/* S2 접수 패널 고정 응답 (docs/05-data-api-spec.md 3·4절, docs/07-ai-design.md 8절 형식).
   모든 값은 가상이다. 실제 이름·번호·사번을 넣지 않는다. 마스킹 결과도 계산하지 않고 고정값이다.
   여러 경우(case)의 응답은 같은 키 형식으로 두고, api-client.js 가 시안 상태에 맞는 것을 고른다.
     case: defect(사례 ① 알림톡 링크) | customer(고객 가입내역 미조회) | usage(사용법 문의) | blocked(입력 차단)
     llm : ok | fail(규칙 되묻기로 대체) */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.intake = {
  /* GET /api/meta/form : 업무·증상 선택지, 슬롯 */
  "metaForm": {
    "businesses": [
      { "code": "LOGIN", "label": "로그인·접속" },
      { "code": "SUBSCRIPTION", "label": "청약·서명" },
      { "code": "CUSTOMER_LOOKUP", "label": "고객조회" },
      { "code": "DESIGN", "label": "가입설계" },
      { "code": "CONTRACT_LOOKUP", "label": "계약조회" },
      { "code": "ETC", "label": "그 밖의 업무" }
    ],
    "symptoms": [
      { "code": "NOT_SHOWN", "label": "내용이 안 보여요" },
      { "code": "CANNOT_PROCEED", "label": "다음으로 안 넘어가요" },
      { "code": "WRONG_SCREEN", "label": "엉뚱한 화면이 떠요" },
      { "code": "WRONG_INPUT", "label": "입력이 잘못 들어가요" },
      { "code": "HOW_TO", "label": "쓰는 법을 모르겠어요" },
      { "code": "ETC", "label": "그 밖의 문제" }
    ],
    "slots": [
      { "code": "device_path", "label": "오류가 난 기기·경로", "auto": false },
      { "code": "steps", "label": "어떻게 하면 다시 생기나요", "auto": false },
      { "code": "key_condition", "label": "사례별 핵심 조건", "auto": false }
    ]
  },

  /* 자동 수집 정보(Report.autoContext 형식). 대응하는 API 없음: 브라우저가 스스로 붙이는 값의 시안 */
  "autoContext": {
    "reportedFrom": { "device": "사무실 컴퓨터", "browser": "크롬 브라우저" },
    "screenCode": "MAIN",
    "screenName": "메인 화면",
    "errorCode": null,
    "occurredAt": "2026-11-03T10:42:00+09:00"
  },

  /* GET /api/known-errors?screen=&symptom= : 공개된 대표 결함(Defect) + 계산값 reportCount */
  "knownErrors": [
    { "id": "D-2026-004", "title": "로그인할 때 글자가 다르게 들어가요", "type": "DEFECT", "systemGen": "OLD",
      "status": "WORKAROUND", "workaround": "인터넷 기록(쿠키)을 지우고 다시 접속하면 잠시 괜찮아져요",
      "plannedFixDate": "2026-11-20", "wontFixReasonCode": null, "wontFixReasonText": null,
      "published": true, "reportCount": 7, "updatedAt": "2026-11-02T09:00:00+09:00" },
    { "id": "D-2026-005", "title": "고객 목록에서 이름을 눌러도 상세가 안 열려요", "type": "IMPROVEMENT", "systemGen": "OLD",
      "status": "WONT_FIX", "workaround": "이름 대신 같은 줄의 성별 칸을 누르면 열려요",
      "plannedFixDate": null, "wontFixReasonCode": "NEW_SFA", "wontFixReasonText": "새 시스템에서 고쳐질 예정이에요",
      "published": true, "reportCount": 3, "updatedAt": "2026-10-30T15:00:00+09:00" }
  ],

  /* POST /api/known-errors/{id}/me-too : ME_TOO 신고 1건 생성 */
  "meToo": { "reportId": "R-101", "kind": "ME_TOO", "defectId": "D-2026-004", "reportCount": 8 },

  /* POST /api/intake/preview : 차단·마스킹 결과와 AI 전달 내용 (차단 시 값 없이 유형만) */
  "preview": {
    "defect": { "blocked": false, "detections": [], "maskedText": "서명 알림톡을 누르면 세미나 초대장 화면이 떠요", "refKeys": [],
      "aiPayload": { "text": "서명 알림톡을 누르면 세미나 초대장 화면이 떠요", "attributes": {} } },
    "customer": { "blocked": false, "detections": [], "maskedText": "[고객] 고객님 가입내역이 안 보여요", "refKeys": ["K-01"],
      "aiPayload": { "text": "[고객] 고객님 가입내역이 안 보여요",
        "attributes": { "ref": "K-01", "contractStatus": "유지", "productGroup": "종신",
          "lastChange": { "type": "계약자변경", "month": "2026-11" }, "channel": "모바일" } } },
    "usage": { "blocked": false, "detections": [], "maskedText": "비밀번호를 바꾸는 방법을 모르겠어요", "refKeys": [],
      "aiPayload": { "text": "비밀번호를 바꾸는 방법을 모르겠어요", "attributes": {} } },
    "blocked": { "blocked": true, "detections": [{ "type": "RRN" }] }
  },

  /* POST /api/intake/sessions : B모드 AI 분석 시작, 되묻기 반환 */
  "sessions": {
    "defect": { "sessionId": "S-001",
      "classification": { "type": "DEFECT", "confidence": "HIGH", "reason": "알림톡 링크가 다른 화면으로 연결된다고 했어요" },
      "ticket": { "title": "서명 알림톡 링크가 세미나 초대장으로 연결됨", "symptomSummary": "청약 서명 알림톡을 누르면 서명 화면 대신 세미나 초대장 화면이 열린다",
        "stepsToReproduce": ["고객에게 청약 서명 알림톡을 보낸다", "알림톡의 서명 버튼을 누른다"], "expected": "서명 화면이 열린다", "actual": "세미나 초대장 화면이 열린다" },
      "questions": [
        { "slot": "device_path", "text": "오류는 어디에서 났나요?", "choices": ["이 컴퓨터", "휴대폰 알림톡", "태블릿", "모르겠어요"] },
        { "slot": "key_condition", "text": "이 고객에게 세미나 초대장을 보낸 적이 있나요?", "choices": ["네", "아니요", "모르겠어요"] },
        { "slot": "steps", "text": "다시 해봐도 같은 문제가 나나요?", "choices": ["매번 나요", "가끔 나요", "한 번만 났어요"] }
      ],
      "usageGuide": null, "needsHumanReview": false, "llmOutcome": "OK" },
    "customer": { "sessionId": "S-002",
      "classification": { "type": "DEFECT", "confidence": "MEDIUM", "reason": "특정 고객의 가입내역이 조회되지 않는다고 했어요" },
      "ticket": { "title": "특정 고객 가입내역 미조회", "symptomSummary": "고객종합조회에서 [고객]의 가입내역이 표시되지 않는다",
        "stepsToReproduce": ["고객종합조회를 연다", "K-01 고객을 조회한다"], "expected": "가입내역이 보인다", "actual": "가입내역이 비어 있다" },
      "questions": [
        { "slot": "other_customers", "text": "다른 고객도 같은 증상이 있나요?", "choices": ["네", "아니요", "모르겠어요"] }
      ],
      "usageGuide": null, "needsHumanReview": false, "llmOutcome": "OK" },
    "usage": { "sessionId": "S-003",
      "classification": { "type": "USAGE", "confidence": "HIGH", "reason": "오류가 아니라 사용 방법을 물었어요" },
      "ticket": { "title": "비밀번호 변경 방법 문의", "symptomSummary": "비밀번호를 바꾸는 방법을 모른다",
        "stepsToReproduce": [], "expected": null, "actual": null },
      "questions": [],
      "usageGuide": "화면 오른쪽 위 '정보 수정'을 누른 뒤 '비밀번호 바꾸기'를 누르세요. 새 비밀번호를 두 번 적고 '저장'을 누르면 끝나요.",
      "needsHumanReview": false, "llmOutcome": "OK" },
    "fallback": { "sessionId": "S-004",
      "classification": null,
      "ticket": null,
      "questions": [
        { "slot": "device_path", "text": "오류는 어디에서 났나요?", "choices": ["이 컴퓨터", "휴대폰", "태블릿", "모르겠어요"] },
        { "slot": "steps", "text": "어떻게 하면 다시 생기나요? 짧게 적어 주세요" }
      ],
      "usageGuide": null, "needsHumanReview": true, "llmOutcome": "FALLBACK" }
  },

  /* POST /api/intake/sessions/{id}/answers : 되묻기 답변 반영(refine) 결과 */
  "answers": {
    "defect": { "sessionId": "S-001",
      "classification": { "type": "DEFECT", "confidence": "HIGH", "reason": "알림톡 링크가 다른 화면으로 연결된다고 했어요" },
      "ticket": { "title": "서명 알림톡 링크가 세미나 초대장으로 연결됨",
        "symptomSummary": "세미나 초대장을 보낸 적이 있는 고객에게 청약 서명 알림톡을 보내면, 휴대폰에서 서명 버튼을 눌렀을 때 초대장 화면이 열린다",
        "stepsToReproduce": ["세미나 초대장을 보낸 적이 있는 고객을 고른다", "청약 서명 알림톡을 보낸다", "휴대폰 알림톡에서 서명 버튼을 누른다"],
        "expected": "서명 화면이 열린다", "actual": "세미나 초대장 화면이 열린다" },
      "remainingMissingSlots": [], "needsHumanReview": false, "llmOutcome": "OK" },
    "customer": { "sessionId": "S-002",
      "classification": { "type": "DEFECT", "confidence": "MEDIUM", "reason": "특정 고객의 가입내역이 조회되지 않는다고 했어요" },
      "ticket": { "title": "특정 고객 가입내역 미조회", "symptomSummary": "고객종합조회에서 K-01 고객의 가입내역만 표시되지 않는다. 다른 고객은 정상",
        "stepsToReproduce": ["고객종합조회를 연다", "K-01 고객을 조회한다", "가입내역 탭을 누른다"],
        "expected": "가입내역이 보인다", "actual": "가입내역이 비어 있다" },
      "remainingMissingSlots": [], "needsHumanReview": false, "llmOutcome": "OK" },
    "fallback": { "sessionId": "S-004",
      "classification": null,
      "ticket": null,
      "remainingMissingSlots": [], "needsHumanReview": true, "llmOutcome": "FALLBACK" }
  },

  /* POST /api/reports : 최종 제출 결과 (A/B 공통). 등급·부서는 규칙이 정한다(02번) */
  "reports": {
    "defect": { "reportId": "R-001", "type": "DEFECT", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT", "closedAsGuidance": false },
    "customer": { "reportId": "R-002", "type": "DEFECT", "grade": "BATCH", "departmentCode": "CUSTOMER_IT", "closedAsGuidance": false },
    "usage": { "reportId": "R-003", "type": "USAGE", "grade": null, "departmentCode": "SALES_SUPPORT", "closedAsGuidance": true },
    "usageAsDefect": { "reportId": "R-003", "type": "DEFECT", "grade": "NORMAL", "departmentCode": "LOGIN_SUPPORT", "closedAsGuidance": false },
    /* A모드 또는 AI 실패(규칙 대체): 유형은 미분류, 담당자가 확정 (REQ-MD-02) */
    "unclassified": { "reportId": "R-004", "type": "UNCLASSIFIED", "grade": "IMMEDIATE", "departmentCode": "SUBSCRIPTION_IT", "closedAsGuidance": false },
    "unclassifiedCustomer": { "reportId": "R-005", "type": "UNCLASSIFIED", "grade": "BATCH", "departmentCode": "CUSTOMER_IT", "closedAsGuidance": false },
    "unclassifiedLogin": { "reportId": "R-006", "type": "UNCLASSIFIED", "grade": "NORMAL", "departmentCode": "LOGIN_SUPPORT", "closedAsGuidance": false }
  }
};

/* 두 화면 접수의 선택지와 공개 임시 안내 시연 데이터 (ADR-019). */
window.FIXTURES.intake.quick = {
  departments: {
    LOGIN: '영업지원팀', SUBSCRIPTION: '청약업무팀', CUSTOMER_LOOKUP: '고객관리팀',
    DESIGN: '상품설계지원팀', CONTRACT_LOOKUP: '계약관리팀', ETC: '영업지원팀'
  },
  guides: {
    'D-2026-001': { steps: ['문자로 서명 링크를 보낼 수 있는 화면을 여세요.', '해당 고객에게 서명 링크를 문자로 보내 주세요.'],
      customerMessage: '현재 서명 알림톡 연결 오류를 확인 중입니다. 문자로 보내드린 서명 링크를 이용해 주세요.' },
    'D-2026-004': { steps: ['브라우저 설정에서 인터넷 사용 기록 삭제를 여세요.', '쿠키 및 사이트 데이터를 선택해 삭제한 뒤 다시 로그인해 주세요.'] },
    'D-2026-005': { steps: ['고객 목록에서 해당 고객의 줄을 확인해 주세요.', '이름 대신 같은 줄의 성별 칸을 눌러 상세를 열어 주세요.'] }
  },
  options: {
    urgency: [['CONSULTING', '고객 상담 중'], ['BLOCKED', '청약 진행 불가'], ['DEADLINE', '오늘 처리 마감']],
    scope: [['ONE', '한 고객'], ['MANY', '여러 고객'], ['UNKNOWN', '아직 모르겠어요']],
    symptoms: [{ code: 'SLOW', label: '느리거나 계속 로딩돼요' }, { code: 'LOST', label: '저장한 내용이 사라졌어요' },
      { code: 'DIFFERENT', label: '금액이나 내용이 달라요' }, { code: 'PRINT', label: '출력이 안 돼요' }],
    contact: [['SFA', 'SFA에서 답변'], ['PHONE', '전화 희망']],
    time: [['AM', '오전'], ['PM', '오후'], ['ANY', '시간 무관']]
  }
};
