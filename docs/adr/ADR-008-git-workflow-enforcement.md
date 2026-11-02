# ADR-008. 깃 흐름(PR·squash·작업 트리)을 문서화하고 푸시 검토를 훅으로 강제한다
- 상태: 승인 (사용자 지시, 2026-11-02)
- 배경: 문서 → 프론트 → 백엔드 순서(ADR-006)에 더해, 원격 저장소 반영과 새 기능 브랜치·머지 규칙, 작업 트리 운영을 일관되게 하고 푸시 때 이를 검토하도록 강제하길 원한다.
- 대안: (a) 문서만 두고 자율 준수 (b) 로컬 훅 + 문서 (c) 로컬 훅 + 서버 보호 규칙 + 문서
- 결정: **(c)**. 규칙 문서 `13-git-conventions.md`, 로컬 훅(`commit-msg`, `pre-commit`, `pre-push`), Claude Bash 훅, PR 템플릿, GitHub 보호 규칙(사용자 1회 설정). 병합은 squash 만, 머지는 사용자만.
- 영향: `scripts/check_git_rules.py` 신설, `check_phase.py` 허용 목록에 `.gitattributes`·`.github/` 추가(규칙 파일), `00-index.md`·`CLAUDE.md`·`12-delivery-plan.md` 갱신.
- 한계: 로컬 훅은 우회될 수 있고(`--no-verify`는 Claude 훅이 막지만 사용자 직접 입력은 못 막음), 서버 보호 규칙은 플랜에 따라 제한될 수 있다. Claude 훅은 세션의 프로젝트 폴더 기준이라 다른 작업 트리의 파일은 그 폴더에서 세션을 열어야 보호된다.
