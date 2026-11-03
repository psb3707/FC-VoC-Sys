#!/usr/bin/env python3
"""깃 규칙 검사 (규칙 원문: docs/13-git-conventions.md).

모드:
  --commit-msg <file>        커밋 메시지 형식 검사 (commit-msg 훅)
  --pre-commit               main 직접 커밋 금지, 브랜치 이름 검사 (pre-commit 훅). 루트 커밋은 예외
  --pre-push <remote> <url>  푸시 직전 검토 (pre-push 훅). stdin: "<local ref> <local sha> <remote ref> <remote sha>"
  --claude-bash              Claude Code Bash 훅. 검사 우회·위험 명령을 차단 (exit 2)
"""
import json
import re
import shlex
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import check_phase  # noqa: E402

ZERO = "0" * 40
TYPES = "feat|fix|docs|refactor|test|chore|perf|build|ci|style|revert"
SUBJECT_RE = re.compile(rf"^({TYPES})(\([a-z0-9-]+\))?!?: \S.*$")
SUBJECT_MAX = 72
BRANCH_RE = re.compile(r"^(feat|fix|docs|refactor|test|chore)/[a-z0-9][a-z0-9._-]*$")
_TOKEN = r"(REQ-[A-Z]{2}-\d{2}|ADR-\d{3})"
REFS_RE = re.compile(rf"^Refs: (none|{_TOKEN}(, {_TOKEN})*)$", re.M)
REFS_REQUIRED_TYPES = ("feat", "fix")
AUTO_PREFIXES = ("Merge ", 'Revert "')
PROTECTED = ("main", "master")
FORBIDDEN_TRACKED = ("references/", "data/", "logs/", "spikes/", ".tools/", "target/")
SECRET_PATTERNS = [
    r"sk-[A-Za-z0-9_-]{20,}",
    r"ghp_[A-Za-z0-9]{30,}",
    r"AKIA[0-9A-Z]{16}",
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
]


def out(msg: str) -> None:
    print(msg, file=sys.stderr)


def git(*args: str, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-c", "core.quotepath=false", *args], cwd=ROOT,
                          capture_output=True, text=True, encoding="utf-8", check=check)


# ---------------------------------------------------------------- 커밋 메시지
def check_message(msg: str) -> list[str]:
    lines = [ln for ln in msg.splitlines() if not ln.startswith("#")]
    text = "\n".join(lines).strip()
    if not text:
        return ["커밋 메시지가 비어 있습니다."]
    if text.startswith(AUTO_PREFIXES):
        return []
    subject = text.splitlines()[0]
    errors = []
    m = SUBJECT_RE.match(subject)
    if not m:
        errors.append(f"제목 형식 오류: '{subject}'  →  '<type>(<scope>): <요약>' (type: {TYPES.replace('|', ', ')})")
    if len(subject) > SUBJECT_MAX:
        errors.append(f"제목이 {SUBJECT_MAX}자를 넘습니다 ({len(subject)}자).")
    if subject.rstrip().endswith("."):
        errors.append("제목 끝에 마침표를 쓰지 않습니다.")
    body_lines = text.splitlines()[1:]
    if body_lines and body_lines[0].strip():
        errors.append("제목과 본문 사이에 빈 줄이 필요합니다.")
    if m and m.group(1) in REFS_REQUIRED_TYPES and not REFS_RE.search(text):
        errors.append("feat/fix 커밋에는 'Refs: REQ-IN-04, ADR-006' 또는 'Refs: none' 줄이 필요합니다.")
    if subject.startswith(("fixup!", "squash!")):
        errors.append("fixup!/squash! 커밋은 푸시 전에 정리(rebase)해야 합니다.")
    return errors


def commit_msg(path: str) -> int:
    msg = Path(path).read_text(encoding="utf-8", errors="replace")
    errors = check_message(msg)
    if errors:
        out("[깃 규칙] 커밋 메시지를 거부합니다. (docs/13-git-conventions.md 5절)")
        for e in errors:
            out("  - " + e)
        return 1
    return 0


# ---------------------------------------------------------------- 커밋 시 브랜치
def pre_commit() -> int:
    if git("rev-parse", "--verify", "-q", "HEAD").returncode != 0:
        return 0  # 저장소의 첫(루트) 커밋은 main에서 허용
    branch = git("symbolic-ref", "--short", "-q", "HEAD").stdout.strip()
    if not branch:
        return 0  # detached HEAD (rebase 등)
    if branch in PROTECTED:
        out(f"[깃 규칙] '{branch}' 에는 직접 커밋할 수 없습니다. 작업 트리와 기능 브랜치를 만드세요. (docs/13-git-conventions.md 4절)")
        return 1
    if not BRANCH_RE.match(branch):
        out(f"[깃 규칙] 브랜치 이름 '{branch}' 이(가) 규칙에 맞지 않습니다. 예: feat/req-in-04-intake-form (3절)")
        return 1
    return 0


