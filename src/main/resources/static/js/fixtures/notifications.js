/* GET /api/notifications?userId= 응답과 같은 키 (docs/05-data-api-spec.md 1절 NotificationLog).
   서버처럼 recipientId 로 걸러 쓴다. 실발송 없음(channel=PREVIEW). */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.notifications = [
  { "id": "N-003", "defectId": "D-2026-001", "historyId": "H-003", "recipientId": "U-001",
    "bodySnapshot": "알림톡 링크 오류 — 임시조치 안내가 등록됐어요", "channel": "PREVIEW", "at": "2026-11-02T10:20:00+09:00" },
  { "id": "N-002", "defectId": "D-2026-002", "historyId": "H-005", "recipientId": "U-001",
    "bodySnapshot": "청약 서명 화면 멈춤 — 고칠 날짜가 11월 20일로 정해졌어요", "channel": "PREVIEW", "at": "2026-11-01T16:05:00+09:00" },
  { "id": "N-001", "defectId": "D-2026-001", "historyId": "H-002", "recipientId": "U-001",
    "bodySnapshot": "알림톡 링크 오류 — 담당 부서가 확인하고 있어요", "channel": "PREVIEW", "at": "2026-10-31T09:40:00+09:00" },
  { "id": "N-004", "defectId": "D-2026-001", "historyId": "H-003", "recipientId": "U-002",
    "bodySnapshot": "알림톡 링크 오류 — 임시조치 안내가 등록됐어요", "channel": "PREVIEW", "at": "2026-11-02T10:20:00+09:00" },
  { "id": "N-005", "defectId": "D-2026-002", "historyId": "H-005", "recipientId": "U-010",
    "bodySnapshot": "청약 서명 화면 멈춤 — 고칠 날짜가 11월 20일로 정해졌어요", "channel": "PREVIEW", "at": "2026-11-01T16:05:00+09:00" }
];
