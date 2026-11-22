# 05. 데이터 모델·API 명세

> 프론트 fixtures(`js/fixtures/`)는 이 문서의 응답 형식을 따른다. 백엔드 연결 시 `api-client.js`의 데이터 출처만 바꾼다.

## 1. 엔티티
| 엔티티 | 주요 필드 | 관계·비고 |
|---|---|---|
| `AppUser` | id, name(가상), role(FC/MANAGER/SALES/IT), branchId, unlinkedSeenAt? | 역할 전환 상자의 원본. `unlinkedSeenAt`: 담당자(SALES/IT)가 대장의 [아직 안 묶인 신고]를 마지막으로 본 시각. 이보다 뒤에 들어온 안 묶인 신고가 "새로 들어옴"(REQ-LG-07, ADR-017) |
| `Branch` | id, name(가상), regionGroup | 영향 지점 수 계산 |
| `Report` | id, reporterId, submittedById, kind(FULL/ME_TOO), mode(A/B), business, symptom, maskedText, autoContext(JSON), slots(JSON), aiResult(JSON), aiType, finalType, grade, departmentCode, closedAsGuidance, defectId?, trialId?, createdAt | Defect N:1. **원문은 저장하지 않고 마스킹본만** |
| `autoContext` 내용 | reportedFrom(접수 화면·기기), screenCode, errorCode, occurredAt | 오류가 난 기기·경로는 슬롯으로 별도 |
| `FollowUpQa` | id, reportId, slot, question, maskedAnswer, seq | Report 1:N |
| `Defect` | id(D-2026-001), title, type, systemGen(OLD/NEW), grade, status, departmentCode, workaround, plannedFixDate?, wontFixReasonCode?, wontFixReasonText?, published, updatedAt | 영향 지점 수·신고 수는 계산 |
| `Defect.status` 코드 | `RECEIVED`(접수) · `REPRODUCED`(재현 확인, FC 화면 이름 "문제 확인") · `CAUSE_FOUND`(원인 파악) · `WORKAROUND`(임시조치) · `FIX_PLANNED`(수정 예정, plannedFixDate 필수) · `RESOLVED`(해결) · `WONT_FIX`(수정하지 않음, wontFixReason* 필수) | 02번 3절 상태 단계. 화면 이름은 06번 5절(ADR-015) |
| `DefectStatusHistory` | id, defectId, from, to, reason, backReason?, plannedFixDate?, resolution?{…, verification?}, actorId, at, notifiable | Defect 1:N. 검증·되돌림 사유는 ADR-029 |
| `FieldVerification` | id, seq, reportId, defectId, resolutionEventId, result(CONFIRMED_OK/STILL_FAIL/NOT_TESTED), at, actorId, requestId | 덧붙이기만. `WorkResumption`과 별도(ADR-029) |
| `FieldInvestigation` | id, reportId, defectId, resolutionEventId, code(STARTED/NEED_INFO/NOT_REPRODUCED/RESIDUAL_SUSPECTED), at, actorId | 문제 지속 신고의 IT 후속 조사(ADR-029) |
| `FcNotice` | id, defectId, draftText, approvedText, status(DRAFT/APPROVED), llmCallId, approverId | 승인본만 FC에 노출 |
| `NotificationLog` | id, defectId, historyId, recipientId, reportId?, audience(REPORTER/SUBMITTER), kind(STATUS/PROXY_RECEIPT), bodySnapshot, summary{title,status,headline,line,action}, channel=PREVIEW, at, readAt? | 실발송 없음. `audience`·`kind`는 02번 4-1절(ADR-025). `PROXY_RECEIPT`는 `historyId`가 없음 |
| `WorkResumption` | reportId, result(RESUMED/STILL), at | Report 1:1(마지막 답). 신고자 본인만 기록. 대표 결함 상태와 무관(ADR-025) |
| `VirtualContract` | id, customerNo, policyNo, proposalNo, statusCat, productGroup, lastChangeType, lastChangeAt, channel | 가상 데이터 |
| `RefKeyMap` | refKey, reportScope, kind, originalValue | **서버 전용**. 신고별로 K-01부터 새로 시작. API로 노출 금지 |
| `LlmCall` | id, task(TRIAGE/REFINE/NOTICE/SIMILAR), provider, model, promptVersion, requestHash, latencyMs, retries, outcome(OK/RETRIED/FALLBACK), trialId? | 전문은 JSONL(마스킹본)에 |
| `Participant` | code(P01), roleGroup(MANAGER/HQ), cell, consentChecked | 실명 없음 |
| `Scenario` | id, set(S1/S2), pairNo, cardText, simulatedContext(JSON), customerNo?, answerKey(JSON), practice | YAML에서 적재 |
| `Trial` | id, participantCode, scenarioId, mode, seq, startedAt, submittedAt, durationMs, llmWaitMs, followUpCount, usabilityScore, llmOutcome, reportId, status(DONE/INVALID), invalidReason | 측정 원자료 |
| `ScoreItem` | trialId, itemCode, manual, satisfied, scorerId | 블라인드 판정 결과 |

