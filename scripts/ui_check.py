#!/usr/bin/env python3
"""화면 자동 검사 (docs/06-ui-spec.md 11절, docs/11-test-plan.md 1절 "화면 자동 검사").

1) 정적 검사: src/main/resources/static/ 아래 파일
   (a) 외부 주소(http://, https://, //cdn) 0건  (b) fetch( · XMLHttpRequest 0건
   (c) fixtures·HTML 에 주민·휴대폰·카드·긴 숫자 형식 0건
   (d) 성씨로 시작하는 한글 3글자 낱말은 UI 낱말이거나 바로 뒤에 "(가상)"
   (e) 화면 시안 표시 0건(ADR-016): 주석을 뺀 코드에 "화면 시안"·"시안 조절"·시안 띠/줄 클래스 없음
2) headless Chrome(없으면 Edge)을 한 번만 띄워 DevTools 프로토콜로, 상태 주소 × 화면 크기마다
   캡처(target/ui-check/<상태>_<폭>.png)와 자체 검사(index.html?selftest=1#<상태>)
   S1 상태(STATES × SIZES), S2 접수 패널 상태(PANEL_STATES × PANEL_SIZES),
   S3 공지 카드 요약(KNOWN_HOME_STATES × SIZES)과 S3 패널(KNOWN_PANEL_STATES × PANEL_SIZES),
   S4 결함 대장(ledger.html, LEDGER_STATES × SIZES)을 함께 본다.

사용: 작업 트리 루트에서  python scripts/ui_check.py [ledger]   (인자를 주면 주소에 그 글자가 든 화면만)
표준 라이브러리만 쓴다. 하나라도 실패하면 종료 코드 1.
"""
import base64
import json
import os
import re
import select
from urllib.parse import quote
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "src" / "main" / "resources" / "static"
OUT = ROOT / "target" / "ui-check"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ref_outline import SURNAME3, UI_WORDS  # noqa: E402  (참고 원본은 읽지 않음: main() 미호출)

# 화면 문구에 흔한 3글자 낱말 중 성씨 글자로 시작하는 것 (이름 아님)
EXTRA_UI_WORDS = {"사용자", "안내가", "부서가", "오류와", "설계일", "모바일",
                  # S1 업무 탭 표 머리
                  "설계명", "주상품",
                  # S2 접수 패널 고정 응답(js/fixtures/intake.js) 문구
                  "보여요", "오류가", "오류는", "어떻게", "사례별", "사무실", "인터넷", "지우고", "이름을", "고쳐질",
                  "고객님", "고객의", "고객을", "고객도", "고객은", "방법을", "연결됨", "보낸다", "보내면", "보인다",
                  "문제가", "나나요", "모른다", "오른쪽", "주세요", "고른다",
                  # S3 알려진 오류·내 신고(index.html, js/fixtures/reports.js·notifications.js) 문구
                  "고르기", "고치지", "문자로", "문제를", "이어서", "원인을", "전에는", "반응이",
                  # S4 결함 대장(ledger.html, js/fixtures/defects.js) 문구
                  "원인의", "신고를", "보험료", "나와요", "고객이", "이력이",
                  # S2 두 화면 접수의 임시조치와 고객 안내 문구
                  "여세요", "오류를", "이용해", "사이트", "선택해"}

BROWSERS = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
]
STATES = ["role=FC", "role=MANAGER", "role=SALES", "role=FC&popup=alarm", "role=FC&notice=next", "role=FC&demo=1"]
SIZES = [(1280, 800), (1888, 952), (1920, 1080)]   # 1888×952: 기준 스크린샷 크기(ADR-012)
# S2 접수 패널: 단계 0~7, 끝 화면, 분기 7종, A/B, 대리 접수 (js/intake-panel.js 주소 키, 06번 11절 시연 주소 목록)
P = "role=FC&panel=intake&"
PANEL_STATES = [P + "step=problem", P + "step=0", P + "step=assistant", P + "step=1", P + "case=customer&step=2", P + "case=defect&step=3",
                P + "case=blocked&step=4&alert=blocked", P + "step=5", P + "llm=slow&step=5", P + "llm=fail&step=5",
                P + "case=customer&step=6", P + "mode=A&case=customer&step=6", P + "step=7", P + "mode=A&step=7",
                P + "step=done", P + "step=metoo", P + "case=usage&step=usage", P + "known=off&step=1",
                "role=MANAGER&panel=intake&step=7"]