# ---------------------------------------------------------------- 푸시 검토
def read_phase_at(sha: str) -> str:
    r = git("show", f"{sha}:docs/gates/PHASE")
    if r.returncode == 0 and r.stdout.strip().upper() in check_phase.PHASES:
        return r.stdout.strip().upper()
    return check_phase.read_phase()


def has_object(sha: str) -> bool:
    return sha != ZERO and git("cat-file", "-e", sha).returncode == 0


def commit_range(lsha: str, rsha: str) -> list[str]:
    # 원격에 새로 올라가는 커밋만 검사한다. 강제 푸시(rebase 후)에서 'rsha..lsha' 를 쓰면
    # 이전 끝(rsha)이 조상이 아니라서 이미 main 에 있는 커밋(GitHub squash 머지 제목 등)까지 잡힌다.
    # 원격 추적 ref 가 오래됐을 때를 대비해 rsha 도 제외 목록에 넣는다.
    excl = ["--remotes"] + ([rsha] if has_object(rsha) else [])
    r = git("rev-list", lsha, "--not", *excl)
    return [s for s in r.stdout.split() if s]


def changed_files(lsha: str, rsha: str) -> list[str]:
    # fast-forward 만 rsha 와 비교한다. 강제 푸시는 rsha 와 비교하면 main 의 변경까지 섞이므로
    # 새 브랜치와 같이 merge-base(lsha, origin/main) 기준으로 본다.
    if has_object(rsha) and is_ancestor(rsha, lsha):
        r = git("diff", "--name-only", rsha, lsha)
    else:
        base = git("merge-base", lsha, "refs/remotes/origin/main")
        if base.returncode == 0 and base.stdout.strip():
            r = git("diff", "--name-only", base.stdout.strip(), lsha)
        else:
            r = git("ls-tree", "-r", "--name-only", lsha)
    return [f for f in r.stdout.splitlines() if f.strip()]


def review_push(branch: str, lsha: str, rsha: str) -> list[str]:
    errors: list[str] = []
    commits = commit_range(lsha, rsha)

    # 1) 커밋 메시지
    for sha in commits:
        msg = git("log", "-1", "--format=%B", sha).stdout
        for e in check_message(msg):
            errors.append(f"커밋 {sha[:7]}: {e}")
    # 2) 병합 커밋 금지 (rebase로 최신화)
    if commits:
        merges = git("rev-list", "--merges", "--no-walk", *commits).stdout.split()
        if merges and branch not in PROTECTED:
            errors.append(f"병합 커밋 {merges[0][:7]} 이(가) 있습니다. 'git rebase origin/main' 으로 최신화하세요 (6절).")

    # 3) 단계(Phase) 허용 경로
    phase = read_phase_at(lsha)
    files = changed_files(lsha, rsha)
    for f in files:
        msg = check_phase.violation(f, phase, claude=False)
        if msg:
            errors.append(msg)
    # 4) 추적 금지 경로
    tracked = git("ls-tree", "-r", "--name-only", lsha).stdout.splitlines()
    for f in tracked:
        if f.startswith(FORBIDDEN_TRACKED) or re.match(r"^\.env(\..*)?$", f):
            errors.append(f"추적하면 안 되는 경로가 포함됨: {f}")
    # 5) 비밀키 형식
    for pat in SECRET_PATTERNS:
        r = git("grep", "-I", "-l", "-E", pat, lsha)
        if r.returncode == 0 and r.stdout.strip():
            names = ", ".join(x.split(":", 1)[-1] for x in r.stdout.split()[:3])
            errors.append(f"비밀키로 보이는 문자열 발견({names}). 키를 폐기하고 이력에서 제거해야 합니다.")
            break
    return errors


def is_ancestor(a: str, b: str) -> bool:
    return git("merge-base", "--is-ancestor", a, b).returncode == 0


