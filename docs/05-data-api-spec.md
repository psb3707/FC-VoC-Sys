# 05. 데이터 모델·API 명세

> 프론트 fixtures(`js/fixtures/`)는 이 문서의 응답 형식을 따른다. 백엔드 연결 시 `api-client.js`의 데이터 출처만 바꾼다.

## 1. 엔티티
| 엔티티 | 주요 필드 | 관계·비고 |
|---|---|---|
| `AppUser` | id, name(가상), role(FC/MANAGER/SALES/IT), branchId | 역할 전환 상자의 원본 |
| `Branch` | id, name(가상), regionGroup | 영향 지점 수 계산 |
| `Report` | id, reporterId, submittedById, kind(FULL/ME_TOO), mode(A/B), business, symptom, maskedText, autoContext(JSON), slots(JSON), aiResult(JSON), aiType, finalType, grade, departmentCode, closedAsGuidance, defectId?, trialId?, createdAt | Defect N:1. **원문은 저장하지 않고 마스킹본만** |
| `autoContext` 내용 | reportedFrom(접수 화면·기기), screenCode, errorCode, occurredAt | 오류가 난 기기·경로는 슬롯으로 별도 |
| `FollowUpQa` | id, reportId, slot, question, maskedAnswer, seq | Report 1:N |
| `Defect` | id(D-2026-001), title, type, systemGen(OLD/NEW), grade, status, departmentCode, workaround, plannedFixDate?, wontFixReasonCode?, wontFixReasonText?, published, updatedAt | 영향 지점 수·신고 수는 계산 |
| `DefectStatusHistory` | id, defectId, from, to, reason, actorId, at, notifiable | Defect 1:N |
| `FcNotice` | id, defectId, draftText, approvedText, status(DRAFT/APPROVED), llmCallId, approverId | 승인본만 FC에 노출 |
| `NotificationLog` | id, defectId, historyId, recipientId, bodySnapshot, channel=PREVIEW, at | 실발송 없음 |
| `VirtualContract` | id, customerNo, policyNo, proposalNo, statusCat, productGroup, lastChangeType, lastChangeAt, channel | 가상 데이터 |
| `RefKeyMap` | refKey, reportScope, kind, originalValue | **서버 전용**. 신고별로 K-01부터 새로 시작. API로 노출 금지 |
| `LlmCall` | id, task, provider, model, promptVersion, requestHash, latencyMs, retries, outcome(OK/RETRIED/FALLBACK), trialId? | 전문은 JSONL(마스킹본)에 |
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
| GET | `/api/defects?status=&grade=&type=` | 대표 결함 목록 |
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

### POST `/api/defects/{id}/status/preview` 응답
```json
{"notifiable":true,"recipientCount":4,"body":"...","recipients":[{"userId":"U-003","name":"(가상)"}]}
```

### 실험 CSV
09번 문서 참조.

## 5. 프론트 fixtures 규칙
`js/fixtures/*.js`는 `window.FIXTURES.<이름> = {...}` 형태로, 위 응답 형식과 동일한 키를 쓴다(더블클릭 `file://` 실행에서는 JSON 파일을 읽을 수 없으므로 .js, 2026-11-02 사용자 결정). 화면은 `api-client.js`를 거쳐서만 읽는다. 키 불일치는 M2 점검 항목.
