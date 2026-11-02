# 13. 깃 컨벤션·브랜치·작업 트리 규칙

> 상태: 초안 v0.1 (2026-11-02). 결정 근거: ADR-008. 이 문서의 규칙은 `scripts/check_git_rules.py`와 `.githooks/`가 **자동으로 검사**한다(9절).
> 우선순위는 `00-index.md` 3절을 따른다.

## 1. 원칙
1. `main`은 항상 **시연 가능하고 문서와 일치**하는 상태다. 직접 커밋·푸시하지 않는다.
2. 모든 변경은 **짧은 기능 브랜치 → PR → squash merge**로 들어간다. 브랜치 수명은 길어도 2~3일.
3. 브랜치 하나는 **작업 트리(worktree) 하나**에서 작업한다. 메인 작업 트리는 `main` 전용이다.
4. 단계(`docs/gates/PHASE`)와 게이트(G1~G3)는 깃 흐름 안에서 지킨다(7절).
5. 규칙은 문서가 아니라 **훅이 강제**한다. 훅을 우회하지 않는다(`--no-verify` 금지).

## 2. 저장소 구성
| 항목 | 값 |
|---|---|
| 원격 | `origin` = `https://github.com/psb3707/FC-VoC-Sys.git` |
| 기본 브랜치 | `main` (유일한 장기 브랜치) |
| 병합 방식 | squash merge 만 (선형 이력) |
| 줄바꿈 | 저장소는 LF (`.gitattributes`). `*.cmd` 만 CRLF |
| 커밋 훅 | `core.hooksPath=.githooks` (클론 직후 1회 설정) |
| 추적 금지 | `references/`, `data/`, `logs/`, `spikes/`, `.tools/`, `target/`, `.env*` |

## 3. 브랜치 이름
`<type>/<kebab-case-설명>` — 소문자, 숫자, `.`, `_`, `-` 만.
| type | 용도 | 예 |
|---|---|---|
| `feat` | 기능·화면 추가 | `feat/req-in-04-intake-form` |
| `fix` | 결함 수정 | `fix/req-ex-03-timer-drift` |
| `docs` | 문서만 변경 | `docs/test-plan-review-focus` |
| `refactor` | 동작 불변 구조 개선 | `refactor/privacy-pattern-loader` |
| `test` | 테스트만 추가·수정 | `test/masking-holdout-corpus` |
| `chore` | 도구·설정·저장소 관리 | `chore/git-hooks` |
| `gate` | **단계 전환**(PHASE 변경, 게이트 기록) 전용 | `gate/g1-docs` |
- 요구사항이 있으면 이름에 소문자 REQ-ID를 앞에 둔다 (`req-in-04-...`).
- `main`, `master` 는 보호 브랜치. `release/*`, `develop` 같은 장기 브랜치는 만들지 않는다.

## 4. 새 기능 작업 절차 (시작 → 머지 → 정리)
메인 작업 트리 경로를 `$MAIN`, 작업 트리 폴더를 `$WT`(= `$MAIN`과 같은 위치의 `FC-Voc-Sys.worktrees`)라 한다.

```bash
# 0) 시작 전: 단계 확인과 최신화 (메인 작업 트리, main 브랜치)
cat docs/gates/PHASE
git switch main && git pull --ff-only

# 1) 브랜치 + 작업 트리 생성 (원격 main 기준)
git fetch origin
git worktree add ../FC-Voc-Sys.worktrees/feat-req-in-04-intake-form \
    -b feat/req-in-04-intake-form origin/main
cd ../FC-Voc-Sys.worktrees/feat-req-in-04-intake-form

# 2) 작업 → 작게 자주 커밋 (5절 형식, 훅이 검사)
git add <파일들>
git commit            # 또는 -m "feat(ui): ..."

# 3) 최신화는 merge가 아니라 rebase
git fetch origin && git rebase origin/main

# 4) 푸시 (pre-push 훅이 자동 검토)
git push -u origin feat/req-in-04-intake-form

# 5) PR 생성 → 템플릿 체크리스트 작성 → 사용자가 squash merge (6절)

# 6) 정리: 메인 작업 트리에서
cd $MAIN
git switch main && git pull --ff-only
git worktree remove ../FC-Voc-Sys.worktrees/feat-req-in-04-intake-form
git branch -D feat/req-in-04-intake-form     # squash 후에는 -D 필요
git fetch --prune
```
- 작업 시작 전에 **관련 문서(01 요구사항, 05/06 명세)를 먼저 읽고**, 문서에 없는 기능은 만들지 않는다. 범위·구조·규칙이 바뀌면 같은 브랜치에서 **ADR → 문서 → 구현** 순서로 커밋한다.
- 브랜치 하나에는 목적 하나. 화면(FRONTEND)과 백엔드(BACKEND)를 한 브랜치에 섞지 않는다.
- 작업 중 막혀 다른 일이 급하면 **새 작업 트리**를 만든다. `git stash`로 돌려 막지 않는다.

