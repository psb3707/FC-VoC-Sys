/* 공통 진단 표시. S2 확인 화면과 S3·S4 접수 상세에서 같은 항목을 보여 준다.
   ADR-028: 값마다 출처를 붙인다(자동 확인 / 시연 진단 이벤트(가상)). 값이 없으면 미확인 */
window.IntakeDiagnosticsSource = function (environment) {
  var source = (environment || {}).source;
  return source === 'BROWSER_CAPTURED' ? '자동 확인' : source === 'DEMO_CONTEXT' ? '시연 진단 이벤트(가상)' : '';
};
window.IntakeDiagnosticsRows = function (environment, formatWhen) {
  var value = environment || {}, from = window.IntakeDiagnosticsSource(value);
  function said(text) { return text ? text + (from ? ' · ' + from : '') : '미확인'; }
  return [
    ['화면', said(value.screen ? value.screen + (value.screenCode ? ' (' + value.screenCode + ')' : '') : '')],
    ['시각', said(value.at ? formatWhen(value.at) : '')],
    ['기기', said(value.device)],
    ['브라우저', said(value.browser)],
    ['오류코드', said(value.errorCode)],
    ['직전 업무 동작', said(value.action)]
  ];
};
