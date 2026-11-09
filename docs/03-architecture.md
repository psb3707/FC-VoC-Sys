# 03. 아키텍처 정의서

> 원천: 계획 2·3절. 기술 선택의 근거는 `04-tech-stack.md`.

## 1. 설계 원칙
1. **마스킹 → LLM → 규칙** 순서를 어기지 않는다. LLM에는 마스킹된 입력(`MaskedInput`)만 전달한다.
2. AI는 구조화·되묻기·분류·안내문 초안·비슷한 대표 결함 후보 추천(ADR-017, 연결은 사람)·접수 채널의 사용법과 공개 결함 안내(ADR-018)만. **등급·부서는 규칙**이 정한다.
3. 접수는 SFA 안(목업), 관리는 SFA 밖(별도 화면).
4. 공급자 교체 가능: 업무 코드는 `LlmGateway` 인터페이스만 안다.
5. 시연 안정성 우선: Mock 모드, LLM 실패 시 규칙 대체.
6. 화면은 `api-client.js` 한 곳으로만 통신(프론트 우선 개발과 연결 단계 분리).

## 2. 구성 요소
```
[브라우저]  S1 SFA 목업+접수 패널 / S4 결함 대장 / S5 참가자 실험 / S6 진행자
    │ REST (localhost, 바인딩은 설정값)
[Spring Boot 단일 프로세스]
    intake      접수 단계 조정 (알려진 오류 → 입력 → 되묻기 → 결과)
    privacy     차단·마스킹·참조키·속성 일반화·송신 직전 검사
    llm         LlmGateway → LlmProvider(openai | anthropic | compatible | mock)
    rules       유형 후처리·처리 등급·담당 부서·필수 슬롯
    defect      대표 결함·상태 전이·안내문·알림 기록
    experiment  배정·시행 측정·CSV·블라인드 채점
    [H2 파일 DB]  [logs/llm-*.jsonl]  [config/*.yml]  [prompts/*]  [mock/*]
```

## 3. 접수 데이터 흐름 (B모드)
```
입력(선택값, 한 줄, 되묻기 답변, 고객번호)
 ① 정규화(NFKC, 공백·하이픈 변형 통일)
 ② 차단 검사: 주민번호·계좌·카드 형식 → 전송 중단 + 경고 (값은 저장·기록하지 않음)
 ③ 참조키 치환: 증권·계약·설계·고객번호 → K-01 (매핑은 서버 전용 테이블)
 ④ 마스킹: 전화·주소·이름
 ⑤ 속성 조회: 참조키 → 가상 계약 → 범주형 속성으로 일반화
 ⑥ 미리보기: "AI에게 전달되는 내용" 표시
 ⑦ OutboundGuard: 송신 직전 재검사, 탐지 시 송신 거부
 ⑧ LLM 호출 → 스키마 검증 → (실패 시 1회 재시도 → 규칙 대체 + 사람 확인)
 ⑨ 서버 후처리: 이미 아는 슬롯의 질문 제거, 최대 3개로 자름
 ⑩ 규칙 확정: 처리 등급·담당 부서 (AI는 정하지 않음)
 ⑪ 사람 확인 후 티켓 저장
```
A모드: ②~④ 동일(저장 데이터 기준 일치), ⑤~⑨ 생략, 유형은 "미분류", ⑩은 선택값 기준.

## 4. 경계와 의존 규칙
- `llm` 패키지는 `privacy`의 `MaskedInput`만 받는다. `MaskedInput` 생성자는 `privacy` 패키지 밖에서 호출할 수 없다(아키텍처 테스트).
- `RefKeyMap` 원값은 어떤 API로도 노출하지 않는다.
- `intake`·`defect`·`experiment`는 `rules`를 호출하되 `llm` 결과로 등급을 덮어쓰지 않는다.
- 로그에는 요청 본문·예외 메시지에 입력값을 남기지 않는다.

## 5. 공급자 교체 지점
`LlmProvider` 구현 추가만으로 사내 모델 교체 가능. 설정: `llm.provider`, `llm.model`, `llm.base-url`, `llm.timeout`.

## 6. 실행 형태
- 단일 JAR + `config/`, `prompts/`, `mock/`, `seed/` 외부 폴더. `start.cmd` 한 번으로 서버 기동과 브라우저 열기.
- 기본 바인딩 `127.0.0.1`. 다른 PC 접속이 필요하면 설정으로 변경(실험 진행 방식 Q1 결정 후).
- 데이터: `data/` (H2 파일), `logs/`. 둘 다 Git 제외.

## 7. 디렉터리 구조
```
FC-Voc-Sys/
├─ start.cmd, reset.cmd, README.md, CLAUDE.md, .gitignore
├─ pom.xml, mvnw, .mvn/                 (백엔드 단계부터)
├─ .githooks/, .claude/settings.json, scripts/check_phase.py
├─ assets/                              (공용 자산. 실제 화면 캡처는 넣지 않음, ADR-012)
├─ references/                           (Git 제외, 참고 전용)
├─ docs/  00~13, adr/, gates/PHASE(현재 단계), proposal.md
├─ config/  grading-rules.yml, department-map.yml, required-slots.yml, privacy-patterns.yml
├─ prompts/  {triage,refine,notice}.{system,user}.md, schemas/*.schema.json
├─ mock/  triage|refine|notice/*.json
├─ seed/  users.yml, contracts.yml, defects.yml, reports.yml, scenarios.yml
├─ eval/  masking-dev.yml, masking-holdout.yml, classification-gold.yml
└─ src/
   ├─ main/java/.../pilot/ {intake, privacy, llm/{provider,prompt,log}, rules, defect, experiment, seed, common}
   ├─ main/resources/static/
   │   index.html(S1+S2+S3), ledger.html(S4), experiment.html(S5), facilitator.html(S6)
   │   js/api-client.js, js/fixtures/*.js, js/, js/dev/selftest.js, css/
   └─ test/java/ (privacy, rules, llm 계약, experiment 배정)
```
