/* S2 접수 패널 (docs/06-ui-spec.md 4절, REQ-IN-01~09, REQ-MD-01/02, REQ-PV-01).
   프론트 단계: 가상 데이터의 탭 내 초안과 화면 상태만 보관한다. 실제 서버 저장·AI·마스킹은 없다(ADR-017).
   화면 안에 시안 조절 버튼은 없다(ADR-016). 모든 상태는 주소 # 뒤 키로만 바꾼다(06번 11절, 시연 주소 목록).
   S1 키(role, user, popup, notice, demo)에 더해
     panel=intake          패널 열림
     step=0..7|metoo|usage|done   단계(끝 화면 포함)
     mode=A|B              A: AI 끔(5단계 없음, 6단계는 저장용 마스킹 결과만) / B: AI 켬 (기본 B)
     known=off             알려진 오류 단계(0) 끔 (S5 실험 재사용용)
     llm=ok|slow|fail      AI 응답: 정상 / 늦음(로딩에서 멈춤) / 실패(규칙 되묻기)
     case=defect|customer|usage|blocked   예시 사례(고정 응답 선택). 값이 바뀌면 칸을 그 사례로 다시 채운다
     alert=blocked         입력 차단 경고 표시
   열린 채로 mode·llm·case·role 이 주소에서 바뀌면 받아 둔 응답을 버리고 새로 받는다(syncKeys).
   panel 값은 하나라서 S3(panel=known, js/known-panel.js)와 동시에 열리지 않는다. */