def pre_push() -> int:
    errors: list[str] = []
    notes: list[str] = []
    for line in sys.stdin:
        parts = line.split()
        if len(parts) != 4:
            continue
        _lref, lsha, rref, rsha = parts
        if rref.startswith("refs/tags/"):
            continue  # 태그는 사용자가 직접 관리 (10절)
        if not rref.startswith("refs/heads/"):
            continue
        branch = rref[len("refs/heads/"):]
        if lsha == ZERO:
            if branch in PROTECTED:
                errors.append(f"'{branch}' 삭제는 금지입니다.")
            continue
        if branch in PROTECTED:
            if rsha != ZERO:
                errors.append(f"'{branch}' 에는 직접 푸시할 수 없습니다. 기능 브랜치 → PR → squash merge 로 반영하세요 (4·6절).")
                continue
            notes.append(f"원격에 '{branch}' 가 없어 최초 기준선 푸시로 허용합니다.")
        elif not BRANCH_RE.match(branch):
            errors.append(f"브랜치 이름 '{branch}' 이(가) 규칙에 맞지 않습니다. 예: feat/req-in-04-intake-form (3절)")
            continue
        if has_object(rsha) and not is_ancestor(rsha, lsha):
            notes.append(f"'{branch}' 는 강제 푸시입니다. 본인 기능 브랜치에서 --force-with-lease 로만 허용됩니다 (9절).")
        errors.extend(review_push(branch, lsha, rsha))

    for n in notes:
        out("[깃 규칙] " + n)
    if errors:
        out("[깃 규칙] 푸시를 거부합니다. (docs/13-git-conventions.md 9절)")
        for e in dict.fromkeys(errors):
            out("  - " + e)
        return 1
    out("[깃 규칙] 푸시 검토 통과")
    return 0


# ---------------------------------------------------------------- Claude Bash 훅
SEPS = {";", "&&", "||", "|", "&", "(", ")"}


def tokenize(cmd: str) -> list[str] | None:
    try:
        lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        return list(lex)
    except ValueError:
        return None


def analyze(seg: list[str]) -> list[str]:
    try:
        i = next(k for k, t in enumerate(seg) if Path(t).name in ("git", "git.exe"))
    except StopIteration:
        return []
    args = seg[i + 1:]
    j = 0
    while j < len(args) and args[j].startswith("-"):
        j += 2 if args[j] in ("-C", "-c", "--git-dir", "--work-tree", "--namespace") else 1
    sub = args[j] if j < len(args) else ""
    rest = args[j + 1:]
    errors = []
    if any("core.hookspath" in t.lower() for t in args):
        errors.append("core.hooksPath 변경은 금지입니다 (훅 비활성화).")
    if "--no-verify" in args:
        errors.append("--no-verify 는 금지입니다. 훅이 거부한 이유를 고치세요.")
    if sub == "commit" and any(t.startswith("-") and not t.startswith("--") and "n" in t[1:] for t in rest):
        errors.append("git commit -n(--no-verify) 은 금지입니다.")
    if sub == "push":
        for t in rest:
            short = t.startswith("-") and not t.startswith("--")
            if t in ("--force", "--mirror", "--delete") or (short and ("f" in t[1:] or "d" in t[1:])):
                errors.append("강제·삭제·미러 푸시는 금지입니다. 필요하면 --force-with-lease 를 기능 브랜치에서만 쓰세요.")
                break
            if t.startswith("+") or t.startswith(":"):
                errors.append("강제(+) 또는 삭제(:) 리프스펙 푸시는 금지입니다.")
                break
    if sub == "clean" and any(t.startswith("-") and not t.startswith("--") and ("x" in t[1:].lower()) for t in rest):
        errors.append("git clean -x/-X 는 금지입니다 (무시된 references/, data/ 가 삭제됩니다).")
    return errors


def claude_bash() -> int:
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return 0
    cmd = (data.get("tool_input") or {}).get("command") or ""
    if "git" not in cmd:
        return 0
    sys.stderr.reconfigure(encoding="utf-8")
    tokens = tokenize(cmd)
    errors: list[str] = []
    if tokens is None:
        if re.search(r"--no-verify|core\.hooksPath", cmd, re.I):
            errors.append("검사 우회 옵션이 감지되었습니다.")
    else:
        segs, cur = [], []
        for t in tokens:
            if t in SEPS:
                segs.append(cur)
                cur = []
            else:
                cur.append(t)
        segs.append(cur)
        for seg in segs:
            errors.extend(analyze(seg))
    if errors:
        out("[깃 규칙 차단] " + " / ".join(dict.fromkeys(errors)) + " (docs/13-git-conventions.md 9절)")
        return 2
    return 0


def main() -> int:
    sys.stderr.reconfigure(encoding="utf-8")
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "--commit-msg" and len(sys.argv) > 2:
        return commit_msg(sys.argv[2])
    if mode == "--pre-commit":
        return pre_commit()
    if mode == "--pre-push":
        return pre_push()
    if mode == "--claude-bash":
        return claude_bash()
    out("사용법: check_git_rules.py --commit-msg <file> | --pre-commit | --pre-push | --claude-bash")
    return 64


if __name__ == "__main__":
    sys.exit(main())
