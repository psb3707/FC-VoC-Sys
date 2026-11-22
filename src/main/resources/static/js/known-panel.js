/* S3 오류 현황·내 접수내역 (docs/06-ui-spec.md 5절, ADR-015, REQ-KN-01·02, REQ-NT-01).
   프론트 단계: 가상 접수와 후속 기록은 같은 탭 메모리에서만 유지한다.
   상태는 주소 # 뒤에 둔다(06번 11절). S1 키(role, user, popup, notice, demo)에 더해
     board=known          공지 카드에서 "알려진 오류·내 신고" 탭 선택 → 공지 목록 자리에 요약 줄
     panel=known          S3 패널 열림 (panel=intake 인 S2 접수 패널과 동시에 열리지 않음)
     tab=known|mine       패널 전환 탭 (없으면 known)
     item=D-…|R-…         이동할 카드 (알려진 오류는 결함 ID, 내 신고는 신고 ID)
   진입: 요약 줄 클릭 → 그 항목의 탭, 알림 팝업 항목(data-kn-defect) 클릭 → [내 신고]의 그 신고. */
(function () {
  'use strict';
  var A = window.ApiClient;
  var H = window.SfaHash;
  var $ = function (id) { return document.getElementById(id); };

  /* 02번 3절 상태 단계. 화면 문구는 쉬운 말(06번 1절): "재현 확인" → "문제 확인" */
  var STAGES = [['RECEIVED', '접수'], ['REPRODUCED', '문제 확인'], ['CAUSE_FOUND', '원인 파악'],
    ['WORKAROUND', '임시조치'], ['FIX_PLANNED', '수정 예정'], ['RESOLVED', '해결']];
  var WONT_FIX = 'WONT_FIX', WONT_FIX_LABEL = '수정하지 않음';
  var REASON = { NEW_SFA: '새 시스템에서 해결', WORKAROUND_OK: '우회법으로 충분', NOT_REPRODUCIBLE: '다시 해봐도 생기지 않음', ETC: '기타' };
  var SUMMARY_MINE = 2, SUMMARY_KNOWN = 2;   // 공지 카드 높이(308px)에 48px 줄 4개

  var known = [], users = [];
  var cache = { userId: null, mine: [], alarms: [], team: [] };
  var opener = null, lastView = null, feedback = null, posting = false;
  var T = window.NoticeTracks;
  var FOLLOWUP = { ADD: '추가 내용', STILL: '아직 안 돼요', RECURRED: '다시 발생했어요', URGENT: '긴급 사정 추가',
    FIELD_FAIL: '수정 뒤에도 문제가 있어요' };
  var FOLLOWUP_CHIPS = ['ADD', 'RECURRED', 'URGENT'];   // "아직 안 돼요"는 업무 재개 회신에서 남긴다(ADR-025)
  var RESUME = { RESUMED: '진행했어요', STILL: '아직 안 돼요' };
  var VERIFY = [['CONFIRMED_OK', '정상 진행했어요'], ['STILL_FAIL', '아직 문제가 있어요'], ['NOT_TESTED', '아직 확인하지 못했어요']];   // ADR-029
  var NOTICE_STATE = { READ: '알림 확인함', UNREAD: '알림 아직 안 봄', NONE: '받은 알림 없음' };
  var URGENCY = { CONSULTING: '고객 상담 중', BLOCKED: '청약 진행 불가', DEADLINE: '오늘 처리 마감' };

  /* ---- 작은 도우미 ---- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'cls') e.className = v; else e.setAttribute(k, v === true ? '' : v);
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
  function rows(list, cls) {
    return el('dl', { cls: 'pn-rows' + (cls ? ' ' + cls : '') }, list.filter(Boolean).map(function (r) {
      return el('div', null, [el('dt', null, [r[0]]), el('dd', null, [r[1]])]);
    }));
  }
  function fmtDate(iso) { return parseInt(iso.slice(5, 7), 10) + '월 ' + parseInt(iso.slice(8, 10), 10) + '일'; }
  function fmtWhen(iso) { return fmtDate(iso) + ' ' + iso.slice(11, 16); }
  function mmdd(iso) { return iso.slice(5, 7) + '.' + iso.slice(8, 10); }

  /* ---- 상태 ---- */
  function read() {
    var st = H.read();
    st.tab = st.tab === 'mine' ? 'mine' : st.tab === 'team' && st.role === 'MANAGER' ? 'team' : 'known';   // team: 관리자만(ADR-025)
    return st;
  }
  function tabsOf(st) { return st.role === 'MANAGER' ? ['known', 'mine', 'team'] : ['known', 'mine']; }
  function go(patch) {
    var before = location.hash;
    H.update(patch);
    if (location.hash === before) render();
  }
  function currentUser(st) {
    return users.filter(function (u) { return u.id === st.user && u.role === st.role; })[0] ||
      users.filter(function (u) { return u.role === st.role; })[0] || null;
  }
  /* 패널이 열리면 같은 탭에서 접수한 내용과 후속 기록을 다시 받는다. */
  function load(st) {
    var me = currentUser(st), id = me ? me.id : null;
    if (id === cache.userId && st.panel !== 'known') return Promise.resolve();
    return Promise.all([A.getMyReports(id), A.getNotifications(id),
      me && me.role === 'MANAGER' ? A.getBranchReports(id) : []]).then(function (r) {
      cache = { userId: id, mine: r[0] || [], alarms: r[1] || [], team: r[2] || [] };
    });
  }

  function statusOf(r) { return r.defect ? r.defect.status : 'RECEIVED'; }
  /* 제목은 내가 쓴 말 기준(ADR-025). "나도 겪었어요"처럼 쓴 말이 없으면 대표 결함 제목 */
  function titleOf(r) { return r.maskedText || r.title || (r.defect ? r.defect.title : '제목 없음'); }
  function stageLabel(code) {
    if (code === WONT_FIX) return WONT_FIX_LABEL;
    var s = STAGES.filter(function (x) { return x[0] === code; })[0];
    return s ? s[1] : code;
  }
  function stageIndex(code) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i][0] === code) return i;
    return -1;
  }
  function reasonOf(d) { return d.wontFixReasonText || REASON[d.wontFixReasonCode] || ''; }
  function planOf(d) {
    if (d.status === WONT_FIX) return ['고치지 않는 이유', reasonOf(d)];
    if (d.plannedFixDate) return ['고칠 예정', fmtDate(d.plannedFixDate)];
    return null;
  }

  /* ---- 공지 카드 요약 줄 (진입점: 기존 공지 목록 줄 모양, data-a11y="sfa") ---- */
  function paintSummary(st) {
    var ul = $('board');
    if (st.board !== 'known') return;
    ul.innerHTML = '';
    var lines = cache.mine.slice(0, SUMMARY_MINE).map(function (r) {
      return { tab: 'mine', id: r.id, title: '[내 접수] ' + titleOf(r), side: T.tag(r.defect) };
    }).concat(known.slice(0, SUMMARY_KNOWN).map(function (k) {
      return { tab: 'known', id: k.id, title: '[알려진 오류] ' + k.title,
        side: k.status === WONT_FIX ? WONT_FIX_LABEL : k.plannedFixDate ? mmdd(k.plannedFixDate) + ' 수정 예정' : stageLabel(k.status) };
    }));
    if (!lines.length) {
      ul.appendChild(el('li', { 'data-a11y': 'sfa', cls: 'kn-sum' }, [el('span', { cls: 'b-title' }, ['오류 현황과 내 접수내역이 비어 있어요'])]));
      return;
    }
    lines.forEach(function (l) {
      ul.appendChild(el('li', { 'data-a11y': 'sfa', cls: 'kn-sum' }, [
        el('button', { type: 'button', cls: 'kn-sum-btn', 'data-kn-tab': l.tab, 'data-kn-item': l.id, 'aria-haspopup': 'dialog' }, [
          el('span', { cls: 'b-title' }, [l.title]), el('span', { cls: 'b-date' }, [l.side])])]));
    });
  }

  /* ---- 패널 ---- */
  /* 임시 방법의 순서와 고객 안내 문구(있을 때). 두 갈래 진행 표시 ①에 붙인다 */
  function guideSteps(d) {
    var g = d && d.workaround && d.status !== 'RESOLVED' ? d.guide : null;
    if (!g || (!g.steps && !g.customerMessage)) return null;
    return el('div', { cls: 'pq-actions' }, [
      g.steps ? el('ol', { cls: 'pq-guide-steps' }, g.steps.map(function (step) {
        return el('li', null, [step]);
      })) : null,
      g.customerMessage ? el('div', { cls: 'pq-customer-note' }, [
        el('p', null, [g.customerMessage]),
        el('button', { type: 'button', cls: 'pn-btn-2', 'data-copy-guide': '' }, ['고객 안내 복사']),
        el('p', { role: 'status' })]) : null]);
  }
  function knownView(st) {
    var cards = known.map(function (k) {
      return el('li', { cls: 'pn-card kn-card' + (st.item === k.id ? ' is-target' : ''), 'data-id': k.id }, [
        el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title', tabindex: '-1' }, [k.title]),
          el('span', { cls: 'pn-tag' }, [T.tag(k)])]),
        T.view(k, { after: guideSteps(k) })]);
    });
    return [el('h3', { tabindex: '-1' }, ['오류 현황']),
      el('p', { cls: 'pn-lead' }, ['업무를 이어갈 수 있는 임시 방법과 수정 일정을 확인해 보세요.']),
      cards.length ? el('ul', { cls: 'pn-plain' }, cards)
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', null, ['지금 알려진 오류가 없어요'])]),
      el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['같은 문제를 겪고 계신가요?']),
        '전산 오류 접수에서 업무를 고르면 관련 오류에 참여하거나 새로 접수할 수 있어요.'])])];
  }

  function recordName(h) {
    if (h.to === 'RESOLVED' && h.verified) return '배포·검증 완료(가상)';
    return h.to === 'WORKAROUND' ? '임시 방법 안내' : stageLabel(h.to);
  }
  /* 내 접수의 기록된 단계(ADR-029): 접수(또는 참여)·담당자 확인(담당자가 연결한 신고만)·대표 결함에 기록된 단계를 시각 순으로.
     지금 = 대표 결함의 현재 상태(내 접수보다 앞선 기록일 수 있다). 연결 시각이 없는 시드는 접수 바로 뒤에 둔다 */
  function progress(r) {
    var list = [{ name: r.kind === 'ME_TOO' ? '같은 오류 참여' : '접수', at: r.createdAt }];
    if (r.defect) {
      if (r.kind !== 'ME_TOO') list.push({ name: '담당자 확인', at: r.linkedAt });
      T.recorded(r.statusHistory).forEach(function (h) {
        if (h.to === 'RECEIVED') return;
        list.push({ name: recordName(h) + (h.at < r.createdAt ? ' (접수 전부터)' : ''), at: h.at, now: h.to === r.defect.status });   // 내 접수보다 앞선 결함 기록
      });
      list.sort(function (a, b) { return (a.at || r.createdAt).localeCompare(b.at || r.createdAt); });
    }
    return T.steps(list);
  }
  function verifyLabel(code) {
    var hit = VERIFY.filter(function (v) { return v[0] === code; })[0];
    return hit ? hit[1] : '아직 답 없음';
  }
  /* 을/를: 끝 글자 받침 */
  function eul(word) { var c = word.charCodeAt(word.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? '을' : '를'; }
  /* 수정 뒤 현장 확인(ADR-029 결정 2): 검증된 해결, 신고자 본인만. 업무 재개 회신과 다른 기록 */
  function verifyView(r, me) {
    var d = r.defect;
    if (!d || d.status !== 'RESOLVED' || !d.verification) return null;
    var answer = r.fieldVerification;
    if (!me || me.id !== r.reporterId) {
      return el('p', { cls: 'kn-resume-status' }, ['FC 현장 확인 · ' + (answer ? verifyLabel(answer.result) + ' (' + fmtWhen(answer.at) + ')' : '확인 전')]);
    }
    var target = d.verifyTarget || '화면';
    var said = !answer ? '알림을 읽은 것만으로는 확인으로 남지 않아요.'
      : answer.result === 'CONFIRMED_OK' ? fmtWhen(answer.at) + ' · 정상 진행으로 남겼어요.'
      : answer.result === 'STILL_FAIL' ? fmtWhen(answer.at) + ' · 문제가 있다고 남겼어요. IT가 확인해요. 어떤 상황인지 더 남겨 주세요.'
      : fmtWhen(answer.at) + ' · 확인 전으로 남겼어요. 확인한 뒤 다시 골라 주세요.';
    return el('div', { cls: 'kn-resume kn-verify', 'data-verify-event': d.resolutionEventId }, [
      el('p', { cls: 'nt-q' }, ['수정된 ' + target + eul(target) + ' 정상적으로 이용할 수 있나요?']),
      el('ul', { cls: 'pn-chips', 'aria-label': '수정 뒤 현장 확인' }, VERIFY.map(function (v) {
        return el('li', null, [el('button', { type: 'button', cls: 'pn-chip', 'data-verify': v[0],
          'aria-pressed': String(!!answer && answer.result === v[0]) }, [v[1]])]);
      })),
      el('p', { cls: 'kn-resume-status', role: 'status', tabindex: '-1', 'data-verify-status': '' }, [said]),
      answer && answer.result === 'STILL_FAIL'
        ? el('button', { type: 'button', cls: 'pn-btn-2', 'data-verify-add': '' }, ['추가 상황 남기기']) : null]);
  }
  /* D 상세 이력(접힘): 상태·일정 변경과 현장 확인. 처리자·내부 사유는 없다 */
  function historyOf(r, me) {
    if (!r.defect) return null;
    var own = r.kind === 'ME_TOO' ? '같은 오류 참여' : me && me.id === r.reporterId ? '내 접수' : '접수';
    // 결함의 첫 접수는 다른 사람의 신고일 수 있어 이 신고의 접수 시각으로 바꾼다
    var list = [{ at: r.createdAt, text: own }].concat((r.statusHistory || []).filter(function (h) {
      return h.to !== 'RECEIVED' || h.from;
    }).map(function (h) {
      var back = h.from === WONT_FIX || (h.from && h.to !== WONT_FIX && stageIndex(h.to) < stageIndex(h.from));
      var plan = h.to === 'FIX_PLANNED' && h.plannedFixDate ? ' · 예정일 ' + fmtDate(h.plannedFixDate) : '';
      return { at: h.at, text: (back ? '다시 검토 · ' : '') + (h.to === 'RESOLVED' && !h.verified ? '해결(검증 기록 없음)' : recordName(h)) + plan };
    })).concat((r.fieldHistory || []).map(function (v) {
      var past = !r.defect.resolutionEventId || v.resolutionEventId !== r.defect.resolutionEventId;
      return { at: v.at, text: (past ? '이전 수정에 대한 확인 · ' : '현장 확인 · ') + verifyLabel(v.result) };
    }));
    list.sort(function (a, b) { return a.at.localeCompare(b.at); });
    return list.length ? rows(list.map(function (x) { return [fmtWhen(x.at), x.text]; }), 'kn-history') : null;
  }

  /* 업무 재개 회신(ADR-025 결정 5): 신고자 본인만 답한다. 대신 접수한 관리자는 FC의 답을 글자로 본다 */
  function canResume(r) { return !!(r.defect && r.defect.workaround && r.defect.status !== 'RESOLVED'); }
  function resumeView(r, me) {
    if (!canResume(r)) return null;
    var answer = r.workResumption;
    if (!me || me.id !== r.reporterId) {
      return el('p', { cls: 'kn-resume-status' }, ['FC 회신 · ' + (answer ? RESUME[answer.result] + ' (' + fmtWhen(answer.at) + ')' : '아직 답 없음')]);
    }
    return el('div', { cls: 'kn-resume' }, [
      el('p', { cls: 'nt-q' }, ['이 방법으로 업무를 이어갈 수 있었나요?']),
      el('ul', { cls: 'pn-chips', 'aria-label': '업무 재개 회신' }, Object.keys(RESUME).map(function (code) {
        return el('li', null, [el('button', { type: 'button', cls: 'pn-chip', 'data-resume': code,
          'aria-pressed': String(!!answer && answer.result === code) }, [code === 'RESUMED' ? '네, 진행했어요' : '아직 안 돼요'])]);
      })),
      el('p', { cls: 'kn-resume-status', role: 'status', tabindex: '-1', 'data-resume-status': '' }, [!answer ? '' :
        answer.result === 'RESUMED' ? fmtWhen(answer.at) + ' · "진행했어요"로 남겼어요. 오류가 고쳐질 때까지 이 방법을 써 주세요.'
          : fmtWhen(answer.at) + ' · "아직 안 돼요"를 이 접수에 남겼어요. 담당자가 확인하면 알림으로 알려 드려요.']),
      answer && answer.result === 'STILL' ? el('button', { type: 'button', cls: 'pn-btn-2', 'data-followup': 'URGENT' },
        ['고객이 기다려요 · 긴급 사정 남기기']) : null]);
  }
  /* 둘째 줄: 접수번호·날짜, 대신 접수 여부(ADR-025 결정 3) */
  function metaOf(r, me) {
    var parts = ['접수번호 ' + r.id, fmtDate(r.createdAt) + (r.kind === 'ME_TOO' ? ' 같은 오류 참여' : ' 접수')];
    if (r.reporter && r.submittedBy && r.reporter.id !== r.submittedBy.id) {
      parts.push(me && me.id === r.reporter.id ? r.submittedBy.name + ' 관리자가 대신 접수' : r.reporter.name + ' 대신 접수');
    }
    return parts.join(' · ');
  }

  function mineView(st) {
    var me = currentUser(st);
    var list = cache.mine;
    var cards = list.map(function (r) {
      var d = r.defect;
      var related = known.find(function (item) { return item.id === (r.guideId || r.defectId); });
      return el('li', { cls: 'pn-card kn-card' + (st.item === r.id ? ' is-target' : ''), 'data-id': r.id }, [
        el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title', tabindex: '-1' }, [titleOf(r)]),
          el('span', { cls: 'pn-tag' }, [T.tag(d)])]),
        el('p', { cls: 'kn-meta' }, [metaOf(r, me)]),
        el('p', { cls: 'kn-handled' }, ['내 문의 처리 · ', el('b', null, [T.handled(d, r.kind)])]),
        // ADR-029: A 상태(위) → B 대응·확인 → C 기록된 단계 → D 상세 이력(접힘)
        T.view(d, { inReport: true, resolution: r.resolution, after: resumeView(r, me) || verifyView(r, me), progress: progress(r) }),
        el('details', { cls: 'pn-details pq-details kn-detail' }, [
          el('summary', null, ['상세 이력']), el('div', { cls: 'pq-details-body' }, [
        historyOf(r, me),
        rows([
          r.department ? ['담당 창구', r.department] : null,
          r.contact === 'PHONE' ? ['연락 희망', '전화' + ({ AM: ' · 오전', PM: ' · 오후', ANY: ' · 시간 무관' }[r.contactTime] || '')] : null,
          r.urgent && r.urgent.length ? ['우선 확인 요청', r.urgent.map(function (code) { return URGENCY[code]; }).join(' · ')] : null,
          r.evidence ? ['추가 확인', r.evidence] : null,
          r.detail ? ['상세 설명', r.detail] : null,
          r.attemptedWorkaround ? ['시도한 임시 방법', r.attemptedWorkaround] : null,
          r.hasAttachment ? ['화면 첨부', '확인한 이미지 1장'] : null,
          r.incident && r.incident.screen ? ['오류 화면', r.incident.screen] : null,
          r.incident && (r.incident.date || r.incident.time) ? ['발생 시각', [r.incident.date, r.incident.time].filter(Boolean).join(' ')] : null,
          d && d.status === WONT_FIX ? planOf(d) : null
        ]),
        r.aiDraft ? el('details', { cls: 'pn-details' }, [
          el('summary', null, ['확인하고 보낸 AI 접수 초안']),
          rows(window.IntakeDraftRules.fields.map(function (field) {
            return [field[1], r.aiDraft[field[0]] || '미확인'];
          }))]) : r.hasAiDraft ? el('p', { cls: 'pn-lead' }, ['AI 접수 초안을 확인하고 보낸 건이에요.']) : null,
        r.diagnostics ? diagnosticDetails(r.diagnostics) : null,
        // 연결 전에는 같은 업무의 공개 방법을 "비슷해 보이는" 것으로만 알린다(AI 추천 ≠ 같은 결함 확정)
        !d && related && related.workaround && related.workaround !== r.attemptedWorkaround
          ? rows([['비슷해 보이는 공개 방법', related.workaround]]) : guideSteps(d && related ? related : null),
        r.resolution ? el('div', { cls: 'pn-note' }, [icon('i-check'), el('div', null, [
          el('b', null, [d && d.verification ? '수정 완료 안내(가상 검증)' : '해결 안내']),
          // 바뀐 동작은 진행상황에, 검증 없는 해결의 기존 건 처리는 대응에 이미 있다
          rows([['적용 시각', fmtWhen(r.resolution.appliedAt)],
            d && d.verification ? ['검증 완료', fmtWhen(d.verification.verifiedAt) + ' (가상)'] : null,
            ['적용 범위', r.resolution.scope],
            d && d.verification ? ['기존 건 처리', r.resolution.action] : null])])]) :
        r.fcNotice && r.fcNotice.approvedText
          ? el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['담당자 안내 전문']), r.fcNotice.approvedText])])
          : el('p', { cls: 'kn-none' }, [d ? '담당자 안내는 아직 없어요' : '접수 완료 · 담당자 확인 전'])])]),
        followupView(r)]);
    });
    return [el('h3', { tabindex: '-1' }, ['내 접수내역']),
      feedback && feedback.id === null ? el('p', { role: 'status', tabindex: '-1', id: 'kn-feedback' }, [feedback.text]) : null,
      el('p', { cls: 'pn-lead' }, [(me ? me.name + ' 님이 ' : '') + '접수한 건의 지금 할 일과 수정 일정이에요. 받은 알림은 위 종 모양에서 볼 수 있어요.']),
      cards.length ? el('ul', { cls: 'pn-plain' }, cards)
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', { cls: 'pn-card-title' }, ['아직 접수한 건이 없어요']),
          el('p', { cls: 'pn-lead' }, ['오류가 생기면 오른쪽 "전산 오류 접수"를 눌러 알려 주세요.'])])];
  }

  /* [지점 FC 문의] (관리자만, REQ-KN-06, ADR-025 결정 6, ADR-027 결정 9). 대표 결함별 카드 안에서 FC 한 줄로 묶고
     펼치면 신고 건별로 본다. 업무 상황은 FC의 가장 최근 기록으로 정한다. FC가 적은 설명은 내가 대신 접수한 건만(API 가 걸러 줌). */
  var SITUATION = { BLOCKED: '업무 진행 어려움', NO_REPLY: '회신 없음', NO_WORKAROUND: '임시조치 미확인', RESUMED: '업무 재개',
    FIELD_FAIL: '추가 지원 필요', FIELD_WAIT: '확인 필요', FIELD_OK: '정상 진행 확인', FIXED: '해결로 처리됨' };
  var SITUATION_ORDER = ['FIELD_FAIL', 'BLOCKED', 'FIELD_WAIT', 'NO_REPLY', 'NO_WORKAROUND', 'RESUMED', 'FIELD_OK', 'FIXED'];
  function verifiedFix(d) { return !!(d && d.status === 'RESOLVED' && d.verification); }
  /* 회신 없음·확인 전 ≠ 업무 중단(02번 4-1·4-2절) */
  function situationOf(r, d) {
    if (verifiedFix(d)) {
      var v = r.fieldVerification && r.fieldVerification.result;
      return v === 'STILL_FAIL' ? 'FIELD_FAIL' : v === 'CONFIRMED_OK' ? 'FIELD_OK' : 'FIELD_WAIT';
    }
    if (d && d.status === 'RESOLVED') return 'FIXED';
    var a = r.workResumption;
    if (a) return a.result === 'STILL' ? 'BLOCKED' : 'RESUMED';
    if (r.supportNeeded === 'YES') return 'BLOCKED';
    return d && d.workaround ? 'NO_REPLY' : 'NO_WORKAROUND';
  }
  function situationAt(r) { return (r.workResumption && r.workResumption.at) || r.createdAt; }
  /* FC의 대표 신고(ADR-029 결정 6): 검증된 해결이면 그 회차의 최신 실제 답, 해결 전이면 명시한 최신 상황.
     상황을 적지 않은 새 신고가 앞선 답을 덮지 않는다 */
  function deciding(reports, d) {
    var said = reports.filter(function (r) {
      return verifiedFix(d) ? !!r.fieldVerification : !!r.workResumption || r.supportNeeded === 'YES' || r.supportNeeded === 'NO';
    });
    return (said.length ? said : reports).slice().sort(function (a, b) {
      if (verifiedFix(d) && said.length) return b.fieldVerification.seq - a.fieldVerification.seq;
      return situationAt(b).localeCompare(situationAt(a));
    })[0];
  }
  function teamGroups() {
    var groups = [], byKey = {};
    cache.team.forEach(function (r) {
      var key = r.defectId || r.id;
      var g = byKey[key];
      if (!g) {
        g = byKey[key] = { key: key, defect: r.defect, title: r.defect ? r.defect.title : r.businessLabel + ' 문의', reports: [], fcs: [], last: '' };
        groups.push(g);
      }
      g.reports.push(r);
      if (r.createdAt > g.last) g.last = r.createdAt;
    });
    groups.forEach(function (g) {
      var byFc = {};
      g.reports.forEach(function (r) {
        var id = r.reporter ? r.reporter.id : r.id;
        var fc = byFc[id];
        if (!fc) { fc = byFc[id] = { id: id, name: r.reporter ? r.reporter.name : r.id, reports: [] }; g.fcs.push(fc); }
        fc.reports.push(r);
      });
      g.fcs.forEach(function (fc) {
        fc.reports.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
        fc.situation = situationOf(deciding(fc.reports, g.defect), g.defect);
        fc.failing = fc.reports.filter(function (r) { return situationOf(r, g.defect) === 'FIELD_FAIL'; }).length;
      });
      g.fcs.sort(function (a, b) { return SITUATION_ORDER.indexOf(a.situation) - SITUATION_ORDER.indexOf(b.situation); });
      g.urgent = g.fcs.some(function (fc) { return fc.situation === 'BLOCKED' || fc.situation === 'FIELD_FAIL'; });
    });
    groups.sort(function (a, b) { return b.urgent - a.urgent || (a.last < b.last ? 1 : -1); });
    return groups;
  }
  /* 맨 위 요약: 먼저 살펴볼 FC (지금 업무를 못 함 / 추가 확인 필요 / 업무 재개). FC마다 가장 급한 상황 하나로 센다 */
  function teamSummary(groups) {
    // 셋째 값 true: 해당자가 있을 때만 보이는 줄(수정 뒤 현장 확인, ADR-029)
    var lines = [['추가 지원 필요', ['FIELD_FAIL'], true], ['업무를 못 함', ['BLOCKED']],
      ['추가 확인 필요', ['FIELD_WAIT', 'NO_REPLY', 'NO_WORKAROUND']], ['업무 재개', ['RESUMED']], ['정상 진행 확인', ['FIELD_OK'], true]];
    var rank = { FIELD_FAIL: 0, BLOCKED: 1, FIELD_WAIT: 2, NO_REPLY: 2, NO_WORKAROUND: 2, RESUMED: 3, FIELD_OK: 4 }, worst = {}, order = [];
    groups.forEach(function (g) {
      g.fcs.forEach(function (fc) {
        if (!(fc.situation in rank)) return;
        if (!(fc.name in worst)) order.push(fc.name);
        if (!(fc.name in worst) || rank[fc.situation] < rank[worst[fc.name]]) worst[fc.name] = fc.situation;
      });
    });
    var card = el('div', { cls: 'pn-card kn-team-summary' }, [el('p', { cls: 'pn-card-title' }, ['먼저 살펴볼 FC']),
      rows(lines.map(function (line) {
        var names = order.filter(function (name) { return line[1].indexOf(worst[name]) >= 0; });
        if (line[2] && !names.length) return null;
        return [line[0], names.length + '명' + (names.length ? ' · ' + names.join(', ') : '')];
      })),
      el('p', { cls: 'kn-meta' }, ['FC마다 여러 결함 중 가장 급한 상황 하나로 셌어요(아래 결함 카드는 결함별로 세요). 회신 없음은 업무 중단이 아니에요. 전화·메신저 연결은 이 화면에 없어요.'])]);
    card.setAttribute('data-team-summary', '');
    return card;
  }
  function teamView(st) {
    var groups = teamGroups();
    var cards = groups.map(function (g) {
      var d = g.defect, n = g.fcs.length;
      var tally = SITUATION_ORDER.map(function (code) {
        var count = g.fcs.filter(function (fc) { return fc.situation === code; }).length;
        return count ? SITUATION[code] + ' ' + count + '명' : null;
      }).filter(Boolean);
      var count = ['FC ' + n + '명', '신고 ' + g.reports.length + '건'].concat(tally).join(' · ');   // 사람 수와 건수를 따로
      var people = g.fcs.map(function (fc) {
        var row = el('details', { cls: 'pn-details pq-details kn-fc', 'data-fc': fc.id }, [
          // 요약은 한 줄 글로(접기 머리가 flex 라 글 조각이 칸으로 나뉘지 않게 span 하나로 감싼다)
          el('summary', null, [el('span', { cls: 'kn-fc-line' }, [el('b', null, [fc.name + ' FC']),
            ' · 관련 신고 ' + fc.reports.length + '건 · ' + (verifiedFix(d) ? '수정 뒤 확인: ' : '최근 업무 상황: '),
            el('span', { cls: 'pn-tag' }, [SITUATION[fc.situation]]),
            fc.failing && fc.situation !== 'FIELD_FAIL' ? ' · 문제 지속 신고 ' + fc.failing + '건' : null])]),
          el('div', { cls: 'pq-details-body' }, [rows(fc.reports.map(function (r) {
            var how = r.byMe ? '내가 대신 접수' : r.kind === 'ME_TOO' ? '같은 오류 참여' : '직접 접수';
            var v = verifiedFix(d) && r.fieldVerification;
            var parts = [fmtDate(r.createdAt) + ' ' + how, NOTICE_STATE[r.notice] || NOTICE_STATE.NONE,
              v ? '현장 확인: ' + verifyLabel(v.result) + ' (' + fmtWhen(v.at) + ')'
                : (verifiedFix(d) ? '현장 확인: ' : '업무 상황: ') + SITUATION[situationOf(r, d)]];
            if (r.workResumption) parts.push('업무 재개 회신 ' + RESUME[r.workResumption.result] + ' (' + fmtWhen(r.workResumption.at) + ')');
            if (r.maskedText) parts.push('"' + r.maskedText + '"');
            return [r.id, parts.join(' · ')];
          }), 'kn-team')])]);
        return row;
      });
      return el('li', { cls: 'pn-card kn-card' + (st.item === g.key ? ' is-target' : ''), 'data-id': g.key }, [
        el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title', tabindex: '-1' }, [g.title]),
          el('span', { cls: 'pn-tag' }, [T.tag(d)])]),
        el('p', { cls: 'kn-meta' }, [count]),
        T.view(d, { team: true }),
        el('div', { cls: 'kn-fcs' }, people)]);
    });
    return [el('h3', { tabindex: '-1' }, ['지점 FC 문의']),
      el('p', { cls: 'pn-lead' }, ['같은 지점 FC의 문의와 내가 대신 접수한 문의예요. FC가 적은 설명과 고객 정보는 보이지 않아요. 알림 확인과 업무 상황은 따로 표시해요.']),
      cards.length ? teamSummary(groups) : null,
      cards.length ? el('ul', { cls: 'pn-plain' }, cards)
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', null, ['지점 FC의 문의가 없어요'])])];
  }

  function diagnosticDetails(diagnostics) {
    return el('details', { cls: 'pn-details' }, [
      el('summary', null, ['첨부된 진단정보']),
      rows([['접수하는 환경', diagnostics.submission.device || '미확인']].concat(window.IntakeDiagnosticsRows(diagnostics.submission, fmtWhen))),
      rows([['오류가 발생한 환경', diagnostics.incident.device || '미확인']].concat(window.IntakeDiagnosticsRows(diagnostics.incident, fmtWhen)))
    ]);
  }

  function followupView(r) {
    var entries = (r.followups || []).map(function (entry) {
      return el('li', null, [FOLLOWUP[entry.action], ' · ', fmtWhen(entry.at), entry.text ? ' · ' + entry.text : null]);
    });
    return el('details', { cls: 'pn-details pq-details pq-followup',
      open: entries.length > 0 || (feedback && feedback.id === r.id) }, [
      el('summary', null, ['추가 내용과 후속 조치']),
      el('div', { cls: 'pq-details-body' }, [
        entries.length ? el('ul', { cls: 'pq-guide-steps' }, entries) : null,
        el('label', { cls: 'pn-label', for: 'kn-add-' + r.id }, ['추가 설명 (고객 이름과 번호 제외)']),
        el('textarea', { id: 'kn-add-' + r.id, maxlength: '500' }),
        el('ul', { cls: 'pn-chips' }, FOLLOWUP_CHIPS.map(function (action) {
          return el('li', null, [el('button', { type: 'button', cls: 'pn-chip', 'data-followup': action },
            [action === 'ADD' ? '추가 내용 보내기' : FOLLOWUP[action]])]);
        })),
        r.kind === 'ME_TOO' ? el('button', { type: 'button', cls: 'pn-btn-2', 'data-followup': 'CANCEL' }, ['같은 오류 참여 취소']) : null,
        el('p', { role: 'status', tabindex: '-1', 'data-followup-status': '' }, [feedback && feedback.id === r.id ? feedback.text : ''])
      ])]);
  }

  function sendFollowup(button) {
    var st = read(), me = currentUser(st);
    if (posting || !me) return;
    var card = button.closest('[data-id]'), id = card.getAttribute('data-id'), action = button.getAttribute('data-followup');
    var input = card.querySelector('textarea'), text = input.value.trim(), status = card.querySelector('[data-followup-status]');
    if (action === 'ADD' && !text) { status.textContent = '추가 설명을 먼저 적어 주세요.'; input.focus(); return; }
    if (action === 'CANCEL' && !window.confirm('같은 오류 참여를 취소할까요?')) return;
    posting = true;
    button.disabled = true;
    return A.postIntakeFollowup(id, me.id, action, action === 'CANCEL' ? '' : text).then(function (result) {
      if (!result || result.blocked) {
        status.textContent = result && result.blocked ? '번호나 이메일을 빼고 다시 보내 주세요.' : '내용을 보내지 못했어요.';
        input.focus();
        return;
      }
      feedback = { id: result.cancelled ? null : id, text: result.cancelled ? '같은 오류 참여를 취소했어요.' : '이 접수에 내용을 추가했어요.' };
      if (result.cancelled) go({ item: '' });
      return render().then(function () {
        var target = result.cancelled ? $('kn-feedback') : document.querySelector('[data-id="' + id + '"] [data-followup-status]');
        if (target) target.focus();
      });
    }).catch(function () {
      status.textContent = '내용을 보내지 못했어요. 다시 눌러 주세요.';
    }).finally(function () {
      posting = false;
      button.disabled = false;
    });
  }

  /* 업무 재개 회신 (REQ-KN-05). 결함 상태는 바꾸지 않는다 */
  function sendResume(button) {
    var st = read(), me = currentUser(st);
    if (posting || !me) return;
    var id = button.closest('[data-id]').getAttribute('data-id'), result = button.getAttribute('data-resume');
    posting = true;
    button.disabled = true;
    return A.postWorkResumption(id, me.id, result).then(function (saved) {
      cache.userId = null;   // 다시 읽어 회신과 후속 기록을 함께 보인다
      return render().then(function () {
        var status = document.querySelector('[data-id="' + id + '"] [data-resume-status]');
        if (status && !saved) status.textContent = '회신을 남기지 못했어요. 다시 눌러 주세요.';
        if (status) status.focus();
      });
    }).finally(function () {
      posting = false;
      button.disabled = false;
    });
  }

  /* 수정 뒤 현장 확인(ADR-029). 결함 상태를 바꾸지 않는다 */
  function sendVerify(button) {
    var st = read(), me = currentUser(st);
    if (posting || !me) return;
    var id = button.closest('[data-id]').getAttribute('data-id'), result = button.getAttribute('data-verify');
    var event = button.closest('[data-verify-event]').getAttribute('data-verify-event');
    posting = true;
    button.disabled = true;
    return A.postFieldVerification(id, me.id, event, result).catch(function () { return null; }).then(function (saved) {
      cache.userId = null;
      return render().then(function () {
        var status = document.querySelector('[data-id="' + id + '"] [data-verify-status]');
        if (status && !saved) status.textContent = '확인 결과를 남기지 못했어요. 다시 눌러 주세요.';
        if (status) status.focus();
      });
    }).finally(function () {
      posting = false;
      button.disabled = false;
    });
  }
  function addSituation(button) {
    var card = button.closest('[data-id]'), box = card.querySelector('.pq-followup'), input = box && box.querySelector('textarea');
    if (!input) return;
    box.open = true;
    input.focus();
    var status = box.querySelector('[data-followup-status]');
    if (status) status.textContent = '다시 생긴 조건과 상황을 적어 주세요. 시제품에서는 글 내용이 이 화면에만 남고, IT에는 추가 내용이 있다는 기록만 보여요.';
  }

  function detailKey(box) {
    return box.closest('[data-id]').getAttribute('data-id') + '|' + (box.getAttribute('data-fc') || box.querySelector('summary').textContent);
  }
  function paintPanel(st) {
    var open = st.panel === 'known';
    $('known-panel').hidden = !open;
    $('kn-scrim').hidden = !open;
    if (!open) { lastView = null; return; }
    var tabs = tabsOf(st);
    Array.prototype.forEach.call(document.querySelectorAll('#known-panel .kn-tab'), function (b) {
      var on = b.getAttribute('data-tab') === st.tab;
      b.hidden = tabs.indexOf(b.getAttribute('data-tab')) < 0;   // [지점 FC 문의]는 관리자만
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('tabindex', on ? '0' : '-1');
    });
    var body = $('kn-body');
    body.setAttribute('aria-labelledby', 'kn-tab-' + st.tab);
    var view = st.tab + '|' + (st.item || '') + '|' + cache.userId;
    var shown = st.tab + '|' + (currentUser(st) || {}).id;   // 답한 뒤 다시 그려도 펼쳐 둔 접기는 그대로
    var opened = body.getAttribute('data-shown') === shown
      ? Array.prototype.map.call(body.querySelectorAll('[data-id] details[open]'), detailKey) : [];
    body.setAttribute('data-shown', shown);
    body.innerHTML = '';
    (st.tab === 'mine' ? mineView(st) : st.tab === 'team' ? teamView(st) : knownView(st)).forEach(function (n) { if (n) body.appendChild(n); });
    if (opened.length) {
      Array.prototype.forEach.call(body.querySelectorAll('[data-id] details'), function (box) {
        if (opened.indexOf(detailKey(box)) >= 0) box.open = true;
      });
    }
    if (view === lastView) return;
    var hadView = lastView !== null;
    lastView = view;
    // 처음 열거나 탭·항목이 바뀌면: 이동할 카드(없으면 제목)로 스크롤·포커스
    var target = st.item ? body.querySelector('.kn-card.is-target') : null;
    body.scrollTop = 0;
    if (target) {
      body.scrollTop = Math.max(0, target.offsetTop - body.offsetTop - 16);
      target.querySelector('.pn-card-title').focus({ preventScroll: true });
    } else if (!hadView || !document.activeElement || !$('known-panel').contains(document.activeElement)) {
      var h = body.querySelector('h3');
      if (h) h.focus({ preventScroll: true });
    }
  }

  function render() {
    var st = read(), hash = location.hash;
    if (st.panel !== 'known') feedback = null;
    return load(st).then(function () {
      if (location.hash !== hash) return;
      paintSummary(st);
      paintPanel(st);
    });
  }

  /* ---- 동작 ---- */
  function open(tab, item, from) {
    opener = from || null;
    lastView = null;
    // S2 단계 키는 지운다 (panel 값이 하나라 S2 패널은 닫힌다)
    go({ panel: 'known', tab: tab === 'mine' || tab === 'team' ? tab : '', item: item || '', popup: '', notice: '',
      step: '', alert: '', 'case': '' });
  }
  function close() {
    go({ panel: '', tab: '', item: '' });
    var t = opener && document.body.contains(opener) ? opener : document.querySelector('[data-entry="tab"]');
    if (t) t.focus();
    opener = null;
  }

  function focusables() {
    return Array.prototype.filter.call($('known-panel').querySelectorAll('button, textarea, summary, [tabindex="0"]'),
      function (x) { return !x.disabled && x.getClientRects().length; });
  }
  function onKey(e) {
    if (read().panel !== 'known') return;
    if (e.key === 'Escape') {
      if (!$('notice-box').hidden || !$('alarm-pop').hidden) return;   // 위에 뜬 안내 상자가 먼저 닫힌다
      e.preventDefault();
      close();
      return;
    }
    var tab = e.target.closest && e.target.closest('.kn-tab');
    if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {   // 탭 목록: 좌우 화살표로 전환(보이는 탭만 돌아가며)
      e.preventDefault();
      var st = read(), tabs = tabsOf(st), at = tabs.indexOf(st.tab);
      var next = tabs[(at + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      go({ tab: next === 'known' ? '' : next, item: '' });
      $('kn-tab-' + next).focus();
      return;
    }
    if (e.key === 'Tab') {   // 패널 안에서만 이동 (aria-modal)
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      var inside = $('known-panel').contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    }
  }

  function bind() {
    // 공지 카드 요약 줄 → 그 항목의 탭
    $('board').addEventListener('click', function (e) {
      var b = e.target.closest('[data-kn-tab]');
      if (b) open(b.getAttribute('data-kn-tab'), b.getAttribute('data-kn-item'), b);
    });
    // 알림 팝업 항목 → FC 알림은 [내 신고]의 그 신고, 대리 접수자 알림은 [지점 FC 문의]의 그 결함 (ADR-025 결정 8)
    $('alarm-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-kn-notice]');
      if (!b) return;
      var st = read(), me = currentUser(st), hash = location.hash;
      var d = b.getAttribute('data-kn-defect'), reportId = b.getAttribute('data-kn-report');
      var submitter = b.getAttribute('data-kn-audience') === 'SUBMITTER';
      if (!me) return;
      A.markNotificationRead(b.getAttribute('data-kn-notice'), me.id).then(function (marked) {
        if (!marked || location.hash !== hash) return;
        if (submitter && me.role === 'MANAGER') return open('team', d || '', $('alarm-btn'));
        var r = d ? cache.mine.find(function (x) { return x.defectId === d; }) : null;
        open('mine', reportId || (r ? r.id : ''), $('alarm-btn'));
      });
    });
    $('known-panel').addEventListener('click', function (e) {
      var resume = e.target.closest('[data-resume]');
      if (resume) return sendResume(resume);
      var verify = e.target.closest('[data-verify]');
      if (verify) return sendVerify(verify);
      var add = e.target.closest('[data-verify-add]');
      if (add) return addSituation(add);
      var followup = e.target.closest('[data-followup]');
      if (followup) return sendFollowup(followup);
      var copy = e.target.closest('[data-copy-guide]');
      if (copy) {
        var box = copy.parentElement, msg = box.querySelector('p');
        return window.SfaCopy(msg.textContent, box.querySelector('[role="status"]'), msg);
      }
      var t = e.target.closest('.kn-tab');
      if (t) go({ tab: t.getAttribute('data-tab') === 'known' ? '' : t.getAttribute('data-tab'), item: '' });
    });
    $('kn-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', render);
    A.watchIntakeUpdates(function () {
      A.getQuickIntakeCatalog().then(function (catalog) {
        known = catalog;
        if (document.activeElement && document.activeElement.matches('#kn-body textarea')) return;
        cache.userId = null;
        render();
      });
    });
  }

  window.SFA_READY = (window.SFA_READY || Promise.resolve()).then(function () {
    return Promise.all([A.getQuickIntakeCatalog(), A.getUsers()]);
  }).then(function (r) {
    known = r[0] || []; users = r[1] || [];
    bind();
    return render();
  });
})();
