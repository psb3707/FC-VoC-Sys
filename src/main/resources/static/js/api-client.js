/* 화면이 쓰는 유일한 데이터 창구 (docs/05-data-api-spec.md, CLAUDE.md 프론트 단계 규칙).
   프론트 단계: 서버 통신 없이 js/fixtures/ 의 고정값만 돌려준다.
   백엔드 연결 때는 이 파일의 데이터 출처만 바꾸고, 함수 이름과 응답 키는 그대로 둔다. */
(function () {
  'use strict';
  var F = window.FIXTURES || {};
  var I = F.intake || {};
  var Q = F.intakeAssistant || {};
  var store = window.IntakeDemoStore;
  var quickReports = new Map(), followupText = new Map(), statusNotes = new Map(), failedSubmissions = new Set(), failedAttachments = new Set(),
    failedResumptions = new Set();
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
      return Promise.resolve((F.users || []).map(function (u) {
        var branch = (L.branches || []).find(function (b) { return b.id === u.branchId; });
        return Object.assign(copy(u), { branchName: branch ? branch.name : '' });   // 홈 머리글(ADR-029 결정 10)
      }));
    },
    /* S1 메인 화면 가상 데이터 (화면 시안 전용, ADR-012. 대응하는 백엔드 API 없음) */
    getSfaHome: function () {
      return Promise.resolve(copy(F.sfaHome || {}));
    },
    /* GET /api/notifications?userId=  -> NotificationLog[] (알림 미리보기 내역, 최신 순).
       ADR-025: audience(REPORTER 신고자 / SUBMITTER 대리 접수자)·kind(STATUS / PROXY_RECEIPT)·reportId 를 함께 내린다 */
    getNotifications: function (userId) {
      var state = store.read();
      var list = allNotifications(state).filter(function (n) {
        return n.recipientId === userId;
      }).map(function (n) { return Object.assign({}, n, { read: isRead(n, state), summary: n.summary || summaryOfNotice(n, state) }); });
      list.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      return Promise.resolve(copy(list));
    },
    watchIntakeUpdates: function (fn) { store.watch(fn); },
    markNotificationRead: function (id, userId) {
      return store.update(function (state) {
        var item = allNotifications(state).find(function (n) {
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
          item.statusHistory = publicHistory(id, state);
          item.linkedAt = (state.linkedAt || {})[r.id] || null;
          if (d && d.resolution) {   // 참조 ID·환경·버전은 FC·관리자에게 내리지 않는다(ADR-029)
            item.resolution = { appliedAt: d.resolution.appliedAt, scope: d.resolution.scope, change: d.resolution.change, action: d.resolution.action };
          }
          // 현장 확인: 지금 해결 회차의 답과, 이력에만 남는 모든 답
          item.fieldVerification = d && d.resolutionEventId ? latestAnswer(state, r.id, d.resolutionEventId) : null;
          item.fieldHistory = state.verifications.filter(function (v) { return v.reportId === r.id && v.defectId === id; })
            .map(function (v) { return { result: v.result, at: v.at, resolutionEventId: v.resolutionEventId }; });
        }
        item.followups = reportFollowups(state, r.id);
        // ADR-025: 누구의 문의·누가 접수했는지, FC 업무 재개 회신
        var submitter = r.submittedById || submitterOf(r.id) || r.reporterId;
        item.reporter = userBrief(r.reporterId);
        item.submittedBy = userBrief(submitter);
        item.workResumption = resumptionOf(r.id, state);
        return item;
      });
      var when = function (r) {
        return [r.createdAt, r.defect && r.defect.updatedAt, r.followups[0] && r.followups[0].at].filter(Boolean).sort().pop();
      };
      list.sort(function (a, b) { return when(a) < when(b) ? 1 : -1; });
      return Promise.resolve(copy(list));
    },
    /* POST /api/reports/{id}/work-resumption {userId, result: RESUMED|STILL} (REQ-KN-05, ADR-025).
       신고자 본인만 답한다. 대표 결함 상태와 알림은 바꾸지 않는다. STILL 은 같은 접수의 후속 기록("아직 안 돼요")도 남긴다. */
    /* ADR-027 결정 10: 같은 신고·같은 신고자의 마지막 회신과 결과가 같거나 같은 requestId 면 새 기록 없이 기존 기록(duplicate).
       임시조치를 시도하지 않은 접수(workaroundState NONE·OFFERED, 연결된 결함에 임시 방법 없음)는 회신을 받지 않는다 */
    postWorkResumption: function (reportId, userId, result, requestId, simulateFailure) {
      if (!['RESUMED', 'STILL'].includes(result)) return ok(null);
      if (simulateFailure && !failedResumptions.has(reportId)) {   // 시연 resume=fail: 첫 기록만 실패
        failedResumptions.add(reportId);
        return ok(null);
      }
      return store.update(function (state) {
        var report = visibleReports(userId, state).find(function (r) { return r.id === reportId && r.reporterId === userId; });
        if (!report) return null;
        var linkedId = state.links[reportId] || report.defectId;
        var linked = linkedId ? ledgerDefects(state).find(function (d) { return d.id === linkedId; }) : null;
        var tried = window.IntakeFacts.clean(report).workaroundState === 'TRIED';
        if (!tried && !(linked && linked.workaround && linked.status !== 'RESOLVED')) return null;
        var last = resumptionOf(reportId, state);
        if (last && (last.result === result || (requestId && last.requestId === requestId))) {
          return Object.assign({ saved: true, duplicate: true }, last);
        }
        var at = nowKst();
        state.resumption[reportId] = requestId ? { result: result, at: at, requestId: requestId } : { result: result, at: at };
        if (result === 'STILL') {
          var entries = state.followups[reportId] || [];
          entries.unshift({ id: reportId + ':' + entries.length, action: 'STILL', at: at });
          state.followups[reportId] = entries;
        }
        return { saved: true, result: result, at: at };
      }).then(ok);
    },
    /* GET /api/reports/branch?managerId= (REQ-KN-06, ADR-025). 관리자와 같은 지점 FC의 신고 + 관리자가 대신 접수한 신고.
       FC가 적은 설명(maskedText)은 내가 대신 접수한 건(byMe)에만 내린다. notice: 그 FC가 이 대표 결함의 마지막 알림을 읽었는지 */
    getBranchReports: function (managerId) {
      var me = (F.users || []).find(function (u) { return u.id === managerId && u.role === 'MANAGER'; });
      if (!me) return ok([]);
      var state = store.read(), defects = ledgerDefects(state), notices = allNotifications(state);
      var labels = ((I.metaForm || {}).businesses || []);
      var list = ledgerReports(state).filter(function (r) {
        var reporter = (F.users || []).find(function (u) { return u.id === r.reporterId; });
        var byMe = r.submittedById === me.id && r.reporterId !== me.id;
        return byMe || (reporter && reporter.role === 'FC' && reporter.branchId === me.branchId);
      }).map(function (r) {
        var byMe = r.submittedById === me.id && r.reporterId !== me.id;
        var d = r.defectId ? defects.find(function (x) { return x.id === r.defectId; }) : null;
        var mine = notices.filter(function (n) {
          return n.recipientId === r.reporterId && n.defectId && n.defectId === r.defectId && n.audience !== 'SUBMITTER';
        }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
        var business = labels.find(function (b) { return b.code === r.business; });
        return { id: r.id, kind: r.kind, business: r.business, businessLabel: business ? business.label : '전산',
          createdAt: r.createdAt, defectId: r.defectId || null, defect: d ? publicDefect(d) : null,
          reporter: userBrief(r.reporterId), byMe: byMe, maskedText: byMe ? r.maskedText || null : null,
          workResumption: resumptionOf(r.id, state),
          // ADR-029: 지금 해결 회차의 현장 확인
          fieldVerification: d && d.resolutionEventId ? latestAnswer(state, r.id, d.resolutionEventId) : null,
          // ADR-027: FC 업무 상황 계산용 코드(대리 접수는 저장할 때 workOutcome·supportNeeded 가 null)
          workaroundState: window.IntakeFacts.clean(r).workaroundState, workOutcome: r.workOutcome || null,
          supportNeeded: window.IntakeFacts.clean(r).supportNeeded,
          notice: !mine.length ? 'NONE' : isRead(mine[0], state) ? 'READ' : 'UNREAD' };
      });
      list.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
      return ok(list);
    },

    /* 신고자·접수자 정보 (ADR-028). 이름·역할·지점명은 저장하지 않고 ID로 조회한다.
       보는 사람: FC는 자기 자신만, 관리자는 자신과 같은 지점 FC, 영업·IT는 모두. 그 밖에는 null */
    getReporterContext: function (viewerId, reporterId, submittedById) {
      var viewer = (F.users || []).find(function (u) { return u.id === viewerId; });
      var reporter = (F.users || []).find(function (u) { return u.id === reporterId; });
      if (!viewer || !reporter) return ok(viewer ? { error: 'USER' } : null);
      var allowed = viewer.id === reporter.id || viewer.id === submittedById || ['SALES', 'IT'].includes(viewer.role) ||
        (viewer.role === 'MANAGER' && reporter.role === 'FC' && reporter.branchId === viewer.branchId);
      if (!allowed) return ok(null);
      var who = identityOf(reporterId, submittedById || reporterId);
      return ok(who.error ? { error: who.error } : who);
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
          business: match.business, symptom: match.symptom, plannedFixDate: d.plannedFixDate, conditions: copy(match.conditions || {}),
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
      if (!req.requestId) return ok({ failed: true });
      var previous = store.read().reports.find(function (r) { return r.requestId === req.requestId; });
      if (previous) return ok(quickReports.get(previous.id) || previous);
      // ADR-028 결정 2: 신고자·접수자·지점이 맞지 않으면 저장하지 않는다(백엔드는 접수자를 인증 세션에서 정함)
      if (identityOf(req.reporterId, req.submittedById).error) return ok({ identityError: true });
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
          var facts = window.IntakeFacts.clean(req), own = req.reporterId === req.submittedById;
          var report = {
            id: 'R-Q' + state.nextReport++, kind: 'FULL', reporterId: req.reporterId, submittedById: req.submittedById,
            createdAt: nowKst(), defectId: null, defect: null, title: req.oneLine, maskedText: req.oneLine,
            detail: req.detail, business: req.business, symptom: req.symptom, extraSymptoms: req.extraSymptoms,
            finalType: req.finalType, urgent: req.urgent, customerScope: req.customerScope,
            incident: req.incident, contact: req.contact, contactTime: req.contactTime, evidence: req.evidence,
            department: quick.departments[req.business] || quick.departments.ETC, guideId: req.guideId,
            grade: intakeGrade(req), departmentCode: INTAKE_DEPARTMENT[req.business] || 'SALES_SUPPORT',
            hasAttachment: !!image, aiDraft: req.aiDraft ? draftRules.clean(req.aiDraft) : null,
            attemptedWorkaround: facts.attemptAllowed ? req.attemptedWorkaround : null,
            // ADR-026: 상담 인계 코드. 대리 접수는 FC 대신 업무 재개를 정하지 않으므로 workOutcome 을 두지 않는다
            // ADR-027: 임시조치 상태·추가 지원 필요. 추가 지원 필요도 FC 본인만 정한다
            origin: facts.origin, conditions: facts.conditions, factSources: facts.factSources,
            workaroundState: facts.workaroundState, workOutcome: own ? facts.workOutcome : null,
            supportNeeded: own ? facts.supportNeeded : null,
            suggestedDefectId: suggestedFor(req.suggestedDefectId, req.business),
            diagnostics: collectDiagnostics(req.diagnosticMode, validDate(req.diagnosticCapturedAt) ? req.diagnosticCapturedAt : nowKst())
          };
          if (report.aiDraft) report.aiDraftSummary = draftSummary(report);
          state.reports.push(storedReport(report, req.requestId));
          if (image) state.attachments[report.id] = image;
          proxyReceipt(state, report);
          return copy(report);
        }, !!image).then(function (result) {
          if (result.id) quickReports.set(result.id, copy(result));
          return result;
        });
      });
    },
    /* ADR-027 결정 6: 같은 오류로 간편 알리기. FC가 공개 결함을 직접 확인했을 때만 부른다.
       extra = {requestId, incident:{device}, conditions, urgent, workaroundState, workOutcome, supportNeeded, factSources} (허용 코드만 남김).
       같은 사용자의 활성 참여나 그 결함에 연결된 접수가 있으면 새로 만들지 않고 그 접수(duplicate) */
    postQuickParticipation: function (defectId, reporterId, submittedById, extra) {
      var d = ledgerDefects().find(function (item) { return item.id === defectId && item.published && item.status !== 'RESOLVED'; });
      if (!d) return ok(null);
      if (identityOf(reporterId, submittedById).error) return ok({ identityError: true });   // ADR-028 결정 2
      extra = extra || {};
      return store.update(function (state) {
        var again = extra.requestId && state.reports.find(function (r) { return r.requestId === extra.requestId; });
        if (again) return Object.assign({ duplicate: true }, again);
        var existing = visibleReports(reporterId, state).find(function (r) {
          return r.reporterId === reporterId && r.kind === 'ME_TOO' && r.defectId === defectId;
        }) || ledgerReports(state).find(function (r) { return r.reporterId === reporterId && r.defectId === defectId; });
        if (existing) return Object.assign({ duplicate: true }, copy(existing), { defect: publicDefect(d) });
        var scenario = (Q.defects || []).find(function (match) { return match.id === d.id; }) || {};
        var facts = window.IntakeFacts.clean(extra), own = reporterId === submittedById, incident = extra.incident || {};
        var report = { id: 'R-Q' + state.nextReport++, requestId: extra.requestId || null, kind: 'ME_TOO', reporterId: reporterId,
          submittedById: submittedById, createdAt: nowKst(), defectId: d.id, finalType: d.type,
          business: scenario.business || null, symptom: scenario.symptom || null,
          department: quick.departments[scenario.business],
          defect: publicDefect(d), guideId: d.id,
          origin: extra.origin === 'ASSISTANT' ? 'ASSISTANT' : 'FORM', conditions: facts.conditions, factSources: facts.factSources,
          urgent: (extra.urgent || []).filter(function (code) { return (quick.options.urgency || []).some(function (p) { return p[0] === code; }); }),
          incident: { device: window.IntakeFacts.isDevice(incident.device) ? incident.device : '' },
          workaroundState: facts.workaroundState, workOutcome: own ? facts.workOutcome : null, supportNeeded: own ? facts.supportNeeded : null,
          attemptedWorkaround: facts.attemptAllowed && facts.workaroundState === 'TRIED' && d.workaround ? d.workaround : null };
        state.reports.push(report);
        proxyReceipt(state, report);
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
        x.fieldFailCount = verified(d) ? fieldSummaryOf(d, x.reports, state).counts.STILL_FAIL : 0;   // ADR-029
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
        .sort(function (a, b) { return a.at.localeCompare(b.at); }));
      x.fieldVerification = verified(d) ? fieldSummaryOf(d, x.reports, state) : null;   // ADR-029
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
       연결은 하지 않는다(담당자가 postLinkReport).
       ADR-026: 고정 응답이 없는 새 신고(R-Q…)는 규칙 후보(llmOutcome=RULE, similarity=null, reasons=추천 근거). */
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
      } else if ((L.similar || {})[reportId]) {
        res = copy(L.similar[reportId]);
      } else if (store.read().reports.some(function (x) { return x.id === reportId; })) {
        res = { llmOutcome: 'RULE', candidates: ruleCandidates(r) };   // ADR-026 결정 8: 시연 중 만든 새 신고
      } else {
        res = { llmOutcome: 'OK', candidates: [] };
      }
      res.reportId = reportId;
      res.needsHumanReview = true;
      var seen = new Set();   // 없는 결함 ID·같은 후보는 버린다(07번 ⑤ 후처리)
      res.candidates = (res.candidates || []).filter(function (c) {
        if (!byId(c.defectId) || seen.has(c.defectId)) return false;
        seen.add(c.defectId);
        return true;
      }).slice(0, 3).map(function (c) {
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
        if (!report.defectId) state.linkedAt[reportId] = nowKst();   // 담당자가 연결한 시각
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
        var resolution = req.to === 'RESOLVED' ? safeResolution(req.resolution, d) : null;
        if (resolution && resolution.verification && !isStaff(req.actorId)) return { error: '영업·IT 담당자만 검증 완료를 기록할 수 있어요.' };
        var back = isBackChange(d.status, req.to);
        if (back && !Object.hasOwn(BACK_REASON, req.backReason)) return { error: '되돌리는 이유를 골라 주세요.' };   // ADR-029 결정 7
        if (req.to === 'RESOLVED' && !resolution) return { error: '개인정보 없이 공개할 해결 안내를 확인해 주세요.' };
        if (req.to === 'FIX_PLANNED' && !validDay(req.plannedFixDate)) return { error: '수정 예정일을 확인해 주세요.' };
        if (req.to === 'WONT_FIX' && !Object.hasOwn(REASON_TEXT, req.wontFixReasonCode)) return { error: '사유를 확인해 주세요.' };
        var preview = statusPreview(state, id, req);
        var sends = preview.notifiable && preview.recipients.length > 0;
        var event = { id: 'H-Q' + (state.history.length + 1), eventId: req.eventId || '', defectId: id,
          from: d.status, to: req.to, at: nowKst(), actorId: req.actorId || null,
          plannedFixDate: req.to === 'FIX_PLANNED' ? req.plannedFixDate : null,
          wontFixReasonCode: req.to === 'WONT_FIX' ? req.wontFixReasonCode : null,
          resolution: resolution, backReason: back ? req.backReason : null, summary: preview.summary,
          body: preview.body, recipients: preview.notifiable ? preview.recipients.map(function (r) {
            return r.audience === 'SUBMITTER' ? { userId: r.userId, reportId: null, audience: 'SUBMITTER', body: r.body, summary: r.summary }
              : { userId: r.userId, reportId: r.reportId, audience: 'REPORTER' };
          }) : [], delivery: sends ? (req.simulateFailure ? 'FAILED' : 'SENT') : 'NONE',
          attempts: sends ? 1 : 0 };
        state.history.push(event);
        // 담당자 자유 입력은 이 페이지 메모리에만(ADR-021)
        var note = String(req.note || '').trim();
        if (note && !containsPrivateValue(note)) statusNotes.set(event.id + event.eventId, note.slice(0, 300));
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
    /* ---- ADR-029 수정 뒤 현장 확인 ----
       업무 재개(WorkResumption)와 다른 기록. 신고자 본인, 지금 해결 회차(검증 있음)만. 결함 상태·알림을 바꾸지 않는다.
       백엔드 단계에서는 userId 를 인증 세션으로 정한다 */
    postFieldVerification: function (reportId, userId, resolutionEventId, result, requestId) {
      if (!FIELD_RESULT.includes(result)) return ok(null);
      return store.update(function (state) {
        var report = ledgerReports(state).find(function (r) { return r.id === reportId && r.reporterId === userId; });
        if (!report || !report.defectId) return null;
        var d = ledgerDefects(state).find(function (x) { return x.id === report.defectId; });
        if (!d || !verified(d) || d.resolutionEventId !== resolutionEventId) return null;
        var round = state.verifications.filter(function (v) { return v.reportId === reportId && v.resolutionEventId === resolutionEventId; });
        var same = requestId && round.find(function (v) { return v.requestId === requestId; });
        var last = round[round.length - 1];
        if (same || (last && last.result === result)) return Object.assign({ duplicate: true }, same || last);
        var seq = state.verifications.length + 1, at = nowKst();
        var entry = { id: 'FV-' + seq, seq: seq, reportId: reportId, defectId: d.id, resolutionEventId: resolutionEventId,
          result: result, at: at, actorId: userId, requestId: requestId || null };
        state.verifications.push(entry);
        if (result === 'STILL_FAIL') {   // 미확인은 후속 조치를 만들지 않는다
          var entries = state.followups[reportId] || [];
          entries.unshift({ id: reportId + ':' + entries.length, action: 'FIELD_FAIL', at: at });
          state.followups[reportId] = entries;
        }
        return entry;
      }).then(ok);
    },
    /* 문제 지속 답이 있던 신고에 영업·IT가 남기는 후속 조사 코드. FC의 답은 고치지 않는다 */
    postFieldInvestigation: function (reportId, actorId, resolutionEventId, code) {
      if (!isStaff(actorId) || !Object.hasOwn(INVESTIGATION, code)) return ok(null);
      return store.update(function (state) {
        var report = ledgerReports(state).find(function (r) { return r.id === reportId; });
        var d = report && report.defectId ? ledgerDefects(state).find(function (x) { return x.id === report.defectId; }) : null;
        if (!d || !verified(d) || d.resolutionEventId !== resolutionEventId) return null;
        function ofRound(x) { return x.reportId === reportId && x.resolutionEventId === resolutionEventId; }
        if (!state.verifications.some(function (v) { return ofRound(v) && v.result === 'STILL_FAIL'; })) return null;
        var last = state.investigations.filter(ofRound).pop();
        if (last && last.code === code) return Object.assign({ duplicate: true }, last);
        var entry = { id: 'FI-' + (state.investigations.length + 1), reportId: reportId, defectId: d.id,
          resolutionEventId: resolutionEventId, code: code, at: nowKst(), actorId: actorId };
        state.investigations.push(entry);
        return entry;
      }).then(ok);
    },
    getResolutionLabels: function () {
      return ok({ scope: RESOLUTION_SCOPE, action: RESOLUTION_ACTION, environment: VERIFY_ENVIRONMENT, backReason: BACK_REASON, investigation: INVESTIGATION });
    }
  };

  function visibleReports(userId, state) {
    var shown = F.myReports || [];
    // ADR-029 결정 10: 알림을 받는 시드 신고자도 자기 접수 카드를 열 수 있게 대장의 시드 신고를 함께 읽는다
    var seeds = (L.reports || []).filter(function (r) { return !shown.some(function (x) { return x.id === r.id; }); });
    return shown.concat(seeds, state.reports.map(function (r) { return quickReports.get(r.id) || r; })).filter(function (r) {
      return !state.cancelled[r.id] && (r.reporterId === userId || r.submittedById === userId);
    });
  }

  /* ---- ADR-025 역할별 알림·업무 재개 ---- */
  function allNotifications(state) {
    return (F.notifications || []).concat(sentNotifications(state), state.notices || []);
  }
  function isRead(n, state) { return !!(state.read[n.id] || n.readAt); }
  function userBrief(id) {
    var u = (F.users || []).find(function (x) { return x.id === id; });
    return u ? { id: u.id, name: u.name, role: u.role } : null;
  }
  function submitterOf(reportId) {
    var r = (L.reports || []).find(function (x) { return x.id === reportId; });
    return r ? r.submittedById : null;
  }
  function resumptionOf(reportId, state) {
    if (state.resumption && state.resumption[reportId]) return copy(state.resumption[reportId]);
    var r = (L.reports || []).find(function (x) { return x.id === reportId; });
    return r && r.workResumption ? copy(r.workResumption) : null;
  }
  /* 관리자가 FC 대신 접수·참여하면 FC에게 접수 알림 1건(02번 4-1절). 대리 접수자는 완료 화면을 봤으므로 받지 않는다.
     본문에는 업무 이름만 넣고 설명 원문은 넣지 않는다(ADR-021: 자유 입력 원문은 저장소에 두지 않음). */
  function proxyReceipt(state, report) {
    var by = userBrief(report.submittedById), to = userBrief(report.reporterId);
    if (!by || !to || by.id === to.id) return;
    var match = (Q.defects || []).find(function (m) { return m.id === report.defectId; });
    var code = report.business || (match ? match.business : '');
    var business = (((I.metaForm || {}).businesses) || []).find(function (b) { return b.code === code; });
    var label = business ? business.label : '전산';
    var body = report.kind === 'ME_TOO'
      ? label + ' 오류에 같은 오류 참여가 기록됐어요 — ' + by.name + ' 관리자가 대신 알렸어요. 진행 상황은 내 접수내역에서 볼 수 있어요'
      : label + ' 문의가 접수됐어요 — ' + by.name + ' 관리자가 대신 접수했어요. 담당자 확인을 기다리고 있어요';
    state.notices.push({ id: 'N-P-' + report.id, defectId: report.kind === 'ME_TOO' ? report.defectId : null, historyId: null,
      reportId: report.id, recipientId: to.id, audience: 'REPORTER', kind: 'PROXY_RECEIPT', bodySnapshot: body,
      channel: 'PREVIEW', at: report.createdAt });
  }
  var INTAKE_DEPARTMENT = { LOGIN: 'LOGIN_SUPPORT', SUBSCRIPTION: 'SUBSCRIPTION_IT', CUSTOMER_LOOKUP: 'CUSTOMER_IT',
    DESIGN: 'DESIGN_SUPPORT', CONTRACT_LOOKUP: 'CONTRACT_IT', CUSTOMER_CONSENT: 'CONSENT_IT' };
  function intakeGrade(req) {
    if (req.finalType === 'USAGE') return null;
    if ((req.business === 'SUBSCRIPTION' && ['CANNOT_PROCEED', 'WRONG_SCREEN'].includes(req.symptom)) ||
        (req.business === 'CUSTOMER_CONSENT' && ['CANNOT_PROCEED', 'CANNOT_INPUT'].includes(req.symptom)) ||   // ADR-027(02번 1절)
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

  function publishedId(id) {
    return (L.defects || []).some(function (d) { return d.published && d.id === id; }) ? id : null;
  }
  /* ADR-027 결정 7: AI 문의가 안내한 사례는 그 결함의 업무가 접수 업무와 같을 때만 남긴다 */
  function suggestedFor(id, business) {
    var scenario = (Q.defects || []).find(function (m) { return m.id === id; });
    return publishedId(id) && scenario && scenario.business === business ? id : null;
  }
  function storedReport(report, requestId) {
    var meta = I.metaForm || {}, options = quick.options || {}, incident = report.incident || {};
    var facts = window.IntakeFacts.clean(report);
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
      attemptedWorkaround: facts.attemptAllowed && guide && guide.workaround === report.attemptedWorkaround ? guide.workaround : null,
      // ADR-026: 허용 목록을 다시 거친 코드만 공유 저장소에 둔다(대화 원문·고객 정보 없음)
      origin: facts.origin, conditions: facts.conditions, workOutcome: report.workOutcome ? facts.workOutcome : null, factSources: facts.factSources,
      workaroundState: facts.workaroundState, supportNeeded: report.supportNeeded ? facts.supportNeeded : null,   // ADR-027
      suggestedDefectId: suggestedFor(report.suggestedDefectId, report.business),
      incident: { device: window.IntakeFacts.isDevice(incident.device) ? incident.device : '',
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
  var SCREENS = { MAIN: '메인 화면', SIGN_LINK: '고객 서명 링크' };
  var SUBMIT_DEVICES = { PC: 'PC', PHONE: '휴대폰', TABLET: '태블릿' };
  /* ADR-028 결정 3: 접수하는 브라우저가 스스로 알려 주는 기기 유형·브라우저 종류·주 버전만. User-Agent 전체·주소·쿠키·토큰은 남기지 않는다 */
  function submissionEnvironment() {
    var deviceType = null, browser = null;
    try {
      var nav = window.navigator || {}, ua = String(nav.userAgent || ''), data = nav.userAgentData;
      if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) deviceType = 'TABLET';
      else if ((data && data.mobile === true) || /iPhone|Android.*Mobile/.test(ua)) deviceType = 'PHONE';
      else if ((data && data.mobile === false) || /Windows NT|Macintosh|X11|CrOS/.test(ua)) deviceType = 'PC';
      var brands = data && Array.isArray(data.brands) ? data.brands : [];
      [['Microsoft Edge', 'Edge'], ['Google Chrome', 'Chrome'], ['HeadlessChrome', 'Chrome'], ['Chromium', 'Chrome']].some(function (pair) {
        var hit = brands.find(function (b) { return b && b.brand === pair[0] && /^\d{1,3}$/.test(b.version); });
        if (hit) browser = pair[1] + ' ' + hit.version;
        return !!hit;
      });
      if (!browser) {
        [[/Edg\/(\d{1,3})\./, 'Edge'], [/(?:Headless)?Chrome\/(\d{1,3})\./, 'Chrome'], [/Firefox\/(\d{1,3})\./, 'Firefox'],
          [/Version\/(\d{1,3})[.\d]* .*Safari/, 'Safari']].some(function (pair) {
          var m = ua.match(pair[0]);
          if (m) browser = pair[1] + ' ' + m[1];
          return !!m;
        });
      }
    } catch (e) { deviceType = browser = null; }
    return { deviceType: deviceType, browser: browser };
  }
  function collectDiagnostics(mode, at) {
    var source = F.intakeDiagnostics || {};
    var env = mode === 'fail-submission' ? { deviceType: null, browser: null } : submissionEnvironment();
    /* 발생 환경은 진단 이벤트가 준 값만(프론트 단계: diagnostics=mobile 시연 이벤트). 접수 환경 값을 복사하지 않는다 */
    var raw = mode === 'mobile' ? source.mobile || {} : {};
    var event = {
      screen: SCREENS[raw.screen] || null, screenCode: SCREENS[raw.screen] ? raw.screen : null,
      device: raw.device === 'PHONE' ? '고객 휴대폰' : null,
      browser: raw.browser === 'MOBILE' && /^\d{1,3}\.\d{1,3}$/.test(raw.version) ? '모바일 브라우저 ' + raw.version : null,
      at: validDate(raw.at) ? raw.at : null,
      errorCode: raw.errorCode === 'SFA-SIGN-LINK' ? raw.errorCode : null,
      action: raw.action === 'OPEN_LINK' ? '서명 링크 열기' : null
    };
    event.source = Object.keys(event).some(function (k) { return event[k]; }) ? 'DEMO_CONTEXT' : null;
    return { capturedAt: at, failed: mode === 'fail',
      submission: { screen: SCREENS.MAIN, screenCode: 'MAIN', device: SUBMIT_DEVICES[env.deviceType] || null, deviceType: env.deviceType,
        browser: env.browser, at: at, errorCode: null, action: null, source: 'BROWSER_CAPTURED' },
      incident: event };
  }
  /* ADR-028 결정 2: 신고자·접수자가 있고, 지점이 있고, 대신 접수면 같은 지점 관리자 → FC */
  var ROLE_LABEL = { FC: 'FC', MANAGER: '관리자', SALES: '영업 담당', IT: 'IT 담당' };
  function identityOf(reporterId, submittedById) {
    var users = F.users || [], branches = L.branches || [];
    var r = users.find(function (u) { return u.id === reporterId; }), s = users.find(function (u) { return u.id === submittedById; });
    if (!r || !s) return { error: 'USER' };
    var rb = branches.find(function (b) { return b.id === r.branchId; }), sb = branches.find(function (b) { return b.id === s.branchId; });
    if (!rb || !sb) return { error: 'BRANCH' };
    if (r.id !== s.id && !(s.role === 'MANAGER' && r.role === 'FC' && r.branchId === s.branchId)) return { error: 'PROXY' };
    function brief(u, b) { return { id: u.id, name: u.name, role: u.role, roleLabel: ROLE_LABEL[u.role] || u.role, branchId: b.id, branchName: b.name }; }
    return { reporter: brief(r, rb), submitter: brief(s, sb), proxied: r.id !== s.id };
  }
  function nowKst() {
    var KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 19) + '+09:00';
  }

  // 시연용 형식 차단. 이름·주소 등은 입력하지 않도록 안내하며, 전체 마스킹은 백엔드 단계에서 수행한다.
  function containsPrivateValue(text) {
    return /(?:\d[ .()-]*){6}|[^\s@]+@[^\s@]+\.[^\s@]+/.test(text) ||
      /(주민|뒷자리|앞자리|생년월일)\S{0,4}\s*[:：]?\s*\d/.test(text);   // ADR-027 결정 11: 본인확인 값 조각
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
        // ADR-026: 처리 중인 결함이면 시나리오의 확인 항목(최대 3개)과 임시 방법 결과 질문을 붙인다. 정규식은 여기서만 쓴다
        var active = d.status !== 'RESOLVED' && d.status !== 'WONT_FIX';
        // ADR-027: 문장에서 아는 항목은 모두 넘기고(묻지 않음), 모르는 항목은 앞에서부터 최대 3개만 묻는다
        var unknown = 0;
        var checks = active ? (match.checks || []).map(function (c) {
          var hit = (c.known || []).find(function (rule) { return rule[0].test(question); });
          return { key: c.key, text: c.text, stage: c.stage === 'guide' ? 'guide' : 'report', known: hit ? hit[1] : null,
            choices: c.choices.map(function (pair) { return { code: pair[0], label: pair[1] }; }) };
        }).filter(function (c) { return c.known || ++unknown <= 3; }) : [];
        return { outcome: 'MATCH', type: d.type, business: match.business, symptom: match.symptom,
          guidance: d.resolution ? d.resolution.change + ' ' + d.resolution.action : notice ? notice.approvedText : null,
          defect: { id: d.id, title: d.title, status: d.status, verification: publicDefect(d).verification, workaround: d.status === 'RESOLVED' ? null : d.workaround,
            plannedFixDate: d.plannedFixDate, wontFixReasonText: d.wontFixReasonText },
          checks: checks, resumeQuestion: active && d.workaround ? match.resumeQuestion || null : null,
          // ADR-027 결정 4: 승인된 임시조치가 없으면 업무를 이어가기 어려운지 묻는다
          supportQuestion: active && !d.workaround ? match.supportQuestion || null : null,
          blockedNote: active && !d.workaround ? match.blockedNote || null : null,
          department: quick.departments[match.business] || null };
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
  function safeResolution(raw, d) {
    if (!raw || raw.approved !== true || !validDate(raw.appliedAt) ||
        !Object.hasOwn(RESOLUTION_SCOPE, raw.scope) || !Object.hasOwn(RESOLUTION_ACTION, raw.action)) return null;
    var change = typeof raw.change === 'string' ? raw.change.trim() : '';
    if (!change || change.length > 300 || containsPrivateValue(change) || hasAddress(change)) return null;
    var verification = null;
    if (raw.verification) {
      verification = safeVerification(raw.verification, raw.appliedAt, d);
      if (!verification) return null;
    }
    return { appliedAt: raw.appliedAt, scope: RESOLUTION_SCOPE[raw.scope], change: change,
      action: RESOLUTION_ACTION[raw.action], verification: verification };
  }
  /* ADR-029 결정 1. 검증 시각은 적용 뒤·미래 아님, 공개 안내는 짧게, 참조는 형식만. 프론트 단계의 검증은 모두 가상 */
  var VERIFY_ENVIRONMENT = { SIM_TEST: '가상 시험 환경', SIM_PROD_LIKE: '가상 운영 유사 환경' };
  var BACK_REASON = { FIELD_RECHECK: '현장 문제 재검토', REDEPLOY: '재배포 준비', MISRECORDED: '잘못 기록', ETC: '그 밖의 이유' };
  var INVESTIGATION = { STARTED: '조사 시작', NEED_INFO: '추가 정보 필요', NOT_REPRODUCED: '재현 안 됨', RESIDUAL_SUSPECTED: '잔존 가능성' };
  var FIELD_RESULT = ['CONFIRMED_OK', 'STILL_FAIL', 'NOT_TESTED'];
  var GUIDE_MAX = 30;   // 알림 두 줄(320px 팝업)에 드는 길이
  function hasAddress(text) { return /:\/\/|www\./i.test(text); }
  function safeReference(value) {
    if (!value) return '';
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(value) && !containsPrivateValue(value) ? value : null;
  }
  function safeVerification(raw, appliedAt, d) {
    if (raw.result !== 'VERIFIED' || !validDate(raw.verifiedAt)) return null;
    var when = Date.parse(raw.verifiedAt);
    if (when < Date.parse(appliedAt) || when > Date.now()) return null;
    var guide = typeof raw.usageGuide === 'string' ? raw.usageGuide.trim() : '';
    if (!guide || guide.length > GUIDE_MAX || containsPrivateValue(guide) || hasAddress(guide)) return null;
    var refId = safeReference(raw.refId), version = safeReference(raw.version);
    if (refId === null || version === null) return null;
    if (raw.environment && !Object.hasOwn(VERIFY_ENVIRONMENT, raw.environment)) return null;
    return { result: 'VERIFIED', verifiedAt: raw.verifiedAt, usageGuide: guide,
      workaroundEnded: !!(d && d.workaround) && raw.workaroundEnded === true,
      refId: refId || null, version: version || null, environment: raw.environment || null, simulated: true };
  }
  function verified(d) { return !!(d && d.status === 'RESOLVED' && d.resolution && d.resolution.verification); }
  function isStaff(id) { return (F.users || []).some(function (u) { return u.id === id && ['SALES', 'IT'].includes(u.role); }); }
  function isBackChange(from, to) { return from === 'WONT_FIX' || ORDER.indexOf(to) < ORDER.indexOf(from); }
  function latestAnswer(state, reportId, eventId) {
    var last = state.verifications.filter(function (v) { return v.reportId === reportId && v.resolutionEventId === eventId; }).pop();
    return last ? { result: last.result, at: last.at, seq: last.seq } : null;
  }
  /* 사람 수는 FC별 최신 실제 답으로(답 없는 다른 신고는 덮지 않음), 신고별 문제 지속은 따로 */
  function fieldSummaryOf(d, reports, state) {
    var byFc = new Map(), perReport = [];
    reports.forEach(function (r) {
      var answer = latestAnswer(state, r.id, d.resolutionEventId);
      var investigation = state.investigations.filter(function (x) { return x.reportId === r.id && x.resolutionEventId === d.resolutionEventId; }).pop();
      perReport.push({ reportId: r.id, reporterId: r.reporterId, result: answer ? answer.result : null, at: answer ? answer.at : null,
        investigation: investigation ? { code: investigation.code, at: investigation.at } : null });
      var fc = byFc.get(r.reporterId);
      if (!fc) {
        fc = { id: r.reporterId, name: r.reporter ? r.reporter.name : r.reporterId, reportIds: [], answer: null };
        byFc.set(r.reporterId, fc);
      }
      fc.reportIds.push(r.id);
      if (answer && (!fc.answer || answer.seq > fc.answer.seq)) fc.answer = answer;
    });
    var counts = { CONFIRMED_OK: 0, STILL_FAIL: 0, NOT_TESTED: 0 };
    var fcs = Array.from(byFc.values()).map(function (fc) {
      var result = fc.answer ? fc.answer.result : 'NOT_TESTED';
      counts[result]++;
      return { id: fc.id, name: fc.name, reportIds: fc.reportIds, result: result, at: fc.answer ? fc.answer.at : null };
    });
    return { resolutionEventId: d.resolutionEventId, reporterCount: fcs.length, reportCount: reports.length, counts: counts, fcs: fcs,
      reports: perReport, failReports: perReport.filter(function (r) { return r.result === 'STILL_FAIL'; }) };
  }
  /* FC에게 내리는 상태 이력: 처리자·내부 사유·참조 없이 */
  function publicHistory(id, state) {
    var base = (L.defects || []).find(function (d) { return d.id === id; }) || {};
    var seeds = (L.statusHistory || []).filter(function (h) { return h.defectId === id; }).map(function (h) {
      return { id: h.id, from: h.from, to: h.to, at: h.at, plannedFixDate: h.to === 'FIX_PLANNED' ? base.plannedFixDate : null, verified: false };
    });
    return seeds.concat(state.history.filter(function (h) { return h.defectId === id; }).map(function (h) {
      var v = h.resolution && h.resolution.verification;
      return { id: h.id, from: h.from, to: h.to, at: h.at, plannedFixDate: h.plannedFixDate, verified: !!v, verifiedAt: v ? v.verifiedAt : null };
    }));
  }
  /* ADR-029 결정 3 알림 요약. 보낼 때의 상태로 만들고 저장한다. 날짜는 수정 예정에만 */
  function dayLabel(day) { return validDay(day) ? Number(day.slice(5, 7)) + '월 ' + Number(day.slice(8, 10)) + '일' : ''; }
  function noticeSummary(d, to, plannedFixDate, verification, audience, count) {
    var out = { title: d.shortTitle || d.title };
    function put(status, headline, line, action) { out.status = status; out.headline = headline; out.line = line; out.action = action; }
    if (to === 'WORKAROUND') {
      put('임시 방법 안내', d.workaround ? '안내된 임시 방법으로 진행해 주세요' : '담당자 안내를 확인해 주세요',
        d.workaround || '현재 확인된 임시조치는 없어요', '방법 확인');
    } else if (to === 'FIX_PLANNED') {
      put('수정 예정', dayLabel(plannedFixDate) ? dayLabel(plannedFixDate) + ' 수정 예정' : '수정 예정',
        d.workaround ? '그때까지 안내된 임시 방법을 써 주세요' : '현재 확인된 임시조치는 없어요', '처리경과 확인');
    } else if (to === 'RESOLVED' && verification) {
      put('수정 완료', verification.usageGuide, '배포·검증 완료(가상). 계속되면 접수에서 알려 주세요', '정상 이용 확인');
    } else if (to === 'RESOLVED') {
      put('해결', '해결로 처리됐어요', '기존 건 처리 방법은 상세에서 확인해 주세요', '처리경과 확인');
    } else {
      put('수정하지 않음', '이번 결함은 별도로 수정하지 않아요', '사유와 이용 방법은 상세에서 확인해 주세요', '사유 확인');
    }
    if (audience === 'SUBMITTER') {
      out.headline = (to === 'FIX_PLANNED' && dayLabel(plannedFixDate) ? dayLabel(plannedFixDate) + ' 수정 예정 · ' : '') + '대신 접수 ' + count + '건';
      out.line = to === 'RESOLVED' && verification ? 'FC의 정상 이용 확인 결과를 살펴봐 주세요'
        : to === 'WORKAROUND' ? 'FC가 업무를 이어갈 수 있는지 확인해 주세요' : 'FC에게도 알렸어요';
      out.action = 'FC 현황 확인';
    }
    return out;
  }
  /* 요약이 없는 시드·대리 접수 알림은 이력과 신고에서 만든다 */
  function summaryOfNotice(n, state) {
    if (n.kind === 'PROXY_RECEIPT') {
      var r = ledgerReports(state).find(function (x) { return x.id === n.reportId; }) || {};
      var business = (((I.metaForm || {}).businesses) || []).find(function (b) { return b.code === r.business; });
      var by = userBrief(r.submittedById), joined = r.kind === 'ME_TOO';
      return { title: (business ? business.label : '전산') + (joined ? ' 오류' : ' 문의'), status: joined ? '참여 기록' : '접수 완료',
        headline: (by ? by.name + ' ' : '') + '관리자가 대신 ' + (joined ? '알렸어요' : '접수했어요'),
        line: '진행 상황은 내 접수내역에서 알려 드려요', action: '접수 확인' };
    }
    var h = (L.statusHistory || []).concat(state.history).find(function (x) { return x.id === n.historyId; });
    var d = (L.defects || []).find(function (x) { return x.id === n.defectId; });
    if (!h || !d) return { title: '접수 경과', status: '안내', headline: '처리경과가 바뀌었어요', line: '', action: '처리경과 확인' };
    var count = Number((/(\d+)건/.exec(n.bodySnapshot || '') || [])[1] || 1);
    return noticeSummary(d, h.to, h.plannedFixDate || d.plannedFixDate, h.resolution && h.resolution.verification, n.audience, count);
  }
  function ledgerDefects(state) {
    state = state || store.read();
    var latest = new Map();
    state.history.forEach(function (event) { latest.set(event.defectId, event); });
    return (L.defects || []).map(function (d) {
      var h = latest.get(d.id);
      return h ? Object.assign({}, d, { status: h.to, updatedAt: h.at, plannedFixDate: h.plannedFixDate,
        wontFixReasonCode: h.wontFixReasonCode, wontFixReasonText: REASON_TEXT[h.wontFixReasonCode] || null,
        resolution: h.resolution, resolutionEventId: h.to === 'RESOLVED' ? h.id : null,
        delivery: h.to === 'RESOLVED' ? deliveryResult(h) : null }) : d;
    });
  }
  function publicDefect(d, fallback) {
    if (!d) return fallback || null;
    var v = verified(d) ? d.resolution.verification : null;
    return { id: d.id, title: d.title, shortTitle: d.shortTitle || null, verifyTarget: d.verifyTarget || null,
      resolutionEventId: d.resolutionEventId || null,
      verification: v ? { result: v.result, verifiedAt: v.verifiedAt, usageGuide: v.usageGuide, simulated: v.simulated,
        workaroundEnded: v.workaroundEnded, workaround: d.workaround && !v.workaroundEnded ? d.workaround : null } : null,
      status: d.status, workaround: d.status === 'RESOLVED' ? null : d.workaround,
      plannedFixDate: d.plannedFixDate, wontFixReasonCode: d.wontFixReasonCode,
      wontFixReasonText: d.wontFixReasonText, updatedAt: d.updatedAt };
  }
  function ledgerReports(state) {
    return (L.reports || []).concat(state.reports).filter(function (r) { return !state.cancelled[r.id]; }).map(function (r) {
      return Object.assign({}, r, { defectId: state.links[r.id] || r.defectId,
        maskedText: r.maskedText || (r.kind === 'FULL' ? r.title : null), followups: reportFollowups(state, r.id),
        workResumption: resumptionOf(r.id, state) });
    });
  }
  function historyView(h) {
    return { id: h.id, defectId: h.defectId, from: h.from, to: h.to, at: h.at, actorId: h.actorId,
      reason: REASON_TEXT[h.wontFixReasonCode] || BACK_REASON[h.backReason] || null, plannedFixDate: h.plannedFixDate,
      verification: h.resolution ? h.resolution.verification || null : null, note: statusNotes.get(h.id + h.eventId) || null,
      notifiable: h.delivery === 'SENT' };
  }
  function deliveryResult(h) {
    return { defectId: h.defectId, historyId: h.id, status: h.to, notificationCount: h.recipients.length,
      delivery: h.delivery, attempts: h.attempts, recipientId: h.recipients.length ? h.recipients[0].userId : null };
  }
  function sentNotifications(state) {
    return state.history.filter(function (event) { return event.delivery === 'SENT'; }).flatMap(function (event) {
      return event.recipients.map(function (r) {
        var submitter = r.audience === 'SUBMITTER';
        return { id: 'N-' + event.id + '-' + r.userId, historyId: event.id, defectId: event.defectId, reportId: r.reportId,
          recipientId: r.userId, at: event.at, bodySnapshot: submitter ? r.body : event.body, summary: submitter ? r.summary : event.summary,
          audience: submitter ? 'SUBMITTER' : 'REPORTER', kind: 'STATUS', resolution: submitter ? null : event.resolution };
      });
    });
  }
  function statusPreview(state, id, req) {
    req = req || {};
    var d = ledgerDefects(state).find(function (entry) { return entry.id === id; });
    var back = req.from === 'WONT_FIX' || ORDER.indexOf(req.to) < ORDER.indexOf(req.from);
    var notifiable = !!d && !back && NOTIFY.includes(req.to);
    /* 02번 4-1절(ADR-025): ① 신고자(REPORTER) 전원 ② 신고자와 다른 대리 접수자(SUBMITTER). 한 변경에 한 사람 1건, ①이 우선 */
    var seen = new Map(), recipients = [];
    var linked = notifiable ? linkedReports(id, state) : [];
    linked.forEach(function (r) {
      if (seen.has(r.reporterId)) return;
      var entry = { userId: r.reporterId, reportId: r.id, audience: 'REPORTER', name: r.reporter ? r.reporter.name : '',
        branchName: r.reporter ? r.reporter.branchName : '' };
      seen.set(r.reporterId, entry);
      recipients.push(entry);
    });
    linked.forEach(function (r) {
      var by = r.submittedById;
      if (!by || by === r.reporterId) return;
      var known = seen.get(by);
      if (known) { if (known.audience === 'SUBMITTER') known.count++; return; }
      var u = (F.users || []).find(function (x) { return x.id === by; });
      var b = u && (L.branches || []).find(function (x) { return x.id === u.branchId; });
      var entry = { userId: by, reportId: null, audience: 'SUBMITTER', count: 1, name: u ? u.name : '', branchName: b ? b.name : '' };
      seen.set(by, entry);
      recipients.push(entry);
    });
    var date = validDay(req.plannedFixDate) ? Number(req.plannedFixDate.slice(5, 7)) + '월 ' + Number(req.plannedFixDate.slice(8, 10)) + '일' : '';
    var reason = REASON_TEXT[req.wontFixReasonCode] || req.wontFixReasonText || '';
    function fill(template) {
      if (!d || !template) return '';
      if (!d.workaround) template = template.replace(': {workaround}', '. 내 접수내역에서 확인해 주세요')
        .replace('그때까지는 안내된 임시 방법을 써 주세요', '임시 방법은 아직 없어요. 급하면 내 접수내역에 긴급 사정을 남겨 주세요');   // ADR-027
      return template.replace('{title}', d.title).replace('{date}', date).replace('{reason}', reason)
        .replace('{workaround}', d.workaround || '');
    }
    var body = notifiable ? fill((L.statusTemplates || {})[req.to]) : '';
    var resolution = d && req.to === 'RESOLVED' ? safeResolution(req.resolution, d) : null;
    var v = resolution && resolution.verification;
    if (v && notifiable) {
      body = d.title + ' · 수정·배포 검증 완료(가상). ' + v.usageGuide + (v.workaroundEnded ? ' 이전 임시 방법은 이제 쓰지 않아도 돼요.' : '') +
        ' 문제가 계속되면 해당 접수에서 알려 주세요.';
    } else if (resolution) {
      body = d.title + ' · 해결. ' + resolution.appliedAt.slice(0, 10) + ' ' +
        resolution.appliedAt.slice(11, 16) + ' 적용. ' + resolution.change + ' ' + resolution.action;
    }
    recipients.forEach(function (r) {
      if (r.audience !== 'SUBMITTER') return;
      r.body = v ? '대신 접수한 문의 ' + r.count + '건 · ' + d.title + ' — 수정·배포 검증 완료(가상). FC의 정상 이용 확인 결과를 살펴봐 주세요'
        : fill((L.submitterTemplates || {})[req.to]).replace('{count}', String(r.count));
      r.summary = noticeSummary(d, req.to, req.plannedFixDate, v, 'SUBMITTER', r.count);
    });
    var submitters = recipients.filter(function (r) { return r.audience === 'SUBMITTER'; }).length;
    return { notifiable: notifiable, recipientCount: recipients.length, reporterCount: recipients.length - submitters,
      submitterCount: submitters, body: body, recipients: recipients, resolution: resolution,
      summary: notifiable ? noticeSummary(d, req.to, req.plannedFixDate, v, 'REPORTER') : null };
  }
  function norm(v) { return String(v == null ? '' : v).trim().toLowerCase().slice(0, 40); }
  function has(text, word) { return text != null && String(text).toLowerCase().indexOf(word) >= 0; }
  function withReporter(r) {
    var x = copy(r);
    var u = (F.users || []).find(function (v) { return v.id === r.reporterId; });
    var b = u && (L.branches || []).find(function (v) { return v.id === u.branchId; });
    x.reporter = u ? { id: u.id, name: u.name, role: u.role, branchId: u.branchId, branchName: b ? b.name : '' } : null;
    x.submittedBy = r.submittedById && r.submittedById !== r.reporterId ? userBrief(r.submittedById) : null;   // 대신 접수(ADR-025)
    return x;
  }
  /* ADR-026 결정 8: 업무+증상이 같거나 AI 문의가 안내한 사례만 후보. 맞은 근거가 많은 순, 점수·비슷함 정도는 만들지 않는다 */
  function ruleCandidates(r) {
    var meta = I.metaForm || {};
    var symptoms = (meta.symptoms || []).concat((quick.options || {}).symptoms || []);
    function label(list, code) { var hit = (list || []).find(function (x) { return x.code === code; }); return hit ? hit.label : code; }
    return ledgerDefects().map(function (d) {
      var scenario = (Q.defects || []).find(function (m) { return m.id === d.id; }) || {};
      var both = [scenario].concat(linkedReports(d.id)).some(function (x) {
        return !!r.business && x.business === r.business && !!r.symptom && x.symptom === r.symptom;
      });
      var matched = [], reasons = [];
      if (both) {
        matched.push('BUSINESS', 'SYMPTOM');
        reasons.push('업무: ' + label(meta.businesses, r.business), '증상: ' + label(symptoms, r.symptom));
      }
      var same = Object.keys(scenario.conditions || {}).filter(function (key) {
        return (r.conditions || {})[key] === scenario.conditions[key];
      });
      if (same.length) {
        matched.push('CONDITION');
        same.forEach(function (key) {
          reasons.push('관련 조건: ' + window.IntakeFacts.CONDITIONS[key].label + ' ' + window.IntakeFacts.conditionLabel(key, r.conditions[key]));
        });
      }
      if (r.attemptedWorkaround && r.attemptedWorkaround === d.workaround) {
        matched.push('WORKAROUND');
        reasons.push('시도한 조치: 이 결함의 임시 방법');
      }
      if (r.suggestedDefectId === d.id && scenario.business === r.business) {   // ADR-027 결정 7
        matched.push('SUGGESTED');
        reasons.push('AI 문의: 안내한 사례');
      }
      if (!both && matched.indexOf('SUGGESTED') < 0) return null;
      return { defectId: d.id, similarity: null, matched: matched, reasons: reasons, reason: reasons.join(' · ') };
    }).filter(Boolean).sort(function (a, b) { return b.matched.length - a.matched.length; });
  }
  function linkedReports(defectId, state) {
    return ledgerReports(state || store.read()).filter(function (r) { return r.defectId === defectId; }).map(withReporter)
      .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
  }
})();