## 2. 공통 규약
- 형식: JSON, UTF-8. 시각은 ISO-8601(로컬 타임존 포함).
- 오류 응답: `{"error":{"code":"BLOCKED_INPUT","message":"...","detail":{...}}}`
- 오류 코드: `BLOCKED_INPUT`(주민/계좌/카드 탐지, 탐지 유형만 반환), `VALIDATION`, `INVALID_TRANSITION`, `NOT_FOUND`, `LLM_UNAVAILABLE`(규칙 대체로 흡수되어 보통 노출 안 됨)
- 차단된 입력 값은 응답·로그·DB 어디에도 되돌려주지 않는다.

## 3. API 목록
| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/api/users` | 역할 전환·대리 접수 대상 |
| GET | `/api/meta/form` | 업무·증상 선택지, 슬롯 |
| GET | `/api/known-errors?screen=&symptom=` | 알려진 오류 조회 |
| POST | `/api/known-errors/{id}/me-too` | "나도 겪었어요" 신고 생성 |
| POST | `/api/intake/preview` | 차단·마스킹 결과와 AI 전달 내용 미리보기 |
| POST | `/api/intake/sessions` | B모드 AI 분석 시작, 되묻기 반환 |
| POST | `/api/intake/sessions/{id}/answers` | 되묻기 답변 제출, 정제 결과 반환 |
| POST | `/api/reports` | 신고 최종 제출(A/B 공통, 사람 확인값 포함) |
| GET | `/api/reports/mine?userId=` | 내 신고와 진행 단계 |
| POST | `/api/reports/{id}/work-resumption` | FC 업무 재개 회신(신고자 본인만, REQ-KN-05) |
| POST | `/api/reports/{id}/field-verifications` | 수정 뒤 현장 확인(신고자 본인이면서 FC 역할만, REQ-KN-08) |
| POST | `/api/reports/{id}/investigations` | 문제 지속 신고의 후속 조사 코드(영업·IT, REQ-LG-12) |
| GET | `/api/reports/branch?managerId=` | 관리자 [지점 FC 문의] (REQ-KN-06) |
| GET | `/api/reports/unlinked?userId=&q=` | 아직 대표 결함에 안 묶인 신고(최신 순, 신고자 지점, 그 담당자 기준 `isNew`). `q`가 있으면 글자 찾기 (REQ-LG-02·07·08) |
| POST | `/api/reports/unlinked/seen` | 담당자가 [아직 안 묶인 신고]를 본 시각(`AppUser.unlinkedSeenAt`) 기록 (REQ-LG-07) |
| POST | `/api/reports/{id}/similar-defects` | AI 비슷한 대표 결함 후보 1~3개(07번 ⑤, 실패 시 규칙 후보, 프론트 단계 새 신고는 규칙 후보 `RULE`) (REQ-LG-06·09) |
| GET | `/api/defects?status=&grade=&type=&q=` | 대표 결함 목록. `q`가 있으면 글자 찾기(필터와 AND) (REQ-LG-05·08) |
| POST | `/api/defects` | 신고에서 대표 결함 생성 |
| GET | `/api/defects/{id}` | 상세, 연결 신고, 이력 |
| POST | `/api/defects/{id}/reports` | 신고 연결 |
| POST | `/api/defects/{id}/status/preview` | 상태 변경 알림 대상·문구 미리보기 |
| POST | `/api/defects/{id}/status` | 상태 변경 확정, 알림 기록 |
| POST | `/api/defects/{id}/notices/draft` | AI 안내문 초안 |
| POST | `/api/notices/{id}/approve` | 담당자 승인 |
| GET | `/api/notifications?userId=` | 알림 미리보기 내역 |
| POST | `/api/experiment/participants` | 참가자 등록과 칸 배정 |
| GET | `/api/experiment/participants/{code}/next` | 다음 시나리오 |
| POST | `/api/experiment/trials/{id}/start` | 서버 측 시작 시각 기록 |
| POST | `/api/experiment/trials/{id}/submit` | 제출, 측정값 기록 |
| POST | `/api/experiment/trials/{id}/usability` | 편의성 점수 |
| POST | `/api/experiment/trials/{id}/invalidate` | 무효 처리와 사유 |
| GET | `/api/experiment/export/raw.csv` | 원자료 |
| GET | `/api/experiment/export/blind-scoring.csv` | 블라인드 판정표 |
| POST | `/api/experiment/import/scores` | 판정 결과 업로드 |
| GET | `/api/experiment/export/summary.csv` | 모드별 요약 |
| GET | `/api/stats/overview` | (Could) 사용 현황 |
| GET | `/api/admin/health/llm` | 현재 공급자·호출 가능 여부 |
| POST | `/api/admin/reset` | 시드 초기화(dev 프로필, 실험 데이터 있으면 재확인) |

## 4. 핵심 요청·응답 예 (fixtures 기준)
### POST `/api/intake/preview`
요청
```json
{"mode":"B","business":"CUSTOMER_LOOKUP","symptom":"NOT_SHOWN","oneLine":"가입내역이 안 보여요","customerRelated":true,"customerNo":"(별도 입력란 값)"}
```
응답
```json
{"blocked":false,"detections":[],"maskedText":"[고객] 가입내역이 안 보여요","refKeys":["K-01"],
 "aiPayload":{"text":"가입내역이 안 보여요","attributes":{"ref":"K-01","contractStatus":"유지","productGroup":"종신","lastChange":{"type":"계약자변경","month":"2026-11"},"channel":"모바일"}}}
