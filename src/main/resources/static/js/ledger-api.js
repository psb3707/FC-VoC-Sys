/* ADR-023. 화면 전용 ApiClient 확장. 서술 입력과 AI 질문은 페이지 메모리에만 둔다. */
(function () {
  'use strict';
  var A = window.ApiClient, F = window.FIXTURES.ledgerWorkflow, store = window.IntakeDemoStore;
  var text = {}, closed = {}, sequence = 0;
  var copy = function (v) { return JSON.parse(JSON.stringify(v)); };
  var clean = function (v) { return window.IntakeDraftRules.mask(v).trim().slice(0, 2000); };
  function snapshot() {
    var saved = store.read().workflow || {}, out = copy(F.records);
    Object.keys(saved).forEach(function (id) { out[id] = Object.assign(out[id] || {}, saved[id]); });
    Object.keys(text).forEach(function (id) { out[id] = Object.assign(out[id] || {}, text[id]); });
    return out;
  }
  function caseData() { return copy(F.cases).map(function (c) { c.guide = copy(F.guidance[c.id]); return c; }); }
  A.getLedgerWorkflow = function () { return Promise.resolve({ businesses: copy(F.businesses), records: snapshot(), closed: copy(closed), cases: caseData(), defaults: copy(F.defaults) }); };
  A.saveLedgerWorkflow = function (id, req) {
    var strings = ['step', 'nextAction', 'impact', 'facts', 'missing', 'sharedText', 'outcome', 'note'];
    var publicFields = ['business', 'ownerId', 'collaboratorId', 'stage', 'due', 'sharedAt', 'references', 'urgent'];
    var patch = {};
    publicFields.forEach(function (key) { if (Object.hasOwn(req, key)) patch[key] = req[key]; });
    text[id] = text[id] || {};
    strings.forEach(function (key) { if (Object.hasOwn(req, key)) text[id][key] = clean(req[key]); });
    if (req.event) {
      text[id].events = (text[id].events || []).concat([{ at: new Date().toISOString(), action: clean(req.event), note: clean(req.note), actorId: req.actorId }]);
    }
    return store.update(function (state) {
      state.workflow = state.workflow || {};
      state.workflow[id] = Object.assign(state.workflow[id] || {}, patch);
      return { id: id, ok: true };
    });
  };
  A.closeLedgerReport = function (id, req) {
    if (!clean(req.outcome) || !clean(req.sharedText)) return Promise.resolve({ error: '안내 내용과 처리 결과를 적어 주세요.' });
    return A.saveLedgerWorkflow(id, Object.assign({}, req, { stage: 'DONE', event: '안내 후 종료' })).then(function () { closed[id] = true; return { id: id }; });
  };
  A.createLedgerCase = function (report, req) {
    if (!clean(req.title) || !req.ownerId || !clean(req.nextAction)) return Promise.resolve({ error: '제목·담당자·다음 조치를 확인해 주세요.' });
    var id = 'D-W' + Date.now().toString(36).toUpperCase() + (++sequence), title = clean(req.title);
    // 자유 입력 제목은 메모리, 저장소에는 가상 기본 제목만 기록한다.
    return store.update(function (state) {
      if (state.links[report.id]) return { error: '이미 연결된 접수예요. 목록을 다시 확인해 주세요.' };
      state.managedDefects = state.managedDefects || [];
      state.managedDefects.push({ id: id, title: '새 업무 관리 건', type: 'DEFECT', systemGen: 'NEW', grade: report.grade || 'NORMAL', status: 'RECEIVED', departmentCode: report.departmentCode || 'SALES_SUPPORT', published: false, updatedAt: new Date().toISOString() });
      state.links[report.id] = id;
      return { id: id };
    }).then(function (result) {
      if (result.error) return result;
      text[id] = { title: title };
      return A.saveLedgerWorkflow(id, Object.assign({}, req, { stage: 'CHECKING', event: '관리 건 등록', actorId: req.actorId })).then(function () { return result; });
    });
  };
  A.unlinkLedgerReport = function (reportId, reason, actorId) {
    if (!clean(reason)) return Promise.resolve({ error: '연결 해제 이유를 적어 주세요.' });
    return store.update(function (state) { state.links[reportId] = null; return { ok: true }; }).then(function () {
      return A.saveLedgerWorkflow(reportId, { stage: 'CHECKING', note: reason, event: '기존 관리 건 연결 해제', actorId: actorId });
    });
  };
  var baseStatus = A.postStatus;
  A.postStatus = function (id, req) {
    return baseStatus(id, req).then(function (result) {
      if (!result || result.error) return result;
      var stage = ['RESOLVED', 'WONT_FIX'].includes(req.to) ? 'DONE' : ['WORKAROUND', 'FIX_PLANNED'].includes(req.to) ? 'ACTION' : 'CHECKING';
      return A.saveLedgerWorkflow(id, { stage: stage, note: req.adminReason || '', event: '상태 변경', actorId: req.actorId }).then(function () { return result; });
    });
  };
  var baseDefects = A.getDefects, baseDefect = A.getDefect;
  A.getDefects = function (q) {
    // 메모리 제목도 글자 검색에 포함한다. 기존 상태·등급·유형 조건은 보존한다.
    var filter = Object.assign({}, q || {}), word = String(filter.q || '').toLowerCase(); delete filter.q;
    return baseDefects(filter).then(function (list) {
      return list.map(function (d) { if (text[d.id] && text[d.id].title) d.title = text[d.id].title; return d; }).filter(function (d) {
        return !word || [d.id, d.title, d.workaround].concat((d.reports || []).map(function (r) { return r.maskedText; })).some(function (v) { return String(v || '').toLowerCase().includes(word); });
      });
    });
  };
  A.getDefect = function (id) { return baseDefect(id).then(function (d) { if (d && text[id] && text[id].title) d.title = text[id].title; return d; }); };
  A.askLedgerCases = function (req) {
    if (req.mode === 'fail') return Promise.resolve({ outcome: 'FAILED', cases: [] });
    if (req.mode === 'slow') return Promise.resolve({ outcome: 'WAITING', cases: [] });
    var question = clean(req.question), list = caseData().filter(function (c) {
      return (!req.business || c.business === req.business) && c.words.some(function (w) { return question.includes(w); });
    }).map(function (c) {
      c.specificity = c.guide.tokens.filter(function (word) { return question.replace(/\s/g, '').includes(word.replace(/\s/g, '')); }).length;
      return c;
    }).sort(function (a, b) { return b.specificity - a.specificity || a.id.localeCompare(b.id); });
    if (req.variant === 'empty' || !question) list = [];
    var signs = list.filter(function (c) { return c.business === 'SUBSCRIPTION'; });
    if (signs.length > 1 && signs[0].specificity === signs[1].specificity && req.variant !== 'mismatch') {
      return Promise.resolve({ outcome: 'CLARIFY', cases: [], choices: [
        { label: '다른 화면이 열려요', question: '서명 알림톡을 누르면 초대장 화면이 열려요. 이전에는 어떻게 처리했나요?' },
        { label: '서명 화면이 멈춰요', question: '모바일 서명 화면이 멈춰요. 이전에는 어떻게 처리했나요?' }
      ] });
    }
    return Promise.resolve({ outcome: list.length ? 'OK' : 'EMPTY', cases: list.slice(0, 2), old: req.variant === 'old', mismatch: req.variant === 'mismatch' });
  };
})();
