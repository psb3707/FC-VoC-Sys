/* ADR-022. 문장에 나타난 근거와 수집 여부만 사용하는 가상 AI 초안. */
(function () {
  'use strict';

  var fields = [
    ['customer', '고객이 말씀하신 내용'],
    ['verified', '설계사가 직접 확인한 사실'],
    ['steps', '오류가 나기 전에 하신 작업'],
    ['attempted', '이미 시도한 방법'],
    ['impact', '고객 업무에 미친 영향'],
    ['environment', '발생 환경 또는 시각 보완']
  ];
  var questions = {
    verified: '직접 확인한 사실이 있나요?',
    steps: '오류가 나기 전에 어떤 작업을 하셨나요?',
    attempted: '이미 시도한 방법이 있나요?',
    impact: '고객 업무에는 어떤 영향이 있었나요?',
    environment: '어떤 기기나 화면에서 언제 발생했나요?'
  };
  var customerSpeech = /고객.{0,90}(말씀|하셨어요|하셨다고|전해|하십니다|라고\s*했)/;

  function mask(text) {
    return String(text || '').normalize('NFKC')
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[이메일]')
      .replace(/(?:\d[ .()-]*){5,}/g, '[번호]')
      .replace(/[가-힣]{2,4}\s*(?=(?:고객님|계약자님|설계사님))/g, '[이름] ')
      .replace(/((?:이름|성명|계약자|고객명|비밀번호|접속 토큰|세션 토큰)\s*[:=]\s*)[^\s,;]+/g, '$1[가림]')
      .replace(/(주소\s*[:=]\s*)[^\n,;]+/g, '$1[주소]');
  }
  function clean(fieldsInput) {
    var out = {};
    fields.forEach(function (field) { out[field[0]] = mask((fieldsInput || {})[field[0]]).trim().slice(0, 500); });
    return out;
  }
  function preview(req) {
    return { text: mask(req.text).trim().slice(0, 200), detail: mask(req.detail).trim().slice(0, 2000), fields: clean(req.fields) };
  }
  function explicit(text, label) {
    var line = text.split('\n').find(function (item) { return item.trim().startsWith(label + ':'); });
    return line ? line.slice(line.indexOf(':') + 1).trim() : '';
  }
  function plan(req) {
    var input = preview(req), result = input.fields;
    var combined = [input.text, input.detail].filter(Boolean).join('\n');
    if (!result.customer) {
      result.customer = combined.split('\n').find(function (line) { return customerSpeech.test(line); }) || '';
    }
    result.verified = result.verified || explicit(combined, '직접 확인');
    result.steps = result.steps || explicit(combined, '재현 순서') ||
      (!result.customer && /누르면|눌렀더니|열면|입력하면|선택하면/.test(input.text) ? input.text : '');
    result.attempted = result.attempted || explicit(combined, '시도한 방법') || mask(req.attempted);
    result.impact = result.impact || explicit(combined, '업무 영향');
    result.environment = result.environment || explicit(combined, '발생 환경');
    var order = result.customer ? ['verified', 'steps', 'attempted', 'impact', 'environment'] :
      ['steps', 'attempted', 'impact', 'environment'];
    var needed = order.filter(function (key) {
      return !result[key] && !(key === 'environment' && req.environmentKnown) &&
        !(key === 'impact' && req.impactKnown);
    });
    return { fields: result, questions: needed.slice(0, 3).map(function (key) {
      return { key: key, label: questions[key] };
    }), business: /서명|청약|알림톡/.test(combined) ? 'SUBSCRIPTION' : null };
  }
  function unknown(value, environmentKnown, impactKnown) {
    var checkedSignature = /서명\s*(?:미완료|완료)(?:를|가)?\s*확인(?:했어요|했습니다|함)/.test(value.verified);
    var unverified = value.customer && /서명/.test(value.customer) && /완료|끝냈/.test(value.customer) && !checkedSignature;
    return [
      unverified ? '실제 서명 완료 여부' : !value.verified ? '설계사의 직접 확인' : '',
      !value.steps ? '재현 순서' : '', !value.attempted ? '시도한 방법' : '',
      !value.impact && !impactKnown ? '고객 업무 영향' : '',
      !value.environment && !environmentKnown ? '발생 환경·시각' : ''
    ].filter(Boolean);
  }

  window.IntakeDraftRules = { fields: fields, mask: mask, clean: clean, preview: preview, plan: plan, unknown: unknown };
})();
