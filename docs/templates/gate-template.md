# 게이트 승인 기록 양식

> 사용법: 이 파일을 복사해 `docs/gates/` 아래 게이트별 파일로 작성한다(아래 표). G1·G2·G3 공용이다.
> 점검표는 `docs/12-delivery-plan.md` 2절의 **해당 게이트 항목을 그대로 복사**해 채운다. 항목을 빼거나 바꾸지 않는다.
> 근거 규칙: ADR-006, `13-git-conventions.md` 7절. 승인 기록과 `PHASE` 변경은 **사용자만** 한다.

## 게이트별 파일명·다음 단계·태그
| 게이트 | 이름 | 기록 파일 | PHASE 변경 | 태그(주석) |
|---|---|---|---|---|
| G1 | 문서 기준선 | `docs/gates/G1-docs.md` | `DOCS` → `FRONTEND` | `docs-v1.0` |
| G2 | 화면 승인 | `docs/gates/G2-ui.md` | `FRONTEND` → `BACKEND` | `ui-v1.0` |
| G3 | 실험 전 구간 | `docs/gates/G3-exp.md` | `BACKEND` → `RELEASE` | `exp-ready` |

---
(아래부터가 기록 본문 양식이다. 복사해서 사용한다.)

# <G1|G2|G3> <게이트 이름> 승인
- 승인일: YYYY-MM-DD
- 승인자: (사용자)
- 기준 커밋: (main 커밋 해시)
- 결과: 승인 / 조건부 승인 / 보류

## 점검표 (docs/12-delivery-plan.md 2절의 해당 게이트 항목을 복사)
| 항목 | 결과(충족/미충족/해당없음) | 근거(링크·날짜·확인자) |
|---|---|---|
| | | |

## ADR 승인
| ADR | 결정(승인/수정/보류) |
|---|---|
| | |

## 남은 미결·조건 (없으면 "없음")
| 항목 | 담당 | 기한 |
|---|---|---|
| | | |

## 단계 전환 절차 (승인 후 사용자가 직접)
1. `gate/<이름>` 브랜치의 작업 트리 생성: `git worktree add --no-track ../FC-Voc-Sys.worktrees/gate-<이름> -b gate/<이름> origin/main`
2. 이 파일을 `docs/gates/<파일명>.md` 로 작성하고, `docs/gates/PHASE` 를 다음 단계로 변경한다(대문자 한 단어, 한 줄).
3. 커밋(`docs(gates): ...`), `git push -u origin gate/<이름>`, PR → squash merge
4. 머지 후 주석 태그 생성·푸시(G1 `docs-v1.0` / G2 `ui-v1.0` / G3 `exp-ready`)
5. 정리: 작업 트리 제거, 로컬 브랜치 삭제, `git fetch --prune`