PANEL_SIZES = [(1280, 800), (1888, 952), (1024, 768)]   # 1024: 1280 미만 → 패널 폭 100%
# S3 알려진 오류·내 신고 (js/known-panel.js 주소 키, ADR-015): 공지 카드 요약 줄, 패널 두 탭, 알림→내 신고, 빈 화면
KNOWN_HOME_STATES = ["role=FC&board=known", "role=SALES&board=known"]
K = "role=FC&board=known&panel=known&"
KNOWN_PANEL_STATES = [K + "tab=known", K + "tab=known&item=D-2026-005", K + "tab=mine",
                      "role=FC&panel=known&tab=mine&item=R-013",   # 알림 팝업 항목에서 연 상태
                      "role=MANAGER&panel=known&tab=mine", "role=SALES&panel=known&tab=mine"]   # 빈 화면
# S4 결함 대장 (ledger.html, js/ledger.js 주소 키, 06번 11절): 목록·필터·빈 결과·안 묶인 신고·상세 패널·
# 상태 바꾸기 대화상자 단계별(고르기·예정일·사유·되돌림·막힘·알림 미리보기·기록만·끝)·신고 묶기
LD = "role=SALES&item=D-2026-001&dialog=status&"
LEDGER_STATES = ["role=SALES", "role=IT&grade=IMMEDIATE", "role=SALES&status=RESOLVED",
                 "role=SALES&tab=unlinked", "role=SALES&tab=unlinked&for=D-2026-001",
                 "role=SALES&item=D-2026-001", "role=SALES&item=D-2026-005", "role=SALES&item=D-2026-006",
                 LD + "dstep=pick", LD + "to=FIX_PLANNED&dstep=pick",
                 LD + "to=FIX_PLANNED&dstep=detail", LD + "to=FIX_PLANNED&dstep=detail&err=1",
                 LD + "to=FIX_PLANNED&dstep=preview&date=2026-11-25",
                 LD + "to=RESOLVED&dstep=detail",
                 LD + "to=WONT_FIX&dstep=detail&reason=ETC&memo=" + "%EC%83%81%ED%92%88%20%EB%8B%A8%EC%A2%85",
                 LD + "to=WONT_FIX&dstep=preview&reason=NEW_SFA",
                 LD + "to=CAUSE_FOUND&dstep=detail&memo=" + "%EC%9E%AC%ED%99%95%EC%9D%B8",
                 "role=SALES&item=D-2026-006&dialog=status&to=REPRODUCED&dstep=preview",
                 LD + "to=FIX_PLANNED&dstep=done&date=2026-11-25",
                 "role=SALES&item=D-2026-006&dialog=status&to=REPRODUCED&dstep=done",
                 "role=SALES&tab=unlinked&dialog=link&report=R-061&link=D-2026-001",
                 "role=SALES&tab=unlinked&dialog=link&report=R-061&link=D-2026-001&dstep=done",
                 # 새 신고 알림·AI 비슷한 결함 추천 (REQ-LG-06·07, ADR-017): 알림 팝업, 담당자별 새 신고,
                 # 신고 패널 추천(높음·보통 / 보통 / 없음 / 지연 / 실패→규칙 후보), 추천에서 연 신고 묶기(정상·지연·실패·없음)
                 "role=SALES&popup=alarm", "role=IT&popup=alarm", "role=IT&tab=unlinked",
                 "role=SALES&tab=unlinked&item=R-061", "role=SALES&tab=unlinked&item=R-014",
                 "role=SALES&tab=unlinked&item=R-062", "role=SALES&tab=unlinked&item=R-061&llm=slow",
                 "role=SALES&tab=unlinked&item=R-061&llm=fail", "role=SALES&tab=unlinked&item=R-014&llm=fail",
                 "role=SALES&tab=unlinked&item=R-061&dialog=link&report=R-061&link=D-2026-001",
                 "role=SALES&tab=unlinked&item=R-061&dialog=link&report=R-061&llm=slow",
                 "role=SALES&tab=unlinked&item=R-061&dialog=link&report=R-061&link=D-2026-001&llm=fail",
                 "role=SALES&tab=unlinked&item=R-062&dialog=link&report=R-062",
                 # 글자 찾기 (REQ-LG-08, q= URL 인코딩): 찾음(알림톡) / 묶인 신고 문장에서만(비밀번호) / 영문 대소문자(B) /
                 # 없음(환급) / 필터와 함께(서명 + 수정 예정) / 필터와 함께 없음(알림톡 + 해결) / 안 묶인 신고 탭 찾음·없음 / 찾은 뒤 상세 패널
                 "role=SALES&q=" + quote("알림톡"), "role=SALES&q=" + quote("비밀번호"), "role=SALES&q=B",
                 "role=SALES&q=" + quote("환급"), "role=SALES&status=FIX_PLANNED&q=" + quote("서명"),
                 "role=SALES&status=RESOLVED&q=" + quote("알림톡"),
                 "role=SALES&tab=unlinked&q=" + quote("알림톡"), "role=SALES&tab=unlinked&q=" + quote("환급"),
                 "role=SALES&q=" + quote("알림톡") + "&item=D-2026-001"]

