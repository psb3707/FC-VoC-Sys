/* GET /api/notifications?userId= 응답과 같은 키 (docs/05-data-api-spec.md 1절 NotificationLog).
   서버처럼 recipientId 로 걸러 쓴다. 실발송 없음(channel=PREVIEW).
   알림 규칙(docs/02-domain-rules.md 4절): 임시조치·수정 예정·해결·수정하지 않음만 담는다. 재현 확인·원인 파악·되돌림은 넣지 않는다.
   ADR-025(02번 4-1절): audience REPORTER = 신고자(FC, 지금 할 일 문구), SUBMITTER = 신고자와 다른 대리 접수자(관리자, 묶음 문구).
   kind PROXY_RECEIPT = 관리자가 대신 접수했을 때 FC에게 가는 접수 알림(본문에 설명 원문 없음). readAt 이 있으면 읽은 알림. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.notifications = [
  { "id": "N-003", "defectId": "D-2026-001", "historyId": "H-003", "recipientId": "U-001", "reportId": "R-011",
    "audience": "REPORTER", "kind": "STATUS",
    "bodySnapshot": "서명 알림톡 오류 — 임시 방법이 나왔어요: 알림톡 대신 문자로 서명 링크를 보내 주세요", "channel": "PREVIEW", "at": "2026-11-02T10:20:00+09:00" },
  { "id": "N-002", "defectId": "D-2026-002", "historyId": "H-005", "recipientId": "U-001", "reportId": "R-012",
    "audience": "REPORTER", "kind": "STATUS",
    "bodySnapshot": "청약 서명 화면 멈춤 — 11월 20일에 고칠 예정이에요. 그때까지는 서명 화면을 닫았다가 다시 열어 주세요", "channel": "PREVIEW", "at": "2026-11-01T16:05:00+09:00" },
  { "id": "N-006", "defectId": "D-2026-005", "historyId": "H-008", "recipientId": "U-001", "reportId": "R-013",
    "audience": "REPORTER", "kind": "STATUS",
    "bodySnapshot": "고객 목록 이름 누름 오류 — 새 시스템에서 고치기로 해서 지금 화면은 고치지 않아요. 안내된 임시 방법을 계속 써 주세요", "channel": "PREVIEW", "at": "2026-10-30T15:00:00+09:00" },
  { "id": "N-004", "defectId": "D-2026-001", "historyId": "H-003", "recipientId": "U-002", "reportId": "R-021",
    "audience": "REPORTER", "kind": "STATUS",
    "bodySnapshot": "서명 알림톡 오류 — 임시 방법이 나왔어요: 알림톡 대신 문자로 서명 링크를 보내 주세요", "channel": "PREVIEW", "at": "2026-11-02T10:20:00+09:00" },
  { "id": "N-005", "defectId": "D-2026-002", "historyId": "H-005", "recipientId": "U-010", "reportId": "R-031",
    "audience": "REPORTER", "kind": "STATUS",
    "bodySnapshot": "청약 서명 화면 멈춤 — 11월 20일에 고칠 예정이에요. 그때까지는 서명 화면을 닫았다가 다시 열어 주세요", "channel": "PREVIEW", "at": "2026-11-01T16:05:00+09:00" },
  /* ADR-025 시연 시드: 관리자 U-010 이 U-011 대신 접수한 R-063(D-2026-001)·R-065(D-2026-003) */
  { "id": "N-007", "defectId": "D-2026-001", "historyId": "H-003", "recipientId": "U-010",
    "audience": "SUBMITTER", "kind": "STATUS",
    "bodySnapshot": "대신 접수한 문의 1건 · 서명 알림톡 오류 — 임시 방법이 나왔어요. FC가 업무를 이어갈 수 있는지 확인해 주세요", "channel": "PREVIEW", "at": "2026-11-02T10:20:00+09:00" },
  { "id": "N-008", "defectId": "D-2026-001", "historyId": "H-003", "recipientId": "U-011", "reportId": "R-063",
    "audience": "REPORTER", "kind": "STATUS",
    "bodySnapshot": "서명 알림톡 오류 — 임시 방법이 나왔어요: 알림톡 대신 문자로 서명 링크를 보내 주세요", "channel": "PREVIEW",
    "at": "2026-11-02T10:20:00+09:00", "readAt": "2026-11-02T13:20:00+09:00" },
  { "id": "N-009", "defectId": null, "historyId": null, "recipientId": "U-011", "reportId": "R-065",
    "audience": "REPORTER", "kind": "PROXY_RECEIPT",
    "bodySnapshot": "가입설계 문의가 접수됐어요 — 박새벽(가상) 관리자가 대신 접수했어요. 담당자 확인을 기다리고 있어요", "channel": "PREVIEW", "at": "2026-11-01T09:10:00+09:00" }
];
