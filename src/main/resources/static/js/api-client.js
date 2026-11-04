/* 화면 전용 가상 데이터 창구. 외부 통신·실제 AI·개인정보 마스킹은 없다.
   fixtures 위에 현재 탭의 가상 신고/읽음 상태만 보관한다(ADR-017). */
(function () {
  'use strict';
  var F = window.FIXTURES || {}, I = F.intake || {};
  var proto = { 'case': 'defect', llm: 'ok' }, sessions = {}, serial = 0;
  var storeKey = 'fc-voc-ui-session-v1';
  var state = { reports: [], read: {}, counts: {}, next: 200 };
  try { var saved = JSON.parse(sessionStorage.getItem(storeKey)); if (saved && Array.isArray(saved.reports) && saved.read && typeof saved.read === 'object' &&
    saved.counts && typeof saved.counts === 'object' && Number.isFinite(saved.next)) state = saved; } catch (e) { /* file:// 또는 저장소 제한 시 메모리만 사용 */ }
  sessions = state.sessions && typeof state.sessions === 'object' ? state.sessions : {};
  state.sessions = sessions;
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function ok(v) { return Promise.resolve(v == null ? null : copy(v)); }
  function changed() {
    try { sessionStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) { /* 메모리 상태 유지 */ }
    window.dispatchEvent(new Event('voc-data-change'));
  }
  function reports() { return (F.myReports || []).concat(state.reports); }
  function now() { return new Date().toISOString(); }
  function meTooReport(id, user) { return reports().filter(function (r) { return r.reporterId === user && r.defectId === id; })[0]; }
  function preview(req) {
    req = req || {};
    if (proto['case'] === 'blocked') return copy(I.preview.blocked);
    var p = copy(I.preview.defect);
    p.maskedText = req.oneLine || '';
    p.aiPayload = { text: p.maskedText, attributes: {} };
    /* 고객 예시의 정해진 가상 문장만 기존 마스킹 장면으로 보여 준다. */
    if (proto['case'] === 'customer' && req.oneLine === '한가람(가상) 고객님 가입내역이 안 보여요') p = copy(I.preview.customer);
    return p;
  }
  function ticket(req) {
    var text = preview(req).maskedText || req.oneLine || '';
    return { title: text.slice(0, 90), symptomSummary: text, stepsToReproduce: [], expected: null, actual: text };
  }
  function session(req) {
    var fail = proto.llm === 'fail', usage = req.symptom === 'HOW_TO' && /비밀번호/.test(req.oneLine || '');
    var s = { sessionId: 'UI-S-' + Date.now() + '-' + (++serial), classification: fail ? null : { type: usage ? 'USAGE' : 'DEFECT',
      confidence: 'MEDIUM', reason: '선택한 업무와 설명을 확인해 주세요' }, ticket: fail ? null : ticket(req),
      questions: [], usageGuide: usage ? I.sessions.usage.usageGuide : null, needsHumanReview: true, llmOutcome: fail ? 'FALLBACK' : 'OK' };
    if (!usage) {
      s.questions = [
        { slot: 'device_path', text: '오류는 어디에서 났나요?', choices: ['이 컴퓨터', '휴대폰', '태블릿', '모르겠어요'] },
        { slot: 'steps', text: '어떤 순서로 하다가 문제가 생겼나요?', choices: null }
      ];
      if (req.customerRelated) s.questions.push({ slot: 'other_customers', text: '다른 고객에게도 같은 문제가 생기나요?', choices: ['네', '아니요', '모르겠어요'] });
    }
    sessions[s.sessionId] = { result: s, req: { business: req.business, symptom: req.symptom } };
    changed();
    return s;
  }
  window.ApiClient = {
    getUsers: function () { return ok(F.users || []); },
    getSfaHome: function () { return ok(F.sfaHome || {}); },
    getNotifications: function (userId) {
      var list = copy(F.notifications || []).filter(function (n) { return n.recipientId === userId; });
      list.forEach(function (n) { n.readAt = state.read[n.id] || null; });
      list.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      return ok(list);
    },
    markNotificationRead: function (id, userId) {
      var n = (F.notifications || []).filter(function (x) { return x.id === id && x.recipientId === userId; })[0];
      if (n && !state.read[id]) { state.read[id] = now(); changed(); }
      return ok({ readAt: state.read[id] || null });
    },
    getMyReports: function (userId) {
      var list = reports().filter(function (r) { return r.reporterId === userId || r.submittedById === userId; });
      var when = function (r) { return (r.defect && r.defect.updatedAt) || r.createdAt; };
      list.sort(function (a, b) { return when(a) < when(b) ? 1 : -1; });
      return ok(list);
    },
    setProto: function (p) { Object.keys(p || {}).forEach(function (k) { if (p[k]) proto[k] = p[k]; }); },
    getMetaForm: function () { return ok(I.metaForm); },
    getAutoContext: function () { return ok(I.autoContext); },
    getKnownErrors: function (screen, symptom, reporterId) {
      var list = copy(I.knownErrors || []);
      list.forEach(function (k) {
        k.reportCount += state.counts[k.id] || 0;
        k.alreadyReported = !!meTooReport(k.id, reporterId);
      });
      return ok(list);
    },
    postMeToo: function (defectId, req) {
      req = req || {};
      var user = req.reporterId || 'U-001', existing = meTooReport(defectId, user);
      var d = (I.knownErrors || []).filter(function (k) { return k.id === defectId; })[0];
      if (!d) return Promise.reject(new Error('알려진 오류를 찾지 못했어요'));
      if (existing) return ok({ reportId: existing.id, kind: 'ME_TOO', defectId: defectId,
        reportCount: d.reportCount + (state.counts[defectId] || 0), alreadyReported: true });
      var id = 'R-' + (++state.next), at = now();
      state.reports.push({ id: id, reporterId: user, submittedById: req.submittedById || user,
        kind: 'ME_TOO', finalType: d.type, createdAt: at, maskedText: null, defectId: defectId,
        defect: copy(d), statusHistory: [{ from: null, to: d.status, at: at }], fcNotice: null });
      state.counts[defectId] = (state.counts[defectId] || 0) + 1;
      changed();
      return ok({ reportId: id, kind: 'ME_TOO', defectId: defectId,
        reportCount: d.reportCount + state.counts[defectId], alreadyReported: false });
    },
    postIntakePreview: function (req) { return ok(preview(req)); },
    postIntakeSession: function (req) { return ok(session(req || {})); },
    postAnswers: function (sessionId, req) {
      var entry = sessions[sessionId], s = entry ? copy(entry.result) : { sessionId: sessionId, ticket: null, classification: null, llmOutcome: 'FALLBACK' };
      var answers = req && req.answers || [];
      if (s.ticket) {
        var steps = answers.filter(function (a) { return a.slot === 'steps'; })[0];
        var device = answers.filter(function (a) { return a.slot === 'device_path'; })[0];
        s.ticket.stepsToReproduce = [];
        if (device && device.answer) s.ticket.stepsToReproduce.push('오류가 난 곳: ' + device.answer);
        if (steps && steps.answer) s.ticket.stepsToReproduce.push(steps.answer);
      }
      s.remainingMissingSlots = answers.filter(function (a) { return !a.answer || a.answer === '모르겠어요'; }).map(function (a) { return a.slot; });
      s.needsHumanReview = true;
      return ok(s);
    },
    postReport: function (req) {
      req = req || {};
      var type = req.mode === 'A' || req.llmOutcome === 'FALLBACK' ? 'UNCLASSIFIED' : req.finalType || 'UNCLASSIFIED';
      if (req.closedAsGuidance || type === 'USAGE') return ok({ reportId: null, type: 'USAGE', grade: null, departmentCode: 'SALES_SUPPORT', closedAsGuidance: true });
      var immediate = req.business === 'SUBSCRIPTION' && (req.symptom === 'CANNOT_PROCEED' || req.symptom === 'WRONG_SCREEN');
      var department = { LOGIN: 'LOGIN_SUPPORT', SUBSCRIPTION: 'SUBSCRIPTION_IT', CUSTOMER_LOOKUP: 'CUSTOMER_IT',
        DESIGN: 'DESIGN_SUPPORT', CONTRACT_LOOKUP: 'CONTRACT_IT', ETC: 'SALES_SUPPORT' };
      var id = 'R-' + (++state.next), at = now();
      state.reports.push({ id: id, reporterId: req.reporterId, submittedById: req.submittedById || req.reporterId,
        kind: 'FULL', finalType: type, createdAt: at, title: req.title || req.oneLine,
        maskedText: req.summary || req.oneLine || req.title, oneLine: req.oneLine || req.summary || '',
        stepsToReproduce: req.stepsToReproduce || [], business: req.business, symptom: req.symptom,
        defectId: null, defect: null, statusHistory: [{ from: null, to: 'RECEIVED', at: at }], fcNotice: null });
      changed();
      return ok({ reportId: id, type: type, grade: immediate ? 'IMMEDIATE' : req.business === 'LOGIN' ? 'NORMAL' : 'BATCH',
        departmentCode: department[req.business] || 'SALES_SUPPORT', closedAsGuidance: false });
    }
  };
})();
