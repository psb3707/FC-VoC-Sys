/* GET /api/reports/mine?userId= 응답 시안 (docs/05-data-api-spec.md 1절 Report·Defect·DefectStatusHistory·FcNotice 키).
   신고(Report) 한 건마다 묶인 대표 결함(defect)의 지금 상태, 대표 결함의 상태 이력(statusHistory, DefectStatusHistory), 승인된 FC용 안내문(fcNotice)을 붙인다.
   fcNotice 는 승인본(APPROVED)만 내려온다(REQ-NT-01: 미승인 초안은 FC 화면에 안 나옴). 없으면 null.
   대표 결함에 아직 묶이지 않은 신고는 defectId·defect 가 null 이고 상태는 "접수"로 본다.
   상태 코드: RECEIVED(접수) REPRODUCED(재현 확인) CAUSE_FOUND(원인 파악) WORKAROUND(임시조치)
             FIX_PLANNED(수정 예정) RESOLVED(해결) WONT_FIX(수정하지 않음)  (docs/02-domain-rules.md 3절)
   모든 값은 가상이다. 실제 이름·번호·사번을 넣지 않는다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.myReports = [
  { "id": "R-011", "reporterId": "U-001", "kind": "FULL", "finalType": "DEFECT", "createdAt": "2026-10-30T14:10:00+09:00",
    "maskedText": "서명 알림톡을 누르면 세미나 초대장 화면이 떠요", "defectId": "D-2026-001",
    "defect": { "id": "D-2026-001", "title": "서명 알림톡이 초대장 화면으로 열려요", "status": "WORKAROUND",
      "workaround": "알림톡 대신 문자로 서명 링크를 보내 주세요", "plannedFixDate": null,
      "wontFixReasonCode": null, "wontFixReasonText": null, "updatedAt": "2026-11-02T10:20:00+09:00" },
    "statusHistory": [
      { "from": null, "to": "RECEIVED", "at": "2026-10-30T14:10:00+09:00" },
      { "from": "RECEIVED", "to": "CAUSE_FOUND", "at": "2026-10-31T09:40:00+09:00" },
      { "from": "CAUSE_FOUND", "to": "WORKAROUND", "at": "2026-11-02T10:20:00+09:00" }],
    "fcNotice": { "id": "FN-001", "status": "APPROVED",
      "approvedText": "세미나 초대장을 보낸 적이 있는 고객에게 서명 알림톡을 보내면 초대장 화면이 열리는 문제를 확인했어요. 고칠 때까지는 알림톡 대신 문자로 서명 링크를 보내 주세요." } },

  { "id": "R-012", "reporterId": "U-001", "kind": "FULL", "finalType": "DEFECT", "createdAt": "2026-10-28T11:30:00+09:00",
    "maskedText": "청약 서명 화면이 중간에 멈춰요", "defectId": "D-2026-002",
    "defect": { "id": "D-2026-002", "title": "청약 서명 화면이 멈춰요", "status": "FIX_PLANNED",
      "workaround": "서명 화면을 닫았다가 다시 열면 이어서 할 수 있어요", "plannedFixDate": "2026-11-20",
      "wontFixReasonCode": null, "wontFixReasonText": null, "updatedAt": "2026-11-01T16:05:00+09:00" },
    "statusHistory": [
      { "from": null, "to": "RECEIVED", "at": "2026-10-28T11:30:00+09:00" },
      { "from": "RECEIVED", "to": "REPRODUCED", "at": "2026-10-29T15:00:00+09:00" },
      { "from": "REPRODUCED", "to": "FIX_PLANNED", "at": "2026-11-01T16:05:00+09:00" }],
    "fcNotice": { "id": "FN-002", "status": "APPROVED",
      "approvedText": "서명 화면이 멈추는 원인을 찾았고 11월 20일에 고칠 예정이에요. 그 전에는 서명 화면을 닫았다가 다시 열어 주세요." } },

  { "id": "R-013", "reporterId": "U-001", "kind": "ME_TOO", "finalType": "IMPROVEMENT", "createdAt": "2026-10-22T09:15:00+09:00",
    "maskedText": null, "defectId": "D-2026-005",
    "defect": { "id": "D-2026-005", "title": "고객 목록에서 이름을 눌러도 상세가 안 열려요", "status": "WONT_FIX",
      "workaround": "이름 대신 같은 줄의 성별 칸을 누르면 열려요", "plannedFixDate": null,
      "wontFixReasonCode": "NEW_SFA", "wontFixReasonText": "새 시스템에서 고쳐질 예정이에요", "updatedAt": "2026-10-30T15:00:00+09:00" },
    "statusHistory": [
      { "from": null, "to": "RECEIVED", "at": "2026-10-20T10:00:00+09:00" },
      { "from": "RECEIVED", "to": "WORKAROUND", "at": "2026-10-24T13:00:00+09:00" },
      { "from": "WORKAROUND", "to": "WONT_FIX", "at": "2026-10-30T15:00:00+09:00" }],
    "fcNotice": null },

  { "id": "R-014", "reporterId": "U-001", "kind": "FULL", "finalType": "DEFECT", "createdAt": "2026-11-03T09:05:00+09:00",
    "maskedText": "인쇄 버튼을 눌러도 반응이 없어요", "defectId": null, "defect": null,
    "statusHistory": [{ "from": null, "to": "RECEIVED", "at": "2026-11-03T09:05:00+09:00" }],
    "fcNotice": null },

  { "id": "R-021", "reporterId": "U-002", "kind": "FULL", "finalType": "DEFECT", "createdAt": "2026-10-31T08:50:00+09:00",
    "maskedText": "서명 알림톡을 누르면 다른 화면이 떠요", "defectId": "D-2026-001",
    "defect": { "id": "D-2026-001", "title": "서명 알림톡이 초대장 화면으로 열려요", "status": "WORKAROUND",
      "workaround": "알림톡 대신 문자로 서명 링크를 보내 주세요", "plannedFixDate": null,
      "wontFixReasonCode": null, "wontFixReasonText": null, "updatedAt": "2026-11-02T10:20:00+09:00" },
    "statusHistory": [
      { "from": null, "to": "RECEIVED", "at": "2026-10-30T14:10:00+09:00" },
      { "from": "RECEIVED", "to": "CAUSE_FOUND", "at": "2026-10-31T09:40:00+09:00" },
      { "from": "CAUSE_FOUND", "to": "WORKAROUND", "at": "2026-11-02T10:20:00+09:00" }],
    "fcNotice": { "id": "FN-001", "status": "APPROVED",
      "approvedText": "세미나 초대장을 보낸 적이 있는 고객에게 서명 알림톡을 보내면 초대장 화면이 열리는 문제를 확인했어요. 고칠 때까지는 알림톡 대신 문자로 서명 링크를 보내 주세요." } },

  { "id": "R-031", "reporterId": "U-010", "kind": "FULL", "finalType": "DEFECT", "createdAt": "2026-10-29T10:00:00+09:00",
    "maskedText": "서명 화면이 멈춰요", "defectId": "D-2026-002",
    "defect": { "id": "D-2026-002", "title": "청약 서명 화면이 멈춰요", "status": "FIX_PLANNED",
      "workaround": "서명 화면을 닫았다가 다시 열면 이어서 할 수 있어요", "plannedFixDate": "2026-11-20",
      "wontFixReasonCode": null, "wontFixReasonText": null, "updatedAt": "2026-11-01T16:05:00+09:00" },
    "statusHistory": [
      { "from": null, "to": "RECEIVED", "at": "2026-10-28T11:30:00+09:00" },
      { "from": "RECEIVED", "to": "REPRODUCED", "at": "2026-10-29T15:00:00+09:00" },
      { "from": "REPRODUCED", "to": "FIX_PLANNED", "at": "2026-11-01T16:05:00+09:00" }],
    "fcNotice": { "id": "FN-002", "status": "APPROVED",
      "approvedText": "서명 화면이 멈추는 원인을 찾았고 11월 20일에 고칠 예정이에요. 그 전에는 서명 화면을 닫았다가 다시 열어 주세요." } }
];
