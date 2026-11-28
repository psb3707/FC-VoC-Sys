/* GET /api/users 응답과 같은 키 (docs/05-data-api-spec.md 1절 AppUser).
   모든 인물은 가상이다. 실제 이름·번호·사번을 넣지 않는다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.users = [
  { "id": "U-001", "name": "김하늘(가상)", "role": "FC", "branchId": "B-01" },
  { "id": "U-002", "name": "이바다(가상)", "role": "FC", "branchId": "B-02" },
  /* S4 결함 대장의 묶인 신고자(영향 지점 수 계산용, docs/10-seed-scenarios.md 1절 "FC 8") */
  { "id": "U-003", "name": "한가람(가상)", "role": "FC", "branchId": "B-03" },
  { "id": "U-004", "name": "윤슬기(가상)", "role": "FC", "branchId": "B-04" },
  { "id": "U-005", "name": "서도담(가상)", "role": "FC", "branchId": "B-05" },
  { "id": "U-006", "name": "오나래(가상)", "role": "FC", "branchId": "B-02" },
  { "id": "U-007", "name": "문채움(가상)", "role": "FC", "branchId": "B-03" },
  { "id": "U-008", "name": "강다온(가상)", "role": "FC", "branchId": "B-04" },
  /* 관리자 U-010 과 같은 지점 FC: [지점 FC 문의]·대리 접수 알림 시연 (ADR-025, docs/10-seed-scenarios.md 5-1절) */
  { "id": "U-011", "name": "정다솜(가상)", "role": "FC", "branchId": "B-01" },
  { "id": "U-012", "name": "조은별(가상)", "role": "FC", "branchId": "B-01" },
  /* ADR-027 고객 동의 키패드 시연의 대표 FC: 같은 지점, 신고 이력 없음 (docs/10-seed-scenarios.md 5-3절) */
  { "id": "U-013", "name": "남다래(가상)", "role": "FC", "branchId": "B-01" },
  { "id": "U-010", "name": "박새벽(가상)", "role": "MANAGER", "branchId": "B-01" },
  /* unlinkedSeenAt: 결함 대장 [아직 안 묶인 신고]를 마지막으로 본 시각. 이 뒤에 들어온 신고가 "새로 들어옴"(ADR-017) */
  /* ADR-030: SALES = 현업 담당자. inboxIds = 맡은 담당 그룹(fixtures/business-routes.js). 부서·그룹은 가상 매핑
     ADR-031: contact = 업무용 내선(가상, 개인 휴대전화 없음), primary = 주 담당, active = 사용 중, available = 지금 인수할 수 있음.
     IT 의 itGroupIds = 맡은 IT 담당 그룹. 이름은 업무 코드에 넣지 않고 이 표에서만 읽는다 */
  { "id": "U-020", "name": "최누리(가상)", "role": "SALES", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T08:00:00+09:00",
    "inboxIds": ["IB-COMMON", "IB-TRIAGE", "IB-UNCLASSIFIED"], "contact": { "ext": "1101" }, "primary": true, "active": true, "available": true },
  { "id": "U-021", "name": "백나린(가상)", "role": "SALES", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T08:00:00+09:00",
    "inboxIds": ["IB-CONSENT"], "contact": { "ext": "1121" }, "primary": true, "active": true, "available": true },
  { "id": "U-022", "name": "임하람(가상)", "role": "SALES", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T08:00:00+09:00",
    "inboxIds": ["IB-CONSENT"], "contact": { "ext": "1122" }, "primary": false, "active": true, "available": true },
  { "id": "U-023", "name": "송이루(가상)", "role": "SALES", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T08:00:00+09:00",
    "inboxIds": ["IB-SUBSCRIPTION"], "contact": { "ext": "1131" }, "primary": true, "active": true, "available": true },
  { "id": "U-024", "name": "유다인(가상)", "role": "SALES", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T08:00:00+09:00",
    "inboxIds": ["IB-CUSTOMER", "IB-DESIGN"], "contact": { "ext": "1141" }, "primary": true, "active": true, "available": true },
  { "id": "U-025", "name": "진서율(가상)", "role": "SALES", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T08:00:00+09:00",
    "inboxIds": ["IB-PRE_UW", "IB-UNDERWRITING"], "contact": { "ext": "1151" }, "primary": true, "active": true, "available": true },
  /* 담당자 부재 사례: 계약관리팀(가상)의 유일한 구성원이 지금 인수할 수 없다 → 대체 그룹(영업지원팀)이 받는다 */
  { "id": "U-026", "name": "하도윤(가상)", "role": "SALES", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T08:00:00+09:00",
    "inboxIds": ["IB-CONTRACT"], "contact": { "ext": "1161" }, "primary": true, "active": true, "available": false },
  { "id": "U-030", "name": "정한결(가상)", "role": "IT", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T09:00:00+09:00",
    "itGroupIds": ["ITG-CONSENT", "ITG-COMMON"], "contact": { "ext": "2101" }, "active": true, "available": true },
  { "id": "U-031", "name": "기태오(가상)", "role": "IT", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T09:00:00+09:00",
    "itGroupIds": ["ITG-SUBSCRIPTION"], "contact": { "ext": "2111" }, "active": true, "available": true },
  { "id": "U-032", "name": "마루한(가상)", "role": "IT", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T09:00:00+09:00",
    "itGroupIds": ["ITG-DESIGN"], "contact": { "ext": "2121" }, "active": true, "available": true },
  { "id": "U-033", "name": "설지안(가상)", "role": "IT", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T09:00:00+09:00",
    "itGroupIds": ["ITG-CUSTOMER", "ITG-COMMON"], "contact": { "ext": "2131" }, "active": true, "available": true }
];