```
차단 시: `{"blocked":true,"detections":[{"type":"RRN"}]}` (값 없음, HTTP 422 `BLOCKED_INPUT`).

### 접수 채널 AI 문의 (ADR-018)

화면은 `ApiClient.getIntakeQuestions()`와 `ApiClient.postIntakeQuestion({text})`를 사용한다. FRONTEND 단계에서는 시연용 표현 매칭과 가상 공개 대장만 읽는다. BACKEND 단계의 `POST /api/intake/questions`는 마스킹·차단을 먼저 거친다.

응답의 `outcome`은 `GUIDANCE`, `MATCH`, `NO_MATCH`, `UNAVAILABLE`, `BLOCKED` 중 하나다. `type`은 `USAGE`, `DEFECT`, `IMPROVEMENT` 또는 확인이 필요한 경우 `null`이다. 안내 문구와 업무·증상 코드는 있을 때만 제공한다. `MATCH`의 `defect`에는 공개된 ID·제목·상태·임시 방법·예정일·수정하지 않는 이유만 포함할 수 있다. 승인된 안내문은 별도 안내 문구로 준다. 차단 응답에는 질문 내용이 없다.

### 두 화면 접수 (ADR-019)

- 브라우저 가상 API는 업무·대표 증상의 공개 결함 조회, 송신 전 내용 점검, 접수 확정, 기존 접수의 후속 기록을 분리한다.
- 접수 내용은 업무·대표 및 추가 증상·한 줄/상세 설명·시도한 공개 임시 방법·고객 범위·긴급 사정과 접수 환경/발생 환경·연락 선호를 구분한다. 고객번호 원값은 내역과 임시저장에 반환하지 않는다.
- 요청 식별자가 같은 제출은 같은 접수번호를 돌려준다. 참여는 사용자·결함별 한 건을 활성 상태로 유지하고, 취소하면 참여 내역에서 제외한다. 재발과 추가 설명은 이력이며 대표 결함 상태를 직접 바꾸지 않는다.

### 1차 후속 요구 (ADR-021)

- `getIntakeDiagnostics()`는 허용 목록의 `submission`과 `incident`를 분리한다. 화면 코드·시각·기기·브라우저 버전·오류코드·동작 코드를 허용하며 원천 이벤트의 고객 식별정보, 화면 입력값, 비밀번호와 토큰을 배제한다.
- 접수, 담당자 연결, 상태 이력, 발송 결과, 읽음은 가상 기록으로 유지한다. `postStatus`의 해결은 적용 시각·범위·변경 내용·재시도/재발송 여부·공개 승인과 요청 식별자를 받는다. 같은 이벤트의 수신자별 알림은 동일 ID를 사용한다.
- 운영 단계에서는 인증된 사용자와 담당자만 열람할 수 있도록 서버에서 권한을 검증하고, 승인된 안내와 진단 허용 목록을 서버에서 다시 검증한다.

### 신고자 정보와 접수·발생 환경 (ADR-028, REQ-IN-17·18, REQ-LG-11)
- **신원.** 신고 저장본은 `reporterId`(오류를 겪은 사람)·`submittedById`(접수 버튼을 누른 로그인 사용자)만 둔다. 이름·역할·지점명은 `GET /api/users`·`Branch`로 조회한다. 프론트 단계의 로그인 사용자는 역할 전환으로 고른 가상 사용자다. **백엔드 단계에서는 `submittedById`를 인증 세션에서 정하고 요청 본문의 접수자·지점 값을 쓰지 않는다.**
- **검증.** `postQuickIntake`·`postQuickParticipation`은 ① 두 사용자가 있고 ② 각자 지점이 있으며 ③ 신고자 ≠ 접수자이면 접수자는 `MANAGER`, 신고자는 같은 지점 `FC`일 때만 저장한다. 아니면 `{identityError: true}`(저장 0건). 화면용 `getReporterContext(viewerId, reporterId, submittedById)` → `{reporter:{id,name,role,roleLabel,branchId,branchName}, submitter:{…}, proxied, error}`. 보는 사람이 FC면 자기 자신만, 관리자는 자신과 같은 지점 FC만, 영업·IT는 모두 조회한다. 그 밖에는 `null`.
- **접수 환경 `diagnostics.submission`.** `{screen, screenCode, device, deviceType, browser, at, source}`. `deviceType`은 `PC|PHONE|TABLET`, `browser`는 종류와 주 버전(예: `Chrome 131`)만, `source`는 `BROWSER_CAPTURED`(브라우저가 알려 줌). 알 수 없는 값은 `null`(화면 "미확인"). User-Agent 전체·주소·쿼리·쿠키·토큰은 저장하지 않는다. 화면 코드는 앱이 아는 코드(`MAIN` 등)만.
- **발생 환경 `diagnostics.incident`.** 진단 이벤트가 준 값만(프론트 단계: `diagnostics=mobile` 시연 이벤트, `source: DEMO_CONTEXT`). 없으면 모든 값이 `null`. FC가 알려 준 발생 기기·조건·발생 날짜/시각은 `incident.device`·`conditions`·`incident.date/time`(출처 `factSources`)에 그대로 두고, 화면이 두 출처를 합쳐 "오류가 발생한 환경"으로 보인다. 접수 환경 값을 발생 환경에 복사하지 않는다.
- **AI 요청.** `postIntakeQuestion`·`planIntakeDraft` 요청에는 신고자·접수자·지점·계정·접수 환경을 넣지 않는다.

### 2차 후속 요구 (ADR-022)

- `previewIntakeDraft`는 텍스트 허용 필드만 가려 반환한다. `planIntakeDraft`에는 미리보기 텍스트와 확인 여부만 넘긴다. 결과는 선택 질문 최대 3개와 근거별 초안 필드다.
- `postQuickIntake`는 사용자가 확정한 이미지 한 장과 확인한 초안을 선택적으로 받는다. 가상 저장에 실패하면 접수번호를 만들지 않고 첨부를 다시 보내거나 빼고 접수할 수 있다. `getReportAttachment`는 가상 담당자 역할만 조회하며 응답은 확인된 이미지다.

### AI 문의 상담 인계와 사건 정보 (ADR-026, REQ-IN-13·14)

- `postIntakeQuestion` 응답이 `MATCH`이고 시나리오에 확인 항목이 있으면 `checks`와 `resumeQuestion`을 더한다. `checks`는 최대 3개이며 `known`은 질문 문장에서 이미 알 수 있는 답(없으면 `null`)이다. 화면은 `known`이 없는 항목만 묻는다. 결함이 해결·수정하지 않음이거나 임시 방법이 없으면 `resumeQuestion`은 `null`이다.
```json
{"outcome":"MATCH","business":"SUBSCRIPTION","symptom":"WRONG_SCREEN","defect":{"id":"D-2026-001","status":"WORKAROUND","workaround":"…"},
 "checks":[{"key":"DEVICE","text":"고객님 휴대전화에서 링크를 여셨나요?","choices":[{"code":"CUSTOMER_PHONE","label":"네, 고객님 휴대전화예요"},{"code":"SAME","label":"아니요, 지금 이 기기예요"},{"code":"UNKNOWN","label":"잘 모르겠어요"}],"known":null}],
 "resumeQuestion":"문자로 서명 링크를 보내니 청약을 진행할 수 있었나요?"}
