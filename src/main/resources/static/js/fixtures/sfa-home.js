/* S1 SFA 메인 화면을 채우는 가상 데이터 (ADR-012, docs/05-data-api-spec.md 5절 형식: camelCase 키, 날짜 ISO-8601).
   실제 SFA 화면의 실데이터 자리를 대신한다. 모든 이름·숫자·일정·상품·공지는 가상이다.
   백엔드 API 는 없다(화면 시안 전용). 화면은 api-client.js 의 getSfaHome() 으로만 읽는다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.sfaHome = {
  "profileSub": "FC-01 · 가상지점",
  "performance": [
    { "label": "이번 달 실적", "unit": "건", "value": 3 },
    { "label": "이번 달 신계약", "unit": "건", "value": 1 }
  ],
  "activity": [
    { "code": "CALL", "label": "전화 상담", "count": 4 },
    { "code": "VISIT", "label": "방문 상담", "count": 2 },
    { "code": "DESIGN", "label": "가입설계", "count": 3 },
    { "code": "APPLY", "label": "청약", "count": 1 },
    { "code": "ANALYSIS", "label": "보장분석", "count": 2 },
    { "code": "CONSENT", "label": "동의 접수", "count": 5 }
  ],
  "customerGroups": [
    { "title": "관심 고객", "count": 11, "rows": [
      { "label": "가망 고객", "count": 6 }, { "label": "상담 예정", "count": 2 }, { "label": "설계 진행", "count": 3 } ] },
    { "title": "계약 고객", "count": 15, "rows": [
      { "label": "유지 고객", "count": 12 }, { "label": "만기 예정", "count": 1 }, { "label": "보완 필요", "count": 2 } ] }
  ],
  "days": [
    { "date": "2026-10-31", "weekday": "SAT", "today": false, "eventCount": 0 },
    { "date": "2026-11-01", "weekday": "SUN", "today": false, "eventCount": 0 },
    { "date": "2026-11-02", "weekday": "MON", "today": true, "eventCount": 0 },
    { "date": "2026-11-03", "weekday": "TUE", "today": false, "eventCount": 0 }
  ],
  "summaries": [
    { "code": "BIRTHDAY", "label": "이번 달 생일", "count": 2 },
    { "code": "POLICY_END", "label": "이번 달 보험만기", "count": 1 },
    { "code": "PAY_END", "label": "이번 달 납입만기", "count": 0 },
    { "code": "CALLCENTER", "label": "이번 달 콜센터접촉 List", "count": 3 }
  ],
  "designHistory": [
    { "designNo": "P-0001", "customerName": "고객A(가상)", "productName": "가상 종신보험 A", "designedAt": "2026-10-30" },
    { "designNo": "P-0002", "customerName": "고객B(가상)", "productName": "가상 건강보험 B (갱신형)", "designedAt": "2026-10-28" }
  ],
  "boards": {
    "general": [
      { "title": "11월 영업 일정 안내(가상)", "postedAt": "2026-10-30" },
      { "title": "가상 상품 판매 기준 변경 안내", "postedAt": "2026-10-27" },
      { "title": "연말 교육 신청 안내(가상)", "postedAt": "2026-10-21" }
    ],
    "system": [
      { "title": "정기 점검 안내(가상)", "postedAt": "2026-10-29" },
      { "title": "모바일 서명 화면 개선 안내(가상)", "postedAt": "2026-10-20" }
    ],
    "ceo": [
      { "title": "11월을 시작하며(가상)", "postedAt": "2026-11-01" }
    ],
    "sales": [
      { "title": "가상 종신보험 A 상품 설명 자료", "postedAt": "2026-10-25" },
      { "title": "보장분석 상담 예시(가상)", "postedAt": "2026-10-18" }
    ]
  }
};
