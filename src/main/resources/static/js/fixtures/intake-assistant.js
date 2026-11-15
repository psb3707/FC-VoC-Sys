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
      business: 'SUBSCRIPTION', symptom: 'WRONG_SCREEN',
      /* ADR-026: 한 상담에서 되묻는 확인 항목(최대 3개). known 은 질문 문장에서 이미 알 수 있는 답(앞 규칙이 먼저) */
      checks: [
        { key: 'DEVICE', text: '고객님 휴대전화에서 링크를 여셨나요?',
          choices: [['CUSTOMER_PHONE', '네, 고객님 휴대전화예요'], ['SAME', '아니요, 지금 이 기기예요'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/고객\S{0,3}\s*(휴대\s*전화|휴대폰|핸드폰|폰)/, 'CUSTOMER_PHONE']] },
        { key: 'SEMINAR_HISTORY', text: '이전에 이 고객님께 세미나 초대장을 보낸 적이 있나요?',
          choices: [['YES', '네, 있어요'], ['NO', '아니요, 없어요'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/초대장\S{0,3}\s*(보낸 적\s*(없|이 없)|안 보냈)/, 'NO'], [/초대장\S{0,3}\s*(보낸 적|보냈|발송했)/, 'YES']] },
        { key: 'CUSTOMER_WAITING', text: '지금 고객님이 기다리고 계신가요?',
          choices: [['YES', '네, 기다리고 계세요'], ['NO', '아니요'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/기다리|상담\s*중|앞에\s*계/, 'YES']] }
      ],
      /* 규칙 후보(ADR-026 결정 8)의 "관련 조건": 원인 파악 이력 "초대장 발송 이력이 있으면 링크가 바뀌는 것을 확인" */
      conditions: { SEMINAR_HISTORY: 'YES' },
      resumeQuestion: '문자로 서명 링크를 보내니 청약을 진행할 수 있었나요?' },
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
