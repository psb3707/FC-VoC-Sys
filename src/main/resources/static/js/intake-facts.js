/* ADR-026. AI 문의 상담 인계와 접수 저장본의 허용 코드·출처·표시 이름.
   S2(접수)·S4(결함 대장)·api-client 가 같은 목록을 쓴다. 목록 밖 값은 저장하지 않는다(docs/05-data-api-spec.md). */
(function () {
  'use strict';

  var SOURCES = {
    USER_REPORTED: 'FC가 알려 줌', DEMO_CONTEXT: '접수 화면 자동 기록', BROWSER_CAPTURED: '브라우저에서 확인',
    DEFECT_LEDGER: '결함 대장 기준', UNKNOWN: '미확인'
  };
  var DEVICES = [['SAME', '접수하는 기기와 같아요'], ['PC', '다른 컴퓨터'], ['PHONE', '휴대폰'], ['TABLET', '태블릿'],
    ['CUSTOMER_PHONE', '고객 휴대전화'], ['UNKNOWN', '아직 모르겠어요']];
  var CONDITIONS = { SEMINAR_HISTORY: { label: '초대장 발송 이력', values: [['YES', '있음'], ['NO', '없음'], ['UNKNOWN', '모름']] } };
  var OUTCOMES = [['RESUMED', '진행했어요'], ['STILL', '아직 안 돼요'], ['UNKNOWN', '지금은 확인할 수 없어요']];
  var SOURCE_KEYS = ['device', 'conditions', 'urgent', 'attempted', 'workOutcome'];

  function has(pairs, code) { return pairs.some(function (pair) { return pair[0] === code; }); }
  function labelOf(pairs, code) { var hit = pairs.find(function (pair) { return pair[0] === code; }); return hit ? hit[1] : ''; }

  /* 요청·저장본에서 허용된 코드만 남긴다. suggestedDefectId 는 부르는 쪽이 대장으로 확인한다. */
  function clean(input) {
    input = input || {};
    var conditions = {}, sources = {};
    Object.keys(CONDITIONS).forEach(function (key) {
      var value = (input.conditions || {})[key];
      if (has(CONDITIONS[key].values, value)) conditions[key] = value;
    });
    SOURCE_KEYS.forEach(function (key) {
      var value = (input.factSources || {})[key];
      if (Object.prototype.hasOwnProperty.call(SOURCES, value)) sources[key] = value;
    });
    return {
      origin: input.origin === 'ASSISTANT' ? 'ASSISTANT' : 'FORM',
      conditions: conditions,
      workOutcome: has(OUTCOMES, input.workOutcome) ? input.workOutcome : null,
      factSources: sources
    };
  }

  window.IntakeFacts = {
    SOURCES: SOURCES, DEVICES: DEVICES, CONDITIONS: CONDITIONS, OUTCOMES: OUTCOMES,
    isDevice: function (code) { return has(DEVICES, code); },
    deviceLabel: function (code) { return labelOf(DEVICES, code); },
    conditionLabel: function (key, code) { return CONDITIONS[key] ? labelOf(CONDITIONS[key].values, code) : ''; },
    outcomeLabel: function (code) { return labelOf(OUTCOMES, code); },
    sourceLabel: function (code) { return SOURCES[code] || SOURCES.UNKNOWN; },
    clean: clean
  };
})();