# ADR-023: 새 업무 범위·대기 조건·완료 기록·AI 진입 화면. 응답/행동은 별도 브라우저 과업 검사.
LEDGER_STATES += ["role=SALES&business=ALL&tab=defects", "role=SALES&business=DESIGN&tab=defects",
                  "role=SALES&business=CUSTOMER_LOOKUP&tab=cases", "role=IT&business=ALL&mine=1&tab=defects",
                  "role=SALES&business=ALL&queue=WAITING", "role=IT&business=ALL&queue=OVERDUE&tab=defects",
                  "role=SALES&ai=1", "role=SALES&ai=1&llm=fail", "role=SALES&business=ALL&queue=REVIEW&tab=defects"]

VIRTUAL_TIME_MS = 3000   # 화면마다 흘리는 가상 시간 (예전 --virtual-time-budget=3000)
CMD_TIMEOUT = 90         # DevTools 명령·기다림 하나의 최대 초

EXTERNAL = re.compile(r"https?://|//cdn", re.I)
NETWORK = re.compile(r"fetch\s*\(|XMLHttpRequest")
# 화면 안 시안 표시(ADR-016): 보이는 문구와 시안 띠·줄 클래스. 주소 설명 같은 주석은 허용
PROTO_MARK = re.compile(r"화면 시안|시안 조절|시안:|proto-band|pn-proto|kn-proto")
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
    # ADR-023 가상 사례의 일반 업무 문구. 이름 검사를 끄지 않고 확인한 낱말만 추가한다.
    allow = UI_WORDS | EXTRA_UI_WORDS | {"사례에", "이력별", "길어짐", "우회법", "차이를", "유지로", "여부와", "정보가", "경우를", "이력을", "진행을", "문제와", "기기와", "여부를", "전달해", "나누어", "방법은", "표시됨", "문제는", "구분해", "마세요", "조회가"}
    # ADR-024 대응 문구에서 검토한 일반 낱말.
    allow |= {"경우에", "보내고", "서명이", "조건이", "정리해", "진행이", "구분이", "기록은", "현상을", "기록과", "보이지", "보이고"}
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        text = p.read_text(encoding="utf-8")
        content = p.suffix == ".html" or "fixtures" in p.parts
        words = strip_comments(text).splitlines()
        for no, plain in enumerate(words, 1):
            m = PROTO_MARK.search(plain)
            if m:
                fails.append(f"{rel}:{no} 시안 표시 '{m.group(0)}' (ADR-016)")
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


