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
  { "id": "U-010", "name": "박새벽(가상)", "role": "MANAGER", "branchId": "B-01" },
  /* unlinkedSeenAt: 결함 대장 [아직 안 묶인 신고]를 마지막으로 본 시각. 이 뒤에 들어온 신고가 "새로 들어옴"(ADR-017) */
  { "id": "U-020", "name": "최누리(가상)", "role": "SALES", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T08:00:00+09:00" },
  { "id": "U-030", "name": "정한결(가상)", "role": "IT", "branchId": "B-HQ", "unlinkedSeenAt": "2026-11-04T09:00:00+09:00" }
];
