/* 업무분장(가상)과 문의함 (ADR-030, docs/02-domain-rules.md 5-2절, docs/05-data-api-spec.md 1절 BusinessRoute·Inbox).
   부서·문의함은 모두 가상 매핑이며 실제 회사의 업무분장이 아니다. AI가 아닌 규칙 분류가 이 표를 읽는다.
   - routes: 세부 업무(기존 업무 코드) → 상위 업무·관련 화면 ID·문의함·IT 협의 영역. UNDERWRITING 은 세부 코드 없이 화면 ID로만 걸린다.
     task: 업무 영향 문구에 넣는 짧은 업무 이름("고객 동의 진행 어려움"). needs: 추가 정보 요청에 먼저 보이는 항목.
   - inboxes: DEPARTMENT 부서 문의함 / TRIAGE 공통 분류(업무가 둘 이상) / UNCLASSIFIED 미분류(근거 없음).
   - infoItems: 추가 정보 요청 항목. 값은 IntakeFacts 의 조건 코드와 같고 모두 "잘 모르겠어요"가 있다.
   - 담당자는 users.js 의 inboxIds 로 정한다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.businessRoutes = {
  "parents": [
    { "code": "CUSTOMER_MGMT", "label": "고객관리" }, { "code": "CONSENT", "label": "상품소개동의" },
    { "code": "DESIGN", "label": "가입설계" }, { "code": "SUBSCRIPTION", "label": "청약" },
    { "code": "UNDERWRITING", "label": "심사" }, { "code": "CONTRACT", "label": "계약관리" },
    { "code": "COMMON", "label": "공통업무" }, { "code": "ETC", "label": "기타" }
  ],
  "routes": [
    { "code": "CUSTOMER_LOOKUP", "label": "고객조회", "parentCode": "CUSTOMER_MGMT", "task": "고객 조회",
      "screenIds": ["CUSTOMER_SEARCH"], "inboxId": "IB-CUSTOMER", "itArea": "CUSTOMER", "needs": ["REPEAT"], "active": true },
    { "code": "CUSTOMER_CONSENT", "label": "고객동의·본인확인", "parentCode": "CONSENT", "task": "고객 동의",
      "screenIds": ["CONSENT_URL"], "inboxId": "IB-CONSENT", "itArea": "CONSENT",
      "needs": ["INPUT_STEP", "KEYPAD_SYMPTOM", "DEVICE_OS", "URL_PATH", "REPEAT"], "active": true },
    { "code": "DESIGN", "label": "가입설계", "parentCode": "DESIGN", "task": "가입설계",
      "screenIds": ["DESIGN"], "inboxId": "IB-DESIGN", "itArea": "DESIGN", "needs": ["REPEAT"], "active": true },
    { "code": "SUBSCRIPTION", "label": "청약·서명", "parentCode": "SUBSCRIPTION", "task": "청약·서명",
      "screenIds": ["SIGN_LINK", "SUBSCRIPTION"], "inboxId": "IB-SUBSCRIPTION", "itArea": "SUBSCRIPTION",
      "needs": ["SEMINAR_HISTORY", "REPEAT"], "active": true },
    { "code": "UNDERWRITING", "label": "심사", "parentCode": "UNDERWRITING", "task": "심사",
      "screenIds": ["UNDERWRITING"], "inboxId": "IB-UNDERWRITING", "itArea": "UNDERWRITING", "needs": ["REPEAT"], "active": true,
      "screenOnly": true },
    { "code": "CONTRACT_LOOKUP", "label": "계약조회", "parentCode": "CONTRACT", "task": "계약 조회",
      "screenIds": ["CONTRACT"], "inboxId": "IB-CONTRACT", "itArea": "CONTRACT", "needs": ["REPEAT"], "active": true },
    { "code": "LOGIN", "label": "로그인·접속", "parentCode": "COMMON", "task": "로그인",
      "screenIds": ["LOGIN"], "inboxId": "IB-COMMON", "itArea": "INFRA", "needs": ["REPEAT"], "active": true },
    { "code": "ETC", "label": "그 밖의 업무", "parentCode": "ETC", "task": "업무",
      "screenIds": [], "inboxId": "IB-UNCLASSIFIED", "itArea": null, "needs": ["REPEAT"], "active": true }
  ],
  "inboxes": [
    { "id": "IB-CONSENT", "name": "고객동의업무팀(가상)", "kind": "DEPARTMENT" },
    { "id": "IB-SUBSCRIPTION", "name": "청약업무팀(가상)", "kind": "DEPARTMENT" },
    { "id": "IB-CUSTOMER", "name": "고객관리팀(가상)", "kind": "DEPARTMENT" },
    { "id": "IB-DESIGN", "name": "상품설계지원팀(가상)", "kind": "DEPARTMENT" },
    { "id": "IB-UNDERWRITING", "name": "심사업무팀(가상)", "kind": "DEPARTMENT" },
    { "id": "IB-CONTRACT", "name": "계약관리팀(가상)", "kind": "DEPARTMENT" },
    { "id": "IB-COMMON", "name": "영업지원팀(가상)", "kind": "DEPARTMENT" },
    { "id": "IB-TRIAGE", "name": "공통 분류 문의함", "kind": "TRIAGE" },
    { "id": "IB-UNCLASSIFIED", "name": "미분류 문의함", "kind": "UNCLASSIFIED" }
  ],
  "infoItems": {
    "REPEAT": { "question": "같은 문제가 반복해서 생기나요?" },
    "URL_PATH": { "question": "고객님이 링크를 어디서 열었나요?" },
    "DEVICE_OS": { "question": "고객님 휴대전화는 어떤 종류인가요?" },
    "INPUT_STEP": { "question": "어느 입력란에서 문제가 생겼나요?" },
    "KEYPAD_SYMPTOM": { "question": "화면에서 어떤 일이 생겼나요?" },
    "SEMINAR_HISTORY": { "question": "그 고객님께 세미나 초대장을 보낸 적이 있나요?" }
  },
  "consultQuestions": [["CAUSE", "원인 확인"], ["REPRO", "재현 확인"], ["FIX_NEEDED", "수정·배포 필요 여부"], ["LOG", "로그 확인"], ["SCOPE", "영향 범위 확인"]],
  "consultReplies": [["FIELD_GUIDE", "현장 안내 가능"], ["KEEP_CHECKING", "IT 확인 계속"], ["NEED_FIX", "수정·배포 필요(ITGS 요청 필요)"], ["NOT_REPRODUCED", "재현 안 됨"]],
  "selfResolutions": [["USAGE_GUIDED", "사용 방법 안내로 해결"], ["DEPT_HANDLED", "담당 부서에서 처리"], ["GUIDE_WORKED", "안내한 방법으로 해결"], ["NOT_REPRODUCED", "다시 해보니 정상"]],
  "selfResolutionText": {
    "USAGE_GUIDED": "담당 부서에서 사용 방법을 확인해 해결했어요. 같은 문제가 다시 생기면 이 문의에 알려 주세요.",
    "DEPT_HANDLED": "담당 부서에서 처리를 마쳤어요. 같은 업무를 다시 진행해 주세요.",
    "GUIDE_WORKED": "안내한 방법으로 해결됐어요. 같은 문제가 다시 생기면 이 문의에 알려 주세요.",
    "NOT_REPRODUCED": "담당 부서에서 다시 확인했을 때는 정상이었어요. 같은 문제가 다시 생기면 이 문의에 알려 주세요."
  },
  "rerouteReasons": [["WRONG_BUSINESS", "업무가 달라요"], ["MULTI", "여러 업무에 걸쳐요"], ["OTHER", "기타"]]
};
