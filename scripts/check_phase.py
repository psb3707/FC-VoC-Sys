#!/usr/bin/env python3
"""개발 단계(DOCS -> FRONTEND -> BACKEND -> RELEASE) 순서를 강제하는 검사 스크립트.

사용:
  --claude : Claude Code PreToolUse 훅. stdin JSON의 tool_input.file_path 검사. 위반 시 exit 2.
  --git    : Git pre-commit 훅. 스테이징된 파일 경로 검사. 위반 시 exit 1.

현재 단계는 docs/gates/PHASE 한 줄(사용자만 변경)에서 읽는다.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHASE_FILE = ROOT / "docs" / "gates" / "PHASE"
PHASES = ["DOCS", "FRONTEND", "BACKEND", "RELEASE"]

# 모든 단계에서 쓸 수 있는 경로 (규칙·문서·자산)
COMMON = ["docs/", "CLAUDE.md", "README.md", ".gitignore", ".gitattributes", ".githooks/",
          ".github/", ".claude/", "scripts/", "assets/"]
# 단계별 추가 허용 경로. None이면 제한 없음
EXTRA = {
    "DOCS": ["spikes/"],
    "FRONTEND": ["src/main/resources/static/"],
    "BACKEND": None,
    "RELEASE": None,
}
# Claude는 어떤 단계에서도 쓰지 못함 (게이트 승인과 단계 변경은 사용자만, 참고 원본은 읽기 전용)
CLAUDE_PROTECTED = ["docs/gates/", "references/"]

HINT = {
    "DOCS": "문서 단계: docs/ 와 규칙 파일만 수정할 수 있습니다. G1(문서 기준선) 승인 뒤 PHASE가 FRONTEND로 바뀝니다.",
    "FRONTEND": "프론트 단계: src/main/resources/static/ 의 화면만 만들 수 있습니다. 백엔드 코드는 G2(화면 승인) 뒤에 가능합니다.",
}


def read_phase() -> str:
    try:
        phase = PHASE_FILE.read_text(encoding="utf-8").strip().upper()
    except OSError:
        phase = ""
    return phase if phase in PHASES else "DOCS"  # 읽을 수 없으면 가장 엄격한 단계


def rel(path: str) -> str | None:
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / p
    try:
        return p.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return None  # 저장소 밖 경로는 이 검사 대상이 아님


def violation(path: str, phase: str, claude: bool) -> str | None:
    r = rel(path)
    if r is None:
        return None
    if claude:
        for p in CLAUDE_PROTECTED:
            if r.startswith(p) or r == p.rstrip("/"):
                return f"'{r}' 은(는) 사용자만 수정할 수 있습니다 (게이트 기록·단계 파일·참고 원본)."
    extra = EXTRA[phase]
    if extra is None:
        return None
    for p in COMMON + extra:
        if r == p.rstrip("/") or r.startswith(p):
            return None
    return f"'{r}' 은(는) 현재 단계 {phase} 에서 허용되지 않습니다. {HINT.get(phase, '')}"


def main() -> int:
    # Windows 기본 코드페이지(cp949)로 나가면 훅 메시지가 깨지므로 UTF-8로 고정
    sys.stderr.reconfigure(encoding="utf-8")
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    phase = read_phase()
    if mode == "--claude":
        try:
            data = json.load(sys.stdin)
        except ValueError:
            return 0
        ti = data.get("tool_input", {}) or {}
        path = ti.get("file_path") or ti.get("notebook_path")
        if not path:
            return 0
        msg = violation(path, phase, claude=True)
        if msg:
            print(f"[단계 차단] {msg}", file=sys.stderr)
            return 2
        return 0
    if mode == "--git":
        out = subprocess.run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMRD"],
                             cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
        bad = [m for f in out.stdout.splitlines() if f.strip()
               if (m := violation(f, phase, claude=False))]
        if bad:
            print("[단계 차단] 커밋을 거부합니다.", file=sys.stderr)
            for m in bad:
                print("  - " + m, file=sys.stderr)
            return 1
        return 0
    print("사용법: check_phase.py --claude | --git", file=sys.stderr)
    return 64


if __name__ == "__main__":
    sys.exit(main())
