#!/usr/bin/env python3
"""화면 자동 검사 (docs/06-ui-spec.md 11절, docs/11-test-plan.md 1절 "화면 자동 검사").

1) 정적 검사: src/main/resources/static/ 아래 파일
   (a) 외부 주소(http://, https://, //cdn) 0건  (b) fetch( · XMLHttpRequest 0건
   (c) fixtures·HTML 에 주민·휴대폰·카드·긴 숫자 형식 0건
   (d) 성씨로 시작하는 한글 3글자 낱말은 UI 낱말이거나 바로 뒤에 "(가상)"
2) 상태 주소 × 화면 크기마다 headless Chrome(없으면 Edge)으로
   캡처(target/ui-check/<상태>_<폭>.png)와 자체 검사(index.html?selftest=1#<상태>)

사용: 작업 트리 루트에서  python scripts/ui_check.py
표준 라이브러리만 쓴다. 하나라도 실패하면 종료 코드 1.
"""
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "src" / "main" / "resources" / "static"
OUT = ROOT / "target" / "ui-check"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ref_outline import SURNAME3, UI_WORDS  # noqa: E402  (참고 원본은 읽지 않음: main() 미호출)

# 화면 문구에 흔한 3글자 낱말 중 성씨 글자로 시작하는 것 (이름 아님)
EXTRA_UI_WORDS = {"사용자", "안내가", "부서가", "오류와", "설계일", "모바일"}

BROWSERS = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]
STATES = ["role=FC", "role=MANAGER", "role=SALES", "role=FC&popup=alarm", "role=FC&notice=next", "role=FC&demo=1"]
SIZES = [(1280, 800), (1888, 952), (1920, 1080)]   # 1888×952: 기준 스크린샷 크기(ADR-012)

EXTERNAL = re.compile(r"https?://|//cdn", re.I)
NETWORK = re.compile(r"fetch\s*\(|XMLHttpRequest")
PII = [
    ("주민번호", re.compile(r"(?<!\d)\d{6}\s*-\s*\d{7}(?!\d)")),
    ("휴대폰", re.compile(r"(?<!\d)01[016789]\s*-?\s*\d{3,4}\s*-?\s*\d{4}(?!\d)")),
    ("카드", re.compile(r"(?<!\d)\d{4}\s*-\s*\d{4}\s*-\s*\d{4}\s*-\s*\d{4}(?!\d)")),
    ("긴 숫자", re.compile(r"\d{10,}")),
]
# 이름 형태 검사(d)는 화면 문구만 본다: 주석은 줄 수를 유지한 채 지운다
COMMENT = re.compile(r"<!--.*?-->|/\*.*?\*/|(?<![:\\])//[^\n]*", re.S)


def strip_comments(text: str) -> str:
    return COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), text)


def static_checks() -> list[str]:
    fails: list[str] = []
    files = [p for p in STATIC.rglob("*") if p.is_file() and p.suffix in {".html", ".js", ".css"}]
    if not files:
        return [f"정적 파일 없음: {STATIC}"]
    allow = UI_WORDS | EXTRA_UI_WORDS
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        text = p.read_text(encoding="utf-8")
        content = p.suffix == ".html" or "fixtures" in p.parts
        words = strip_comments(text).splitlines()
        for no, line in enumerate(text.splitlines(), 1):
            if EXTERNAL.search(line):
                fails.append(f"{rel}:{no} 외부 주소")
            if NETWORK.search(line):
                fails.append(f"{rel}:{no} 통신 코드")
            if not content:
                continue
            for name, rx in PII:
                if rx.search(line):
                    fails.append(f"{rel}:{no} {name} 형식")
            plain = words[no - 1] if no <= len(words) else ""
            for m in SURNAME3.finditer(plain):
                if m.group(0) not in allow and not plain[m.end():].startswith("(가상)"):
                    fails.append(f"{rel}:{no} 이름 형태 '{m.group(0)}' 뒤에 (가상) 없음")
    return fails


def find_browser() -> Path | None:
    for b in BROWSERS:
        if b.exists():
            return b
    return None


def run_browser(browser: Path, profile: str, w: int, h: int, extra: list[str], url: str) -> subprocess.CompletedProcess:
    args = [str(browser), "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}",
            "--virtual-time-budget=3000", "--allow-file-access-from-files", "--no-first-run",
            "--no-default-browser-check", "--disable-extensions", f"--user-data-dir={profile}", *extra, url]
    return subprocess.run(args, capture_output=True, timeout=90)


def selftest(browser: Path, profile: str, w: int, h: int, url: str) -> dict:
    cp = run_browser(browser, profile, w, h, ["--dump-dom"], url)
    dom = cp.stdout.decode("utf-8", errors="replace")
    m = re.search(r'<pre id="selftest-result"[^>]*>(.*?)</pre>', dom, re.S)
    if not m:
        return {"ok": False, "checks": [{"name": "selftest-missing", "pass": False,
                                         "detail": f"결과 없음 (exit {cp.returncode})"}]}
    try:
        return json.loads(html.unescape(m.group(1)))
    except json.JSONDecodeError as e:
        return {"ok": False, "checks": [{"name": "selftest-json", "pass": False, "detail": str(e)}]}


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    index = STATIC / "index.html"
    failed = False

    print("[정적 검사]", STATIC.relative_to(ROOT).as_posix())
    sf = static_checks()
    print("  PASS" if not sf else "  FAIL")
    for f in sf:
        print("   -", f)
    failed |= bool(sf)

    browser = find_browser()
    if not browser:
        print("FAIL: Chrome/Edge 를 찾지 못했습니다.")
        return 1
    if not index.exists():
        print("FAIL: index.html 없음")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    base = index.as_uri()
    profile = tempfile.mkdtemp(prefix="ui-check-", dir=str(OUT))
    print(f"\n[화면 검사] {browser.name}, {len(STATES)}개 상태 × {len(SIZES)}개 크기")
    print(f"  {'상태':<26}{'크기':<11}결과")
    rows = []
    try:
        for st in STATES:
            for w, h in SIZES:
                name = st.replace("=", "-").replace("&", "_") + f"_{w}"
                png = OUT / f"{name}.png"
                if png.exists():
                    png.unlink()
                run_browser(browser, profile, w, h, [f"--screenshot={png}"], f"{base}#{st}")
                res = selftest(browser, profile, w, h, f"{base}?selftest=1#{st}")
                bad = [c for c in res.get("checks", []) if not c.get("pass")]
                if not png.exists():
                    bad.append({"name": "screenshot", "detail": "캡처 파일 없음"})
                ok = res.get("ok") and not bad
                failed |= not ok
                rows.append((st, w, h, ok, bad))
                print(f"  {st:<26}{f'{w}x{h}':<11}{'PASS' if ok else 'FAIL'}")
                for c in bad:
                    print(f"      - {c.get('name')}: {c.get('detail')}")
    finally:
        shutil.rmtree(profile, ignore_errors=True)

    passed = sum(1 for r in rows if r[3])
    print(f"\n요약: 정적 검사 {'PASS' if not sf else 'FAIL'}, 화면 {passed}/{len(rows)} PASS")
    print(f"캡처: {OUT}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
