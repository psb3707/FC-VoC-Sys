/* S2 AI 문의 시연용 표현과 가상 안내. 결함 상태와 처리 내용은 결함 대장에서 읽는다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.intakeAssistant = {
  questions: [
    '비밀번호는 어떻게 바꾸나요?',
    '서명 알림톡을 열면 초대장이 떠요',
    '가입설계에서 보험료 계산이 늦어요',
    '고객 휴대폰에서 동의 URL 뒷자리 키패드가 안 떠요'
  ],
  usage: {
    terms: [/비밀번호/, /바꾸|바꿔|변경|수정/],
    business: 'LOGIN',
    symptom: 'HOW_TO'
  },
  defects: [
    { id: 'D-2026-001', terms: [/서명/, /알림톡|링크/, /초대장|다른 화면|엉뚱한 화면/],
      business: 'SUBSCRIPTION', symptom: 'WRONG_SCREEN',
      /* ADR-026: 한 상담에서 되묻는 확인 항목(최대 3개). known 은 질문 문장에서 이미 알 수 있는 답(앞 규칙이 먼저).
         ADR-027: stage guide = 대장의 안내를 고르는 데 필요(결과 카드 전에 물음), report = 담당자 확인용(결과 뒤에 물음) */
      checks: [
        { key: 'DEVICE', stage: 'report', text: '고객님 휴대전화에서 링크를 여셨나요?',
          choices: [['CUSTOMER_PHONE', '네, 고객님 휴대전화예요'], ['SAME', '아니요, 지금 이 기기예요'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/고객\S{0,3}\s*(휴대\s*전화|휴대폰|핸드폰|폰)/, 'CUSTOMER_PHONE']] },
        { key: 'SEMINAR_HISTORY', stage: 'guide', text: '이전에 이 고객님께 세미나 초대장을 보낸 적이 있나요?',
          choices: [['YES', '네, 있어요'], ['NO', '아니요, 없어요'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/초대장\S{0,3}\s*(보낸 적\s*(없|이 없)|안 보냈)/, 'NO'], [/초대장\S{0,3}\s*(보낸 적|보냈|발송했)/, 'YES']] },
        { key: 'CUSTOMER_WAITING', stage: 'report', text: '지금 고객님이 기다리고 계신가요?',
          choices: [['YES', '네, 기다리고 계세요'], ['NO', '아니요'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/기다리|상담\s*중|앞에\s*계/, 'YES']] }
      ],
      /* 규칙 후보(ADR-026 결정 8)의 "관련 조건": 원인 파악 이력 "초대장 발송 이력이 있으면 링크가 바뀌는 것을 확인" */
      conditions: { SEMINAR_HISTORY: 'YES' },
      resumeQuestion: '문자로 서명 링크를 보내니 청약을 진행할 수 있었나요?' },
    /* ADR-027 고객 동의 키패드 오류(docs/10-seed-scenarios.md 5-3절). 승인된 임시조치가 없어 guide 항목이 없다.
       입력란 값(주민등록번호 등)은 묻지 않고 "어느 입력란인지·키패드가 보였는지"만 묻는다 */
    { id: 'D-2026-007', terms: [/동의|본인\s*확인/, /키패드|자판|숫자\s*입력/, /안\s*(떠|뜨|나와|나오|나타|올라|열|보)|않|없어/],
      business: 'CUSTOMER_CONSENT', symptom: 'CANNOT_INPUT',
      checks: [
        { key: 'DEVICE', stage: 'report', text: '고객님 휴대전화에서 동의 URL을 여셨나요?',
          choices: [['CUSTOMER_PHONE', '네, 고객님 휴대전화예요'], ['OTHER', '아니요, 다른 기기예요'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/고객\S{0,3}\s*(휴대\s*전화|휴대폰|핸드폰|폰)/, 'CUSTOMER_PHONE']] },
        { key: 'INPUT_STEP', stage: 'report', text: '어느 입력란에서 문제가 생겼나요?',
          choices: [['FRONT', '앞자리 입력란'], ['BACK', '뒷자리 입력란'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/앞자리\S{0,2}\s*(는|은)?\s*(되|괜찮|정상|잘)/, 'BACK'], [/뒷자리\S{0,2}\s*(는|은)?\s*(되|괜찮|정상|잘)/, 'FRONT'],
            [/뒷자리/, 'BACK'], [/앞자리/, 'FRONT']] },
        { key: 'KEYPAD_SYMPTOM', stage: 'report', text: '키패드는 어떻게 보였나요?',
          choices: [['NO_KEYPAD', '키패드가 안 나타나요'], ['NO_INPUT', '키패드는 보이는데 입력이 안 돼요'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/(키패드|자판)\S{0,3}\s*(보이는데|나와도|떠도|있는데)/, 'NO_INPUT'],
            [/(키패드|자판)\S{0,3}\s*(안\s*(떠|뜨|나와|나오|나타|올라|열|보)|없)/, 'NO_KEYPAD']] },
        { key: 'DEVICE_OS', stage: 'report', text: '고객님 휴대전화는 어떤 종류인가요?',
          choices: [['ANDROID', '안드로이드(갤럭시 등)'], ['IOS', '아이폰'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/안드로이드|갤럭시|android/i, 'ANDROID'], [/아이폰|iphone|ios/i, 'IOS']] },
        { key: 'URL_PATH', stage: 'report', text: '동의 URL을 어디에서 여셨나요?',
          choices: [['IN_APP', '문자·메신저 앱 안에서 바로'], ['EXTERNAL', '인터넷 앱(크롬·사파리 등)으로'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/카카오톡|카톡|메신저|앱\s*안/, 'IN_APP'], [/크롬|사파리|인터넷\s*앱/, 'EXTERNAL']] },
        { key: 'CUSTOMER_WAITING', stage: 'report', text: '지금 고객님이 기다리고 계신가요?',
          choices: [['YES', '네, 기다리고 계세요'], ['NO', '아니요'], ['UNKNOWN', '잘 모르겠어요']],
          known: [[/기다리|상담\s*중|앞에\s*계/, 'YES']] }
      ],
      /* 핵심 조건: 규칙 후보의 "관련 조건" 근거이자, 확인 화면에서 다른 값으로 바꾸면 안내 사례를 다시 확인하는 기준(ADR-027 결정 7) */
      conditions: { INPUT_STEP: 'BACK', KEYPAD_SYMPTOM: 'NO_KEYPAD' },
      blockedNote: '고객 동의 절차가 진행되지 않는 상황을 접수에 남길게요.',
      supportQuestion: '지금 이 고객님과 업무를 이어가기 어려운 상황인가요?' },
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
