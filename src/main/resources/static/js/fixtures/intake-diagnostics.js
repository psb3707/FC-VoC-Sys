/* ADR-021. 실제 로그나 사용자 정보가 없는 진단 시연 이벤트.
   ADR-028: 접수 환경은 고정값을 두지 않고 브라우저가 알려 주는 값으로 기록한다(api-client submissionEnvironment).
   mobile 은 "고객 휴대폰에서 진단 이벤트가 왔다면"의 시연 이벤트(가상)이며 허용 목록 밖 값은 api-client 가 버린다. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.intakeDiagnostics = {
  mobile: { screen: 'SIGN_LINK', device: 'PHONE', browser: 'MOBILE', version: '17.0',
    at: '2026-11-09T14:05:00+09:00', errorCode: 'SFA-SIGN-LINK', action: 'OPEN_LINK',
    customerId: 'DEMO-PRIVATE-CUSTOMER', sessionToken: 'DEMO-PRIVATE-TOKEN',
    password: 'DEMO-PRIVATE-PASSWORD', inputValue: 'DEMO-PRIVATE-INPUT' }
};