```
- 상담 상태(질문·되묻기·답·조치 결과)는 페이지 메모리에만 둔다. 인계 객체(화면 사이, 저장 안 함): `{origin:"ASSISTANT", question, business, symptom, suggestedDefectId, facts:{DEVICE, SEMINAR_HISTORY, CUSTOMER_WAITING}, attemptedDefectId, outcome:"RESUMED|STILL|UNKNOWN"}`. 지시서 예시의 필드는 `incidentFacts.device`→`incident.device`(`CUSTOMER_PHONE`), `seminarHistory`→`conditions.SEMINAR_HISTORY`, `customerWaiting`→`urgent`의 `CONSULTING`, `attemptedAction`→`attemptedWorkaround`(대장 임시 방법 문장, `guideId` 결함과 같을 때만), `pendingOutcome`→`workOutcome`으로 맞췄다.
- `postQuickIntake` 요청에 `origin`, `conditions`, `workOutcome`, `suggestedDefectId`, `factSources`를 더한다. `incident.device`는 `CUSTOMER_PHONE`(고객 휴대전화)을 허용한다.
- 접수 저장본(공유 저장소)은 허용 목록을 거친 코드만 남긴다. 목록 밖의 값은 버리고 빈 값으로 둔다.

| 키 | 허용 값 | 비고 |
|---|---|---|
| `origin` | `ASSISTANT` `FORM` | AI 문의에서 넘어왔는지 |
| `incident.device` | `SAME` `PC` `PHONE` `TABLET` `CUSTOMER_PHONE` `OTHER` `UNKNOWN` | 오류가 난 기기(FC 진술). `OTHER` "다른 기기"는 ADR-027 |
| `conditions.SEMINAR_HISTORY` | `YES` `NO` `UNKNOWN` | 전자서명 시나리오(D-2026-001) 확인 항목 |
| `conditions.INPUT_STEP` | `FRONT` `BACK` `UNKNOWN` | 고객 동의 시나리오(D-2026-007, ADR-027): 문제가 생긴 입력란(앞자리/뒷자리). 입력한 값은 두지 않음 |
| `conditions.KEYPAD_SYMPTOM` | `NO_KEYPAD` `NO_INPUT` `UNKNOWN` | 키패드가 안 나타남 / 보이지만 입력 안 됨 |
| `conditions.DEVICE_OS` | `ANDROID` `IOS` `UNKNOWN` | 고객 기기 환경(FC 진술, 자동 수집 아님) |
| `conditions.URL_PATH` | `IN_APP` `EXTERNAL` `UNKNOWN` | 링크를 연 경로(앱 안 브라우저 / 외부 브라우저) |
| `workaroundState` | `NONE` `OFFERED` `TRIED` 또는 `null` | ADR-027. 승인된 임시조치 없음 / 안내했지만 결과 미확인 / 시도함. 없으면 `workOutcome`으로 읽음(`RESUMED|STILL`→`TRIED`, `UNKNOWN`→`OFFERED`) |
| `supportNeeded` | `YES` `NO` `UNKNOWN` 또는 `null` | ADR-027. 업무를 이어가기 어려움(추가 지원 필요). 대리 접수는 항상 `null` |
| `workOutcome` | `RESUMED` `STILL` `UNKNOWN` 또는 `null` | 접수 시점의 조치 결과. 대리 접수는 항상 `null`. ADR-027: `TRIED`이면 `RESUMED|STILL`, `OFFERED`이면 `UNKNOWN`, `NONE`이면 `null`(어긋난 조합은 버림) |
| `suggestedDefectId` | 공개 대표 결함 ID 또는 `null` | AI 문의가 안내한 사례. 연결 아님. ADR-027: 그 결함의 시나리오 업무가 접수 업무와 다르면 버림 |
| `factSources.*` | `USER_REPORTED` `DEMO_CONTEXT` `BROWSER_CAPTURED` `DEFECT_LEDGER` `UNKNOWN` | 키는 `device` `conditions` `urgent` `attempted` `workOutcome` `supportNeeded`(ADR-027) |

- 접수 뒤 `workOutcome`이 `RESUMED|STILL`이고 접수자가 신고자 본인이면 화면이 `POST /api/reports/{id}/work-resumption`을 한 번 부른다(같은 접수에 다시 부르지 않음). `getMyReports`·`getUnlinkedReports`·`getDefect`의 신고는 같은 저장본을 읽어 위 키를 그대로 내린다.

### POST `/api/intake/sessions`
응답
```json
{"sessionId":"S-001","classification":{"type":"DEFECT","confidence":"HIGH","reason":"..."},
 "ticket":{"title":"...","symptomSummary":"...","stepsToReproduce":["..."],"expected":null,"actual":null},
 "questions":[{"slot":"other_customers","text":"다른 고객도 같은 증상이 있나요?","choices":["네","아니요","모르겠어요"]}],
 "usageGuide":null,"needsHumanReview":false,"llmOutcome":"OK"}
