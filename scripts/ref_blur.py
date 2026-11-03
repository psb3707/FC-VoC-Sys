#!/usr/bin/env python3
"""실제 SFA 스크린샷의 흐림 사본을 만든다 (ADR-012, docs/06-ui-spec.md 11절).

원본 스크린샷에는 실명·고객·일정 등 실데이터가 있다. Claude(외부 LLM)는 원본을 직접 열지 않고
이 스크립트가 만든 흐림 사본만 본다. 흐림 6px 미만은 거부한다.
확대(--zoom)는 흐림을 적용한 **뒤** 확대한 것과 같다(흐림 반경도 함께 커져 글자가 읽히지 않는다).

사용: python scripts/ref_blur.py <이미지.png> [--blur 6] [--crop x,y,w,h] [--zoom 2] [--out 경로]
  기본 출력: target/ref-blur/<원본이름>_b<흐림>[_crop]_z<확대>.png  (Git 제외)
표준 라이브러리 + 설치된 Chrome(없으면 Edge) headless 만 쓴다.
"""
import argparse
import base64
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "target" / "ref-blur"
MIN_BLUR = 6.0
BROWSERS = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def find_browser() -> Path | None:
    return next((b for b in BROWSERS if b.exists()), None)


def png_size(data: bytes) -> tuple[int, int]:
    """PNG 머리(IHDR)에서 폭·높이를 읽는다. 이미지 내용은 해석하지 않는다."""
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("PNG 파일만 지원합니다")
    return struct.unpack(">II", data[16:24])


def check_blur(blur: float) -> None:
    if blur < MIN_BLUR:
        raise SystemExit(f"거부: 흐림 {blur}px < 최소 {MIN_BLUR}px (ADR-012). 원본이 읽히는 사본은 만들지 않습니다.")


def headless_shot(browser: Path, html_text: str, w: int, h: int, png: Path, work: Path) -> None:
    """임시 HTML 을 headless 로 열어 w×h 캡처. 임시 파일(원본 data URI 포함)은 끝나면 지운다."""
    tmp = Path(tempfile.mkdtemp(prefix="shot-", dir=str(work)))
    try:
        page = tmp / "page.html"
        page.write_text(html_text, encoding="utf-8")
        if png.exists():
            png.unlink()
        args = [str(browser), "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}",
                "--virtual-time-budget=4000", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
                "--force-device-scale-factor=1", f"--user-data-dir={tmp / 'profile'}", f"--screenshot={png}",
                page.as_uri()]
        subprocess.run(args, capture_output=True, timeout=120)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if not png.exists():
        raise SystemExit("캡처 실패: 출력 파일이 없습니다")


def blur_html(data_uri: str, iw: int, ih: int, blur: float, crop: tuple[int, int, int, int], zoom: float) -> str:
    x, y, w, h = crop
    # 확대한 크기로 그리되 흐림 반경도 같은 배율로 키운다 = "흐림 적용 후 확대"와 같은 결과.
    # 원본 전체에 흐림을 건 뒤 잘라 내므로 자른 경계가 번지지 않는다.
    z = zoom
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;background:#fff;overflow:hidden}}
.crop{{width:{w * z}px;height:{h * z}px;overflow:hidden;position:relative}}
.crop img{{position:absolute;left:{-x * z}px;top:{-y * z}px;width:{iw * z}px;height:{ih * z}px;filter:blur({blur * z}px)}}
</style></head><body><div class="crop"><img src="{data_uri}" alt=""></div></body></html>"""


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="스크린샷 흐림 사본 만들기 (흐림 6px 이상만)")
    ap.add_argument("image")
    ap.add_argument("--blur", type=float, default=MIN_BLUR)
    ap.add_argument("--crop", help="x,y,w,h (원본 픽셀)")
    ap.add_argument("--zoom", type=float, default=1.0)
    ap.add_argument("--out")
    a = ap.parse_args()
    check_blur(a.blur)
    if not (0.25 <= a.zoom <= 4):
        raise SystemExit("--zoom 은 0.25~4 사이")

    src = Path(a.image)
    data = src.read_bytes()
    iw, ih = png_size(data)
    crop = (0, 0, iw, ih)
    if a.crop:
        crop = tuple(int(v) for v in a.crop.split(","))  # type: ignore[assignment]
        if len(crop) != 4 or crop[2] <= 0 or crop[3] <= 0:
            raise SystemExit("--crop 형식: x,y,w,h")
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge 를 찾지 못했습니다")

    OUT.mkdir(parents=True, exist_ok=True)
    tag = f"_crop{crop[0]}-{crop[1]}-{crop[2]}x{crop[3]}" if a.crop else ""
    out = (Path(a.out) if a.out else OUT / f"{src.stem}_b{a.blur:g}{tag}_z{a.zoom:g}.png").resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    uri = "data:image/png;base64," + base64.b64encode(data).decode("ascii")
    w, h = round(crop[2] * a.zoom), round(crop[3] * a.zoom)
    headless_shot(browser, blur_html(uri, iw, ih, a.blur, crop, a.zoom), w, h, out, OUT)
    print(f"흐림 {a.blur:g}px, 영역 {crop}, 확대 {a.zoom:g} → {out} ({w}x{h})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
