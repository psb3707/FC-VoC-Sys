/* S3 알려진 오류·내 신고 (docs/06-ui-spec.md 5절, ADR-015, REQ-KN-01·02, REQ-NT-01).
   기능 없는 화면 시안: 데이터는 ApiClient(=fixtures)만 읽고 저장하지 않는다.
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
  var opener = null, lastView = null;

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
  /* 사용자가 바뀌었을 때만 내 신고·알림을 다시 받는다 */
  function load(st) {
    var me = currentUser(st), id = me ? me.id : null;
    if (id === cache.userId) return Promise.resolve();
    return Promise.all([A.getMyReports(id), A.getNotifications(id)]).then(function (r) {
      cache = { userId: id, mine: r[0] || [], alarms: r[1] || [] };
    });
  }

  function statusOf(r) { return r.defect ? r.defect.status : 'RECEIVED'; }
  function titleOf(r) { return r.defect ? r.defect.title : (r.maskedText || '제목 없음'); }
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
      return { tab: 'mine', id: r.id, title: '[내 신고] ' + titleOf(r), side: stageLabel(statusOf(r)) };
    }).concat(known.slice(0, SUMMARY_KNOWN).map(function (k) {
      return { tab: 'known', id: k.id, title: '[알려진 오류] ' + k.title,
        side: k.status === WONT_FIX ? WONT_FIX_LABEL : k.plannedFixDate ? mmdd(k.plannedFixDate) + ' 수정 예정' : stageLabel(k.status) };
    }));
    if (!lines.length) {
      ul.appendChild(el('li', { 'data-a11y': 'sfa', cls: 'kn-sum' }, [el('span', { cls: 'b-title' }, ['알려진 오류와 내 신고가 없어요'])]));
      return;
    }
    lines.forEach(function (l) {
      ul.appendChild(el('li', { 'data-a11y': 'sfa', cls: 'kn-sum' }, [
        el('button', { type: 'button', cls: 'kn-sum-btn', 'data-kn-tab': l.tab, 'data-kn-item': l.id, 'aria-haspopup': 'dialog' }, [
          el('span', { cls: 'b-title' }, [l.title]), el('span', { cls: 'b-date' }, [l.side])])]));
    });
  }

  /* ---- 패널 ---- */
  function knownView(st) {
    var cards = known.map(function (k) {
      return el('li', { cls: 'pn-card kn-card' + (st.item === k.id ? ' is-target' : ''), 'data-id': k.id }, [
        el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title', tabindex: '-1' }, [k.title]),
          el('span', { cls: 'pn-tag' }, [stageLabel(k.status)])]),
        rows([['임시로 이렇게', k.workaround], planOf(k), ['같은 신고', k.reportCount + '건']])]);
    });
    return [el('h3', { tabindex: '-1' }, ['지금 알려진 오류']),
      el('p', { cls: 'pn-lead' }, ['담당자가 이미 알고 있는 오류예요. 고쳐질 때까지 "임시로 이렇게"를 먼저 해 보세요.']),
      cards.length ? el('ul', { cls: 'pn-plain' }, cards)
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', null, ['지금 알려진 오류가 없어요'])]),
      el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['같은 문제를 겪고 계신가요?']),
        '오른쪽 "전산 오류 접수"를 누르면 첫 화면에서 "나도 겪었어요"를 누를 수 있어요.'])])];
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
      var meta = '신고 번호 ' + r.id + ' · ' + fmtDate(r.createdAt) + (r.kind === 'ME_TOO' ? ' "나도 겪었어요"로 보냄' : ' 보냄');
      return el('li', { cls: 'pn-card kn-card' + (st.item === r.id ? ' is-target' : ''), 'data-id': r.id }, [
        el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title', tabindex: '-1' }, [titleOf(r)]),
          el('span', { cls: 'pn-tag' }, [stageLabel(statusOf(r))])]),
        el('p', { cls: 'kn-meta' }, [meta]),
        progress(r),
        d ? rows([d.workaround ? ['임시로 이렇게', d.workaround] : null, planOf(d)]) : null,
        r.fcNotice && r.fcNotice.approvedText
          ? el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['담당자 안내']), r.fcNotice.approvedText])])
          : el('p', { cls: 'kn-none' }, [d ? '담당자 안내는 아직 없어요' : '담당자가 확인하고 있어요. 안내가 정해지면 알려드릴게요.'])]);
    });
    var alarms = cache.alarms.map(function (n) { return [fmtWhen(n.at), n.bodySnapshot]; });
    return [el('h3', { tabindex: '-1' }, ['내가 보낸 신고']),
      el('p', { cls: 'pn-lead' }, [me ? me.name + ' 님이 보낸 신고의 진행 단계와 담당자 안내예요.' : '보낸 신고의 진행 단계와 담당자 안내예요.']),
      cards.length ? el('ul', { cls: 'pn-plain' }, cards)
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', { cls: 'pn-card-title' }, ['아직 보낸 신고가 없어요']),
          el('p', { cls: 'pn-lead' }, ['오류가 생기면 오른쪽 "전산 오류 접수"를 눌러 알려 주세요.'])]),
      el('h4', null, ['받은 알림']),
      alarms.length ? el('div', { cls: 'pn-card' }, [rows(alarms, 'kn-alarms')])
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', null, ['받은 알림이 없어요'])])];
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
    var st = read();
    return load(st).then(function () {
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
      step: '', alert: '', 'case': '', proto: '' });
  }
  function close() {
    go({ panel: '', tab: '', item: '' });
    var t = opener && document.body.contains(opener) ? opener : document.querySelector('[data-entry="tab"]');
    if (t) t.focus();
    opener = null;
  }

  function focusables() {
    return Array.prototype.filter.call($('known-panel').querySelectorAll('button, [tabindex="0"]'),
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
      var d = b.getAttribute('data-kn-defect');
      var r = cache.mine.filter(function (x) { return x.defectId === d; })[0];
      open('mine', r ? r.id : '', $('alarm-btn'));
    });
    $('known-panel').addEventListener('click', function (e) {
      var t = e.target.closest('.kn-tab');
      if (t) go({ tab: t.getAttribute('data-tab') === 'mine' ? 'mine' : '', item: '' });
    });
    $('kn-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', render);
  }

  window.SFA_READY = (window.SFA_READY || Promise.resolve()).then(function () {
    return Promise.all([A.getKnownErrors(), A.getUsers()]);
  }).then(function (r) {
    known = r[0] || []; users = r[1] || [];
    bind();
    return render();
  });
})();