```

### POST `/api/reports` 응답
```json
{"reportId":"R-001","type":"DEFECT","grade":"IMMEDIATE","departmentCode":"SUBSCRIPTION_IT","closedAsGuidance":false}
```

### GET `/api/reports/mine?userId=` 응답 (S3 내 신고, ADR-015)
신고마다 묶인 대표 결함의 지금 상태, 대표 결함의 상태 이력, **승인된** FC용 안내문만 붙인다(미승인 초안은 `null`, REQ-NT-01). 대표 결함에 아직 묶이지 않은 신고는 `defectId`·`defect`가 `null`이고 화면에서는 "접수"로 본다. 최신 신고 순.
```json
[{"id":"R-011","reporterId":"U-001","kind":"FULL","finalType":"DEFECT","createdAt":"2026-10-30T14:10:00+09:00",
  "maskedText":"서명 알림톡을 누르면 세미나 초대장 화면이 떠요","defectId":"D-2026-001",
  "defect":{"id":"D-2026-001","title":"...","status":"WORKAROUND","workaround":"...","plannedFixDate":null,
            "wontFixReasonCode":null,"wontFixReasonText":null,"updatedAt":"2026-11-02T10:20:00+09:00"},
  "statusHistory":[{"from":null,"to":"RECEIVED","at":"..."},{"from":"RECEIVED","to":"CAUSE_FOUND","at":"..."},
                   {"from":"CAUSE_FOUND","to":"WORKAROUND","at":"..."}],
  "fcNotice":{"id":"FN-001","status":"APPROVED","approvedText":"..."}}]
