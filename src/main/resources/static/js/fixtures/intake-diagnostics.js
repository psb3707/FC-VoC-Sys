/* ADR-021. 실제 로그나 사용자 정보가 없는 진단 시연 이벤트. */
window.FIXTURES = window.FIXTURES || {};
window.FIXTURES.intakeDiagnostics = {
  submission: { screen: 'MAIN', device: 'PC', browser: 'CHROME', version: '120.0' },
  mobile: { screen: 'SIGN_LINK', device: 'PHONE', browser: 'MOBILE', version: '17.0',
    at: '2026-11-09T14:05:00+09:00', errorCode: 'SFA-SIGN-LINK', action: 'OPEN_LINK',
    customerId: 'DEMO-PRIVATE-CUSTOMER', sessionToken: 'DEMO-PRIVATE-TOKEN',
    password: 'DEMO-PRIVATE-PASSWORD', inputValue: 'DEMO-PRIVATE-INPUT' }
};