class Chrome:
    """headless Chrome 하나를 띄워 두고 DevTools 프로토콜(웹소켓, 표준 라이브러리만)로 조종한다.
    예전에는 조합마다 Chrome 을 두 번(캡처·자체 검사) 새로 띄워 오래 걸렸다."""

    def __init__(self, exe: Path, profile: str):
        self.profile = Path(profile)
        self.proc = subprocess.Popen(
            [str(exe), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=0",
             "--allow-file-access-from-files", "--no-first-run", "--no-default-browser-check",
             "--disable-extensions", f"--user-data-dir={profile}", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        port, path = self._wait_port()
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=CMD_TIMEOUT)
        self.buf = b""
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\n"
                           f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        while b"\r\n\r\n" not in self.buf:
            self._fill()
        head, self.buf = self.buf.split(b"\r\n\r\n", 1)
        status = head.split(b"\r\n", 1)[0]
        if b" 101 " not in status:
            raise RuntimeError(f"DevTools 연결 실패: {status!r}")
        self.next_id = 0
        self.events: list[dict] = []
        target = self.send("Target.createTarget", {"url": "about:blank"})["targetId"]
        self.session = self.send("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        self.send("Page.enable", session=self.session)

    def _wait_port(self) -> tuple[int, str]:
        f = self.profile / "DevToolsActivePort"
        end = time.monotonic() + 30
        while time.monotonic() < end:
            if self.proc.poll() is not None:
                raise RuntimeError(f"브라우저가 바로 종료됨 (exit {self.proc.returncode})")
            try:
                port, path = f.read_text().split()[:2]
                return int(port), path
            except (OSError, ValueError):
                time.sleep(0.05)
        raise RuntimeError("DevTools 포트를 얻지 못함 (30초)")

    # --- 웹소켓 (RFC 6455, 텍스트 프레임만) ---
    def _write(self, text: str) -> None:
        data = text.encode()
        n = len(data)
        head = bytearray([0x81])
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            head += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i & 3] for i, b in enumerate(data))
        self.sock.sendall(bytes(head) + mask + masked)

    def _fill(self) -> None:
        chunk = self.sock.recv(1 << 20)
        if not chunk:
            raise RuntimeError("DevTools 연결이 끊김")
        self.buf += chunk

    def _exact(self, n: int) -> bytes:
        while len(self.buf) < n:
            self._fill()
        b, self.buf = self.buf[:n], self.buf[n:]
        return b

    def _read(self) -> dict:
        parts = []
        while True:
            b0, b1 = self._exact(2)
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._exact(8))[0]
            payload = self._exact(n)
            op = b0 & 0x0F
            if op == 8:
                raise RuntimeError("DevTools 연결이 닫힘")
            if op in (9, 10):   # ping·pong: 서버는 보통 보내지 않음, 무시
                continue
            parts.append(payload)
            if b0 & 0x80:
                return json.loads(b"".join(parts))

    def send(self, method: str, params: dict | None = None, session: str | None = None) -> dict:
        self.next_id += 1
        msg = {"id": self.next_id, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        self._write(json.dumps(msg))
        while True:
            m = self._read()
            if m.get("id") == self.next_id:
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error'].get('message')}")
                return m.get("result", {})
            if "method" in m:
                self.events.append(m)

    def wait_event(self, name: str, timeout: float) -> None:
        end = time.monotonic() + timeout
        while True:
            for i, e in enumerate(self.events):
                if e["method"] == name and e.get("sessionId") == self.session:
                    del self.events[i]
                    return
            if time.monotonic() > end:
                raise RuntimeError(f"{name} 기다림 시간 초과")
            # 받은 것이 없을 때만 소켓을 기다린다 (프레임 중간에서 끊기지 않게)
            if self.buf or select.select([self.sock], [], [], max(0.05, end - time.monotonic()))[0]:
                self.events.append(self._read())

    # --- 화면 ---
    def open(self, url: str, w: int, h: int) -> None:
        """예전 --window-size·--virtual-time-budget=3000 과 같게: 창 크기를 맞추고 새 문서로 연 뒤
        가상 시간(네트워크 요청이 남아 있으면 멈춤)을 3초 흘린다."""
        s = self.session
        self.send("Emulation.setVirtualTimePolicy", {"policy": "advance"}, s)   # 지난 화면의 멈춘 가상 시간 풀기
        self.send("Emulation.setDeviceMetricsOverride",
                  {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False}, s)
        self.events.clear()
        self.send("Page.navigate", {"url": "about:blank"}, s)   # 주소 # 만 바뀌어도 새로 불러오게
        self.wait_event("Page.loadEventFired", CMD_TIMEOUT)
        # 가상 시간을 멈춘 채 이동하고, 새 문서가 들어선 뒤에 3초 예산을 준다
        self.send("Emulation.setVirtualTimePolicy", {"policy": "pause"}, s)
        self.events.clear()
        self.send("Page.navigate", {"url": url}, s)
        self.wait_event("Page.frameNavigated", CMD_TIMEOUT)
        self.send("Emulation.setVirtualTimePolicy",
                  {"policy": "pauseIfNetworkFetchesPending", "budget": VIRTUAL_TIME_MS}, s)
        self.wait_event("Emulation.virtualTimeBudgetExpired", CMD_TIMEOUT)

    def screenshot(self, png: Path) -> None:
        data = self.send("Page.captureScreenshot", {"format": "png"}, self.session)["data"]
        png.write_bytes(base64.b64decode(data))

    def eval(self, expr: str):
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True}, self.session)
        return r.get("result", {}).get("value")

    def close(self) -> None:
        try:
            self.send("Browser.close")
        except Exception:  # noqa: BLE001  이미 끊겼으면 아래에서 강제 종료
            pass
        try:
            self.sock.close()
        except OSError:
            pass
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()