```
- `statusHistory`는 `DefectStatusHistory`에서 FC에 필요한 `from`·`to`·`at`만 내린다(`actorId`·`reason` 제외).
- 단계는 건너뛸 수 있다(예: `RECEIVED → CAUSE_FOUND`). 화면은 지금 상태 기준으로 지난 단계를 채운다.
- `WONT_FIX`이면 화면은 직전 상태(`statusHistory` 마지막 항목의 `from`)까지 막대를 채우고 "수정하지 않음 · ○○ 단계에서 끝났어요"로 표시한다(06번 5절).
- ADR-025 추가 키: `workResumption`(`{result, at}` 또는 `null`), `reporter`·`submittedBy`(`{id, name}`, 대신 접수한 건이면 둘이 다름). `defectId`가 있으면 "담당자가 확인했어요", 없으면 "접수됨 · 담당자 확인 전"으로 본다.

### 빠른 도움·간편 알리기 (ADR-027, REQ-IN-15·16)
- `postIntakeQuestion`의 `checks[]`에 `stage`(`guide`: 안내를 고르는 데 필요 / `report`: 담당자 확인용)를 더한다. 화면은 `guide` → 결과 카드 → 결과 질문 → `report` 순서로 묻고, 합쳐 3개를 넘지 않는다. 임시 방법이 없는 공개 결함이면 `resumeQuestion` 대신 `supportQuestion`("지금 이 고객님과 업무를 이어가기 어려운 상황인가요?")을 내린다.
- 인계 객체에 `workaroundState`, `supportNeeded`를 더한다. 확인 화면은 업무·대표 증상·`guide` 조건이 바뀌면 `suggestedDefectId`를 다시 확인하고, 맞지 않으면 그 결함의 조건 값·시도한 조치·`workaroundState`·`workOutcome`을 함께 지운다.
- `postQuickParticipation(defectId, reporterId, submittedById, extra)`: `extra = {requestId, incident:{device}, conditions, urgent, workaroundState, workOutcome, supportNeeded, factSources}`(허용 목록을 거친 코드만). 응답은 `ME_TOO` 접수. 같은 사용자의 활성 참여나 그 결함에 연결된 접수가 있으면 새로 만들지 않고 그 접수에 `duplicate:true`를 붙여 돌려준다. 공개되지 않았거나 해결된 결함이면 `null`.

### POST `/api/reports/{id}/work-resumption` (REQ-KN-05, ADR-025)
요청 `{"userId":"U-001","result":"RESUMED"}` → 응답 `{"saved":true,"result":"RESUMED","at":"2026-11-15T10:20:00+09:00"}`. 신고자가 아니거나 `result`가 두 값이 아니면 `null`. `STILL`이면 그 신고의 후속 기록(`action: STILL`)도 남긴다. 대표 결함 상태·알림은 바꾸지 않는다. ADR-027: 같은 신고·같은 신고자의 마지막 회신과 결과가 같거나 같은 `requestId`이면 새 기록·후속 기록 없이 기존 기록에 `duplicate:true`를 붙여 돌려준다.

### GET `/api/reports/branch?managerId=` 응답 (REQ-KN-06, ADR-025)
관리자와 같은 지점 FC의 신고와 관리자가 대신 접수한 신고. 신고마다 `id, kind, business, createdAt, defectId, defect(공개 키), reporter{id,name}, byMe(내가 대신 접수), workResumption, notice(UNREAD/READ/NONE: 그 FC가 이 대표 결함의 마지막 알림을 읽었는지)`. `maskedText`는 `byMe`일 때만 내린다(FC가 적은 설명은 관리자에게 보이지 않음). ADR-027: `workaroundState`, `workOutcome`(대리 접수는 `null`), `supportNeeded`를 더 내린다. 화면은 FC별로 묶어 업무 상황(업무 재개·업무 진행 어려움·회신 없음·임시조치 미확인)을 계산한다.

### 알림 (`GET /api/notifications?userId=`, ADR-025)
항목마다 `audience`(REPORTER/SUBMITTER), `kind`(STATUS/PROXY_RECEIPT), `reportId`(FC 알림), `read`. 한 상태 변경의 수신자는 02번 4-1절 규칙으로 고르고 같은 사람은 1건이다.

### GET `/api/reports/unlinked?userId=` 응답 (S4 아직 안 묶인 신고, ADR-017)
`defectId`가 `null`인 신고, 최신 순. `reporter`는 화면 표시용(이름(가상)·지점). `isNew`는 `createdAt`이 그 담당자의 `unlinkedSeenAt`보다 뒤면 `true`. 이 목록은 LLM에 보내지 않는다.
```json
[{"id":"R-062","reporterId":"U-010","kind":"FULL","business":"ETC","symptom":"NOT_SHOWN","finalType":"UNCLASSIFIED",
  "maskedText":"첨부 메뉴 글자가 겹쳐 보여요","defectId":null,"createdAt":"2026-11-04T09:30:00+09:00",
  "reporter":{"id":"U-010","name":"(가상)","branchId":"B-05","branchName":"(가상)"},"isNew":true}]