## 5. 커밋 규칙
### 형식
```
<type>(<scope>): <요약>

<본문: 무엇을, 왜. 선택>

Refs: REQ-IN-04, ADR-006
```
| 항목 | 규칙 |
|---|---|
| type | `feat` `fix` `docs` `refactor` `test` `chore` `perf` `build` `ci` `style` `revert` |
| scope | 소문자, 선택. 권장: `intake` `privacy` `llm` `rules` `defect` `experiment` `ui` `seed` `docs` `infra` `git` |
| 요약 | 한국어 허용, 72자 이내, 마침표 없음, 명령형(“추가”, “수정”) |
| 본문 | 제목과 빈 줄로 분리. 이유 중심 |
| `Refs:` | **feat·fix 커밋 필수.** `REQ-xx-nn`, `ADR-nnn` 을 쉼표로, 해당 없으면 `Refs: none` |
| 금지 | `fixup!`/`squash!` 푸시, 병합 커밋 푸시, “WIP”만 있는 제목 |
| 제목 예 | `feat(ui): 접수 패널 알려진 오류 단계 화면 추가` |
- Claude가 만든 커밋은 시스템 지침의 `Co-Authored-By:` 줄을 마지막에 붙인다. `Refs:` 줄은 그 위에 둔다.
- 비밀키, 실제 이름·번호, `references/` 내용은 어떤 커밋에도 넣지 않는다.
- 한 커밋은 한 가지 논리적 변경. 리뷰어가 되돌릴 수 있는 크기로.

## 6. PR·머지 규칙
| 항목 | 규칙 |
|---|---|
| 대상 | 항상 `main` |
| 제목 | squash 커밋 제목이 되므로 5절 형식 (`feat(ui): … (#12)` 처럼 번호는 GitHub가 붙임) |
| 본문 | `.github/PULL_REQUEST_TEMPLATE.md` 체크리스트를 채운다 |
| 크기 | 권장 변경 400줄 이내. 넘으면 나눈다 |
| 머지 방식 | **squash merge 만**. 머지 커밋·rebase merge 쓰지 않음 |
| 머지 권한 | **사용자(프로젝트 소유자)만 머지**한다. Claude·서브에이전트는 PR 준비까지 |
| 머지 조건 | ① pre-push 검토 통과 ② PR 체크리스트 완료 ③ 충돌 없음(rebase로 해결) ④ BACKEND 단계부터는 테스트 통과 |
| 머지 후 | 원격 브랜치 자동 삭제, 로컬은 4절 6)으로 정리 |
| 충돌 | `git rebase origin/main` 으로 해결 후 `git push --force-with-lease` (본인 기능 브랜치만) |
| 되돌리기 | `git revert <squash 커밋>` 을 새 브랜치(`fix/…` 또는 `chore/…`)에서 PR로. `main` 이력을 고쳐 쓰지 않는다 |

