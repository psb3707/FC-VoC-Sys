/* 공통 진단 표시. S2 확인 화면과 S3·S4 접수 상세에서 같은 항목을 보여 준다. */
window.IntakeDiagnosticsRows = function (environment, formatWhen) {
  var value = environment || {};
  return [
    ['화면', value.screen || '미확인'],
    ['시각', value.at ? formatWhen(value.at) : '미확인'],
    ['기기', value.device || '미확인'],
    ['앱·브라우저 버전', value.browser || '미확인'],
    ['오류코드', value.errorCode || '미확인'],
    ['직전 업무 동작', value.action || '미확인']
  ];
};