```
- 프론트 단계에서는 `unlinkedSeenAt`을 고정값으로 두고 `seen` 기록은 하지 않는다(배지가 줄지 않음).

### 글자 찾기 `q` (S4, REQ-LG-08)
`GET /api/defects`와 `GET /api/reports/unlinked`의 선택 매개변수. AI·LLM을 거치지 않는 단순 글자 포함 검사다.
- 앞뒤 빈칸을 없애고 대소문자를 무시한다. 비었으면 매개변수가 없는 것과 같다. 40자를 넘으면 앞 40자만 쓴다.
- `/api/defects`: `id`·`title`·`workaround`·묶인 신고의 `maskedText` 중 하나에 들어가면 남긴다. `status`·`grade`·`type`과 모두 만족(AND). `q`가 있을 때만 각 건에 `matchedIn`(`ID` `TITLE` `WORKAROUND` `REPORT` 중 찾은 곳)과 `matchedReportIds`(문장에서 찾은 묶인 신고 ID)를 붙인다.
- `/api/reports/unlinked`: `id`·`maskedText`에서 찾는다. `isNew`는 찾기와 관계없이 그 담당자 기준.
- 신고자 이름·지점, 고객 참조키, 담당 부서 이름은 찾지 않는다(부서 이름은 화면 문구).
```json
[{"id":"D-2026-004","title":"로그인할 때 글자가 다르게 들어가요","matchedIn":["REPORT"],"matchedReportIds":["R-…"], "...":"Defect 키"}]
```

### POST `/api/reports/{id}/similar-defects` 응답 (07번 ⑤, ADR-017)
요청 본문 없음(서버가 신고·대장을 읽어 마스킹본만 LLM에 보낸다). 후보는 최대 3개, 대장에 있는 결함만, 비슷함 순. 화면 표시용 `title`·`status`는 서버가 대장에서 붙인다(LLM 응답에서 받지 않음).
```json
{"reportId":"R-061","llmOutcome":"OK","needsHumanReview":true,
 "candidates":[{"defectId":"D-2026-001","title":"...","status":"WORKAROUND","similarity":"HIGH",
                "reason":"같은 업무(청약·서명)에서 서명 알림톡을 열면 다른 안내 화면이 뜬다는 내용이 같아요",
                "matched":["BUSINESS","SYMPTOM","WORDING"]}]}
