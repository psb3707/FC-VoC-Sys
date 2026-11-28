/* 업무분장(가상)과 담당 그룹 (ADR-030·031, docs/02-domain-rules.md 5-2절, docs/05-data-api-spec.md 1절).
   부서·담당 그룹·IT 그룹·내선 번호는 모두 가상 매핑이며 실제 회사의 업무분장이 아니다. AI가 아닌 규칙 분류가 이 표만 읽는다.
   - routes: 세부 업무 → 상위 업무·관련 화면 ID·현업 담당 그룹(inboxId)·IT 협의 영역(itArea)·업무 표현(lexicon).
     기존 업무 코드 7종은 그대로 두고 세부 업무를 더했다(ADR-031 결정 1). inboxId 가 없으면 매핑 누락(공통 분류 문의함).
     task: 업무 영향 문구의 짧은 업무 이름. needs: 추가 정보 요청에 먼저 보이는 항목. selectable: 빠른 접수 업무 칸에 보임.
     lexicon: names = 뜻이 하나인 업무 이름(하나로도 근거), objects·actions = 대상어와 동작·증상어(함께 맞아야 근거).
     낱말은 띄어쓰기 없이 쓴다(규칙이 띄어쓰기를 보지 않음).
   - ambiguities: 뜻이 여럿인 말. 다른 근거가 없으면 확정하지 않고 질문 하나(마지막 선택지는 늘 "잘 모르겠어요").
   - inboxes: 현업 담당 그룹. DEPARTMENT 부서 / TRIAGE 공통 분류(업무가 둘 이상·매핑 누락) / UNCLASSIFIED 미분류(근거 없음).
     contact: 대표 업무 연락처(가상 내선). backupInboxId: 인수할 수 있는 구성원이 없을 때 받는 대체 그룹.
   - itGroups: IT 담당 그룹. itAreas 로 업무와 잇고, 없으면 공통 IT 협의함(ITG-COMMON).
   - 담당자는 users.js 의 inboxIds·itGroupIds 로 정한다. 이름을 이 표에 넣지 않는다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.businessRoutes = {
  "parents": [
    { "code": "CUSTOMER_MGMT", "label": "고객관리" }, { "code": "CONSENT", "label": "상품소개동의" },
    { "code": "DESIGN", "label": "가입설계" }, { "code": "PRE_UW", "label": "선심사" },
    { "code": "SUBSCRIPTION", "label": "청약" }, { "code": "UW_NEW", "label": "신계약심사" },
    { "code": "CONTRACT", "label": "계약관리" }, { "code": "COMMON", "label": "공통업무" }, { "code": "ETC", "label": "업무 미확인" }
  ],
  "routes": [
    { "code": "CUSTOMER_LOOKUP", "label": "고객조회", "parentCode": "CUSTOMER_MGMT", "task": "고객 조회",
      "screenIds": ["CUSTOMER_SEARCH"], "inboxId": "IB-CUSTOMER", "itArea": "CUSTOMER", "needs": ["REPEAT"], "active": true,
      "lexicon": { "names": ["고객조회", "고객관리", "고객등록"],
        "objects": ["고객목록", "고객정보", "고객이름", "고객명", "고객검색", "고객카드"],
        "actions": ["조회", "검색", "안열", "열리지", "수정", "등록", "저장", "안나와", "안보여", "반응", "안눌"] } },
    { "code": "CUSTOMER_CONSENT", "label": "고객동의·본인확인", "parentCode": "CONSENT", "task": "고객 동의",
      "screenIds": ["CONSENT_URL"], "inboxId": "IB-CONSENT", "itArea": "CONSENT",
      "needs": ["INPUT_STEP", "KEYPAD_SYMPTOM", "DEVICE_OS", "URL_PATH", "REPEAT"], "active": true,
      "lexicon": { "names": ["상품소개동의", "고객동의", "본인확인", "동의url", "동의링크", "동의화면"],
        "objects": ["동의", "키패드", "본인인증"],
        "actions": ["링크", "url", "뒷자리", "앞자리", "숫자", "입력", "안눌", "안떠", "안뜨", "안나타", "안보여"] } },
    { "code": "DESIGN", "label": "가입설계", "parentCode": "DESIGN", "task": "가입설계",
      "screenIds": ["DESIGN"], "inboxId": "IB-DESIGN", "itArea": "DESIGN", "needs": ["REPEAT"], "active": true,
      "lexicon": { "names": ["가입설계", "보장설계", "설계서"],
        "objects": ["보험료", "플랜", "특약", "상품선택"],
        "actions": ["계산", "산출", "돌아", "로딩", "느려", "느리", "늦", "오래", "멈", "안나와", "안돼", "안되", "오류", "에러", "이상"] } },
    { "code": "PRE_UW", "label": "선심사", "parentCode": "PRE_UW", "task": "선심사",
      "screenIds": ["PRE_UW"], "inboxId": "IB-PRE_UW", "itArea": "PRE_UW", "needs": ["REPEAT"], "active": true, "selectable": true,
      "lexicon": { "names": ["선심사", "사전심사"], "objects": [], "actions": [] } },
    { "code": "SUBSCRIPTION", "label": "청약·서명", "parentCode": "SUBSCRIPTION", "task": "청약·서명",
      "screenIds": ["SUBSCRIPTION"], "inboxId": "IB-SUBSCRIPTION", "itArea": "SUBSCRIPTION",
      "needs": ["SEMINAR_HISTORY", "REPEAT"], "active": true,
      "lexicon": { "names": ["청약"], "objects": [], "actions": [] } },
    { "code": "APPLICATION", "label": "청약서 작성·제출", "parentCode": "SUBSCRIPTION", "task": "청약서 제출",
      "screenIds": ["APPLICATION"], "inboxId": "IB-SUBSCRIPTION", "itArea": "SUBSCRIPTION", "needs": ["REPEAT"], "active": true,
      "lexicon": { "names": ["청약서"], "objects": ["청약"], "actions": ["작성", "제출", "전송", "저장"] } },
    { "code": "E_SIGN", "label": "전자서명", "parentCode": "SUBSCRIPTION", "task": "전자서명",
      "screenIds": ["SIGN_LINK"], "inboxId": "IB-SUBSCRIPTION", "itArea": "SUBSCRIPTION", "needs": ["SEMINAR_HISTORY", "REPEAT"], "active": true,
      /* ADR-031 결정 1: "서명"만으로는 부서를 정하지 않는다. 청약 서명의 경로(알림톡·서명 링크·청약서)가 함께 나올 때만 근거 */
      "lexicon": { "names": [], "objects": ["전자서명", "서명"], "actions": ["알림톡", "링크", "청약서", "청약"] } },
    { "code": "UW_NEW", "label": "신계약심사", "parentCode": "UW_NEW", "task": "신계약심사",
      "screenIds": ["UNDERWRITING"], "inboxId": "IB-UNDERWRITING", "itArea": "UNDERWRITING", "needs": ["REPEAT"], "active": true, "selectable": true,
      "lexicon": { "names": ["신계약심사", "청약심사", "청약이후심사", "청약후심사", "심사보완", "보완요청"], "objects": [], "actions": [] } },
    { "code": "CONTRACT_LOOKUP", "label": "계약조회", "parentCode": "CONTRACT", "task": "계약 조회",
      "screenIds": ["CONTRACT"], "inboxId": "IB-CONTRACT", "itArea": "CONTRACT", "needs": ["REPEAT"], "active": true,
      "lexicon": { "names": ["계약관리", "계약조회", "보장내역", "보장현황", "가입한보험", "가입한상품"],
        "objects": ["계약", "증권"], "actions": ["조회", "안나와", "안보여", "목록", "정렬", "확인"] } },
    { "code": "LOGIN", "label": "로그인·접속", "parentCode": "COMMON", "task": "로그인",
      "screenIds": ["LOGIN"], "inboxId": "IB-COMMON", "itArea": "INFRA", "needs": ["REPEAT"], "active": true,
      "lexicon": { "names": ["로그인", "비밀번호", "비번", "인증서", "공동인증", "아이디"], "objects": ["접속"], "actions": ["안돼", "안되", "끊", "오류", "느려"] } },
    /* 매핑 누락 사례(ADR-031 결정 4): 담당 그룹이 아직 정해지지 않은 세부 업무 → 공통 분류 문의함 */
    { "code": "SALES_MATERIAL", "label": "영업 자료실", "parentCode": "COMMON", "task": "영업 자료 조회",
      "screenIds": [], "inboxId": null, "itArea": null, "needs": ["REPEAT"], "active": true,
      "lexicon": { "names": ["자료실", "영업자료", "교육자료"], "objects": [], "actions": [] } },
    { "code": "ETC", "label": "그 밖의 업무", "parentCode": "ETC", "task": "업무",
      "screenIds": [], "inboxId": "IB-UNCLASSIFIED", "itArea": null, "needs": ["REPEAT"], "active": true,
      "lexicon": { "names": [], "objects": [], "actions": [] } }
  ],
  "ambiguities": [
    { "id": "UW_KIND", "triggers": ["심사"], "resolvedBy": ["PRE_UW", "UW_NEW"],
      "question": "가입설계 과정에서 요청하신 선심사 결과인가요, 아니면 청약 이후 진행되는 심사 결과인가요?",
      "choices": [["PRE_UW", "선심사 결과"], ["UW_NEW", "청약 이후 심사 결과"], ["UNKNOWN", "잘 모르겠어요"]] },
    { "id": "SUBMIT_KIND", "triggers": ["제출", "마지막버튼", "전송버튼"], "resolvedBy": "ANY",
      "question": "어떤 것을 제출하다가 문제가 생겼나요?",
      "choices": [["APPLICATION", "청약서"], ["PRE_UW", "선심사 요청"], ["UNKNOWN", "잘 모르겠어요"]] },
    { "id": "SIGN_KIND", "triggers": ["서명", "사인"], "resolvedBy": ["E_SIGN", "CUSTOMER_CONSENT", "APPLICATION", "SUBSCRIPTION"],
      "question": "어느 단계의 서명인가요?",
      "choices": [["E_SIGN", "청약서 전자서명"], ["CUSTOMER_CONSENT", "고객 동의(본인확인)"], ["UNKNOWN", "잘 모르겠어요"]] }
  ],
  "conflictQuestion": "어느 업무를 하다가 문제가 생겼나요?",
  "inboxes": [
    { "id": "IB-CONSENT", "name": "고객동의업무팀(가상)", "kind": "DEPARTMENT", "active": true, "contact": { "label": "고객동의업무팀(가상)", "ext": "1120" } },
    { "id": "IB-SUBSCRIPTION", "name": "청약업무팀(가상)", "kind": "DEPARTMENT", "active": true, "contact": { "label": "청약업무팀(가상)", "ext": "1130" } },
    { "id": "IB-CUSTOMER", "name": "고객관리팀(가상)", "kind": "DEPARTMENT", "active": true, "contact": { "label": "고객관리팀(가상)", "ext": "1140" } },
    { "id": "IB-DESIGN", "name": "상품설계지원팀(가상)", "kind": "DEPARTMENT", "active": true, "contact": { "label": "상품설계지원팀(가상)", "ext": "1145" } },
    { "id": "IB-PRE_UW", "name": "선심사지원팀(가상)", "kind": "DEPARTMENT", "active": true, "contact": { "label": "선심사지원팀(가상)", "ext": "1150" } },
    { "id": "IB-UNDERWRITING", "name": "신계약심사팀(가상)", "kind": "DEPARTMENT", "active": true, "contact": { "label": "신계약심사팀(가상)", "ext": "1155" } },
    /* 담당자 부재 사례(ADR-031 결정 4): 구성원이 인수할 수 없어 대체 그룹(영업지원팀)이 받는다 */
    { "id": "IB-CONTRACT", "name": "계약관리팀(가상)", "kind": "DEPARTMENT", "active": true, "backupInboxId": "IB-COMMON",
      "contact": { "label": "계약관리팀(가상)", "ext": "1160" } },
    { "id": "IB-COMMON", "name": "영업지원팀(가상)", "kind": "DEPARTMENT", "active": true, "contact": { "label": "영업지원팀(가상)", "ext": "1100" } },
    { "id": "IB-TRIAGE", "name": "공통 분류 문의함", "kind": "TRIAGE", "active": true, "contact": { "label": "영업지원팀(가상)", "ext": "1100" } },
    { "id": "IB-UNCLASSIFIED", "name": "미분류 문의함", "kind": "UNCLASSIFIED", "active": true, "contact": { "label": "영업지원팀(가상)", "ext": "1100" } }
  ],
  "itGroups": [
    { "id": "ITG-CONSENT", "name": "고객동의 IT(가상)", "itAreas": ["CONSENT"], "active": true, "contact": { "label": "고객동의 IT(가상)", "ext": "2100" } },
    { "id": "ITG-SUBSCRIPTION", "name": "청약 IT(가상)", "itAreas": ["SUBSCRIPTION"], "active": true, "contact": { "label": "청약 IT(가상)", "ext": "2110" } },
    { "id": "ITG-DESIGN", "name": "설계·심사 IT(가상)", "itAreas": ["DESIGN", "PRE_UW", "UNDERWRITING"], "active": true, "contact": { "label": "설계·심사 IT(가상)", "ext": "2120" } },
    { "id": "ITG-CUSTOMER", "name": "고객·계약 IT(가상)", "itAreas": ["CUSTOMER", "CONTRACT"], "active": true, "contact": { "label": "고객·계약 IT(가상)", "ext": "2130" } },
    { "id": "ITG-COMMON", "name": "공통 IT 협의함(가상)", "itAreas": [], "active": true, "contact": { "label": "공통 IT 협의함(가상)", "ext": "2199" } }
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
  "rerouteReasons": [["WRONG_BUSINESS", "업무가 달라요"], ["MULTI", "여러 업무에 걸쳐요"], ["OTHER", "기타"]],
  /* ADR-031 결정 8(P1): 전화 대응 기록. 통화 내용 원문은 저장하지 않고 코드만 남긴다 */
  "phoneKinds": [["FC_CALLED", "FC가 전화로 문의함"], ["STAFF_CALLED", "담당자가 FC에게 전화함"]],
  "phoneChecks": [["SAME_AS_INTAKE", "접수 내용과 같음"], ["MORE_INFO", "추가 정보를 들음"], ["URGENT", "긴급 지원 필요"], ["GUIDED_BY_PHONE", "통화로 안내함"]]
};