## 7. 단계(Phase)·게이트와 깃
- 현재 단계는 `docs/gates/PHASE`. 단계별 허용 경로는 `12-delivery-plan.md` 1절, 검사는 `scripts/check_phase.py`.
- **단계 전환은 `gate/*` 브랜치의 전용 PR**로만 한다. 이 PR은 `docs/gates/G*.md`(승인 기록)와 `PHASE` 변경만 담고 **사용자가 직접** 작성·커밋한다. 푸시 검토가 이를 강제한다(`PHASE` 변경은 `gate/*` 외 거부).
- 게이트 통과 후 `main` 머지 커밋에 **주석 태그**를 단다.
| 게이트 | 태그 | 시점 |
|---|---|---|
| G1 | `docs-v1.0` | 문서 기준선 확정 |
| G2 | `ui-v1.0` | 화면 승인 |
| G3 | `exp-ready` | 실험 전 구간 통과 |
| 프롬프트 동결 | `prompt-v1` | 실험 직전(07번 문서) |
- 태그는 사용자가 만든다: `git tag -a docs-v1.0 -m "G1 문서 기준선" && git push origin docs-v1.0`. 태그 이동·삭제 금지.
- 단계가 FRONTEND일 때 `src/main/java`, `pom.xml` 을 건드리는 PR은 푸시 검토에서 거부된다.

## 8. 작업 트리(worktree) 규칙
| 항목 | 규칙 |
|---|---|
| 메인 작업 트리 | `…/Desktop/FC-Voc-Sys` (`main` 고정). pull, 태그, 정리, `references/` 보관 전용. 여기서 기능 작업을 하지 않는다 |
| 기능 작업 트리 | 저장소 **밖** 형제 폴더 `…/Desktop/FC-Voc-Sys.worktrees/<브랜치의 / 를 - 로 바꾼 이름>` |
| 동시 개수 | 기능 작업 트리 **최대 2개**(혼자 개발, 맥락 전환 비용 제한) |
| 생성 | `git worktree add ../FC-Voc-Sys.worktrees/<이름> -b <브랜치> origin/main` |
| 같은 브랜치 | 두 작업 트리에서 동시에 체크아웃 불가(깃이 거부) |
| 훅·설정 | `core.hooksPath=.githooks` 는 공통 설정이라 모든 작업 트리에 적용. 생성 직후 `git config core.hooksPath` 로 확인 |
| 추적 제외 폴더 | `references/`, `data/`, `logs/`, `.tools/`, `spikes/` 는 작업 트리에 **복사되지 않는다.** 참고 원본은 메인 작업 트리 것을 읽기 전용으로 본다(복사·이동 금지) |
| 의존 폴더 | BACKEND 단계의 `target/`, `data/` 는 작업 트리마다 따로 생긴다. 포트 충돌에 주의(하나만 실행) |
| 정리 | 머지 후 `git worktree remove <경로>` → `git branch -D <브랜치>` → `git fetch --prune`. 주 1회 `git worktree list`, `git worktree prune` 점검 |
| 금지 | 작업 트리 폴더를 탐색기에서 지우기(`remove` 사용), 메인 작업 트리 안에 작업 트리 만들기 |
| 한계 | Claude의 단계·경로 훅은 **그 세션의 프로젝트 폴더** 기준이다. 다른 작업 트리 파일은 그 폴더에서 세션을 열어 작업한다 |

## 9. 푸시 규칙과 자동 검토
### 푸시 규칙
- `main` 에는 푸시하지 않는다. **예외: 원격에 `main` 이 아직 없을 때의 최초 기준선 푸시 1회**(훅이 원격 상태로 판단).
- 푸시 대상은 규칙에 맞는 기능 브랜치뿐이다. 강제 푸시는 본인 기능 브랜치에서 `--force-with-lease` 만.
- 푸시 전 `git status` 와 `git log origin/main..HEAD` 로 내용을 눈으로 확인한다.