```
- 후보가 없으면 `"candidates":[]`. 화면은 "비슷한 결함을 찾지 못했어요"와 새 대표 결함 만들기 안내.
- 프론트 단계에서 고정 응답이 없는 신고(시연 중 만든 `R-Q…`)는 규칙으로 후보를 만든다(ADR-026 결정 8): `llmOutcome:"RULE"`, `similarity:null`, `reasons:["업무: 청약·서명","증상: 엉뚱한 화면이 떠요","관련 조건: 초대장 발송 이력 있음","시도한 조치: 이 결함의 임시 방법","AI 문의: 안내한 사례"]`(맞은 것만), `matched`는 `BUSINESS` `SYMPTOM` `CONDITION` `WORKAROUND` `SUGGESTED` 중 맞은 것. 업무와 증상이 모두 같거나 `SUGGESTED`일 때만 후보이며 맞은 항목이 많은 순이다. 비슷함 정도·점수는 붙이지 않는다.
- ADR-027: `SUGGESTED`(AI 문의가 안내한 사례)는 그 결함의 업무가 신고 업무와 같을 때만 근거·후보가 된다. 고객 동의 시나리오의 조건(`INPUT_STEP` 등)도 같은 방식으로 "관련 조건: …" 근거가 된다.
- LLM 실패 시 `"llmOutcome":"FALLBACK"`, 규칙 후보는 `"similarity":null`, `"reason":"같은 업무·같은 문제 유형이에요"`.
- 연결은 이 API가 하지 않는다. 담당자가 고른 뒤 `POST /api/defects/{id}/reports`.

### POST `/api/defects/{id}/status/preview` 응답
```json
{"notifiable":true,"recipientCount":4,"body":"...","recipients":[{"userId":"U-003","name":"(가상)"}]}
```

### 수정 검증과 현장 확인 (ADR-029, REQ-NT-03·LG-12·KN-08·09)
- `postStatus`의 `resolution.verification`(선택): `{result:"VERIFIED", verifiedAt, usageGuide(30자), workaroundEnded, refId?, environment?, version?}`. 서버가 `simulated:true`(프론트), 형식, 시각 순서·미래 금지, 개인정보·주소 금지, 담당자 역할을 확인한다. `environment`는 `SIM_TEST|SIM_PROD_LIKE`, `refId`·`version`은 영문·숫자·`._-` 30자.
- 되돌림은 `backReason`(`FIELD_RECHECK|REDEPLOY|MISRECORDED|ETC`) 필수. `note`는 프론트 단계에서 페이지 메모리에만 둔다.
- 공개 결함 키에 `shortTitle`, `verifyTarget`, `resolutionEventId`, `verification{result,verifiedAt,usageGuide,workaroundEnded,workaround?,simulated}`를 더한다. 참조 ID·환경·버전·메모는 FC·관리자에게 내리지 않는다.
- `postFieldVerification(reportId, userId, resolutionEventId, result, requestId)` → 기록 또는 `null`(본인·FC 역할·회차·상태 불일치). 같은 요청·같은 마지막 결과는 `duplicate:true`. 운영에서는 `userId`·역할을 세션으로 정한다.
- `postFieldInvestigation(reportId, actorId, resolutionEventId, code)` → 문제 지속 답이 있던 신고만, 영업·IT만.
- `getDefect`는 `fieldVerification{resolutionEventId, reporterCount, reportCount, counts, failReports, fcs, reports}`, `getDefects`는 `fieldFailCount`(모두 FC가 신고자인 신고만 세고, `reporterCount`·`reportCount`도 같음), `getMyReports`·`getBranchReports`는 신고별 지금 회차의 `fieldVerification`을 내린다.
- `getMyReports.statusHistory`는 `id,from,to,at,plannedFixDate?,verified,verifiedAt?`. 처리자·내부 사유·참조는 없다. 연결 시각은 `linkedAt`.

### 실험 CSV
09번 문서 참조.

## 5. 프론트 fixtures 규칙
`js/fixtures/*.js`는 `window.FIXTURES.<이름> = {...}` 형태로, 위 응답 형식과 동일한 키를 쓴다(더블클릭 `file://` 실행에서는 JSON 파일을 읽을 수 없으므로 .js, 2026-11-02 사용자 결정). 화면은 `api-client.js`를 거쳐서만 읽는다. 키 불일치는 M2 점검 항목.
- 예외: `js/fixtures/sfa-home.js`(`window.FIXTURES.sfaHome`)는 S1에서 실제 SFA 화면의 실데이터 자리를 채우는 **화면 시안 전용 가상 데이터**다(ADR-012). 대응하는 백엔드 API는 없고, 키는 같은 규약(camelCase, 날짜 ISO-8601)을 따른다. 화면은 `ApiClient.getSfaHome()`으로만 읽는다.
