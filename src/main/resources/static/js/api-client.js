/* 화면이 쓰는 유일한 데이터 창구 (docs/05-data-api-spec.md, CLAUDE.md 프론트 단계 규칙).
   프론트 단계: 서버 통신 없이 js/fixtures/ 의 고정값만 돌려준다.
   백엔드 연결 때는 이 파일의 데이터 출처만 바꾸고, 함수 이름과 응답 키는 그대로 둔다. */
(function () {
  'use strict';
  var F = window.FIXTURES || {};
  var I = F.intake || {};
  var Q = F.intakeAssistant || {};
  var store = window.IntakeDemoStore;
  var quickReports = new Map(), followupText = new Map(), failedSubmissions = new Set(), failedAttachments = new Set();
  var draftRules = window.IntakeDraftRules;
  var quick = I.quick || {};

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
      var state = store.read();
      var list = (F.notifications || []).concat(sentNotifications(state)).filter(function (n) {
        return n.recipientId === userId;
      }).map(function (n) { return Object.assign({}, n, { read: !!state.read[n.id] }); });
      list.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      return Promise.resolve(copy(list));
    },
    watchIntakeUpdates: function (fn) { store.watch(fn); },
    markNotificationRead: function (id, userId) {
      return store.update(function (state) {
        var item = (F.notifications || []).concat(sentNotifications(state)).find(function (n) {
          return n.id === id && n.recipientId === userId;
        });
        if (!item) return false;
        state.read[id] = true;
        return true;
      }).then(ok);
    },
    /* GET /api/reports/mine?userId=  -> 내 신고와 진행 단계 (최근 바뀐 순).
       각 건: Report 키 + defect(지금 상태) + statusHistory + fcNotice(승인본만, 없으면 null) */
    getMyReports: function (userId) {
      var state = store.read(), defects = ledgerDefects(state);
      var list = visibleReports(userId, state).map(function (r) {
        var item = copy(r);
        var id = state.links[r.id] || r.defectId;
        if (id) {
          var d = defects.find(function (entry) { return entry.id === id; });
          item.defectId = id;
          item.defect = publicDefect(d, item.defect);
          var changes = state.history.filter(function (h) { return h.defectId === id; });
          if (changes.length) item.statusHistory = (item.statusHistory || []).concat(changes.map(function (h) {
            return { from: h.from, to: h.to, at: h.at };
          }));
          if (d && d.resolution) item.resolution = d.resolution;
        }
        item.followups = reportFollowups(state, r.id);
        return item;
      });
      var when = function (r) {
        return [r.createdAt, r.defect && r.defect.updatedAt, r.followups[0] && r.followups[0].at].filter(Boolean).sort().pop();
      };
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
      return ok(intakeAnswer(draftRules.mask(question)));
    },
    /* ADR-021: 구조화 가상 접수는 대장과 공유한다. 자유 입력은 현재 페이지 메모리에 둔다. */
    getIntakeDiagnostics: function (mode) { return ok(collectDiagnostics(mode, nowKst())); },
    getQuickIntakeMeta: function () { return ok(quick.options); },
    getQuickIntakeCatalog: function () {
      var defects = ledgerDefects();
      return ok((Q.defects || []).flatMap(function (match) {
        var d = defects.find(function (item) { return item.id === match.id && item.published; });
        return d && d.status !== 'RESOLVED' ? [{ id: d.id, title: d.title, status: d.status, workaround: d.workaround,
          business: match.business, symptom: match.symptom, plannedFixDate: d.plannedFixDate,
          wontFixReasonCode: d.wontFixReasonCode, wontFixReasonText: d.wontFixReasonText, guide: quick.guides[d.id] || null }] : [];
      }));
    },
    // 공개 대장의 시연 문구만 로컬에서 비교한다. 입력을 저장하거나 AI를 호출하지 않는다.
    findQuickIntakeGuide: function (business, text) {
      if (!business || containsPrivateValue(text)) return null;
      var matches = (Q.defects || []).filter(function (example) {
        return example.business === business && matchesQuestion(text, example);
      });
      if (matches.length !== 1) return null;
      var d = ledgerDefects().find(function (item) {
        return item.id === matches[0].id && item.published && item.workaround && item.status !== 'RESOLVED';
      });
      return d ? d.id : null;
    },
    previewIntakeDraft: function (req) { return ok(draftRules.preview(req)); },
    planIntakeDraft: function (req, mode) {
      return ok(mode === 'fail' ? { failed: true } : draftRules.plan(req));
    },
    getReportAttachment: function (reportId, userId) {
      var agent = (F.users || []).find(function (user) { return user.id === userId; });
      var state = store.read();
      if (!agent || !['SALES', 'IT'].includes(agent.role) || state.cancelled[reportId] ||
          !state.reports.some(function (r) { return r.id === reportId && r.hasAttachment; })) return ok(null);
      return ok(state.attachments[reportId] || null);
    },
    previewQuickIntake: function (req) {
      var text = ['oneLine', 'detail', 'screen'].map(function (key) { return req[key]; });
      var blocked = text.concat(Object.values(req.aiDraft || {})).some(containsPrivateValue);
      return ok({ blocked: blocked });
    },
    postQuickIntake: function (req, simulateFailure) {
      if (!req.requestId || !(F.users || []).some(function (user) { return user.id === req.reporterId; })) return ok({ failed: true });
      var previous = store.read().reports.find(function (r) { return r.requestId === req.requestId; });
      if (previous) return ok(quickReports.get(previous.id) || previous);
      var image = req.attachment;
      if (image && !validAttachment(image)) return ok({ attachmentError: '확정한 이미지가 너무 크거나 형식이 맞지 않아요. 다시 선택해 주세요.' });
      if (image && req.simulateAttachmentFailure && !failedAttachments.has(req.requestId)) {
        failedAttachments.add(req.requestId);
        return ok({ attachmentError: '이미지를 첨부하지 못했어요. 다시 접수하거나 이미지를 삭제하고 글만 접수할 수 있어요.' });
      }
      if (simulateFailure && !failedSubmissions.has(req.requestId)) {
        failedSubmissions.add(req.requestId);
        return ok({ failed: true });
      }
      return window.ApiClient.previewQuickIntake(req).then(function (preview) {
        if (preview.blocked) return { blocked: true };
        return store.update(function (state) {
          var duplicate = state.reports.find(function (r) { return r.requestId === req.requestId; });
          if (duplicate) return copy(quickReports.get(duplicate.id) || duplicate);
          if (image && Object.values(state.attachments).reduce(function (size, value) { return size + value.length; }, 0) + image.length > 2000000) {
            return { attachmentError: '이 브라우저의 첨부 저장 한도에 도달했어요. 이미지를 빼고 접수할 수 있어요.' };
          }
          var report = {
            id: 'R-Q' + state.nextReport++, kind: 'FULL', reporterId: req.reporterId, submittedById: req.submittedById,
            createdAt: nowKst(), defectId: null, defect: null, title: req.oneLine, maskedText: req.oneLine,
            detail: req.detail, business: req.business, symptom: req.symptom, extraSymptoms: req.extraSymptoms,
            finalType: req.finalType, urgent: req.urgent, customerScope: req.customerScope,
            incident: req.incident, contact: req.contact, contactTime: req.contactTime, evidence: req.evidence,
            department: quick.departments[req.business] || quick.departments.ETC, guideId: req.guideId,
            grade: intakeGrade(req), departmentCode: INTAKE_DEPARTMENT[req.business] || 'SALES_SUPPORT',
            hasAttachment: !!image, aiDraft: req.aiDraft ? draftRules.clean(req.aiDraft) : null,
            attemptedWorkaround: req.attemptedWorkaround,
            diagnostics: collectDiagnostics(req.diagnosticMode, validDate(req.diagnosticCapturedAt) ? req.diagnosticCapturedAt : nowKst())
          };
          if (report.aiDraft) report.aiDraftSummary = draftSummary(report);
          state.reports.push(storedReport(report, req.requestId));
          if (image) state.attachments[report.id] = image;
          return copy(report);
        }, !!image).then(function (result) {
          if (result.id) quickReports.set(result.id, copy(result));
          return result;
        });
      });
    },
    postQuickParticipation: function (defectId, reporterId, submittedById) {
      var d = ledgerDefects().find(function (item) { return item.id === defectId && item.published && item.status !== 'RESOLVED'; });
      if (!d) return ok(null);
      return store.update(function (state) {
        var existing = visibleReports(reporterId, state).find(function (r) {
          return r.reporterId === reporterId && r.kind === 'ME_TOO' && r.defectId === defectId;
        });
        if (existing) return existing;
        var report = { id: 'R-Q' + state.nextReport++, kind: 'ME_TOO', reporterId: reporterId,
          submittedById: submittedById, createdAt: nowKst(), defectId: d.id, finalType: d.type,
          department: quick.departments[((Q.defects || []).find(function (match) { return match.id === d.id; }) || {}).business],
          defect: publicDefect(d), guideId: d.id };
        state.reports.push(report);
        return report;
      }).then(ok);
    },
    postIntakeFollowup: function (id, userId, action, text) {
      if (!['ADD', 'STILL', 'RECURRED', 'URGENT', 'CANCEL'].includes(action) || (action === 'ADD' && !text)) return ok(null);
      if (containsPrivateValue(text)) return ok({ blocked: true });
      return store.update(function (state) {
        var report = visibleReports(userId, state).find(function (r) { return r.id === id; });
        if (!report) return null;
        if (action === 'CANCEL') {
          if (report.kind !== 'ME_TOO') return null;
          state.cancelled[id] = true;
          return { cancelled: true };
        }
        var entries = state.followups[id] || [];
        var entry = { id: id + ':' + entries.length, action: action, at: nowKst() };
        if (text) followupText.set(entry.id, text);
        entries.unshift(entry);
        state.followups[id] = entries;
        return { saved: true };
      }).then(ok);
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
    postAnswers: function (sessionId, req) {
      var a = I.answers || {};
      if (proto.llm === 'fail') return ok(a.fallback);
      var result = copy(a[caseOf()] || a.defect);
      var answers = (req && req.answers) || [];
      var facts = answers.filter(function (entry) { return entry.answer; }).map(function (entry) {
        var question = ((I.sessions[caseOf()] || {}).questions || []).find(function (q) { return q.slot === entry.slot; });
        return question ? question.text + ' ' + entry.answer : '';
      }).filter(Boolean);
      if (result.ticket) {
        result.ticket.symptomSummary = [req && req.oneLine, facts.length ? facts.join(' / ') : '추가 정보 확인 필요']
          .filter(Boolean).join(' · ');
        result.ticket.stepsToReproduce = [];
        result.ticket.expected = result.ticket.actual = null;
      }
      return ok(result);
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
      var word = norm(q.q), state = store.read();
      var list = ledgerDefects(state).filter(function (d) {
        return (!q.status || d.status === q.status) && (!q.grade || d.grade === q.grade) && (!q.type || d.type === q.type);
      }).map(function (d) {
        var x = copy(d);
        x.reports = linkedReports(d.id, state);
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
      var state = store.read();
      var d = ledgerDefects(state).find(function (x) { return x.id === id; });
      if (!d) return Promise.resolve(null);
      var x = copy(d);
      x.reports = linkedReports(id, state);
      x.statusHistory = copy((L.statusHistory || []).concat(state.history.map(historyView)).filter(function (h) { return h.defectId === id; })
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
      var list = ledgerReports(store.read()).filter(function (r) {
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
      var r = ledgerReports(store.read()).find(function (x) { return x.id === reportId; });
      if (!r) return Promise.resolve(null);
      var byId = function (id) { return ledgerDefects().find(function (d) { return d.id === id; }); };
      var res;
      if (proto.llm === 'fail') {
        var hits = ledgerDefects().filter(function (d) {
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
    /* POST /api/defects/{id}/reports — 담당자가 확정한 연결만 기록한다. */
    postLinkReport: function (defectId, reportId) {
      return store.update(function (state) {
        var report = ledgerReports(state).find(function (item) { return item.id === reportId; });
        if (!report || (report.defectId && report.defectId !== defectId) ||
            !ledgerDefects(state).some(function (d) { return d.id === defectId; })) return null;
        state.links[reportId] = defectId;
        return { defectId: defectId, reportId: reportId };
      }).then(ok);
    },
    postStatusPreview: function (id, req) {
      return ok(statusPreview(store.read(), id, req));
    },
    postStatus: function (id, req) {
      return store.update(function (state) {
        var existing = state.history.find(function (h) { return h.defectId === id && req.eventId && h.eventId === req.eventId; });
        if (existing) return deliveryResult(existing);
        var d = ledgerDefects(state).find(function (item) { return item.id === id; });
        if (!d || !ORDER.includes(req.to)) return { error: '상태를 다시 확인해 주세요.' };
        if (d.status === req.to) {
          var latest = state.history.slice().reverse().find(function (h) { return h.defectId === id; });
          return latest ? deliveryResult(latest) : { error: '이미 같은 상태예요.' };
        }
        if (d.status !== req.from) return { error: '상태가 바뀌었어요. 다시 열어 주세요.' };
        var resolution = req.to === 'RESOLVED' ? safeResolution(req.resolution) : null;
        if (req.to === 'RESOLVED' && !resolution) return { error: '개인정보 없이 공개할 해결 안내를 확인해 주세요.' };
        if (req.to === 'FIX_PLANNED' && !validDay(req.plannedFixDate)) return { error: '수정 예정일을 확인해 주세요.' };
        if (req.to === 'WONT_FIX' && !Object.hasOwn(REASON_TEXT, req.wontFixReasonCode)) return { error: '사유를 확인해 주세요.' };
        var preview = statusPreview(state, id, req);
        var sends = preview.notifiable && preview.recipients.length > 0;
        var event = { id: 'H-Q' + (state.history.length + 1), eventId: req.eventId || '', defectId: id,
          from: d.status, to: req.to, at: nowKst(), actorId: req.actorId || null,
          plannedFixDate: req.to === 'FIX_PLANNED' ? req.plannedFixDate : null,
          wontFixReasonCode: req.to === 'WONT_FIX' ? req.wontFixReasonCode : null,
          resolution: resolution, body: preview.body, recipients: preview.notifiable ? preview.recipients.map(function (r) {
            return { userId: r.userId, reportId: r.reportId };
          }) : [], delivery: sends ? (req.simulateFailure ? 'FAILED' : 'SENT') : 'NONE',
          attempts: sends ? 1 : 0 };
        state.history.push(event);
        return deliveryResult(event);
      }).then(ok);
    },
    retryStatusNotification: function (historyId) {
      return store.update(function (state) {
        var event = state.history.find(function (h) { return h.id === historyId; });
        if (!event) return null;
        if (event.delivery === 'FAILED') {
          event.delivery = 'SENT';
          event.attempts++;
        }
        return deliveryResult(event);
      }).then(ok);
    },
    getResolutionLabels: function () { return ok({ scope: RESOLUTION_SCOPE, action: RESOLUTION_ACTION }); }
  };

  function visibleReports(userId, state) {
    return (F.myReports || []).concat(state.reports.map(function (r) { return quickReports.get(r.id) || r; })).filter(function (r) {
      return !state.cancelled[r.id] && (r.reporterId === userId || r.submittedById === userId);
    });
  }
  var INTAKE_DEPARTMENT = { LOGIN: 'LOGIN_SUPPORT', SUBSCRIPTION: 'SUBSCRIPTION_IT', CUSTOMER_LOOKUP: 'CUSTOMER_IT',
    DESIGN: 'DESIGN_SUPPORT', CONTRACT_LOOKUP: 'CONTRACT_IT' };
  function intakeGrade(req) {
    if (req.finalType === 'USAGE') return null;
    if ((req.business === 'SUBSCRIPTION' && ['CANNOT_PROCEED', 'WRONG_SCREEN'].includes(req.symptom)) ||
        /서명|동의|설명의무|잘못된 문서/.test(req.oneLine)) return 'IMMEDIATE';
    return req.business === 'LOGIN' ? 'NORMAL' : 'BATCH';
  }
  function validAttachment(image) {
    return typeof image === 'string' && image.length <= 420000 &&
      /^data:image\/(?:png;base64,iVBOR|jpeg;base64,\/9j\/)[A-Za-z0-9+/]+={0,2}$/.test(image);
  }

  function draftSummary(report) {
    var draft = report.aiDraft, manual = report.incident || {}, detected = report.diagnostics.incident;
    return { customerReported: !!draft.customer, verifiedProvided: !!draft.verified,
      missing: draftRules.unknown(draft, !!(manual.screen || manual.date || manual.time ||
        manual.device && manual.device !== 'UNKNOWN' || detected.device || detected.screen || detected.at),
      !!((report.urgent || []).length || report.customerScope && report.customerScope !== 'UNKNOWN')) };
  }

  function storedReport(report, requestId) {
    var meta = I.metaForm || {}, options = quick.options || {}, incident = report.incident || {};
    var category = (meta.businesses || []).find(function (item) { return item.code === report.business; });
    var symptoms = (meta.symptoms || []).concat(options.symptoms || []).map(function (item) { return item.code; });
    var guide = (L.defects || []).find(function (d) { return d.published && d.id === report.guideId; });
    function option(key, value) {
      return (options[key] || []).some(function (item) { return item[0] === value; }) ? value : '';
    }
    return {
      id: report.id, requestId: requestId, kind: report.kind, reporterId: report.reporterId, submittedById: report.submittedById,
      createdAt: report.createdAt, defectId: null, title: (category ? category.label : '전산') + ' 오류 접수',
      business: category ? category.code : 'ETC', symptom: symptoms.includes(report.symptom) ? report.symptom : '',
      extraSymptoms: (report.extraSymptoms || []).filter(function (code) { return symptoms.includes(code); }),
      finalType: ['DEFECT', 'USAGE', 'IMPROVEMENT', 'UNCLASSIFIED'].includes(report.finalType) ? report.finalType : 'UNCLASSIFIED',
      grade: report.grade, departmentCode: report.departmentCode, hasAttachment: report.hasAttachment,
      hasAiDraft: !!report.aiDraft, aiDraftSummary: report.aiDraftSummary,
      urgent: (report.urgent || []).filter(function (code) { return option('urgency', code); }),
      customerScope: option('scope', report.customerScope), contact: option('contact', report.contact),
      contactTime: option('time', report.contactTime), department: report.department, diagnostics: report.diagnostics,
      guideId: guide ? guide.id : null,
      attemptedWorkaround: guide && guide.workaround === report.attemptedWorkaround ? guide.workaround : null,
      incident: { device: ['SAME', 'PC', 'PHONE', 'TABLET', 'UNKNOWN'].includes(incident.device) ? incident.device : '',
        date: validDay(incident.date) ? incident.date : '', time: /^\d{2}:\d{2}$/.test(incident.time) ? incident.time : '',
        screenProvided: !!incident.screen }
    };
  }
  function reportFollowups(state, id) {
    return (state.followups[id] || []).map(function (entry) {
      return Object.assign({}, entry, { text: followupText.get(entry.id) || '' });
    });
  }
  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(value) &&
      Number.isFinite(Date.parse(value));
  }
  function collectDiagnostics(mode, at) {
    var source = F.intakeDiagnostics || {};
    var screens = { MAIN: '메인 화면', SIGN_LINK: '고객 서명 링크' };
    var devices = { PC: '사무실 컴퓨터', PHONE: '고객 휴대폰' };
    var browsers = { CHROME: 'Chrome', MOBILE: '모바일 브라우저' };
    function pick(raw) {
      raw = raw || {};
      return {
        screen: screens[raw.screen] || null,
        device: devices[raw.device] || null,
        browser: browsers[raw.browser] && /^\d{1,3}\.\d{1,3}$/.test(raw.version) ? browsers[raw.browser] + ' ' + raw.version : null,
        at: validDate(raw.at) ? raw.at : null,
        errorCode: raw.errorCode === 'SFA-SIGN-LINK' ? raw.errorCode : null,
        action: raw.action === 'OPEN_LINK' ? '서명 링크 열기' : null
      };
    }
    return { capturedAt: at, failed: mode === 'fail',
      submission: pick(Object.assign({}, source.submission, { at: at })),
      incident: pick(mode === 'mobile' ? source.mobile : null) };
  }
  function nowKst() {
    var KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 19) + '+09:00';
  }

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
      var d = ledgerDefects().find(function (item) { return item.published && item.id === match.id; });
      if (d) {
        var notice = (L.fcNotices || []).find(function (n) { return n.defectId === d.id && n.status === 'APPROVED'; });
        return { outcome: 'MATCH', type: d.type, business: match.business, symptom: match.symptom,
          guidance: d.resolution ? d.resolution.change + ' ' + d.resolution.action : notice ? notice.approvedText : null,
          defect: { id: d.id, title: d.title, status: d.status, workaround: d.status === 'RESOLVED' ? null : d.workaround,
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

  /* 대장과 설계사 화면이 같은 가상 접수·상태 이력을 읽는다. */
  var L = F.ledger || {};
  var ORDER = ['RECEIVED', 'REPRODUCED', 'CAUSE_FOUND', 'WORKAROUND', 'FIX_PLANNED', 'RESOLVED', 'WONT_FIX'];
  var NOTIFY = ['WORKAROUND', 'FIX_PLANNED', 'RESOLVED', 'WONT_FIX'];
  var REASON_TEXT = { NEW_SFA: '새 시스템에서 고쳐질 예정이에요', WORKAROUND_OK: '임시 방법으로 충분해요',
    NOT_REPRODUCIBLE: '같은 문제가 다시 생기지 않아요', ETC: '담당자가 다른 이유를 확인했어요' };
  var RESOLUTION_SCOPE = { SFA: '영업지원시스템 전체', LINKED: '이 결함에 연결된 접수' };
  var RESOLUTION_ACTION = { RETRY: '기존 건을 다시 시도해 주세요.', RESEND: '기존 링크를 다시 보내 주세요.',
    NONE: '기존 건에 추가 작업은 필요 없어요.', UNKNOWN: '재시도 여부는 내 접수내역의 추가 내용에서 담당 창구에 확인해 주세요.' };
  function validDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)); }
  function safeResolution(raw) {
    if (!raw || raw.approved !== true || !validDate(raw.appliedAt) ||
        !Object.hasOwn(RESOLUTION_SCOPE, raw.scope) || !Object.hasOwn(RESOLUTION_ACTION, raw.action)) return null;
    var change = typeof raw.change === 'string' ? raw.change.trim() : '';
    if (!change || change.length > 300 || containsPrivateValue(change)) return null;
    return { appliedAt: raw.appliedAt, scope: RESOLUTION_SCOPE[raw.scope], change: change,
      action: RESOLUTION_ACTION[raw.action] };
  }
  function ledgerDefects(state) {
    state = state || store.read();
    var latest = new Map();
    state.history.forEach(function (event) { latest.set(event.defectId, event); });
    return (L.defects || []).map(function (d) {
      var h = latest.get(d.id);
      return h ? Object.assign({}, d, { status: h.to, updatedAt: h.at, plannedFixDate: h.plannedFixDate,
        wontFixReasonCode: h.wontFixReasonCode, wontFixReasonText: REASON_TEXT[h.wontFixReasonCode] || null,
        resolution: h.resolution, delivery: h.to === 'RESOLVED' ? deliveryResult(h) : null }) : d;
    });
  }
  function publicDefect(d, fallback) {
    if (!d) return fallback || null;
    return { id: d.id, title: d.title, status: d.status, workaround: d.status === 'RESOLVED' ? null : d.workaround,
      plannedFixDate: d.plannedFixDate, wontFixReasonCode: d.wontFixReasonCode,
      wontFixReasonText: d.wontFixReasonText, updatedAt: d.updatedAt };
  }
  function ledgerReports(state) {
    return (L.reports || []).concat(state.reports).filter(function (r) { return !state.cancelled[r.id]; }).map(function (r) {
      return Object.assign({}, r, { defectId: state.links[r.id] || r.defectId,
        maskedText: r.maskedText || (r.kind === 'FULL' ? r.title : null), followups: reportFollowups(state, r.id) });
    });
  }
  function historyView(h) {
    return { id: h.id, defectId: h.defectId, from: h.from, to: h.to, at: h.at, actorId: h.actorId,
      reason: REASON_TEXT[h.wontFixReasonCode] || null, notifiable: h.delivery === 'SENT' };
  }
  function deliveryResult(h) {
    return { defectId: h.defectId, historyId: h.id, status: h.to, notificationCount: h.recipients.length,
      delivery: h.delivery, attempts: h.attempts, recipientId: h.recipients.length ? h.recipients[0].userId : null };
  }
  function sentNotifications(state) {
    return state.history.filter(function (event) { return event.delivery === 'SENT'; }).flatMap(function (event) {
      return event.recipients.map(function (r) {
        return { id: 'N-' + event.id + '-' + r.userId, historyId: event.id, defectId: event.defectId, reportId: r.reportId,
          recipientId: r.userId, at: event.at, bodySnapshot: event.body, resolution: event.resolution };
      });
    });
  }
  function statusPreview(state, id, req) {
    req = req || {};
    var d = ledgerDefects(state).find(function (entry) { return entry.id === id; });
    var back = req.from === 'WONT_FIX' || ORDER.indexOf(req.to) < ORDER.indexOf(req.from);
    var notifiable = !!d && !back && NOTIFY.includes(req.to);
    var seen = new Set(), recipients = [];
    if (notifiable) linkedReports(id, state).forEach(function (r) {
      if (seen.has(r.reporterId)) return;
      seen.add(r.reporterId);
      recipients.push({ userId: r.reporterId, reportId: r.id, name: r.reporter ? r.reporter.name : '',
        branchName: r.reporter ? r.reporter.branchName : '' });
    });
    var date = validDay(req.plannedFixDate) ? Number(req.plannedFixDate.slice(5, 7)) + '월 ' + Number(req.plannedFixDate.slice(8, 10)) + '일' : '';
    var body = notifiable ? (L.statusTemplates || {})[req.to] || '' : '';
    var resolution = req.to === 'RESOLVED' ? safeResolution(req.resolution) : null;
    if (d) body = body.replace('{title}', d.title).replace('{date}', date)
      .replace('{reason}', REASON_TEXT[req.wontFixReasonCode] || req.wontFixReasonText || '');
    if (resolution) {
      body = d.title + ' · 수정 완료. ' + resolution.appliedAt.slice(0, 10) + ' ' +
        resolution.appliedAt.slice(11, 16) + ' 적용. ' + resolution.change + ' ' + resolution.action;
    }
    return { notifiable: notifiable, recipientCount: recipients.length, body: body, recipients: recipients, resolution: resolution };
  }
  function norm(v) { return String(v == null ? '' : v).trim().toLowerCase().slice(0, 40); }
  function has(text, word) { return text != null && String(text).toLowerCase().indexOf(word) >= 0; }
  function withReporter(r) {
    var x = copy(r);
    var u = (F.users || []).find(function (v) { return v.id === r.reporterId; });
    var b = u && (L.branches || []).find(function (v) { return v.id === u.branchId; });
    x.reporter = u ? { id: u.id, name: u.name, branchId: u.branchId, branchName: b ? b.name : '' } : null;
    return x;
  }
  function linkedReports(defectId, state) {
    return ledgerReports(state || store.read()).filter(function (r) { return r.defectId === defectId; }).map(withReporter)
      .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
  }
})();
