/* S2 AI 문의 시연용 표현과 가상 안내. 결함 상태와 처리 내용은 결함 대장에서 읽는다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.intakeAssistant = {
  questions: [
    '비밀번호는 어떻게 바꾸나요?',
    '서명 알림톡을 열면 초대장이 떠요',
    '가입설계에서 보험료 계산이 늦어요'
  ],
  usage: {
    terms: [/비밀번호/, /바꾸|바꿔|변경|수정/],
    business: 'LOGIN',
    symptom: 'HOW_TO'
  },
  defects: [
    { id: 'D-2026-001', terms: [/서명/, /알림톡|링크/, /초대장|다른 화면|엉뚱한 화면/],
      business: 'SUBSCRIPTION', symptom: 'WRONG_SCREEN' },
    { id: 'D-2026-002', terms: [/청약|서명/, /멈추|멈췄|멈춰|먹통|안 넘어/],
      business: 'SUBSCRIPTION', symptom: 'CANNOT_PROCEED' },
    { id: 'D-2026-003', terms: [/보험료|가입설계/, /느려|느리|늦|오래 걸|한참 기다/],
      business: 'DESIGN', symptom: 'NOT_SHOWN' },
    { id: 'D-2026-004', terms: [/로그인|비밀번호/, /글자|입력|숫자/, /다르게|다른|잘못|로만/],
      business: 'LOGIN', symptom: 'WRONG_INPUT' },
    { id: 'D-2026-005', terms: [/고객/, /목록|이름/, /안 열|열리지 않|반응 없/],
      business: 'CUSTOMER_LOOKUP', symptom: 'CANNOT_PROCEED' },
    { id: 'D-2026-006', terms: [/계약/, /정렬/, /다른 계약|엉뚱한/],
      business: 'CONTRACT_LOOKUP', symptom: 'WRONG_SCREEN' }
  ]
};
