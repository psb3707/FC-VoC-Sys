#!/usr/bin/env python3
"""실제 SFA 스크린샷과 우리 S1 화면의 재현도를 비교한다 (ADR-012, docs/06-ui-spec.md 11절).

1) 우리 index.html?compare=1 을 원본 크기로 headless Chrome 캡처 (target/ui-compare/ours.png)
2) 원본과 우리 캡처를 data URI 로 넣은 임시 비교 HTML 에서 canvas 로 **둘 다 같은 흐림**을 건 뒤
   픽셀 차이를 계산한다: 전체 유사도 %, 차이 큰 픽셀 비율, 8×6 격자별 유사도
3) target/ui-compare/ 에 저장: overlay.png(흐림 원본·흐림 재현 반반 겹침), side.png(나란히),
   diff.png(차이 지도), result.json
원본은 흐림 없이 출력·저장하지 않는다(임시 비교 HTML 은 끝나면 지운다). 흐림 6px 미만은 거부.

사용: python scripts/ui_compare.py <원본 스크린샷.png> [--blur 6] [--offset-y N] [--hash role=FC]
  --offset-y: 스크린샷 맨 위가 잘린 픽셀 수. 우리 캡처를 그만큼 위로 당겨 맞춘다.
표준 라이브러리 + 설치된 Chrome(없으면 Edge)만 쓴다.
"""
import argparse
import base64
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ref_blur import MIN_BLUR, check_blur, find_browser, png_size  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "src" / "main" / "resources" / "static" / "index.html"
OUT = ROOT / "target" / "ui-compare"
COLS, ROWS = 8, 6

PAGE = r"""<!doctype html><html><head><meta charset="utf-8"></head><body>
<img id="a" src="__A__" alt=""><img id="b" src="__B__" alt="">
<script>
(function () {
  var W = __W__, H = __H__, BLUR = __BLUR__, OFF = __OFF__, COLS = __COLS__, ROWS = __ROWS__;
  function done(obj) {
    var pre = document.createElement('pre'); pre.id = 'result'; pre.textContent = JSON.stringify(obj);
    document.body.appendChild(pre);
  }
  function blurred(img, dy) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.filter = 'blur(' + BLUR + 'px)'; x.drawImage(img, 0, -dy); return c;
  }
  function go() {
    var A = blurred(document.getElementById('a'), 0), B = blurred(document.getElementById('b'), OFF);
    var da = A.getContext('2d').getImageData(0, 0, W, H).data, db = B.getContext('2d').getImageData(0, 0, W, H).data;
    var D = document.createElement('canvas'); D.width = W; D.height = H;
    var dctx = D.getContext('2d'), dimg = dctx.createImageData(W, H), dd = dimg.data;
    var sum = 0, big = 0, gs = [], gn = [];
    for (var i = 0; i < COLS * ROWS; i++) { gs.push(0); gn.push(0); }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var p = (y * W + x) * 4;
      var d = (Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2])) / 765;
      sum += d; if (d > 0.1) big++;
      var g = Math.min(ROWS - 1, Math.floor(y * ROWS / H)) * COLS + Math.min(COLS - 1, Math.floor(x * COLS / W));
      gs[g] += d; gn[g]++;
      var v = Math.min(255, Math.round(d * 3 * 255));
      dd[p] = 255; dd[p + 1] = 255 - v; dd[p + 2] = 255 - v; dd[p + 3] = 255;
    }
    dctx.putImageData(dimg, 0, 0);
    // 반반 겹침: 흐림 원본 위에 흐림 재현을 50% 투명도로
    var O = document.createElement('canvas'); O.width = W; O.height = H;
    var o = O.getContext('2d'); o.drawImage(A, 0, 0); o.globalAlpha = 0.5; o.drawImage(B, 0, 0);
    // 나란히: 왼쪽 흐림 원본, 오른쪽 흐림 재현
    var GAP = 16, S = document.createElement('canvas'); S.width = W * 2 + GAP; S.height = H;
    var s = S.getContext('2d'); s.fillStyle = '#ff00ff'; s.fillRect(0, 0, S.width, H);
    s.drawImage(A, 0, 0); s.drawImage(B, W + GAP, 0);
    var grid = gs.map(function (v, k) { return Math.round((1 - v / gn[k]) * 1000) / 10; });
    done({ w: W, h: H, blur: BLUR, offsetY: OFF,
           similarity: Math.round((1 - sum / (W * H)) * 1000) / 10,
           mismatchPct: Math.round(big / (W * H) * 1000) / 10,
           grid: grid,
           overlay: O.toDataURL('image/png'), side: S.toDataURL('image/png'), diff: D.toDataURL('image/png') });
  }
  var n = 0;
  function loaded() { if (++n === 2) { try { go(); } catch (e) { done({ error: String(e) }); } } }
  ['a', 'b'].forEach(function (id) {
    var im = document.getElementById(id);
    if (im.complete && im.naturalWidth) loaded(); else { im.onload = loaded; im.onerror = function () { done({ error: 'load ' + id }); }; }
  });
})();
</script></body></html>"""