def selftest(chrome: Chrome, w: int, h: int, url: str) -> dict:
    chrome.open(url, w, h)
    text = chrome.eval("(document.getElementById('selftest-result') || {}).textContent || ''")
    if not text:
        return {"ok": False, "checks": [{"name": "selftest-missing", "pass": False, "detail": "결과 없음"}]}
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        return {"ok": False, "checks": [{"name": "selftest-json", "pass": False, "detail": str(e)}]}


def quick_intake_check(chrome: Chrome, page: str) -> None:
    """두 화면 접수의 안내·모드 전환·복구·재시도·내역 연결을 확인한다."""
    chrome.open(page + "#role=FC&panel=intake&step=problem&submit=fail", 390, 780)
    chrome.send("Emulation.setVirtualTimePolicy", {"policy": "advance"}, chrome.session)
    flow = """(async () => {
      const find = (selector) => document.querySelector(selector);
      const wait = async (selector) => {
        for (let i = 0; i < 40; i++) {
          if (find(selector)) return find(selector);
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw Error('누락된 요소 ' + selector + ' ' + location.hash);
      };
      const click = (selector) => find(selector).click();
      const action = (name) => click('[data-act="' + name + '"]');
      const message = '서명 알림톡을 열면 초대장이 떠요';
      await window.SFA_READY;
      const work = await wait('#quick-business');
      if (find('[data-quick-section="urgent"]').open || find('[data-quick-section="description"]').open) {
        throw Error('첫 화면에서 추가 입력이 기본으로 열림');
      }
      work.value = 'SUBSCRIPTION';
      work.dispatchEvent(new Event('change', { bubbles: true }));
      if (find('[data-quick-section="related"]').open) throw Error('업무만 선택했을 때 오류 상세가 열림');
      const line = await wait('#quick-oneLine');
      line.focus();
      line.value = message;
      line.dispatchEvent(new Event('input', { bubbles: true }));
      if (!find('#quick-related').innerText.includes('지금 해볼 방법') || document.activeElement !== line) {
        throw Error('입력 중 임시 방법이나 포커스 확인 실패');
      }
      click('.pn-head #pn-mode-toggle');
      if ((await wait('#pn-assist-text')).value !== message) throw Error('AI 모드에서 질문 초안 유실');
      click('.pn-head #pn-mode-toggle');
      if ((await wait('#quick-oneLine')).value !== message) throw Error('AI 모드 왕복 뒤 설명 유실');
      click('[data-quick-section="urgent"] > summary');
      action('quick-toggle');
      click('#pn-close');
      await wait('#quick-confirm');
      action('quick-save');
      await wait('#intake-panel[hidden]');
      click('[data-panel="intake"]');
      await wait('[data-act="quick-restore"]');
      action('quick-restore');
      if (find('#quick-oneLine').value !== message) throw Error('임시저장 복구 실패');
      window.SfaHash.update({ submit: 'fail' });
      click('[data-quick-section^="method-"] > summary');
      action('quick-tried');
      await wait('#quick-customerScope');
      if (find('[data-quick-section="extra"]').open || !find('#pn-body').innerText.includes('시도한 임시 방법')) {
        throw Error('접수 확인에서 시도한 방법 또는 기본 접힘 확인 실패');
      }
      click('.pn-head #pn-mode-toggle');
      await wait('#pn-assist-text');
      click('.pn-head #pn-mode-toggle');
      await wait('#quick-customerScope');
      action('quick-submit');
      await wait('#quick-error');
      if (!find('#pn-body').innerText.includes(message)) throw Error('제출 실패 뒤 설명 유실');
      action('quick-submit');
      await wait('#quick-receipt-id');
      if (!find('.pn-receipt-enter .pn-success-mark svg')) throw Error('접수 완료 체크 누락');
      action('quick-mine');
      const record = await wait('#kn-body .is-target[data-id]');
      if (!record.innerText.includes(message) || !record.innerText.includes('고객 상담 중') ||
          !record.innerText.includes('시도한 임시 방법')) {
        throw Error('접수 상세에서 입력과 긴급 사정 확인 실패');
      }
      return 'ok';
    })()"""
    result = chrome.send("Runtime.evaluate",
                         {"expression": flow, "awaitPromise": True, "returnByValue": True}, chrome.session)
    if result.get("result", {}).get("value") != "ok":
        detail = result.get("exceptionDetails", {})
        raise RuntimeError(detail.get("exception", {}).get("description", "두 화면 접수 동작 실패"))


