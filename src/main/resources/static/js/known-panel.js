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
  var cache = { userId: null, mine: [], alarms: [] };
  var opener = null, lastView = null, feedback = null, posting = false;
  var FOLLOWUP = { ADD: '추가 내용', STILL: '아직 안 돼요', RECURRED: '다시 발생했어요', URGENT: '긴급 사정 추가' };
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
    st.tab = st.tab === 'mine' ? 'mine' : 'known';
    return st;
  }
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
    return Promise.all([A.getMyReports(id), A.getNotifications(id)]).then(function (r) {
      cache = { userId: id, mine: r[0] || [], alarms: r[1] || [] };
    });
  }

  function statusOf(r) { return r.defect ? r.defect.status : 'RECEIVED'; }
  function titleOf(r) { return r.title || (r.defect ? r.defect.title : (r.maskedText || '제목 없음')); }
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
      return { tab: 'mine', id: r.id, title: '[내 접수] ' + titleOf(r), side: stageLabel(statusOf(r)) };
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
  function publicGuide(d) {
    if (!d || !d.workaround) return null;
    var g = d.guide;
    return el('div', { cls: 'pq-actions' }, [
      el('p', { cls: 'pn-card-title' }, ['지금 해볼 방법']),
      el('p', null, [d.workaround]),
      g && g.steps ? el('ol', { cls: 'pq-guide-steps' }, g.steps.map(function (step) {
        return el('li', null, [step]);
      })) : null,
      g && g.customerMessage ? el('div', { cls: 'pq-customer-note' }, [
        el('p', null, [g.customerMessage]),
        el('button', { type: 'button', cls: 'pn-btn-2', 'data-copy-guide': '' }, ['고객 안내 복사']),
        el('p', { role: 'status' })]) : null,
      el('p', { cls: 'pn-lead' }, ['이 방법으로도 어렵다면 접수에 상황을 남겨 주세요.'])]);
  }
  function knownView(st) {
    var cards = known.map(function (k) {
      return el('li', { cls: 'pn-card kn-card' + (st.item === k.id ? ' is-target' : ''), 'data-id': k.id }, [
        el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title', tabindex: '-1' }, [k.title]),
          el('span', { cls: 'pn-tag' }, [stageLabel(k.status)])]),
        publicGuide(k),
        rows([planOf(k)]),
        k.wontFixReasonCode === 'NEW_SFA' ? el('p', { cls: 'pn-lead' }, ['새 시스템 적용 날짜는 아직 안내되지 않았어요.']) : null]);
    });
    return [el('h3', { tabindex: '-1' }, ['오류 현황']),
      el('p', { cls: 'pn-lead' }, ['업무를 이어갈 수 있는 임시 방법과 수정 일정을 확인해 보세요.']),
      cards.length ? el('ul', { cls: 'pn-plain' }, cards)
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', null, ['지금 알려진 오류가 없어요'])]),
      el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['같은 문제를 겪고 계신가요?']),
        '전산 오류 접수에서 업무를 고르면 관련 오류에 참여하거나 새로 접수할 수 있어요.'])])];
  }

  function progress(r) {
    var code = statusOf(r), wont = code === WONT_FIX;
    var at = stageIndex(code);
    if (wont) {   // 수정하지 않음: 그 직전 단계까지 지나온 것으로 표시
      var h = (r.statusHistory || []).filter(function (x) { return x.to === WONT_FIX; })[0];
      at = h ? stageIndex(h.from) : 0;
    }
    var now = el('p', { cls: 'kn-now' }, wont
      ? [el('b', null, [WONT_FIX_LABEL]), ' · ' + STAGES[Math.max(at, 0)][1] + ' 단계에서 끝났어요']
      : [STAGES.length + '단계 중 ' + (at + 1) + '단계 · ', el('b', null, [stageLabel(code)])]);   // 06번 5절 "6단계 중 4단계 · 임시조치"
    var track = el('ol', { cls: 'pn-track', 'aria-hidden': 'true' }, STAGES.map(function (s, i) {
      return el('li', { cls: wont ? (i <= at ? 'is-done' : null) : (i < at ? 'is-done' : i === at ? 'is-now' : null) });
    }));
    var names = STAGES.map(function (s, i) {
      var cur = !wont && i === at;
      return el('li', { cls: cur ? 'is-now' : null, 'aria-current': cur ? 'step' : null }, [s[1] + (cur ? '(지금)' : '')]);
    });
    names.push(el('li', { cls: 'is-alt' + (wont ? ' is-now' : ''), 'aria-current': wont ? 'step' : null },
      [WONT_FIX_LABEL + (wont ? '(지금)' : '')]));
    return el('div', { cls: 'kn-progress' }, [now, track,
      el('ol', { cls: 'kn-stages', 'aria-label': '처리 단계' }, names)]);
  }

  function mineView(st) {
    var me = currentUser(st);
    var list = cache.mine;
    var cards = list.map(function (r) {
      var d = r.defect;
      var meta = '접수번호 ' + r.id + ' · ' + fmtDate(r.createdAt) + (r.kind === 'ME_TOO' ? ' · 같은 오류 참여' : ' 접수');
      var related = known.find(function (item) { return item.id === (r.guideId || r.defectId); });
      return el('li', { cls: 'pn-card kn-card' + (st.item === r.id ? ' is-target' : ''), 'data-id': r.id }, [
        el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title', tabindex: '-1' }, [titleOf(r)]),
          el('span', { cls: 'pn-tag' }, [stageLabel(statusOf(r))])]),
        el('p', { cls: 'kn-meta' }, [meta]),
        progress(r),
        rows([
          r.department ? ['담당 창구', r.department] : null,
          r.contact === 'PHONE' ? ['연락 희망', '전화' + ({ AM: ' · 오전', PM: ' · 오후', ANY: ' · 시간 무관' }[r.contactTime] || '')] : null,
          r.urgent && r.urgent.length ? ['우선 확인 요청', r.urgent.map(function (code) { return URGENCY[code]; }).join(' · ')] : null,
          r.evidence ? ['추가 확인', r.evidence] : null,
          r.detail ? ['상세 설명', r.detail] : null,
          r.attemptedWorkaround ? ['시도한 임시 방법', r.attemptedWorkaround] : null,
          r.incident && r.incident.screen ? ['오류 화면', r.incident.screen] : null,
          r.incident && (r.incident.date || r.incident.time) ? ['발생 시각', [r.incident.date, r.incident.time].filter(Boolean).join(' ')] : null,
          d ? planOf(d) : null
        ]),
        r.diagnostics ? diagnosticDetails(r.diagnostics) : null,
        !r.resolution && related ? (related.workaround === r.attemptedWorkaround ? null : publicGuide(related)) :
          !r.resolution && d && d.workaround ? rows([['지금 해볼 방법', d.workaround]]) : null,
        r.resolution ? el('div', { cls: 'pn-note' }, [icon('i-check'), el('div', null, [
          el('b', null, ['수정 완료 안내']),
          rows([['적용 시각', fmtWhen(r.resolution.appliedAt)], ['적용 범위', r.resolution.scope],
            ['바뀐 동작', r.resolution.change], ['기존 건 처리', r.resolution.action]])])]) :
        r.fcNotice && r.fcNotice.approvedText
          ? el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['담당자 안내']), r.fcNotice.approvedText])])
          : el('p', { cls: 'kn-none' }, [d ? '담당자 안내는 아직 없어요' : '접수 완료 · 담당자 확인 대기']),
        followupView(r)]);
    });
    var alarms = cache.alarms.map(function (n) { return [fmtWhen(n.at), n.bodySnapshot]; });
    return [el('h3', { tabindex: '-1' }, ['내 접수내역']),
      feedback && feedback.id === null ? el('p', { role: 'status', tabindex: '-1', id: 'kn-feedback' }, [feedback.text]) : null,
      el('p', { cls: 'pn-lead' }, [me ? me.name + ' 님이 접수한 건의 진행 단계와 담당자 안내예요.' : '접수한 건의 진행 단계와 담당자 안내예요.']),
      cards.length ? el('ul', { cls: 'pn-plain' }, cards)
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', { cls: 'pn-card-title' }, ['아직 접수한 건이 없어요']),
          el('p', { cls: 'pn-lead' }, ['오류가 생기면 오른쪽 "전산 오류 접수"를 눌러 알려 주세요.'])]),
      el('h4', null, ['받은 알림']),
      alarms.length ? el('div', { cls: 'pn-card' }, [rows(alarms, 'kn-alarms')])
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', null, ['받은 알림이 없어요'])])];
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
        el('ul', { cls: 'pn-chips' }, Object.keys(FOLLOWUP).map(function (action) {
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

  function paintPanel(st) {
    var open = st.panel === 'known';
    $('known-panel').hidden = !open;
    $('kn-scrim').hidden = !open;
    if (!open) { lastView = null; return; }
    Array.prototype.forEach.call(document.querySelectorAll('#known-panel .kn-tab'), function (b) {
      var on = b.getAttribute('data-tab') === st.tab;
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('tabindex', on ? '0' : '-1');
    });
    var body = $('kn-body');
    body.setAttribute('aria-labelledby', 'kn-tab-' + st.tab);
    body.innerHTML = '';
    (st.tab === 'mine' ? mineView(st) : knownView(st)).forEach(function (n) { if (n) body.appendChild(n); });
    var view = st.tab + '|' + (st.item || '') + '|' + cache.userId;
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
    go({ panel: 'known', tab: tab === 'mine' ? 'mine' : '', item: item || '', popup: '', notice: '',
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
    if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {   // 탭 목록: 좌우 화살표로 전환
      e.preventDefault();
      var next = read().tab === 'mine' ? 'known' : 'mine';
      go({ tab: next === 'mine' ? 'mine' : '', item: '' });
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
    // 알림 팝업 항목 → [내 신고]의 그 신고 (같은 대표 결함에 묶인 내 신고)
    $('alarm-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-kn-defect]');
      if (!b) return;
      var st = read(), me = currentUser(st), hash = location.hash;
      var d = b.getAttribute('data-kn-defect'), reportId = b.getAttribute('data-kn-report');
      if (!me) return;
      A.markNotificationRead(b.getAttribute('data-kn-notice'), me.id).then(function (marked) {
        if (!marked || location.hash !== hash) return;
        var r = cache.mine.find(function (x) { return x.defectId === d; });
        open('mine', reportId || (r ? r.id : ''), $('alarm-btn'));
      });
    });
    $('known-panel').addEventListener('click', function (e) {
      var followup = e.target.closest('[data-followup]');
      if (followup) return sendFollowup(followup);
      var copy = e.target.closest('[data-copy-guide]');
      if (copy) {
        var box = copy.parentElement, msg = box.querySelector('p');
        return window.SfaCopy(msg.textContent, box.querySelector('[role="status"]'), msg);
      }
      var t = e.target.closest('.kn-tab');
      if (t) go({ tab: t.getAttribute('data-tab') === 'mine' ? 'mine' : '', item: '' });
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
