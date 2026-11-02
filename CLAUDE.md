# FC-Voc-Sys (현장 결함 해결 순환 체계 PoC)

작업 전 반드시 `docs/gates/PHASE`(현재 단계)와 `docs/00-index.md`를 읽는다.

## 개발 순서 (강제)
`DOCS` → `FRONTEND`(기능 없는 화면) → `BACKEND`(구현·연결) → `RELEASE`. 승인 절차는 없고(ADR-010), 마일스톤 M1~M3 는 일정 지표다.
- 현재 단계에서 허용되지 않은 경로는 훅(`scripts/check_phase.py`)이 차단한다. 우회하지 말고, 차단되면 사용자에게 알린다.
- `references/` 는 Claude가 수정하지 않는다. `docs/gates/PHASE` 는 사용자가 요청할 때만 `chore(phase)` 전용 커밋으로 바꾼다.
- `git commit --no-verify`, 훅 설정 삭제·변경으로 검사를 피하지 않는다.
- 클론 직후 `git config core.hooksPath .githooks` 가 설정돼 있는지 확인한다.

## 깃 규칙 (상세: `docs/13-git-conventions.md`)
- `main`에 직접 커밋·푸시하지 않는다. 기능 브랜치(`feat|fix|docs|refactor|test|chore/<kebab>`) → PR → squash merge. 머지는 사용자만.
- 새 작업은 작업 트리에서: `git worktree add --no-track ../FC-Voc-Sys.worktrees/<이름> -b <브랜치> origin/main` (`--no-track` 필수). 첫 푸시는 `git push -u origin <브랜치>`. 메인 작업 트리는 `main` 전용.
- 커밋은 `<type>(<scope>): <요약>`, feat·fix는 `Refs: REQ-xx-nn | ADR-nnn | none` 필수. 최신화는 rebase, 병합 커밋 금지.
- 푸시는 사용자가 요청한 브랜치만. 태그 생성·PR 머지는 하지 않고, `PHASE` 는 사용자가 요청할 때만 바꾼다. pre-push가 거부하면 우회하지 말고 원인을 고친다.
- 금지: `--no-verify`, `core.hooksPath` 변경, `--force`/`-f`/`+ref`/`:ref` 푸시, `git clean -x`.

## 기준 문서
- 우선순위: 승인된 ADR(`docs/adr/`) > `docs/00~12` > 요청 프롬프트 > `docs/proposal.md`
- 문서에 없는 기능은 만들지 않는다. 범위·구조·규칙을 바꾸려면 ADR → 문서 수정 → 구현 순서를 지킨다.
- 문서와 구현이 다르면 임의로 맞추지 말고 어느 쪽을 고칠지 사용자에게 묻는다.

## 보안·개인정보
- `references/` (실제 SFA 저장본)는 읽기 전용 참고. 앱에 포함하거나 Git에 올리지 않는다.
- 원본을 Read·cat 등으로 **직접 읽지 않는다.** `python scripts/ref_outline.py > 임시파일` 로 마스킹된 구조 요약을 만들고, 자동 검사(성씨 3글자 잔여·데이터 행·회사명)를 통과한 뒤에만 내용을 본다. 확인 후 임시 파일은 지운다(ADR-011).
- 시드·평가 데이터는 전부 가상. 실제 이름·번호·사번을 넣지 않는다.
- API 키는 환경 변수로만. 저장소·로그·문서에 쓰지 않는다.
- LLM에는 `MaskedInput`만 전달한다 (마스킹 → 참조키 → 속성 일반화 후).

## 프론트 단계 규칙
- 화면은 HTML 더블클릭으로 열려야 한다(서버·Node 불필요). 데이터는 `js/fixtures/` 고정값, 통신은 `js/api-client.js` 한 곳.
- 상단에 "화면 시안 – 실제 동작 안 함"을 표시한다.

## 언어·UI
- UI 문구는 한국어, 쉬운 말, 큰 글씨(본문 18px 이상, 주요 버튼 높이 56px 이상).
