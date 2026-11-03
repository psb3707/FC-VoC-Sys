/* GET /api/users 응답과 같은 키 (docs/05-data-api-spec.md 1절 AppUser).
   모든 인물은 가상이다. 실제 이름·번호·사번을 넣지 않는다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.users = [
  { "id": "U-001", "name": "김하늘(가상)", "role": "FC", "branchId": "B-01" },
  { "id": "U-002", "name": "이바다(가상)", "role": "FC", "branchId": "B-02" },
  { "id": "U-010", "name": "박새벽(가상)", "role": "MANAGER", "branchId": "B-01" },
  { "id": "U-020", "name": "최누리(가상)", "role": "SALES", "branchId": "B-HQ" },
  { "id": "U-030", "name": "정한결(가상)", "role": "IT", "branchId": "B-HQ" }
];
