#!/usr/bin/env python3
"""참고 원본(references/sfa_home.html)의 화면 구조를 개인정보 없이 요약한다 (ADR-011).

원본을 그대로 읽으면 실존 인물로 보이는 이름·번호가 외부 LLM으로 전달된다.
Claude는 원본 대신 이 스크립트의 출력만 참고한다.

출력:
  1) 영역별 UI 문구 (상단 메뉴, 유틸리티, 퀵메뉴, 탭)  -- 마스킹 적용
  2) 영역 관련 CSS 규칙 (색, 글꼴, 크기, 모서리 등)     -- 디자인 정보만

마스킹(보수적으로):
  - 숫자는 모두 '#'
  - 호칭 앞 2~4자 한글(○○○ 님/고객/팀장/지점장/FC 등) -> [이름]
  - 25자를 넘는 문구 -> [긴 문구 N자]
  - 이메일·URL -> [주소]
  - 회사·서비스 식별 문자열 -> [회사]
사용: python scripts/ref_outline.py [원본 경로]
"""
import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT = ROOT / "references" / "sfa_home.html"

BRAND = re.compile(r"동양생명|엔젤[가-힣 ]*|angel ?planner|myangel|tongyang|우리WON[가-힣()A-Za-z]*", re.I)
# 호칭 없는 이름 대비: 흔한 성씨로 시작하는 한글 3글자 낱말은 가린다 (UI 낱말 일부도 가려질 수 있음: 안전 쪽 오류)
SURNAME3 = re.compile(r"(?<![가-힣])[김이박최정강조윤장임한오서신권황안송류유홍전고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경사부황보][가-힣]{2}(?![가-힣])")
UI_WORDS = {"신계약", "가입설계", "고객관리", "계약관리", "재무설계", "영업관리", "지식관리", "관리자", "원격지원", "원격요청",
            "수수료규정", "약관검색", "로그아웃", "보장분석", "교육방송", "고객종합", "공지사항", "시스템공지", "일반공지",
            "영업자료실", "청약진행현황", "해피콜보완", "신계약보완", "계약문서열람", "가입설계 이력", "더보기"}
HONORIFIC = re.compile(r"[가-힣]{2,4}(?=\s*(님|고객(?![가-힣])|팀장|지점장|부지점장|설계사|FC|매니저|대리|과장|차장|부장))")
EMAIL_URL = re.compile(r"\S+@\S+|https?://\S+|www\.\S+")

# 영역 선택: (이름, class/id에 포함되는 키워드)
REGIONS = [
    ("상단 업무 메뉴", re.compile(r"gnb_tit", re.I)),
    ("상단 유틸리티", re.compile(r"(util|gnbtop|top_?menu|topmenu)", re.I)),
    ("오른쪽 퀵메뉴", re.compile(r"quick", re.I)),
    ("탭", re.compile(r"w2tabcontrol_tab_center", re.I)),  # 탭 제목만 (본문·목록 제외)
]
# 로그인 사용자 정보가 섞일 수 있는 영역은 허용 목록 문구만 보여 준다 (제안서 2.4의 유틸리티 이름)
WHITELIST = {
    "상단 유틸리티": {"제보", "원격지원", "수수료규정", "메뉴검색", "약관검색", "스케줄", "알림", "로그아웃",
                  "원격요청", "챗봇", "전체메뉴", "메뉴", "검색", "설정", "도움말"},
}
# 사용자 정보·표(그리드)·달력·슬라이드 등 데이터 영역은 통째로 건너뛴다
SKIP_ATTR = re.compile(r"user|name|info|myinfo|profile|login|grid|calendar|hourbox|swiper|slide|bbs|list|data", re.I)
CSS_KEYS = re.compile(r"quick|gnb|tab|util|header|notice|badge|alarm|alim|butn|btn", re.I)
CSS_PROPS = re.compile(r"(color|background|font|border|radius|width|height|padding|margin|box-shadow)", re.I)


def mask(text: str) -> str | None:
    t = html.unescape(text).strip()
    t = re.sub(r"\s+", " ", t)
    if not t:
        return None
    t = EMAIL_URL.sub("[주소]", t)
    t = BRAND.sub("[회사]", t)
    t = HONORIFIC.sub("[이름]", t)
    t = SURNAME3.sub(lambda m: m.group(0) if m.group(0) in UI_WORDS else "[이름?]", t)
    t = re.sub(r"\d", "#", t)
    if "/" in t and re.search(r"[가-힣]", t):
        return "[데이터 행]"  # "구분/이름/번호" 형태의 데이터 행
    if len(t) > 25:
        return f"[긴 문구 {len(t)}자]"
    return t


def strip_noise(s: str) -> str:
    s = re.sub(r"data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+", "DATA", s)
    s = re.sub(r"<script\b.*?</script>", "", s, flags=re.S | re.I)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    return s


VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class _Collector(HTMLParser):
    """class/id 가 키워드에 맞는 요소의 하위 텍스트만 모은다. 사용자 정보 영역(SKIP_ATTR)은 통째로 건너뛴다."""

    def __init__(self, key: re.Pattern):
        super().__init__(convert_charrefs=True)
        self.key = key
        self.stack: list[tuple[str, bool, bool]] = []  # (tag, in_region, skipped)
        self.out: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = " ".join(v for k, v in attrs if k in ("class", "id") and v)
        parent_in = self.stack[-1][1] if self.stack else False
        parent_skip = self.stack[-1][2] if self.stack else False
        skip = parent_skip or bool(SKIP_ATTR.search(a))
        inside = parent_in or bool(self.key.search(a))
        if tag not in VOID:
            self.stack.append((tag, inside, skip))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self.stack and self.stack[-1][1] and not self.stack[-1][2]:
            v = mask(data)
            if v and v not in self.out:
                self.out.append(v)


def region_texts(s: str, key: re.Pattern) -> list[str]:
    c = _Collector(key)
    c.feed(re.sub(r"<style\b.*?</style>", "", s, flags=re.S | re.I))
    return c.out[:40]


def css_rules(s: str) -> list[str]:
    rules: list[str] = []
    for block in re.findall(r"<style[^>]*>(.*?)</style>", s, flags=re.S | re.I):
        for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", block):
            sel = sel.strip()
            if not CSS_KEYS.search(sel) or len(sel) > 120:
                continue
            props = [p.strip() for p in body.split(";") if CSS_PROPS.search(p.split(":")[0])]
            props = [re.sub(r"url\([^)]*\)", "url(…)", p) for p in props if p]
            if props:
                rules.append(f"{sel} {{ {'; '.join(props)} }}")
    return rules


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    s = strip_noise(path.read_text(encoding="utf-8", errors="replace"))
    print(f"# 참고 원본 구조 요약 (마스킹 적용)\n원본 크기 {path.stat().st_size:,} bytes\n")
    for name, key in REGIONS:
        texts = region_texts(s, key)
        allowed = WHITELIST.get(name)
        if allowed is not None:
            hidden = sum(1 for t in texts if t not in allowed)
            texts = [t for t in texts if t in allowed] + ([f"[허용 목록 밖 {hidden}개 숨김]"] if hidden else [])
        print(f"## {name} ({len(texts)})")
        print(" | ".join(texts) if texts else "(찾지 못함)")
        print()
    rules = css_rules(s)
    print(f"## 관련 CSS 규칙 ({len(rules)}건, 최대 80건 표시)")
    for r in rules[:80]:
        print("- " + r[:300])
    return 0


if __name__ == "__main__":
    sys.exit(main())
