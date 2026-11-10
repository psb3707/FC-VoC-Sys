/* S4 결함 대장 고정 데이터 (docs/05-data-api-spec.md 1절 Defect·DefectStatusHistory·FcNotice·Report·Branch 키, docs/02-domain-rules.md 3~5절).
   - defects: 대표 결함(Defect). D-2026-001~005 의 제목·상태는 reports.js·intake.js·notifications.js 와 같다.
     영향 지점 수·신고 수는 저장하지 않는다(REQ-LG-01): 화면이 reports 의 defectId 와 신고자 지점으로 센다.
   - reports: 신고(Report). defectId 가 null 이면 아직 대표 결함에 안 묶인 신고(REQ-LG-02).
   - statusHistory: DefectStatusHistory. H-003·H-005·H-008 은 notifications.js 의 historyId 와 같다.
   - fcNotices: FcNotice. 승인본(APPROVED)만 FC 화면에 나온다(REQ-NT-01).
   - branches: Branch. 영향 지점 수 계산과 화면 표시용.
   - similar: POST /api/reports/{id}/similar-defects 의 AI 고정 응답(신고 ID별, 07번 ⑤, ADR-017). 실제 LLM 호출은 없다.
     후보의 title·status 는 서버가 대장에서 붙이므로 여기에는 두지 않는다(api-client 가 붙임). candidates 가 [] 이면 "찾지 못함".
     AI 실패(llm=fail)는 api-client 가 규칙 후보(같은 업무·같은 증상 유형의 신고가 묶인 결함)로 대신 만든다.
   - statusTemplates: 상태 변경 알림의 고정 문구(02번 4절 "없으면 고정 템플릿"). {title} {date} {reason} 을 채운다.
   업무 코드는 intake.js metaForm, 등급·부서 코드는 intake-panel.js 와 같다. 모든 값은 가상이다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.ledger = {
  /* 프론트 단계 기준 시각(05번 4절): 경과일·예정일·"확인할 것"(02번 5-2절)을 이 시각으로 센다. 시드의 마지막 신고 직후 */
  "asOf": "2026-11-04T10:00:00+09:00",

  "branches": [
    { "id": "B-01", "name": "해오름지점(가상)", "regionGroup": "수도권" },
    { "id": "B-02", "name": "푸른솔지점(가상)", "regionGroup": "수도권" },
    { "id": "B-03", "name": "새솔지점(가상)", "regionGroup": "충청권" },
    { "id": "B-04", "name": "늘봄지점(가상)", "regionGroup": "영남권" },
    { "id": "B-05", "name": "한빛지점(가상)", "regionGroup": "호남권" },
    { "id": "B-HQ", "name": "본사(가상)", "regionGroup": "본사" }
  ],

  "defects": [
    { "id": "D-2026-001", "title": "서명 알림톡이 초대장 화면으로 열려요", "type": "DEFECT", "systemGen": "OLD",
      "grade": "IMMEDIATE", "status": "WORKAROUND", "departmentCode": "SUBSCRIPTION_IT",
      "workaround": "알림톡 대신 문자로 서명 링크를 보내 주세요", "plannedFixDate": null,
      "wontFixReasonCode": null, "wontFixReasonText": null, "published": true, "updatedAt": "2026-11-02T10:20:00+09:00" },
    { "id": "D-2026-002", "title": "청약 서명 화면이 멈춰요", "type": "DEFECT", "systemGen": "NEW",
      "grade": "IMMEDIATE", "status": "FIX_PLANNED", "departmentCode": "SUBSCRIPTION_IT",
      "workaround": "서명 화면을 닫았다가 다시 열면 이어서 할 수 있어요", "plannedFixDate": "2026-11-20",
      "wontFixReasonCode": null, "wontFixReasonText": null, "published": false, "updatedAt": "2026-11-01T16:05:00+09:00" },
    { "id": "D-2026-003", "title": "가입설계에서 보험료 계산이 늦게 나와요", "type": "DEFECT", "systemGen": "NEW",
      "grade": "BATCH", "status": "CAUSE_FOUND", "departmentCode": "DESIGN_SUPPORT",
      "workaround": null, "plannedFixDate": null,
      "wontFixReasonCode": null, "wontFixReasonText": null, "published": true, "updatedAt": "2026-11-03T11:00:00+09:00" },
    { "id": "D-2026-004", "title": "로그인할 때 글자가 다르게 들어가요", "type": "DEFECT", "systemGen": "OLD",
      "grade": "NORMAL", "status": "WORKAROUND", "departmentCode": "LOGIN_SUPPORT",
      "workaround": "인터넷 기록(쿠키)을 지우고 다시 접속하면 잠시 괜찮아져요", "plannedFixDate": "2026-11-20",
      "wontFixReasonCode": null, "wontFixReasonText": null, "published": true, "updatedAt": "2026-11-02T09:00:00+09:00" },
    { "id": "D-2026-005", "title": "고객 목록에서 이름을 눌러도 상세가 안 열려요", "type": "IMPROVEMENT", "systemGen": "OLD",
      "grade": "BATCH", "status": "WONT_FIX", "departmentCode": "CUSTOMER_IT",
      "workaround": "이름 대신 같은 줄의 성별 칸을 누르면 열려요", "plannedFixDate": null,
      "wontFixReasonCode": "NEW_SFA", "wontFixReasonText": "새 시스템에서 고쳐질 예정이에요", "published": true, "updatedAt": "2026-10-30T15:00:00+09:00" },
    { "id": "D-2026-006", "title": "계약 목록을 정렬하면 다른 계약 상세가 열려요", "type": "DEFECT", "systemGen": "OLD",
      "grade": "NORMAL", "status": "RECEIVED", "departmentCode": "CONTRACT_IT",
      "workaround": null, "plannedFixDate": null,
      "wontFixReasonCode": null, "wontFixReasonText": null, "published": false, "updatedAt": "2026-11-03T15:20:00+09:00" }
  ],

  "reports": [
    { "id": "R-011", "reporterId": "U-001", "submittedById": "U-001", "kind": "FULL", "mode": "B", "business": "SUBSCRIPTION", "symptom": "WRONG_SCREEN",
      "maskedText": "서명 알림톡을 누르면 세미나 초대장 화면이 떠요", "finalType": "DEFECT", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT",
      "defectId": "D-2026-001", "createdAt": "2026-10-30T14:10:00+09:00" },
    { "id": "R-021", "reporterId": "U-002", "submittedById": "U-002", "kind": "FULL", "mode": "B", "business": "SUBSCRIPTION", "symptom": "WRONG_SCREEN",
      "maskedText": "서명 알림톡을 누르면 다른 화면이 떠요", "finalType": "DEFECT", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT",
      "defectId": "D-2026-001", "createdAt": "2026-10-31T08:50:00+09:00" },
    { "id": "R-041", "reporterId": "U-003", "submittedById": "U-003", "kind": "ME_TOO", "mode": "B", "business": "SUBSCRIPTION", "symptom": "WRONG_SCREEN",
      "maskedText": null, "finalType": "DEFECT", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT",
      "defectId": "D-2026-001", "createdAt": "2026-11-03T09:30:00+09:00" },
    { "id": "R-042", "reporterId": "U-006", "submittedById": "U-006", "kind": "FULL", "mode": "A", "business": "SUBSCRIPTION", "symptom": "WRONG_SCREEN",
      "maskedText": "고객이 서명 링크를 눌렀더니 초대장이 보인대요", "finalType": "DEFECT", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT",
      "defectId": "D-2026-001", "createdAt": "2026-11-03T13:40:00+09:00" },

    { "id": "R-012", "reporterId": "U-001", "submittedById": "U-001", "kind": "FULL", "mode": "B", "business": "SUBSCRIPTION", "symptom": "CANNOT_PROCEED",
      "maskedText": "청약 서명 화면이 중간에 멈춰요", "finalType": "DEFECT", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT",
      "defectId": "D-2026-002", "createdAt": "2026-10-28T11:30:00+09:00" },
    { "id": "R-031", "reporterId": "U-010", "submittedById": "U-010", "kind": "FULL", "mode": "B", "business": "SUBSCRIPTION", "symptom": "CANNOT_PROCEED",
      "maskedText": "서명 화면이 멈춰요", "finalType": "DEFECT", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT",
      "defectId": "D-2026-002", "createdAt": "2026-10-29T10:00:00+09:00" },
    { "id": "R-043", "reporterId": "U-004", "submittedById": "U-004", "kind": "ME_TOO", "mode": "B", "business": "SUBSCRIPTION", "symptom": "CANNOT_PROCEED",
      "maskedText": null, "finalType": "DEFECT", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT",
      "defectId": "D-2026-002", "createdAt": "2026-11-03T10:15:00+09:00" },

    { "id": "R-044", "reporterId": "U-005", "submittedById": "U-005", "kind": "FULL", "mode": "B", "business": "DESIGN", "symptom": "NOT_SHOWN",
      "maskedText": "보험료 계산 버튼을 누르고 한참 기다려야 해요", "finalType": "DEFECT", "grade": "BATCH", "departmentCode": "DESIGN_SUPPORT",
      "defectId": "D-2026-003", "createdAt": "2026-11-01T15:30:00+09:00" },
    { "id": "R-045", "reporterId": "U-007", "submittedById": "U-007", "kind": "FULL", "mode": "B", "business": "DESIGN", "symptom": "NOT_SHOWN",
      "maskedText": "가입설계 결과가 늦게 떠요", "finalType": "DEFECT", "grade": "BATCH", "departmentCode": "DESIGN_SUPPORT",
      "defectId": "D-2026-003", "createdAt": "2026-11-02T09:10:00+09:00" },

    { "id": "R-046", "reporterId": "U-002", "submittedById": "U-002", "kind": "FULL", "mode": "B", "business": "LOGIN", "symptom": "WRONG_INPUT",
      "maskedText": "로그인할 때 b를 누르면 다른 글자가 들어가요", "finalType": "DEFECT", "grade": "NORMAL", "departmentCode": "LOGIN_SUPPORT",
      "defectId": "D-2026-004", "createdAt": "2026-10-24T09:00:00+09:00" },
    { "id": "R-047", "reporterId": "U-003", "submittedById": "U-003", "kind": "ME_TOO", "mode": "B", "business": "LOGIN", "symptom": "WRONG_INPUT",
      "maskedText": null, "finalType": "DEFECT", "grade": "NORMAL", "departmentCode": "LOGIN_SUPPORT",
      "defectId": "D-2026-004", "createdAt": "2026-10-25T10:20:00+09:00" },
    { "id": "R-048", "reporterId": "U-004", "submittedById": "U-004", "kind": "FULL", "mode": "A", "business": "LOGIN", "symptom": "WRONG_INPUT",
      "maskedText": "비밀번호 숫자가 1로만 들어가요", "finalType": "DEFECT", "grade": "NORMAL", "departmentCode": "LOGIN_SUPPORT",
      "defectId": "D-2026-004", "createdAt": "2026-10-26T08:40:00+09:00" },
    { "id": "R-049", "reporterId": "U-005", "submittedById": "U-005", "kind": "ME_TOO", "mode": "B", "business": "LOGIN", "symptom": "WRONG_INPUT",
      "maskedText": null, "finalType": "DEFECT", "grade": "NORMAL", "departmentCode": "LOGIN_SUPPORT",
      "defectId": "D-2026-004", "createdAt": "2026-10-27T13:05:00+09:00" },
    { "id": "R-050", "reporterId": "U-007", "submittedById": "U-007", "kind": "ME_TOO", "mode": "B", "business": "LOGIN", "symptom": "WRONG_INPUT",
      "maskedText": null, "finalType": "DEFECT", "grade": "NORMAL", "departmentCode": "LOGIN_SUPPORT",
      "defectId": "D-2026-004", "createdAt": "2026-10-29T16:30:00+09:00" },
    { "id": "R-051", "reporterId": "U-008", "submittedById": "U-008", "kind": "FULL", "mode": "B", "business": "LOGIN", "symptom": "WRONG_INPUT",
      "maskedText": "아이디를 적으면 글자가 바뀌어 들어가요", "finalType": "DEFECT", "grade": "NORMAL", "departmentCode": "LOGIN_SUPPORT",
      "defectId": "D-2026-004", "createdAt": "2026-10-31T09:25:00+09:00" },
    { "id": "R-052", "reporterId": "U-006", "submittedById": "U-006", "kind": "ME_TOO", "mode": "B", "business": "LOGIN", "symptom": "WRONG_INPUT",
      "maskedText": null, "finalType": "DEFECT", "grade": "NORMAL", "departmentCode": "LOGIN_SUPPORT",
      "defectId": "D-2026-004", "createdAt": "2026-11-01T11:50:00+09:00" },

    { "id": "R-013", "reporterId": "U-001", "submittedById": "U-001", "kind": "ME_TOO", "mode": "B", "business": "CUSTOMER_LOOKUP", "symptom": "NOT_SHOWN",
      "maskedText": null, "finalType": "IMPROVEMENT", "grade": "BATCH", "departmentCode": "CUSTOMER_IT",
      "defectId": "D-2026-005", "createdAt": "2026-10-22T09:15:00+09:00" },
    { "id": "R-053", "reporterId": "U-002", "submittedById": "U-002", "kind": "FULL", "mode": "B", "business": "CUSTOMER_LOOKUP", "symptom": "NOT_SHOWN",
      "maskedText": "고객 목록에서 이름을 누르면 아무 일도 없어요", "finalType": "IMPROVEMENT", "grade": "BATCH", "departmentCode": "CUSTOMER_IT",
      "defectId": "D-2026-005", "createdAt": "2026-10-20T10:00:00+09:00" },
    { "id": "R-054", "reporterId": "U-007", "submittedById": "U-007", "kind": "ME_TOO", "mode": "B", "business": "CUSTOMER_LOOKUP", "symptom": "NOT_SHOWN",
      "maskedText": null, "finalType": "IMPROVEMENT", "grade": "BATCH", "departmentCode": "CUSTOMER_IT",
      "defectId": "D-2026-005", "createdAt": "2026-10-23T14:45:00+09:00" },

    { "id": "R-055", "reporterId": "U-008", "submittedById": "U-008", "kind": "FULL", "mode": "B", "business": "CONTRACT_LOOKUP", "symptom": "WRONG_SCREEN",
      "maskedText": "계약 목록을 날짜순으로 바꾸면 다른 계약이 열려요", "finalType": "DEFECT", "grade": "NORMAL", "departmentCode": "CONTRACT_IT",
      "defectId": "D-2026-006", "createdAt": "2026-11-03T15:20:00+09:00" },

    { "id": "R-014", "reporterId": "U-001", "submittedById": "U-001", "kind": "FULL", "mode": "B", "business": "ETC", "symptom": "ETC",
      "maskedText": "인쇄 버튼을 눌러도 반응이 없어요", "finalType": "DEFECT", "grade": "BATCH", "departmentCode": "SALES_SUPPORT",
      "defectId": null, "createdAt": "2026-11-03T09:05:00+09:00" },
    { "id": "R-061", "reporterId": "U-005", "submittedById": "U-005", "kind": "FULL", "mode": "B", "business": "SUBSCRIPTION", "symptom": "WRONG_SCREEN",
      "maskedText": "서명 알림톡을 열면 행사 안내 화면이 나와요", "finalType": "DEFECT", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT",
      "defectId": null, "createdAt": "2026-11-04T08:45:00+09:00" },
    { "id": "R-062", "reporterId": "U-010", "submittedById": "U-010", "kind": "FULL", "mode": "A", "business": "ETC", "symptom": "NOT_SHOWN",
      "maskedText": "첨부 메뉴 글자가 겹쳐 보여요", "finalType": "UNCLASSIFIED", "grade": "BATCH", "departmentCode": "SALES_SUPPORT",
      "defectId": null, "createdAt": "2026-11-04T09:30:00+09:00" }
  ],

  "statusHistory": [
    { "id": "H-001", "defectId": "D-2026-001", "from": null, "to": "RECEIVED", "reason": null, "actorId": "U-020", "at": "2026-10-30T14:10:00+09:00", "notifiable": false },
    { "id": "H-002", "defectId": "D-2026-001", "from": "RECEIVED", "to": "CAUSE_FOUND", "reason": "초대장 발송 이력이 있으면 링크가 바뀌는 것을 확인", "actorId": "U-030", "at": "2026-10-31T09:40:00+09:00", "notifiable": false },
    { "id": "H-003", "defectId": "D-2026-001", "from": "CAUSE_FOUND", "to": "WORKAROUND", "reason": null, "actorId": "U-020", "at": "2026-11-02T10:20:00+09:00", "notifiable": true },

    { "id": "H-010", "defectId": "D-2026-002", "from": null, "to": "RECEIVED", "reason": null, "actorId": "U-020", "at": "2026-10-28T11:30:00+09:00", "notifiable": false },
    { "id": "H-004", "defectId": "D-2026-002", "from": "RECEIVED", "to": "REPRODUCED", "reason": null, "actorId": "U-030", "at": "2026-10-29T15:00:00+09:00", "notifiable": false },
    { "id": "H-005", "defectId": "D-2026-002", "from": "REPRODUCED", "to": "FIX_PLANNED", "reason": null, "actorId": "U-030", "at": "2026-11-01T16:05:00+09:00", "notifiable": true },

    { "id": "H-011", "defectId": "D-2026-003", "from": null, "to": "RECEIVED", "reason": null, "actorId": "U-020", "at": "2026-11-01T15:30:00+09:00", "notifiable": false },
    { "id": "H-012", "defectId": "D-2026-003", "from": "RECEIVED", "to": "CAUSE_FOUND", "reason": "보험료 계산 서버 응답이 느림", "actorId": "U-030", "at": "2026-11-03T11:00:00+09:00", "notifiable": false },

    { "id": "H-013", "defectId": "D-2026-004", "from": null, "to": "RECEIVED", "reason": null, "actorId": "U-020", "at": "2026-10-24T09:00:00+09:00", "notifiable": false },
    { "id": "H-014", "defectId": "D-2026-004", "from": "RECEIVED", "to": "REPRODUCED", "reason": null, "actorId": "U-030", "at": "2026-10-27T10:00:00+09:00", "notifiable": false },
    { "id": "H-015", "defectId": "D-2026-004", "from": "REPRODUCED", "to": "WORKAROUND", "reason": null, "actorId": "U-020", "at": "2026-11-02T09:00:00+09:00", "notifiable": true },

    { "id": "H-006", "defectId": "D-2026-005", "from": null, "to": "RECEIVED", "reason": null, "actorId": "U-020", "at": "2026-10-20T10:00:00+09:00", "notifiable": false },
    { "id": "H-007", "defectId": "D-2026-005", "from": "RECEIVED", "to": "WORKAROUND", "reason": null, "actorId": "U-020", "at": "2026-10-24T13:00:00+09:00", "notifiable": true },
    { "id": "H-008", "defectId": "D-2026-005", "from": "WORKAROUND", "to": "WONT_FIX", "reason": "새 시스템에서 고쳐질 예정이에요", "actorId": "U-030", "at": "2026-10-30T15:00:00+09:00", "notifiable": true },

    { "id": "H-016", "defectId": "D-2026-006", "from": null, "to": "RECEIVED", "reason": null, "actorId": "U-020", "at": "2026-11-03T15:20:00+09:00", "notifiable": false }
  ],

  "fcNotices": [
    { "id": "FN-001", "defectId": "D-2026-001", "status": "APPROVED", "llmCallId": null, "approverId": "U-020",
      "draftText": null,
      "approvedText": "세미나 초대장을 보낸 적이 있는 고객에게 서명 알림톡을 보내면 초대장 화면이 열리는 문제를 확인했어요. 고칠 때까지는 알림톡 대신 문자로 서명 링크를 보내 주세요." },
    { "id": "FN-002", "defectId": "D-2026-002", "status": "APPROVED", "llmCallId": null, "approverId": "U-020",
      "draftText": null,
      "approvedText": "서명 화면이 멈추는 원인을 찾았고 11월 20일에 고칠 예정이에요. 그 전에는 서명 화면을 닫았다가 다시 열어 주세요." },
    { "id": "FN-004", "defectId": "D-2026-004", "status": "DRAFT", "llmCallId": null, "approverId": null,
      "draftText": "로그인할 때 글자가 다르게 들어가는 문제를 알고 있어요. 인터넷 기록(쿠키)을 지우고 다시 접속하면 잠시 괜찮아져요.",
      "approvedText": null }
  ],

  "similar": {
    "R-061": { "llmOutcome": "OK", "candidates": [
      { "defectId": "D-2026-001", "similarity": "HIGH", "matched": ["BUSINESS", "SYMPTOM", "WORDING"],
        "reason": "같은 청약·서명 업무에서 서명 알림톡을 열면 다른 안내 화면이 뜬다는 내용이 같아요" },
      { "defectId": "D-2026-002", "similarity": "MEDIUM", "matched": ["BUSINESS", "SCREEN"],
        "reason": "같은 청약·서명 업무의 서명 화면 문제예요. 다만 이 결함은 화면이 멈추는 증상이라 확인이 필요해요" } ] },
    "R-014": { "llmOutcome": "OK", "candidates": [
      { "defectId": "D-2026-005", "similarity": "MEDIUM", "matched": ["WORDING"],
        "reason": "눌러도 반응이 없다는 증상은 비슷하지만 화면(인쇄·고객 목록)이 달라 확인이 필요해요" } ] },
    "R-062": { "llmOutcome": "OK", "candidates": [] }
  },

  "statusTemplates": {
    "WORKAROUND": "{title} — 임시조치 안내가 등록됐어요",
    "FIX_PLANNED": "{title} — 고칠 날짜가 {date}로 정해졌어요",
    "RESOLVED": "{title} — 고쳤어요. 이제 평소처럼 쓰시면 돼요",
    "WONT_FIX": "{title} — {reason}. 지금 화면은 고치지 않아요"
  }
};