(function () {
  'use strict';
  var A = window.ApiClient;
  var H = window.SfaHash;
  var $ = function (id) { return document.getElementById(id); };

  var STEP_TITLE = {
    '0': '알려진 오류 확인', '2': '고객 확인', '3': '업무와 문제 고르기',
    '4': '한 줄로 적기', '5': '몇 가지 확인', '7': '확인하고 보내기'
  };
  var END_TITLE = { metoo: '나도 겪었어요 – 끝', usage: '사용 방법 안내', done: '접수 끝' };
  var ICON_BY_CODE = {
    LOGIN: 'i-key', SUBSCRIPTION: 'i-pen', CUSTOMER_LOOKUP: 'i-user', DESIGN: 'i-doc', CONTRACT_LOOKUP: 'i-search', ETC: 'i-menu',
    NOT_SHOWN: 'i-eye', CANNOT_PROCEED: 'i-stop', WRONG_SCREEN: 'i-swap', WRONG_INPUT: 'i-keyboard', HOW_TO: 'i-help'
  };
  var TYPE_LABEL = { USAGE: '사용법 문의', DEFECT: '오류(결함)', IMPROVEMENT: '개선 요청', UNCLASSIFIED: '아직 정하지 않음' };
  var GRADE = {
    IMMEDIATE: ['즉시', '바로 IT 담당에게 넘겨요'],
    NORMAL: ['일반', '영업팀이 먼저 임시로 조치하고 매주 살펴봐요'],
    BATCH: ['모아서', '비슷한 의견과 모아 매달 살펴봐요']
  };
  var DEPT = {
    SUBSCRIPTION_IT: '청약업무팀 + IT', CUSTOMER_IT: '고객관리팀 + IT', LOGIN_SUPPORT: '영업지원팀',
    SALES_SUPPORT: '영업지원팀', DESIGN_SUPPORT: '상품설계지원팀', CONTRACT_IT: '계약관리팀 + IT'
  };
  var DETECT_LABEL = { RRN: '주민등록번호', ACCOUNT: '계좌번호', CARD: '카드번호' };
  var ATTR_LABEL = { contractStatus: '계약 상태', productGroup: '상품 종류', lastChange: '최근 변경', channel: '청약 경로' };

  /* 예시 입력 (모두 가상). 단계로 바로 갈 때 빈 칸을 채운다 */
  var SAMPLES = {
    defect: { customer: 'no', business: 'SUBSCRIPTION', symptom: 'WRONG_SCREEN', oneLine: '서명 알림톡을 누르면 세미나 초대장 화면이 떠요',
      answers: { device_path: '휴대폰 알림톡', key_condition: '네', steps: '매번 나요' } },
    customer: { customer: 'yes', customerNo: 'C-90001', business: 'CUSTOMER_LOOKUP', symptom: 'NOT_SHOWN',
      oneLine: '한가람(가상) 고객님 가입내역이 안 보여요', answers: { other_customers: '아니요' } },
    usage: { customer: 'no', business: 'LOGIN', symptom: 'HOW_TO', oneLine: '비밀번호를 바꾸는 방법을 모르겠어요', answers: {} },
    blocked: { customer: 'no', business: 'CUSTOMER_LOOKUP', symptom: 'NOT_SHOWN',
      oneLine: '주민번호 ○○○○○○-○○○○○○○ 로 찾았는데 안 나와요', answers: {} }
  };


  var meta = null, ctx = null, known = [], users = [];
  var form, res, lastStep = null, opener = null, booted = false, lastKeys = null;
  var closePending = false, restored = false, editOpen = false, submitting = false;

  function blank() {
    form = { customer: null, customerNo: '', business: null, symptom: null, oneLine: '', answers: {},
      onBehalf: '', edit: null, typeOverride: null, err: '' };
    closePending = false; editOpen = false; submitting = false;
    res = { preview: null, session: null, refined: null, report: null, meToo: null };
  }
  blank();
  function invalidate() { res.preview = res.session = res.refined = res.report = null; form.edit = null; }

  /* 이 탭의 가상 입력만 복원. 명시적인 시연 주소와 자동 캡처에는 섞지 않는다. */
  function draftKey(st) {
    return 'fc-voc-draft-v1:' + st.role + ':' + (st.user || '') + ':' + st.mode;
  }
  function useDraft(st) { return !st['case'] && !/[?&](selftest|compare)=1/.test(location.search); }
  function saveDraft(st) {
    if (!useDraft(st)) return;
    try { sessionStorage.setItem(draftKey(st), JSON.stringify({ form: form, res: res, step: st.step })); } catch (e) { /* 저장 불가해도 접수 가능 */ }
  }
  function clearDraft(st) {
    try { sessionStorage.removeItem(draftKey(st)); } catch (e) { /* 저장소 사용 불가 */ }
  }
  function restoreDraft(st) {
    if (restored) return;
    restored = true;
    if (!useDraft(st)) return;
    try {
      var d = JSON.parse(sessionStorage.getItem(draftKey(st)) || 'null');
      if (d && d.form && d.form.answers && d.res) {
        form = d.form; res = d.res;
        if (!st.step || st.step === '0') { go({ step: d.step }); return true; }
      }
    } catch (e) { clearDraft(st); }
  }
  function firstMissing() {
    if (!form.customer) return '2';
    if (!form.business || !form.symptom) return '3';
    if (!form.oneLine.trim()) return '4';
    return null;
  }
  function hasInput() { return !!(form.customer || form.business || form.symptom || form.oneLine || form.onBehalf); }
  function autoInfo() {
    var c = ctx || {}, from = c.reportedFrom || {};
    return el('details', { cls: 'pn-details pn-auto' }, [
      el('summary', null, ['자동으로 붙는 정보']),
      rows([['화면', c.screenName || '메인 화면'], ['기기·브라우저', (from.device || '') + ' · ' + (from.browser || '')],
        ['시각', c.occurredAt ? fmtWhen(c.occurredAt) : '']])]);
  }
  function previewDetails(st) {
    var p = res.preview || {}, attrs = (p.aiPayload && p.aiPayload.attributes) || {};
    var masked = (p.refKeys || []).length > 0 || /\[[^\]]+\]/.test(p.maskedText || '');
    var list = [['고른 것', labelOf(meta.businesses, form.business) + ' · ' + labelOf(meta.symptoms, form.symptom)],
      ['한 줄 설명', maskSpan(p.maskedText || form.oneLine)]];
    if (attrs.ref) list.push(['고객', maskSpan(attrs.ref + ' (번호 대신 쓰는 표시)')]);
    Object.keys(attrs).filter(function (k) { return k !== 'ref'; }).forEach(function (k) {
      var v = attrs[k];
      list.push([ATTR_LABEL[k] || k, typeof v === 'object' ? v.type + ' (' + v.month.replace('-', '년 ') + '월)' : v]);
    });
    (res.session && res.session.questions || []).forEach(function (q) {
      list.push([q.text, form.answers[q.slot] || '답하지 않음']);
    });
    return el('details', { cls: 'pn-details', open: masked ? true : null }, [
      el('summary', { 'data-fk': 'preview' }, [st.mode === 'A' ? '저장되는 내용' : 'AI에 전달한 내용']),
      masked ? note('', 'i-shield', '가려진 부분이 있어요', '고객번호 대신 표시를 써요. 원래 번호는 AI에 보내지 않아요.') : null,
      rows(list)]);
  }

  /* ---- 작은 도우미 ---- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'cls') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (k) {
      if (k == null || k === false) return;
      e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    });
    return e;
  }
  function icon(id) {
    var ns = document.querySelector('svg').namespaceURI;
    var s = document.createElementNS(ns, 'svg');
    var u = document.createElementNS(ns, 'use');
    s.setAttribute('aria-hidden', 'true');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }
  function btn(cls, label, act, extra) {
    var a = { type: 'button', cls: cls, 'data-act': act, 'data-fk': 'act:' + act };   // 다시 그려도 포커스 유지
    Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
    return el('button', a, [].concat(label));
  }
  function note(kind, ico, title, text) {
    return el('div', { cls: 'pn-note' + (kind ? ' ' + kind : '') }, [icon(ico), el('div', null, [title ? el('b', null, [title]) : null, text])]);
  }
  function rows(list) {
    return el('dl', { cls: 'pn-rows' }, list.filter(Boolean).map(function (r) {
      return el('div', null, [el('dt', null, [r[0]]), el('dd', null, [r[1]])]);
    }));
  }
  function fmtWhen(iso) {
    return parseInt(iso.slice(5, 7), 10) + '월 ' + parseInt(iso.slice(8, 10), 10) + '일 ' + iso.slice(11, 16);
  }
  function fmtDate(iso) { return parseInt(iso.slice(5, 7), 10) + '월 ' + parseInt(iso.slice(8, 10), 10) + '일'; }
  function labelOf(list, code) { var x = (list || []).filter(function (i) { return i.code === code; })[0]; return x ? x.label : ''; }
  /* [고객]·[전화]·[주소]·K-01 같은 가린 자리를 눈에 띄게 (계산 없이 표시만) */
  function maskSpan(text) {
    var out = el('span');
    String(text || '').split(/(\[[^\]]+\]|K-\d+)/).forEach(function (part) {
      if (!part) return;
      out.appendChild(/^(\[[^\]]+\]|K-\d+)$/.test(part) ? el('span', { cls: 'pn-mask' }, [part]) : document.createTextNode(part));
    });
    return out;
  }

  /* ---- 상태 ---- */
  function read() {
    var st = H.read();
    st.mode = st.mode === 'A' ? 'A' : 'B';
    if (['ok', 'slow', 'fail'].indexOf(st.llm) < 0) st.llm = 'ok';
    return st;
  }
  function go(patch) {
    var before = location.hash;
    H.update(patch);
    if (location.hash === before) render();
  }
  function seqOf(st) {
    return ['0', '2', '3', '4', '5', '7'].filter(function (s) {
      return !(s === '0' && st.known === 'off') && !(s === '5' && st.mode === 'A');
    });
  }
  function caseOf(st) {
    if (st['case'] && SAMPLES[st['case']]) return st['case'];
    if (st.step === 'usage' && !form.business) return 'usage';   // 주소로 사용법 끝 화면을 바로 연 경우
    if (form.customer === 'yes') return 'customer';
    if (form.symptom === 'HOW_TO') return 'usage';
    return 'defect';
  }
  function syncFixture(st) { A.setProto({ 'case': caseOf(st), llm: st.llm === 'fail' ? 'fail' : 'ok' }); }
  function prefill(c) {
    var s = SAMPLES[c] || SAMPLES.defect;
    form.customer = s.customer; form.customerNo = s.customerNo || ''; form.business = s.business; form.symptom = s.symptom;
    form.oneLine = s.oneLine; form.answers = JSON.parse(JSON.stringify(s.answers || {}));
  }
  function stepIndex(st, step) { var q = seqOf(st); var i = q.indexOf(step); return i; }
  function isAfter(step, ref) { return /^\d$/.test(step) && parseInt(step, 10) > parseInt(ref, 10); }
  function proxyUser(st) {
    var me = users.filter(function (u) { return u.id === st.user && u.role === st.role; })[0] ||
      users.filter(function (u) { return u.role === st.role; })[0];
    return me;
  }

  /* 단계에 필요한 고정 응답을 미리 받아 둔다 (주소로 바로 열어도 같은 화면) */
  function ensure(st) {
    var step = st.step, chain = Promise.resolve();
    // 주소로 바로 연 경우에만 빈 칸을 예시로 채운다 (클릭으로 따라갈 때는 채우지 않음).
    // 4단계 이후는 3단계 검사를 거쳐야 오므로 업무가 비어 있으면 주소로 건너뛴 것: 첫 화면이 아니어도 채운다.
    if (!form.business) {
      var deep = isAfter(step, '3') || step === 'done' || step === 'usage';
      if (st['case'] && (deep || step === '2' || step === '3')) {
        prefill(caseOf(st));
        if (booted) invalidate();   // 빈 값으로 받아 둔 응답은 버린다
      }
    }
    syncFixture(st);
    chain = chain.then(function () { return A.getKnownErrors('MAIN', '', reporterId(st)).then(function (list) { known = list || []; }); });
    var needPreview = isAfter(step, '4') || step === 'done' || step === 'usage';
    if (needPreview && !res.preview) chain = chain.then(function () { return A.postIntakePreview(req(st)).then(function (p) { res.preview = p; }); });
    var aiStep = st.mode === 'B' && (isAfter(step, '4') || step === 'done' || step === 'usage');
    var waiting = step === '5' && st.llm === 'slow';
    chain = chain.then(function () {
      if (res.preview && res.preview.blocked && needPreview) return;
      if (aiStep && !waiting && !res.session) return A.postIntakeSession(req(st)).then(function (s) { res.session = s; });
    });
    chain = chain.then(function () {
      var s = res.session;
      if (!s || !(isAfter(step, '5') || step === 'done') || res.refined || !(s.questions || []).length) return;
      return A.postAnswers(s.sessionId, { answers: answersList(s) }).then(function (r) { res.refined = r; });
    });
    chain = chain.then(function () {
      if (step === 'done' && st['case'] && !res.report) return A.postReport(reportReq(st)).then(function (r) { res.report = r; });
      if (step === 'metoo' && st['case'] && !res.meToo && known.length) return A.postMeToo(known[0].id, { reporterId: reporterId(st), submittedById: proxyUser(st) ? proxyUser(st).id : null }).then(function (r) { res.meToo = r; });
    });
    return chain;
  }
  function req(st) {
    return { mode: st.mode, business: form.business, symptom: form.symptom, oneLine: form.oneLine,
      customerRelated: form.customer === 'yes', customerNo: form.customer === 'yes' ? form.customerNo : null };
  }
  function answersList(s) {
    return (s.questions || []).map(function (q) { return { slot: q.slot, answer: form.answers[q.slot] || '' }; });
  }
  function reporterId(st) {
    var me = proxyUser(st);
    return form.onBehalf || (me ? me.id : null);
  }
  function aiTicket() { return (res.refined && res.refined.ticket) || (res.session && res.session.ticket) || null; }
  function aiClass() { return (res.refined && res.refined.classification) || (res.session && res.session.classification) || null; }
  function llmOutcome() { return (res.refined && res.refined.llmOutcome) || (res.session && res.session.llmOutcome) || null; }
  function editOf(st) {
    if (form.edit) return form.edit;
    var t = st.mode === 'B' ? aiTicket() : null, c = st.mode === 'B' ? aiClass() : null;
    var masked = res.preview && res.preview.maskedText || form.oneLine;
    form.edit = {
      title: t ? t.title : masked.slice(0, 90) || (labelOf(meta.businesses, form.business) + ' · ' + labelOf(meta.symptoms, form.symptom)),
      summary: t ? t.symptomSummary : masked,
      steps: t ? (t.stepsToReproduce || []).join('\n') : '',
      type: form.typeOverride || (c ? c.type : 'UNCLASSIFIED')
    };
    return form.edit;
  }
  function reportReq(st) {
    var e = editOf(st), me = proxyUser(st);
    return { mode: st.mode, reporterId: reporterId(st), submittedById: me ? me.id : null, kind: 'FULL',
      business: form.business, symptom: form.symptom, finalType: e.type, title: e.title, summary: e.summary,
      stepsToReproduce: e.steps ? e.steps.split('\n') : [], oneLine: form.oneLine, answers: form.answers,
      autoContext: ctx, llmOutcome: llmOutcome() };
  }

  /* ---- 화면 그리기 ---- */
  function render() {
    var st = read();
    var panel = $('intake-panel');
    var open = st.panel === 'intake';
    panel.hidden = !open;
    $('pn-scrim').hidden = !open;
    document.querySelector('[data-panel="intake"]').setAttribute('aria-expanded', String(open));
    if (!open) { lastStep = null; lastKeys = null; return Promise.resolve(); }
    if (restoreDraft(st)) return Promise.resolve();
    syncKeys(st);
    if (st.step === '1' || st.step === '6') { go({ step: st.step === '1' ? '2' : '7' }); return Promise.resolve(); }
    if (!st['case']) {
      var missing = firstMissing();
      if (missing && (isAfter(st.step, missing) || st.step === 'usage' || (st.step === 'done' && !res.report))) {
        go({ step: missing }); return Promise.resolve();
      }
      if (st.step === 'metoo' && !res.meToo) { go({ step: '0' }); return Promise.resolve(); }
    }
    var q = seqOf(st);
    if (!st.step || (/^\d$/.test(st.step) && q.indexOf(st.step) < 0)) {
      var fix = !st.step ? q[0] : (q.filter(function (s) { return s > st.step; })[0] || q[q.length - 1]);
      go({ step: fix });
      return Promise.resolve();
    }
    if (st['case'] === 'blocked' && isAfter(st.step, '4')) { go({ step: '4', alert: 'blocked' }); return Promise.resolve(); }
    return ensure(st).then(function () {
      booted = true;
      var s = res.session;
      if (st.step === '5' && s && s.classification && s.classification.type === 'USAGE' && !form.typeOverride) {
        go({ step: 'usage' });   // 사용법으로 분류되면 안내 화면으로 (REQ-IN-07)
        return;
      }
      paint(st);
      saveDraft(st);
    });
  }

  /* 패널이 열린 채로 주소의 mode·llm·case·role 이 바뀌면(시연 주소로 바로 이동) 이전 응답을 버린다.
     case 가 새 값이면 칸을 그 사례로 다시 채운다. case 가 지워지는 경우(차단 경고 해제)는 적은 내용을 그대로 둔다. */
  function syncKeys(st) {
    var k = { mode: st.mode, llm: st.llm, 'case': st['case'] || '', role: st.role };
    var was = lastKeys;
    lastKeys = k;
    if (!was || !booted) return;
    if (k['case'] && k['case'] !== was['case']) { blank(); prefill(k['case']); return; }
    if (k.role !== was.role) form.onBehalf = '';
    if (k.mode !== was.mode || k.llm !== was.llm) { invalidate(); res.meToo = null; }
  }

  function paint(st) {
    var fk = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-fk');
    var caret = fk && document.activeElement.selectionStart;
    paintProxy(st);
    $('pn-close').disabled = submitting;
    paintSteps(st);
    var view = closePending ? {
      body: [el('h3', { tabindex: '-1' }, ['접수를 닫을까요?']),
        el('p', { cls: 'pn-lead' }, ['아직 보내지 않은 내용이 있어요. 닫으면 적은 내용이 지워져요.'])],
      foot: [btn('pn-btn-2', '지우고 닫기', 'discard'), btn('pn-btn', '계속 작성하기', 'keep')]
    } : VIEWS[st.step] ? VIEWS[st.step](st) : { body: [el('p', null, ['알 수 없는 단계예요.'])], foot: [] };
    var body = $('pn-body');
    body.innerHTML = '';
    view.body.forEach(function (n) { if (n) body.appendChild(n); });
    var foot = $('pn-foot');
    foot.innerHTML = '';
    view.foot.forEach(function (n) { if (n) foot.appendChild(n); });
    if (submitting) Array.prototype.forEach.call($('intake-panel').querySelectorAll('button, input, textarea, select'),
      function (control) { control.disabled = true; });
    if (st.step !== lastStep) {
      body.scrollTop = 0;
      var h = body.querySelector('h3');
      if (h) h.focus();
      lastStep = st.step;
    } else if (fk) {
      var back = document.querySelector('[data-fk="' + fk + '"]');
      if (back) { back.focus(); if (caret != null && back.setSelectionRange) try { back.setSelectionRange(caret, caret); } catch (e) { /* 선택 불가 입력 */ } }
    }
  }

  function paintProxy(st) {
    var box = $('pn-proxy');
    var ended = ['metoo', 'usage', 'done'].indexOf(st.step) >= 0;
    box.hidden = st.role !== 'MANAGER' || ended || closePending;
    if (box.hidden) return;
    var me = proxyUser(st);
    var sel = $('pn-proxy-select');
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '' }, ['나 (' + (me ? me.name : '관리자') + ')']));
    users.filter(function (u) { return u.role === 'FC'; }).forEach(function (u) {
      sel.appendChild(el('option', { value: u.id }, [u.name + ' 대신 접수']));
    });
    sel.value = form.onBehalf;
    sel.disabled = submitting;
  }

  function paintSteps(st) {
    var q = seqOf(st), i = q.indexOf(st.step), end = END_TITLE[st.step];
    var text = $('pn-steps-text');
    text.innerHTML = '';
    if (end) {
      text.appendChild(el('b', null, [end]));
    } else {
      text.appendChild(el('b', null, [(i + 1) + '단계']));
      text.appendChild(document.createTextNode(' / 전체 ' + q.length + '단계 · ' + (STEP_TITLE[st.step])));
    }
    var track = $('pn-track');
    track.innerHTML = '';
    q.forEach(function (s, k) {
      track.appendChild(el('li', { cls: end || k < i ? 'is-done' : k === i ? 'is-now' : null }));
    });
  }

  function footNav(st, primary, act, extra) {
    var q = seqOf(st), i = q.indexOf(st.step);
    return [i > 0 ? btn('pn-btn-2', '이전', 'back') : null, primary ? btn('pn-btn', primary, act, extra) : null];
  }
  function choice(cls, code, label, pressed, act, ico) {
    return el('li', null, [btn(cls, [ico ? el('span', { cls: 'pn-ico' }, [icon(ico)]) : null, el('span', null, [label]),
      el('span', { cls: 'pn-tick' }, [icon('i-check')])], act, { 'data-code': code, 'aria-pressed': String(!!pressed), 'data-fk': act + ':' + code })]);
  }
  function err() { return form.err ? el('p', { cls: 'pn-err', role: 'alert' }, [form.err]) : null; }

  var VIEWS = {
    '0': function (st) {
      var cards = known.map(function (k) {
        var plan = k.plannedFixDate ? ['고칠 예정', fmtDate(k.plannedFixDate)] : k.wontFixReasonText ? ['고치지 않는 이유', k.wontFixReasonText] : null;
        return el('li', { cls: 'pn-card' }, [
          el('p', { cls: 'pn-card-title' }, [k.title]),
          rows([['임시로 이렇게', k.workaround], plan, ['같은 신고', k.reportCount + '건']]),
          btn('pn-btn-out', k.alreadyReported ? '이미 알려 주셨어요' : '나도 겪었어요', 'metoo', { 'data-id': k.id, 'data-fk': 'metoo:' + k.id, disabled: k.alreadyReported })
        ]);
      });
      return {
        body: [el('h3', { tabindex: '-1' }, ['혹시 이 문제인가요?']),
          el('p', { cls: 'pn-lead' }, ['이미 알려진 오류예요. 같은 문제라면 "나도 겪었어요"만 누르면 끝나요.']),
          el('ul', { cls: 'pn-plain' }, cards)],
        foot: [btn('pn-btn', '다른 문제예요', 'next')]
      };
    },
    '2': function (st) {
      var yes = form.customer === 'yes';
      return {
        body: [el('h3', { tabindex: '-1' }, ['특정 고객에게만 생기는 문제인가요?']),
          el('p', { cls: 'pn-lead' }, ['특정 고객의 정보를 확인해야 하는 문제라면 "예"를 골라 주세요.']),
          autoInfo(),
          el('ul', { cls: 'pn-choices is-two' }, [
            choice('pn-choice', 'yes', '예, 특정 고객이에요', yes, 'customer', 'i-user'),
            choice('pn-choice', 'no', '아니요', form.customer === 'no', 'customer', 'i-doc')]),
          yes ? el('div', { cls: 'pn-field' }, [
            el('label', { 'for': 'pn-cust-no' }, ['고객번호']),
            el('input', { cls: 'pn-input', id: 'pn-cust-no', type: 'text', inputmode: 'numeric', autocomplete: 'off',
              value: form.customerNo, 'data-fk': 'custno', 'data-in': 'customerNo', 'aria-describedby': 'pn-cust-help' }),
            el('p', { cls: 'pn-help', id: 'pn-cust-help' }, [icon('i-shield'), el('span', null, [el('b', null, ['AI에는 보내지 않아요. ']),
              '담당자가 확인할 때만 쓰고, AI에게는 번호 대신 "K-01" 같은 표시로 바꿔 보내요.'])])]) : null,
          err()],
        foot: footNav(st, '다음', 'next')
      };
    },
    '3': function (st) {
      return {
        body: [el('h3', { tabindex: '-1' }, ['어떤 일을 하다가 생겼나요?']),
          el('p', { cls: 'pn-lead' }, ['업무와 문제를 하나씩 골라 주세요.']),
          el('h4', null, ['업무']),
          el('ul', { cls: 'pn-choices' }, meta.businesses.map(function (b) {
            return choice('pn-choice', b.code, b.label, form.business === b.code, 'business', ICON_BY_CODE[b.code] || 'i-menu');
          })),
          el('h4', null, ['어떤 문제인가요?']),
          el('ul', { cls: 'pn-choices' }, meta.symptoms.map(function (s) {
            return choice('pn-choice', s.code, s.label, form.symptom === s.code, 'symptom', ICON_BY_CODE[s.code] || 'i-menu');
          })),
          err()],
        foot: footNav(st, '다음', 'next')
      };
    },
    '4': function (st) {
      var blocked = st.alert === 'blocked';
      var dets = (res.preview && res.preview.detections) || [];
      if (!dets.length) dets = [{ type: 'RRN' }];   // 감지 결과가 없으면(차단 아닌 미리보기 재사용 등) 대표 예시로 표시
      var types = !blocked ? '' : dets.map(function (d) { return DETECT_LABEL[d.type] || d.type; }).join(', ');
      return {
        body: [el('h3', { tabindex: '-1' }, ['무슨 일이 있었는지 한 줄로 적어 주세요']),
          note('', 'i-shield', '이름·번호는 적지 마세요', '고객 이름, 전화번호, 주민등록번호, 계좌·카드번호는 빼고 적어 주세요.'),
          el('div', { cls: 'pn-field' }, [
            el('label', { 'for': 'pn-line' }, ['한 줄 설명']),
            el('input', { cls: 'pn-input', id: 'pn-line', type: 'text', maxlength: '100', autocomplete: 'off', value: form.oneLine,
              'data-fk': 'oneline', 'data-in': 'oneLine', 'aria-invalid': blocked ? 'true' : null,
              'aria-describedby': blocked ? 'pn-block' : 'pn-line-help' }),
            el('p', { cls: 'pn-help', id: 'pn-line-help' }, [el('span', null, ['예) 서명 알림톡을 누르면 다른 화면이 떠요'])])]),
          blocked ? el('div', { id: 'pn-block', role: 'alert' }, [note('pn-warn', 'i-alert', types + '처럼 보이는 숫자가 있어요',
            '보안을 위해 이 내용은 보내지도, 저장하지도 않았어요. 숫자를 지우고 다시 적어 주세요.')]) : null,
          err()],
        foot: footNav(st, '다음', 'next')
      };
    },
    '5': function (st) {
      var s = res.session;
      if (!s) {
        return {
          body: [el('div', { cls: 'pn-loading', role: 'status' }, [el('span', { cls: 'pn-spin', 'aria-hidden': 'true' }),
            el('h3', { tabindex: '-1' }, ['AI가 내용을 살펴보고 있어요']),
            el('p', { cls: 'pn-lead' }, ['잠시만 기다려 주세요. 오래 걸리면 기본 질문으로 넘어가요.'])])],
          foot: footNav(st, null)
        };
      }
      var qs = (s.questions || []).slice(0, 3);
      if (!qs.length) {
        return { body: [el('h3', { tabindex: '-1' }, ['더 여쭤볼 것은 없어요']),
          el('p', { cls: 'pn-lead' }, ['"다음"을 눌러 주세요.'])], foot: footNav(st, '다음', 'next') };
      }
      var cards = qs.map(function (qq, n) {
        var kids = [el('p', { cls: 'pn-card-title' }, [el('span', { cls: 'pn-q-no' }, ['질문 ' + (n + 1) + ' / ' + qs.length + ' · ']), qq.text])];
        if (qq.choices && qq.choices.length) {
          kids.push(el('ul', { cls: 'pn-chips', role: 'group', 'aria-label': qq.text }, qq.choices.map(function (c) {
            return el('li', null, [btn('pn-chip', c, 'answer', { 'data-slot': qq.slot, 'data-code': c,
              'aria-pressed': String(form.answers[qq.slot] === c), 'data-fk': 'ans:' + qq.slot + ':' + c })]);
          })));
        } else {
          kids.push(el('input', { cls: 'pn-input', type: 'text', maxlength: '80', 'aria-label': qq.text, autocomplete: 'off',
            value: form.answers[qq.slot] || '', 'data-fk': 'ans:' + qq.slot, 'data-in': 'answer', 'data-slot': qq.slot }));
          kids.push(el('p', { cls: 'pn-help' }, [el('span', null, ['이름·번호는 적지 마세요'])]));
        }
        return el('li', { cls: 'pn-card' }, kids);
      });
      return {
        body: [el('h3', { tabindex: '-1' }, ['몇 가지만 더 여쭤볼게요']),
          el('p', { cls: 'pn-lead' }, ['고르기 어려우면 "모르겠어요"를 눌러도 돼요.']),
          s.llmOutcome === 'FALLBACK' ? note('', 'i-info', '기본 질문이에요', 'AI 연결이 잠시 원활하지 않아 기본 질문으로 여쭤봐요. 접수는 그대로 이어져요.') : null,
          el('ul', { cls: 'pn-plain' }, cards)],
        foot: footNav(st, '다음', 'next')
      };
    },
    '7': function (st) {
      var e = editOf(st), c = st.mode === 'B' ? aiClass() : null;
      var me = proxyUser(st);
      var who = form.onBehalf ? users.filter(function (u) { return u.id === form.onBehalf; })[0] : null;
      var typeBox;
      if (c) {
        typeBox = el('div', { cls: 'pn-field' }, [el('p', { cls: 'pn-label', id: 'pn-type-lbl' }, ['어떤 종류인가요?']),
          el('ul', { cls: 'pn-chips', role: 'group', 'aria-labelledby': 'pn-type-lbl' }, ['USAGE', 'DEFECT', 'IMPROVEMENT'].map(function (t) {
            return el('li', null, [btn('pn-chip', [TYPE_LABEL[t], t === c.type ? el('span', { cls: 'pn-tag' }, ['AI 제안']) : null], 'type',
              { 'data-code': t, 'aria-pressed': String(e.type === t), 'data-fk': 'type:' + t })]);
          }))]);
      } else {
        typeBox = el('div', { cls: 'pn-card' }, [rows([['종류', '아직 정하지 않음 – 담당자가 정해요']])]);
      }
      var edit = el('details', { cls: 'pn-details', open: editOpen ? true : null }, [
        el('summary', { 'data-fk': 'edit-toggle' }, ['내용 수정']),
        el('div', { cls: 'pn-edit-body' }, [
          el('div', { cls: 'pn-field' }, [el('label', { 'for': 'pn-t' }, ['제목']),
            el('input', { cls: 'pn-input', id: 'pn-t', type: 'text', value: e.title, 'data-fk': 'title', 'data-in': 'title' })]),
          el('div', { cls: 'pn-field' }, [el('label', { 'for': 'pn-s' }, ['무슨 일인지']),
            el('textarea', { id: 'pn-s', 'data-fk': 'summary', 'data-in': 'summary' }, [e.summary])]),
          st.mode === 'B' ? el('div', { cls: 'pn-field' }, [el('label', { 'for': 'pn-r' }, ['문제가 생긴 순서']),
            el('textarea', { id: 'pn-r', 'data-fk': 'steps', 'data-in': 'steps' }, [e.steps])]) : null,
          typeBox])]);
      edit.addEventListener('toggle', function () { if (edit.isConnected) { editOpen = edit.open; if (!edit.open) paint(st); } });
      return {
        body: [el('h3', { tabindex: '-1' }, ['이 내용으로 접수할게요']),
          el('p', { cls: 'pn-lead' }, ['맞으면 보내 주세요. 바꿀 내용만 "내용 수정"에서 고칠 수 있어요.']),
          llmOutcome() === 'FALLBACK' ? note('', 'i-info', null, '고른 내용으로 정리했어요. 담당자가 한 번 더 확인해요.') : null,
          el('div', { cls: 'pn-card pn-review' }, [
            el('p', { cls: 'pn-card-title' }, [e.summary || e.title]),
            rows([['업무·문제', labelOf(meta.businesses, form.business) + ' · ' + labelOf(meta.symptoms, form.symptom)]])
          ]),
          edit,
          previewDetails(st),
          st.role === 'MANAGER' ? el('div', { cls: 'pn-card' }, [rows([['누구의 신고', who ? who.name : (me ? me.name : '')],
            ['접수한 사람', me ? me.name : '']])]) : null,
          err()],
        foot: footNav(st, submitting ? '보내는 중…' : '이대로 보내기', 'submit', { disabled: submitting })
      };
    },
    metoo: function () {
      var k = known.filter(function (x) { return res.meToo && x.id === res.meToo.defectId; })[0] || known[0] || {};
      return {
        body: [el('div', { cls: 'pn-end' }, [el('span', { cls: 'pn-ico is-ok' }, [icon('i-check')]),
          el('h3', { tabindex: '-1' }, ['신고 건수에 더했어요']),
          el('p', { cls: 'pn-lead' }, ['따로 적으실 것은 없어요.']),
          el('div', { cls: 'pn-card' }, [rows([['오류', k.title], ['같은 신고', (res.meToo ? res.meToo.reportCount : '') + '건'],
            ['임시로 이렇게', k.workaround]])]),
          note('', 'i-bell', null, '고쳐지거나 바뀌면 알림(종 모양)으로 알려드릴게요.')])],
        foot: [btn('pn-btn', '닫기', 'close')]
      };
    },
    usage: function (st) {
      var s = res.session || {};
      return {
        body: [el('div', { cls: 'pn-end' }, [el('span', { cls: 'pn-ico' }, [icon('i-help')]),
          el('h3', { tabindex: '-1' }, ['이렇게 해 보세요']),
          el('p', { cls: 'pn-lead' }, ['오류가 아니라 사용 방법 문의로 보여요. 안내만 드리고 접수는 마칠게요.']),
          el('div', { cls: 'pn-card' }, [el('p', null, [s.usageGuide || ''])]),
          st.mode === 'B' ? btn('pn-btn-out', '아니에요, 오류예요', 'not-usage') : null])],
        foot: [btn('pn-btn', '해결됐어요 · 닫기', 'close-usage')]
      };
    },
    done: function (st) {
      var r = res.report || {}, g = GRADE[r.grade];
      var me = proxyUser(st);
      var who = form.onBehalf ? users.filter(function (u) { return u.id === form.onBehalf; })[0] : null;
      return {
        body: [el('div', { cls: 'pn-end' }, [el('span', { cls: 'pn-ico is-ok' }, [icon('i-check')]),
          el('h3', { tabindex: '-1' }, ['접수됐어요']),
          el('p', { cls: 'pn-lead' }, ['신고 번호 ' + (r.reportId || '')]),
          el('div', { cls: 'pn-card' }, [rows([['종류', TYPE_LABEL[r.type] || ''],
            ['처리 등급', g ? g[0] + ' – ' + g[1] : '없음'], ['담당 부서', DEPT[r.departmentCode] || ''],
            st.role === 'MANAGER' ? ['누구의 신고', who ? who.name : (me ? me.name : '')] : null])]),
          note('', 'i-bell', null, '진행 상황은 알림(종 모양)과 "알려진 오류·내 신고" 탭에서 볼 수 있어요.')])],
        foot: [btn('pn-btn-2', '닫기', 'close'), btn('pn-btn', '내 신고에서 보기', 'view-report')]
      };
    }
  };

  /* ---- 동작 ---- */
  function next(st) {
    var q = seqOf(st), i = q.indexOf(st.step);
    form.err = '';
    if (st.step === '2' && !form.customer) { form.err = '"예" 또는 "아니요"를 골라 주세요.'; return render(); }
    if (st.step === '3' && (!form.business || !form.symptom)) { form.err = '업무와 문제를 하나씩 골라 주세요.'; return render(); }
    if (st.step === '4') {
      if (!form.oneLine.trim()) { form.err = '한 줄 설명을 적어 주세요.'; return render(); }
      syncFixture(st);
      invalidate();
      return A.postIntakePreview(req(st)).then(function (p) {
        if (p && p.blocked) { res.preview = p; go({ alert: 'blocked' }); return; }
        res.preview = p;
        go({ step: q[i + 1], alert: '' });
      });
    }
    if (st.step === '5' && res.session && (res.session.questions || []).length) {
      return A.postAnswers(res.session.sessionId, { answers: answersList(res.session) }).then(function (r) {
        res.refined = r; go({ step: q[i + 1] });
      });
    }
    go({ step: q[i + 1] });
  }

  function closeNow() {
    clearDraft(read());
    blank();
    go({ panel: '', step: '', alert: '', 'case': '', tab: '', item: '' });
    var t = opener || document.querySelector('[data-panel="intake"]');
    if (t) t.focus();
  }

  function requestClose() {
    var st = read();
    if (submitting) return;
    if (closePending) { closePending = false; paint(st); return; }
    if (END_TITLE[st.step] || !hasInput()) return closeNow();
    closePending = true;
    paint(st);
    var h = $('pn-body').querySelector('h3'); if (h) h.focus();
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || submitting) return;
    var st = read(), act = b.getAttribute('data-act'), code = b.getAttribute('data-code');
    var q = seqOf(st);
    switch (act) {
      case 'next': return next(st);
      case 'back': form.err = ''; return go({ step: q[Math.max(0, q.indexOf(st.step) - 1)], alert: '' });
      case 'close': return requestClose();
      case 'discard': return closeNow();
      case 'keep': closePending = false; paint(st); var heading = $('pn-body').querySelector('h3'); if (heading) heading.focus(); return;
      case 'view-report':
        var id = res.report && res.report.reportId;
        clearDraft(st); blank();
        return go({ panel: 'known', tab: 'mine', item: id || '', step: '', alert: '', 'case': '', board: 'known' });
      case 'close-usage':
        return A.postReport({ mode: st.mode, finalType: 'USAGE', closedAsGuidance: true, reporterId: reporterId(st) }).then(closeNow);
      case 'metoo':
        return A.postMeToo(b.getAttribute('data-id'), { reporterId: reporterId(st), submittedById: proxyUser(st) ? proxyUser(st).id : null }).then(function (r) { res.meToo = r; go({ step: 'metoo' }); });
      case 'customer': form.customer = code; form.err = ''; invalidate(); return render();
      case 'business': form.business = code; form.err = ''; invalidate(); return render();
      case 'symptom': form.symptom = code; form.err = ''; invalidate(); return render();
      case 'answer': form.answers[b.getAttribute('data-slot')] = code; res.refined = null; form.edit = null; return render();
      case 'type': editOf(st).type = code; return render();
      case 'usage': return go({ step: 'usage' });
      case 'not-usage': form.typeOverride = 'DEFECT'; form.edit = null; return go({ step: '7' });
      case 'submit':
        var edited = editOf(st);
        if (!edited.title.trim() || !edited.summary.trim()) { form.err = '제목과 설명을 적어 주세요.'; editOpen = true; return paint(st); }
        form.err = '';
        submitting = true;
        paint(st);
        return Promise.resolve().then(function () { return A.postReport(reportReq(st)); }).then(function (r) {
          submitting = false;
          res.report = r;
          go({ step: r.closedAsGuidance ? 'usage' : 'done' });
        }, function () {
          submitting = false;
          form.err = '접수를 보내지 못했어요. 잠시 뒤 다시 눌러 주세요.';
          paint(st);
        });
    }
  }

  function onInput(e) {
    var t = e.target, k = t.getAttribute && t.getAttribute('data-in');
    if (!k) return;
    var st = read();
    if (k === 'customerNo') { form.customerNo = t.value; invalidate(); saveDraft(st); return; }
    if (k === 'oneLine') {
      form.oneLine = t.value;
      invalidate();
      saveDraft(st);
      if (st.alert === 'blocked') go({ alert: '', 'case': st['case'] === 'blocked' ? '' : st['case'] });
      return;
    }
    if (k === 'answer') { form.answers[t.getAttribute('data-slot')] = t.value; res.refined = null; form.edit = null; saveDraft(st); return; }
    if (k === 'title' || k === 'summary' || k === 'steps') { editOf(st)[k] = t.value; saveDraft(st); }
  }

  function focusables() {
    return Array.prototype.filter.call($('intake-panel').querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]'),
      function (x) { return !x.disabled && x.getClientRects().length; });
  }
  function onKey(e) {
    if (read().panel !== 'intake') return;
    if (e.key === 'Escape') {
      if (!$('notice-box').hidden || !$('alarm-pop').hidden) return;   // 위에 뜬 안내 상자가 먼저 닫힌다
      e.preventDefault();
      requestClose();
      return;
    }
    if (e.key === 'Tab') {   // 패널 안에서만 이동 (aria-modal)
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      var inside = $('intake-panel').contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    }
  }

  function bind() {
    document.querySelector('[data-panel="intake"]').addEventListener('click', function () {
      opener = this;
      blank();
      restored = false;
      lastStep = null;
      go({ panel: 'intake', step: '', alert: '', 'case': '', popup: '', notice: '', tab: '', item: '' });   // S3 키(tab, item)도 지운다
    });
    var panel = $('intake-panel');
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    $('pn-close').addEventListener('click', requestClose);
    $('pn-proxy-select').addEventListener('change', function (e) { form.onBehalf = e.target.value; form.edit = null; saveDraft(read()); render(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', render);
  }

  window.SFA_READY = (window.SFA_READY || Promise.resolve()).then(function () {
    return Promise.all([A.getMetaForm(), A.getAutoContext(), A.getKnownErrors('MAIN', ''), A.getUsers()]);
  }).then(function (r) {
    meta = r[0]; ctx = r[1]; known = r[2] || []; users = r[3] || [];
    bind();
    return render();
  });
})();
