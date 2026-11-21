/* ADR-026·027. AI 문의 상담 인계와 접수 저장본의 허용 코드·출처·표시 이름.
   S2(접수)·S3(관리자 현황)·S4(결함 대장)·api-client 가 같은 목록을 쓴다. 목록 밖 값은 저장하지 않는다(docs/05-data-api-spec.md). */
(function () {
  'use strict';

  var SOURCES = {
    USER_REPORTED: 'FC가 알려 줌', DEMO_CONTEXT: '접수 화면 자동 기록', BROWSER_CAPTURED: '브라우저에서 확인',
    DEFECT_LEDGER: '결함 대장 기준', UNKNOWN: '미확인'
  };
  var DEVICES = [['SAME', '접수하는 기기와 같아요'], ['PC', '다른 컴퓨터'], ['PHONE', '휴대폰'], ['TABLET', '태블릿'],
    ['CUSTOMER_PHONE', '고객 휴대전화'], ['OTHER', '다른 기기'], ['UNKNOWN', '아직 모르겠어요']];
  /* 시나리오별 발생 조건. 키마다 독립(전자서명: SEMINAR_HISTORY, 고객 동의: INPUT_STEP 등, ADR-027 결정 2).
     입력란에 넣은 값은 어떤 키에도 두지 않는다 */
  var CONDITIONS = {
    SEMINAR_HISTORY: { label: '초대장 발송 이력', values: [['YES', '있음'], ['NO', '없음'], ['UNKNOWN', '모름']] },
    INPUT_STEP: { label: '문제가 생긴 입력란', values: [['FRONT', '앞자리 입력'], ['BACK', '뒷자리 입력'], ['UNKNOWN', '모름']] },
    KEYPAD_SYMPTOM: { label: '발생 현상', values: [['NO_KEYPAD', '키패드가 안 나타남'], ['NO_INPUT', '키패드는 보이지만 입력 안 됨'], ['UNKNOWN', '모름']] },
    DEVICE_OS: { label: '고객 기기 환경', values: [['ANDROID', 'Android'], ['IOS', 'iOS'], ['UNKNOWN', '모름']] },
    URL_PATH: { label: '링크를 연 경로', values: [['IN_APP', '앱 안 브라우저'], ['EXTERNAL', '외부 브라우저'], ['UNKNOWN', '모름']] }
  };
  var OUTCOMES = [['RESUMED', '진행했어요'], ['STILL', '아직 안 돼요'], ['UNKNOWN', '지금은 확인할 수 없어요']];
  /* ADR-027 결정 5: 임시조치 상태와 추가 지원 필요 */
  var WORKAROUND_STATES = [['NONE', '승인된 임시조치 없음'], ['OFFERED', '안내했지만 결과 미확인'], ['TRIED', '시도함']];
  var SUPPORT = [['YES', '업무 진행 어려움 · 추가 지원 필요'], ['NO', '기다릴 수 있음'], ['UNKNOWN', '모름']];
  var SOURCE_KEYS = ['device', 'conditions', 'urgent', 'attempted', 'workOutcome', 'supportNeeded'];

  function has(pairs, code) { return pairs.some(function (pair) { return pair[0] === code; }); }
  function labelOf(pairs, code) { var hit = pairs.find(function (pair) { return pair[0] === code; }); return hit ? hit[1] : ''; }

  /* 임시조치 상태와 결과를 함께 맞춘다. 없으면 기존 workOutcome 으로 읽는다(RESUMED|STILL → TRIED, UNKNOWN → OFFERED) */
  function workaround(input) {
    var outcome = has(OUTCOMES, input.workOutcome) ? input.workOutcome : null;
    var state = has(WORKAROUND_STATES, input.workaroundState) ? input.workaroundState :
      outcome === 'UNKNOWN' ? 'OFFERED' : outcome ? 'TRIED' : null;
    if (state === 'NONE') outcome = null;                                   // 임시조치가 없으면 결과가 없다
    else if (state === 'OFFERED') outcome = outcome === 'UNKNOWN' ? 'UNKNOWN' : null;
    else if (state === 'TRIED' && outcome === 'UNKNOWN') outcome = null;
    return { state: state, outcome: outcome };
  }

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
    var w = workaround(input);
    return {
      origin: input.origin === 'ASSISTANT' ? 'ASSISTANT' : 'FORM',
      conditions: conditions,
      workaroundState: w.state,
      workOutcome: w.outcome,
      supportNeeded: has(SUPPORT, input.supportNeeded) ? input.supportNeeded : null,
      // 시도한 조치 문장은 "시도함"(또는 상태를 모르는 기존 일반 접수의 [해봤는데 아직 안 돼요])일 때만 남는다
      attemptAllowed: w.state === 'TRIED' || w.state === null,
      factSources: sources
    };
  }

  window.IntakeFacts = {
    SOURCES: SOURCES, DEVICES: DEVICES, CONDITIONS: CONDITIONS, OUTCOMES: OUTCOMES,
    WORKAROUND_STATES: WORKAROUND_STATES, SUPPORT: SUPPORT,
    isDevice: function (code) { return has(DEVICES, code); },
    deviceLabel: function (code) { return labelOf(DEVICES, code); },
    conditionLabel: function (key, code) { return CONDITIONS[key] ? labelOf(CONDITIONS[key].values, code) : ''; },
    outcomeLabel: function (code) { return labelOf(OUTCOMES, code); },
    workaroundLabel: function (code) { return labelOf(WORKAROUND_STATES, code); },
    supportLabel: function (code) { return labelOf(SUPPORT, code); },
    sourceLabel: function (code) { return SOURCES[code] || SOURCES.UNKNOWN; },
    clean: clean
  };
})();