def chrome(browser: Path, profile: Path, w: int, h: int, extra: list[str], url: str) -> subprocess.CompletedProcess:
    args = [str(browser), "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}",
            "--virtual-time-budget=20000", "--allow-file-access-from-files", "--no-first-run",
            "--no-default-browser-check", "--disable-extensions", "--force-device-scale-factor=1",
            f"--user-data-dir={profile}", *extra, url]
    return subprocess.run(args, capture_output=True, timeout=240)


def save_data_url(url: str, path: Path) -> None:
    path.write_bytes(base64.b64decode(url.split(",", 1)[1]))


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="실제 SFA 스크린샷과 S1 재현도 비교 (흐림 비교만)")
    ap.add_argument("image")
    ap.add_argument("--blur", type=float, default=MIN_BLUR)
    ap.add_argument("--offset-y", type=int, default=0)
    ap.add_argument("--hash", default="role=FC")
    a = ap.parse_args()
    check_blur(a.blur)
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge 를 찾지 못했습니다")
    data = Path(a.image).read_bytes()
    w, h = png_size(data)
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="cmp-", dir=str(OUT)))
    try:
        ours = OUT / "ours.png"
        if ours.exists():
            ours.unlink()
        chrome(browser, tmp / "p1", w, h + a.offset_y, [f"--screenshot={ours}"],
               f"{INDEX.as_uri()}?compare=1#{a.hash}")
        if not ours.exists():
            raise SystemExit("우리 화면 캡처 실패")
        page = PAGE
        for k, v in {"__A__": "data:image/png;base64," + base64.b64encode(data).decode("ascii"),
                     "__B__": "data:image/png;base64," + base64.b64encode(ours.read_bytes()).decode("ascii"),
                     "__W__": str(w), "__H__": str(h), "__BLUR__": f"{a.blur:g}", "__OFF__": str(a.offset_y),
                     "__COLS__": str(COLS), "__ROWS__": str(ROWS)}.items():
            page = page.replace(k, v)
        cmp_html = tmp / "compare.html"   # 원본 data URI 포함: 아래 finally 에서 삭제
        cmp_html.write_text(page, encoding="utf-8")
        cp = chrome(browser, tmp / "p2", 800, 600, ["--dump-dom"], cmp_html.as_uri())
        dom = cp.stdout.decode("utf-8", errors="replace")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    m = re.search(r'<pre id="result">(.*?)</pre>', dom, re.S)
    if not m:
        raise SystemExit(f"비교 결과 없음 (exit {cp.returncode})")
    res = json.loads(html.unescape(m.group(1)))
    if "error" in res:
        raise SystemExit("비교 오류: " + res["error"])
    for k in ("overlay", "side", "diff"):
        save_data_url(res.pop(k), OUT / f"{k}.png")
    (OUT / "result.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"[재현도] 흐림 {a.blur:g}px, offset-y {a.offset_y}, 크기 {w}x{h}")
    print(f"  전체 유사도 {res['similarity']:.1f}%   차이 큰 픽셀(>10%) {res['mismatchPct']:.1f}%")
    print(f"  격자별 유사도 (%; 열 A~{chr(64 + COLS)} = 왼→오, 행 1~{ROWS} = 위→아래)")
    print("      " + "".join(f"{chr(65 + c):>7}" for c in range(COLS)))
    for r in range(ROWS):
        row = res["grid"][r * COLS:(r + 1) * COLS]
        print(f"  {r + 1:>3} " + "".join(f"{v:>7.1f}" for v in row))
    worst = sorted(range(COLS * ROWS), key=lambda i: res["grid"][i])[:5]
    print("  낮은 격자: " + ", ".join(f"{chr(65 + i % COLS)}{i // COLS + 1}({res['grid'][i]:.1f})" for i in worst))
    for k in ("overlay", "side", "diff", "ours"):
        print(f"  {k}: {OUT / (k + '.png')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
