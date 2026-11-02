# FC-Voc-Sys

설계사 시스템 결함 해결 순환 체계 PoC (접수 → AI 구조화 → 결함 대장 → 처리 → 경과 공유).

## 현재 단계
`docs/gates/PHASE` 파일 참고. 문서(`docs/00-index.md`)가 의사결정 기준입니다.

## 처음 한 번 (클론 직후)
```
git config core.hooksPath .githooks
```
단계 순서 검사(`scripts/check_phase.py`)와 비밀키 검사가 커밋 때 동작합니다. `--no-verify`로 우회하지 마세요.

## 주의
- `references/` (실제 SFA 저장본)는 Git·앱·외부 전송 금지.
- 모든 데이터는 가상입니다.