### 푸시 직전 자동 검토 (`.githooks/pre-push` → `check_git_rules.py --pre-push`)
하나라도 실패하면 **푸시가 거부**된다.
| # | 검토 | 거부 조건 |
|---|---|---|
| 1 | 보호 브랜치 | `main`/`master` 직접 푸시·삭제 (최초 기준선 제외) |
| 2 | 브랜치 이름 | 3절 패턴 불일치 |
| 3 | 커밋 메시지 | 5절 형식 위반, feat/fix 의 `Refs:` 누락, `fixup!`/`squash!` |
| 4 | 선형 이력 | 푸시 범위에 병합 커밋 |
| 5 | 단계 허용 경로 | 푸시 범위의 변경 파일이 현재 단계에서 금지된 경로 (`check_phase.py` 규칙) |
| 6 | 게이트 파일 | `docs/gates/PHASE` 변경이 `gate/*` 브랜치가 아님 |
| 7 | 추적 금지 경로 | `references/`, `data/`, `logs/`, `spikes/`, `.tools/`, `target/`, `.env*` 포함 |
| 8 | 비밀키 | `sk-…`, `ghp_…`, `AKIA…`, 개인 키 블록 형식 문자열 |
| 9 | 강제 푸시 알림 | 비 fast-forward 푸시 시 경고(허용은 기능 브랜치에 한함) |

### 같이 동작하는 로컬 훅
| 훅 | 검사 |
|---|---|
| `commit-msg` | 5절 메시지 형식 |
| `pre-commit` | `main` 직접 커밋 금지(루트 첫 커밋 제외), 브랜치 이름, 단계 허용 경로, 비밀키 형식 |
| Claude `PreToolUse(Bash)` | `--no-verify`, `git commit -n`, `core.hooksPath` 변경, 강제·삭제·미러 푸시(`--force`, `-f`, `+ref`, `:ref`), `git clean -x/-X` 차단 |

### 에이전트(Claude·서브에이전트) 작업 규칙
- 푸시 전에 위 9가지를 스스로 점검하고, **훅이 거부하면 우회하지 말고 원인을 고쳐** 다시 시도한다.
- 푸시는 **사용자가 요청한 브랜치만**. `main` 반영(PR 머지), 태그 생성·푸시, `PHASE` 변경은 하지 않는다.
- 푸시 결과(브랜치, 커밋 수, 훅 출력 요약)를 사용자에게 보고한다.
- 자격 증명이 필요하면 멈추고 사용자에게 알린다. 토큰을 명령 줄이나 파일에 쓰지 않는다.

## 10. 서버 측 설정 (사용자가 GitHub 웹에서 1회 설정)
로컬 훅은 우회될 수 있으므로 서버 설정이 마지막 방어선이다. `Settings → Branches → main` 규칙:
- [ ] Require a pull request before merging
- [ ] Require linear history
- [ ] Do not allow bypassing the above settings
- [ ] Block force pushes / Restrict deletions
`Settings → General → Pull Requests`:
- [ ] Allow squash merging 만 켜고 merge commit·rebase merge 끔
- [ ] Automatically delete head branches
> 개인 비공개 저장소(무료 플랜)는 일부 보호 규칙이 제한될 수 있다. 제한되면 이 사실과 대체 운영(로컬 훅 + 자기 규율)을 ADR에 기록한다.
> **최초 기준선 푸시 이후에** 설정한다(설정 후에는 `main` 직접 푸시가 서버에서도 막힌다).

## 11. 사고 대응
| 상황 | 대응 |
|---|---|
| 비밀키를 커밋·푸시함 | **키를 먼저 폐기·재발급**한다. 이력 제거(`git filter-repo`)는 사용자 승인 후. 푸시 전이면 새 커밋이 아니라 커밋을 수정해 제거 |
| `references/` 또는 실제 개인정보를 푸시함 | 즉시 사용자에게 알린다. 원격 이력 제거와 저장소 가시성 점검은 사용자 결정 |
| 훅이 오탐으로 막음 | 우회하지 않는다. `scripts/check_*.py` 규칙을 고치는 PR(`chore/git-hooks-…`)을 먼저 낸다 |
| `main` 이 깨짐 | 직접 고치지 않고 `git revert` PR |
| 작업 트리 폴더를 실수로 삭제 | `git worktree prune` 후 브랜치에서 `git worktree add` 로 복구 |

## 12. 변경 절차
이 문서·훅 규칙을 바꾸려면 `chore/git-…` 브랜치에서 ADR → 이 문서 → `scripts/check_git_rules.py` 순서로 고치고 PR로 반영한다.
