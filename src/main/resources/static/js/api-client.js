/* 화면이 쓰는 유일한 데이터 창구 (docs/05-data-api-spec.md, CLAUDE.md 프론트 단계 규칙).
   프론트 단계: 서버 통신 없이 js/fixtures/ 의 고정값만 돌려준다.
   백엔드 연결 때는 이 파일의 데이터 출처만 바꾸고, 함수 이름과 응답 키는 그대로 둔다. */
(function () {
  'use strict';
  var F = window.FIXTURES || {};
  var I = F.intake || {};
  var Q = F.intakeAssistant || {};

  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function ok(v) { return Promise.resolve(v == null ? null : copy(v)); }

  /* 화면 시안 전용: 어떤 고정 응답을 돌려줄지 고른다(실제 판단·마스킹 없음). 백엔드 연결 때 지운다.
     case: defect | customer | usage | blocked,  llm: ok | fail */
  var proto = { 'case': 'defect', llm: 'ok' };
  function caseOf() { return proto['case'] === 'blocked' ? 'defect' : proto['case']; }

  window.ApiClient = {
    /* GET /api/users  -> AppUser[] (역할 전환·대리 접수 대상) */
    getUsers: function () {
      return Promise.resolve(copy(F.users || []));
    },
    /* S1 메인 화면 가상 데이터 (화면 시안 전용, ADR-012. 대응하는 백엔드 API 없음) */
    getSfaHome: function () {
      return Promise.resolve(copy(F.sfaHome || {}));
    },
    /* GET /api/notifications?userId=  -> NotificationLog[] (알림 미리보기 내역, 최신 순) */
    getNotifications: function (userId) {
      var list = (F.notifications || []).filter(function (n) { return n.recipientId === userId; });
      list.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      return Promise.resolve(copy(list));
    },
    /* GET /api/reports/mine?userId=  -> 내 신고와 진행 단계 (최근 바뀐 순).
       각 건: Report 키 + defect(지금 상태) + statusHistory + fcNotice(승인본만, 없으면 null) */
    getMyReports: function (userId) {
      var list = (F.myReports || []).filter(function (r) { return r.reporterId === userId; });
      var when = function (r) { return (r.defect && r.defect.updatedAt) || r.createdAt; };
      list.sort(function (a, b) { return when(a) < when(b) ? 1 : -1; });
      return Promise.resolve(copy(list));
    },

    /* ---- S2 접수 패널 ---- */
    setProto: function (p) {
      Object.keys(p || {}).forEach(function (k) { if (p[k]) proto[k] = p[k]; });
    },
    /* GET /api/meta/form -> {businesses, symptoms, slots} */
    getMetaForm: function () { return ok(I.metaForm); },
    /* 자동 수집 정보(Report.autoContext 형식). 화면 시안 전용: 실제로는 브라우저가 붙인다 */
    getAutoContext: function () { return ok(I.autoContext); },
    /* GET /api/known-errors?screen=&symptom= -> 공개된 대표 결함 목록 */
    getKnownErrors: function (/* screen, symptom */) { return ok(I.knownErrors || []); },
    /* POST /api/known-errors/{id}/me-too -> ME_TOO 신고 1건 */
    postMeToo: function (defectId /* , body */) {
      var r = copy(I.meToo || {});
      var d = (I.knownErrors || []).filter(function (k) { return k.id === defectId; })[0];
      r.defectId = defectId;
      if (d) r.reportCount = d.reportCount + 1;
      return Promise.resolve(r);
    },
    /* 접수 채널 AI 문의 (ADR-018). 네트워크 없이 시연용 표현과 공개 결함을 비교한다. */
    getIntakeQuestions: function () { return ok(Q.questions || []); },
    postIntakeQuestion: function (req) {
      var question = String((req || {}).text || '').trim();
      if (containsPrivateValue(question)) return ok({ outcome: 'BLOCKED' });
      if (proto.llm === 'fail') return ok({ outcome: 'UNAVAILABLE' });
      return ok(intakeAnswer(question));
    },
    /* POST /api/intake/preview -> 차단·마스킹 결과와 AI 전달 내용 (차단 시 값 없이 유형만) */
    postIntakePreview: function (req) {
      if (req && req.source === 'ASSISTANT') return ok({ blocked: containsPrivateValue(req.oneLine) });
      var p = I.preview || {};
      return ok(proto['case'] === 'blocked' ? p.blocked : p[caseOf()]);
    },
    /* POST /api/intake/sessions -> B모드 AI 분석 시작, 되묻기 */
    postIntakeSession: function (/* req */) {
      var s = I.sessions || {};
      return ok(proto.llm === 'fail' ? s.fallback : s[caseOf()]);
    },
    /* POST /api/intake/sessions/{id}/answers -> 답변 반영 결과 */
    postAnswers: function (/* sessionId, req */) {
      var a = I.answers || {};
      return ok(proto.llm === 'fail' ? a.fallback : (a[caseOf()] || a.defect));
    },
    /* POST /api/reports -> {reportId, type, grade, departmentCode, closedAsGuidance} */
    postReport: function (req) {
      var r = I.reports || {}, c = caseOf(), key;
      req = req || {};
      if (req.source === 'ASSISTANT') {
        if (containsPrivateValue(req.title) || containsPrivateValue(req.summary)) return ok({ blocked: true });
        return ok({ reportId: 'R-102', type: 'UNCLASSIFIED', grade: null, departmentCode: null, closedAsGuidance: false });
      }
      if (req.mode === 'A' || req.llmOutcome === 'FALLBACK') {
        key = c === 'customer' ? 'unclassifiedCustomer' : c === 'usage' ? 'unclassifiedLogin' : 'unclassified';
      } else if (c === 'usage') {
        key = req.finalType === 'USAGE' ? 'usage' : 'usageAsDefect';
      } else {
        key = c;
      }
      var res = copy(r[key] || {});
      if (req.mode === 'B' && req.finalType && res.type !== 'UNCLASSIFIED') res.type = req.finalType;
      return Promise.resolve(res);
    },

    /* ---- S4 결함 대장 (fixtures/defects.js). 영향 지점 수·신고 수는 내려주지 않고 화면이 센다(REQ-LG-01) ---- */
    /* GET /api/defects?status=&grade=&type=&q=  -> Defect[] + reports(묶인 신고, 신고자 지점 포함)
       q: 글자 찾기(REQ-LG-08, 05번 4절). AI 없이 id·title·workaround·묶인 신고 maskedText 에 들어갔는지만 본다(대소문자 무시).
       필터와 모두 만족(AND). q 가 있으면 각 건에 matchedIn(ID|TITLE|WORKAROUND|REPORT)·matchedReportIds 를 붙인다 */
    getDefects: function (q) {
      q = q || {};
      var word = norm(q.q);
      var list = (L.defects || []).filter(function (d) {
        return (!q.status || d.status === q.status) && (!q.grade || d.grade === q.grade) && (!q.type || d.type === q.type);
      }).map(function (d) {
        var x = copy(d);
        x.reports = linkedReports(d.id);
        if (word) {
          x.matchedIn = [['ID', d.id], ['TITLE', d.title], ['WORKAROUND', d.workaround]]
            .filter(function (f) { return has(f[1], word); }).map(function (f) { return f[0]; });
          x.matchedReportIds = x.reports.filter(function (r) { return has(r.maskedText, word); }).map(function (r) { return r.id; });
          if (x.matchedReportIds.length) x.matchedIn.push('REPORT');
        }
        return x;
      }).filter(function (x) { return !word || x.matchedIn.length; });
      return Promise.resolve(list);
    },
    /* GET /api/defects/{id}  -> Defect + reports(묶인 신고) + statusHistory(관리자용: 사유·처리자 포함) + fcNotice */
    getDefect: function (id) {
      var d = (L.defects || []).filter(function (x) { return x.id === id; })[0];
      if (!d) return Promise.resolve(null);
      var x = copy(d);
      x.reports = linkedReports(id);
      x.statusHistory = copy((L.statusHistory || []).filter(function (h) { return h.defectId === id; })
        .sort(function (a, b) { return a.at < b.at ? -1 : 1; }));
      x.fcNotice = copy((L.fcNotices || []).filter(function (n) { return n.defectId === id; })[0] || null);
      return Promise.resolve(x);
    },
    /* GET /api/reports/unlinked?userId=&q=  -> 아직 대표 결함에 안 묶인 신고(defectId 없음), 최신 순.
       opt.q: 글자 찾기(REQ-LG-08). 신고 id·maskedText 에 들어간 것만(대소문자 무시). isNew 는 찾기와 관계없음.
       isNew: 그 담당자가 이 탭을 마지막으로 본 시각(AppUser.unlinkedSeenAt) 뒤에 들어온 신고 (REQ-LG-07, ADR-017).
       프론트 단계: 본 시각을 기록(POST /api/reports/unlinked/seen)하지 않으므로 "새로 들어옴"은 줄지 않는다 */
    getUnlinkedReports: function (userId, opt) {
      var me = (F.users || []).filter(function (u) { return u.id === userId; })[0];
      var seen = me && me.unlinkedSeenAt;
      var word = norm((opt || {}).q);
      var list = (L.reports || []).filter(function (r) {
        return !r.defectId && (!word || has(r.id, word) || has(r.maskedText, word));
      }).map(function (r) {
        var x = withReporter(r);
        x.isNew = !!seen && Date.parse(r.createdAt) > Date.parse(seen);
        return x;
      });
      list.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
      return Promise.resolve(list);
    },
    /* POST /api/reports/{id}/similar-defects  -> {reportId, llmOutcome, needsHumanReview, candidates:[{defectId, title, status, similarity, reason, matched}]}
       AI 비슷한 대표 결함 후보(07번 ⑤, REQ-LG-06, ADR-017). 프론트 단계: fixtures 고정 응답, 실제 LLM 호출 없음.
       llm=fail 이면 규칙 후보(같은 업무·같은 증상 유형의 신고가 묶인 결함, 최대 3개, similarity=null)로 대체.
       연결은 하지 않는다(담당자가 postLinkReport). */
    postSimilarDefects: function (reportId) {
      var r = (L.reports || []).filter(function (x) { return x.id === reportId; })[0];
      if (!r) return Promise.resolve(null);
      var byId = function (id) { return (L.defects || []).filter(function (d) { return d.id === id; })[0]; };
      var res;
      if (proto.llm === 'fail') {
        var hits = (L.defects || []).filter(function (d) {
          return linkedReports(d.id).some(function (x) { return x.business === r.business && x.symptom === r.symptom; });
        }).slice(0, 3);
        res = { llmOutcome: 'FALLBACK', candidates: hits.map(function (d) {
          return { defectId: d.id, similarity: null, reason: '같은 업무·같은 문제 유형이에요', matched: ['BUSINESS', 'SYMPTOM'] };
        }) };
      } else {
        res = copy((L.similar || {})[reportId] || { llmOutcome: 'OK', candidates: [] });
      }
      res.reportId = reportId;
      res.needsHumanReview = true;
      res.candidates = (res.candidates || []).filter(function (c) { return byId(c.defectId); }).slice(0, 3).map(function (c) {
        var d = byId(c.defectId);
        c.title = d.title; c.status = d.status;
        return c;
      });
      return Promise.resolve(res);
    },
    /* POST /api/defects/{id}/reports  -> 신고 연결 (프론트 단계: 저장하지 않고 결과 모양만 돌려준다) */
    postLinkReport: function (defectId, reportId) {
      return Promise.resolve({ defectId: defectId, reportId: reportId });
    },
    /* POST /api/defects/{id}/status/preview  -> {notifiable, recipientCount, body, recipients:[{userId, name}]}
       req: {from, to, plannedFixDate, wontFixReasonText}. 알림 규칙(02번 4절): 임시조치·수정 예정·해결·수정하지 않음만 알리고,
       되돌림(앞 단계로)·재현 확인·원인 파악은 기록만. 받는 사람은 묶인 신고자 전원(중복 1회). */
    postStatusPreview: function (id, req) {
      req = req || {};
      var d = (L.defects || []).filter(function (x) { return x.id === id; })[0] || {};
      var back = req.from === 'WONT_FIX' || ORDER.indexOf(req.to) < ORDER.indexOf(req.from);
      var notifiable = !back && NOTIFY.indexOf(req.to) >= 0;
      var seen = {}, recipients = [];
      linkedReports(id).forEach(function (r) {
        if (seen[r.reporterId]) return;
        seen[r.reporterId] = true;
        recipients.push({ userId: r.reporterId, name: r.reporter ? r.reporter.name : '',
          branchName: r.reporter ? r.reporter.branchName : '' });
      });
      var date = req.plannedFixDate ? parseInt(req.plannedFixDate.slice(5, 7), 10) + '월 ' + parseInt(req.plannedFixDate.slice(8, 10), 10) + '일' : '';
      var body = notifiable ? (L.statusTemplates || {})[req.to] || '' : '';
      body = body.replace('{title}', d.title || '').replace('{date}', date).replace('{reason}', req.wontFixReasonText || '');
      return Promise.resolve({ notifiable: notifiable, recipientCount: notifiable ? recipients.length : 0,
        body: notifiable ? body : null, recipients: notifiable ? recipients : [] });
    },
    /* POST /api/defects/{id}/status  -> 상태 변경 확정, 알림 기록 (프론트 단계: 저장하지 않음) */
    postStatus: function (id, req) {
      return window.ApiClient.postStatusPreview(id, req).then(function (p) {
        return { defectId: id, historyId: 'H-100', status: (req || {}).to, notificationCount: p.recipientCount };
      });
    }
  };

  // 시연용 형식 차단. 이름·주소 등은 입력하지 않도록 안내하며, 전체 마스킹은 백엔드 단계에서 수행한다.
  function containsPrivateValue(text) {
    return /(?:\d[ .()-]*){6}|[^\s@]+@[^\s@]+\.[^\s@]+/.test(text);
  }
  function matchesQuestion(question, example) {
    return example.terms.every(function (term) { return term.test(question); });
  }
  function intakeAnswer(question) {
    var asksHow = /어떻게|어디서|방법|는\s*법|사용법|알려|모르겠/.test(question);
    var hasError = /안\s*(돼|되|열|보여|넘어)|않|오류|실패|먹통|멈|다른 화면|늦|느리|느려/.test(question);
    var matches = (Q.defects || []).filter(function (example) {
      return matchesQuestion(question, example);
    });
    if (matches.length === 1) {
      var match = matches[0];
      var d = (L.defects || []).find(function (item) { return item.published && item.id === match.id; });
      if (d) {
        var notice = (L.fcNotices || []).find(function (n) { return n.defectId === d.id && n.status === 'APPROVED'; });
        return { outcome: 'MATCH', type: d.type, business: match.business, symptom: match.symptom,
          guidance: notice ? notice.approvedText : null,
          defect: { id: d.id, title: d.title, status: d.status, workaround: d.workaround,
            plannedFixDate: d.plannedFixDate, wontFixReasonText: d.wontFixReasonText } };
      }
    }
    if (!matches.length && asksHow && !hasError && Q.usage && matchesQuestion(question, Q.usage)) {
      return { outcome: 'GUIDANCE', type: 'USAGE', business: Q.usage.business, symptom: Q.usage.symptom,
        guidance: I.sessions.usage.usageGuide };
    }
    var type = null;
    if (matches.length === 1 || (!matches.length && hasError)) type = 'DEFECT';
    if (!matches.length && !hasError && asksHow) type = 'USAGE';
    return { outcome: 'NO_MATCH', type: type };
  }

  /* S4 도우미: 신고에 신고자(이름·지점)를 붙인다. 내 신고(getMyReports)에 defect 를 붙여 내리는 것과 같은 방식 */
  var L = F.ledger || {};
  var ORDER = ['RECEIVED', 'REPRODUCED', 'CAUSE_FOUND', 'WORKAROUND', 'FIX_PLANNED', 'RESOLVED', 'WONT_FIX'];
  var NOTIFY = ['WORKAROUND', 'FIX_PLANNED', 'RESOLVED', 'WONT_FIX'];
  /* 글자 찾기(REQ-LG-08): 앞뒤 빈칸 없앰·소문자·40자까지. 빈 값이면 '' (찾지 않음) */
  function norm(v) { return String(v == null ? '' : v).trim().toLowerCase().slice(0, 40); }
  function has(text, word) { return text != null && String(text).toLowerCase().indexOf(word) >= 0; }
  function withReporter(r) {
    var x = copy(r);
    var u = (F.users || []).filter(function (v) { return v.id === r.reporterId; })[0];
    var b = u && (L.branches || []).filter(function (v) { return v.id === u.branchId; })[0];
    x.reporter = u ? { id: u.id, name: u.name, branchId: u.branchId, branchName: b ? b.name : '' } : null;
    return x;
  }
  function linkedReports(defectId) {
    return (L.reports || []).filter(function (r) { return r.defectId === defectId; }).map(withReporter)
      .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
  }
})();