def assistant_motion_check(chrome: Chrome, page: str) -> None:
    """모션 설정에 따라 답변이 실제로 나뉘거나 한 번에 표시되는지 확인한다."""
    flow = """(async () => {
      const find = (selector) => document.querySelector(selector);
      const wait = async (condition) => {
        for (let i = 0; i < 100; i++) {
          if (condition()) return;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw Error('AI 응답 상태가 전환되지 않음');
      };
      await window.SFA_READY;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const animation = getComputedStyle(find('.pn-assist-enter h3')).animationName;
      if (animation !== (reduced ? 'none' : 'pn-assist-appear')) throw Error('AI 진입 모션 설정 오류');
      find('[data-index="1"]').click();
      let partial = 0;
      if (!reduced) {
        if (!find('.pn-assist-thinking .pn-assist-dots') || !find('#pn-assist-status').textContent) {
          throw Error('답변 준비 표시 누락');
        }
        await wait(() => find('.pn-assist-result[aria-busy="true"] #pn-assist-reply')?.textContent.length);
        partial = find('#pn-assist-reply').textContent.length;
        if (find('[data-act="assistant-handoff"]')) throw Error('답변 표시 중에 접수 동작이 노출됨');
      }
      await wait(() => find('.pn-assist-result[aria-busy="false"]'));
      const answer = find('#pn-assist-reply');
      if (answer.textContent.length <= partial || !answer.textContent.includes('문자로 서명 링크') ||
          answer.hasAttribute('aria-hidden') || !find('[data-act="assistant-handoff"]')) {
        throw Error('완성된 답변과 접수 동작 확인 실패');
      }
      return 'ok';
    })()"""
    for preference in ("no-preference", "reduce"):
        chrome.send("Emulation.setEmulatedMedia",
                    {"features": [{"name": "prefers-reduced-motion", "value": preference}]}, chrome.session)
        chrome.open(page + "#role=FC&panel=intake&step=assistant", 390, 780)
        chrome.send("Emulation.setVirtualTimePolicy", {"policy": "advance"}, chrome.session)
        result = chrome.send("Runtime.evaluate",
                             {"expression": flow, "awaitPromise": True, "returnByValue": True}, chrome.session)
        if result.get("result", {}).get("value") != "ok":
            detail = result.get("exceptionDetails", {})
            raise RuntimeError(detail.get("exception", {}).get("description", "AI 답변 표시 실패"))


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
    ledger = STATIC / "ledger.html"
    if not ledger.exists():
        print("FAIL: ledger.html 없음")
        return 1
    base, lbase = index.as_uri(), ledger.as_uri()
    only = sys.argv[1] if len(sys.argv) > 1 else ""   # 예: python scripts/ui_check.py ledger  (그 화면 파일만)
    profile = tempfile.mkdtemp(prefix="ui-check-", dir=str(OUT))
    combos = ([(base, st, w, h) for st in STATES + KNOWN_HOME_STATES for w, h in SIZES]
              + [(base, st, w, h) for st in PANEL_STATES + KNOWN_PANEL_STATES for w, h in PANEL_SIZES]
              + [(lbase, st, w, h) for st in LEDGER_STATES for w, h in SIZES])
    combos = [c for c in combos if only in c[0].rsplit("/", 1)[-1]]
    print(f"\n[화면 검사] {browser.name}, S1·S3 요약 {len(STATES) + len(KNOWN_HOME_STATES)}개 상태 × {len(SIZES)}개 크기"
          f" + S2·S3 패널 {len(PANEL_STATES) + len(KNOWN_PANEL_STATES)}개 상태 × {len(PANEL_SIZES)}개 크기"
          f" + S4 결함 대장 {len(LEDGER_STATES)}개 상태 × {len(SIZES)}개 크기" + (f" (그중 '{only}' 화면만)" if only else ""))
    print(f"  {'상태':<26}{'크기':<11}결과")
    rows = []
    started = time.monotonic()
    chrome = None
    try:
        chrome = Chrome(browser, profile)   # 브라우저는 한 번만 띄워 모든 조합에 쓴다
        for page, st, w, h in combos:
            prefix = "ledger_" if page == lbase else ""
            name = prefix + st.replace("=", "-").replace("&", "_").replace("%", "") + f"_{w}"
            png = OUT / f"{name}.png"
            if png.exists():
                png.unlink()
            bad = []
            try:
                chrome.open(f"{page}#{st}", w, h)
                chrome.screenshot(png)
                res = selftest(chrome, w, h, f"{page}?selftest=1#{st}")
            except (RuntimeError, OSError) as e:
                res = {"ok": False, "checks": [{"name": "browser", "pass": False, "detail": str(e)}]}
            bad += [c for c in res.get("checks", []) if not c.get("pass")]
            if not png.exists():
                bad.append({"name": "screenshot", "detail": "캡처 파일 없음"})
            ok = res.get("ok") and not bad
            failed |= not ok
            rows.append((st, w, h, ok, bad))
            print(f"  {st:<26}{f'{w}x{h}':<11}{'PASS' if ok else 'FAIL'}", flush=True)
            for c in bad:
                print(f"      - {c.get('name')}: {c.get('detail')}")
        if only in "index.html":
            try:
                quick_intake_check(chrome, base)
                print("  두 화면 접수 복구·재시도·내역 연결 PASS")
                assistant_motion_check(chrome, base)
                print("  AI 답변 준비·순차 표시·모션 줄이기 PASS")
            except (RuntimeError, OSError) as e:
                print(f"  접수·AI 문의 동작 검사 FAIL: {e}")
                failed = True
    except (RuntimeError, OSError) as e:
        print(f"FAIL: 브라우저 시작·연결 실패: {e}")
        failed = True
    finally:
        if chrome:
            chrome.close()
        shutil.rmtree(profile, ignore_errors=True)

    passed = sum(1 for r in rows if r[3])
    print(f"\n요약: 정적 검사 {'PASS' if not sf else 'FAIL'}, 화면 {passed}/{len(rows)} PASS")
    print(f"캡처: {OUT}  (화면 검사 {time.monotonic() - started:.0f}초)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
