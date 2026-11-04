/* S3 알려진 오류·내 신고 (docs/06-ui-spec.md 5절, ADR-015, REQ-KN-01·02, REQ-NT-01).
   프론트 화면: ApiClient의 가상 신고·읽음 상태를 표시한다(ADR-017).
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
  /* 접수·공감·읽음 뒤에도 같은 사용자의 화면을 새로 받는다. */
  function load(st) {
    var me = currentUser(st), id = me ? me.id : null;
    return Promise.all([A.getMyReports(id), A.getNotifications(id), A.getKnownErrors(null, null, id)]).then(function (r) {
      cache = { userId: id, mine: r[0] || [], alarms: r[1] || [] };
      known = r[2] || [];
    });
  }

  function statusOf(r) { return r.defect ? r.defect.status : 'RECEIVED'; }
  function titleOf(r) { return r.title || r.maskedText || r.oneLine || (r.defect ? r.defect.title : '제목 없음'); }
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
    if (d.status !== 'RESOLVED' && d.plannedFixDate) return ['고칠 예정', fmtDate(d.plannedFixDate)];
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
        rows([['지금은 이렇게', k.workaround], planOf(k), ['같은 신고', k.reportCount + '건']]),
        el('button', { type: 'button', cls: 'pn-btn-out kn-metoo', 'data-kn-metoo': k.id,
          disabled: k.alreadyReported, 'aria-label': k.title + ' — ' + (k.alreadyReported ? '이미 알려 주셨어요' : '나도 겪었어요') },
          [k.alreadyReported ? '이미 알려 주셨어요' : '나도 겪었어요'])]);
    });
    return [el('h3', { tabindex: '-1' }, ['지금 알려진 오류']),
      el('p', { cls: 'pn-lead' }, ['같은 문제라면 다시 설명하지 않아도 돼요. 임시 방법을 확인하고 알려 주세요.']),
      cards.length ? el('ul', { cls: 'pn-plain' }, cards)
        : el('div', { cls: 'pn-card kn-empty' }, [el('p', null, ['지금 알려진 오류가 없어요'])])];
  }

  function progress(r) {
    var code = statusOf(r), wont = code === WONT_FIX, at = stageIndex(code);
    if (wont) {
      var h = (r.statusHistory || []).filter(function (x) { return x.to === WONT_FIX; })[0];
      at = h ? stageIndex(h.from) : 0;
    }
    at = Math.max(at, 0);
    var now = el('p', { cls: 'kn-now' }, wont ? [el('b', null, [WONT_FIX_LABEL])]
      : [el('b', null, [stageLabel(code)]), ' · ' + (at + 1) + '/' + STAGES.length + '단계']);
    var track = el('ol', { cls: 'pn-track', 'aria-hidden': 'true' }, STAGES.map(function (x, i) {
      return el('li', { cls: wont ? (i <= at ? 'is-done' : null) : (i < at ? 'is-done' : i === at ? 'is-now' : null) });
    }));
    return el('div', { cls: 'kn-progress' }, [now, track]);
  }

  function stageNames(r) {
    var code = statusOf(r);
    var names = STAGES.map(function (x) {
      var on = x[0] === code;
      return el('li', { cls: on ? 'is-now' : null, 'aria-current': on ? 'step' : null }, [x[1] + (on ? '(지금)' : '')]);
    });
    names.push(el('li', { cls: 'is-alt' + (code === WONT_FIX ? ' is-now' : ''),
      'aria-current': code === WONT_FIX ? 'step' : null }, [WONT_FIX_LABEL]));
    return el('ol', { cls: 'kn-stages', 'aria-label': '처리 단계' }, names);
  }

  function card(r, st, proxy) {
    var d = r.defect, notice = r.fcNotice && r.fcNotice.approvedText;
    var action = d && d.status === 'RESOLVED' ? '문제가 해결됐어요. 다시 업무를 진행해 주세요.'
      : d && d.workaround || notice || '담당자가 확인하고 있어요. 안내가 정해지면 알려드릴게요.';
    var who = users.filter(function (u) { return u.id === r.reporterId; })[0];
    var details = el('details', { cls: 'kn-details', open: st.item === r.id }, [
      el('summary', null, ['자세히 보기']),
      el('div', { cls: 'kn-detail-body' }, [
        el('p', { cls: 'kn-meta' }, ['신고 번호 ' + r.id + ' · ' + fmtDate(r.createdAt) + ' 보냄']),
        d ? el('p', { cls: 'kn-meta' }, ['담당자가 묶은 문제: ' + d.title]) : null,
        stageNames(r),
        r.maskedText && r.maskedText !== titleOf(r) ? rows([['보낸 설명', r.maskedText]]) : null,
        notice && notice !== action ? el('div', { cls: 'kn-full-notice' }, [el('b', null, ['담당자 안내']), el('p', null, [notice])]) : null,
        r.stepsToReproduce && r.stepsToReproduce.length ? rows([['보낸 재현 정보', r.stepsToReproduce.join(' / ')]]) : null
      ])]);
    return el('li', { cls: 'pn-card kn-card' + (st.item === r.id ? ' is-target' : ''), 'data-id': r.id }, [
      proxy ? el('p', { cls: 'kn-proxy-name' }, [(who ? who.name : '설계사') + ' 대신 보냄']) : null,
      el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title', tabindex: '-1' }, [titleOf(r)])]),
      progress(r),
      el('div', { cls: 'kn-action' }, [el('b', null, ['지금은 이렇게']), el('p', null, [action])]),
      d && planOf(d) ? rows([planOf(d)]) : null,
      details]);
  }

  function reportGroup(list, st, proxy) {
    var active = list.filter(function (r) { return ['RESOLVED', WONT_FIX].indexOf(statusOf(r)) < 0; });
    var done = list.filter(function (r) { return ['RESOLVED', WONT_FIX].indexOf(statusOf(r)) >= 0; });
    var result = [];
    if (active.length) result.push(el('ul', { cls: 'pn-plain' }, active.map(function (r) { return card(r, st, proxy); })));
    if (done.length) result.push(el('details', { cls: 'kn-finished', open: done.some(function (r) { return st.item === r.id; }) }, [
      el('summary', null, ['끝난 신고 ' + done.length + '건']),
      el('ul', { cls: 'pn-plain' }, done.map(function (r) { return card(r, st, proxy); }))]));
    return result;
  }

  function mineView(st) {
    var own = cache.mine.filter(function (r) { return r.reporterId === cache.userId; });
    var proxy = cache.mine.filter(function (r) { return r.reporterId !== cache.userId && r.submittedById === cache.userId; });
    var result = [el('h3', { tabindex: '-1' }, ['내가 보낸 신고']),
      el('p', { cls: 'pn-lead' }, ['지금 상태와 업무를 이어갈 방법을 확인하세요.'])];
    if (own.length) result = result.concat(reportGroup(own, st, false));
    else result.push(el('div', { cls: 'pn-card kn-empty' }, [el('p', { cls: 'pn-card-title' }, ['아직 보낸 신고가 없어요']),
      el('p', { cls: 'pn-lead' }, ['오류가 생기면 전산 오류 접수에서 알려 주세요.'])]));
    if (proxy.length) {
      result.push(el('h4', null, ['내가 대신 보낸 신고']));
      result = result.concat(reportGroup(proxy, st, true));
    }
    if (cache.alarms.length) result.push(el('details', { cls: 'kn-history' }, [
      el('summary', null, ['지난 알림 보기 · ' + cache.alarms.length + '건']),
      el('div', { cls: 'pn-card' }, [rows(cache.alarms.map(function (n) { return [fmtWhen(n.at), n.bodySnapshot]; }), 'kn-alarms')])]));
    return result;
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
      step: '', alert: '', 'case': '' });
  }
  function close() {
    go({ panel: '', tab: '', item: '' });
    var t = opener && document.body.contains(opener) ? opener : document.querySelector('[data-entry="tab"]');
    if (t) t.focus();
    opener = null;
  }

  function focusables() {
    return Array.prototype.filter.call($('known-panel').querySelectorAll('button, summary, [tabindex="0"]'),
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
      A.markNotificationRead(b.getAttribute('data-notification-id'), cache.userId).then(function () {
        open('mine', r ? r.id : '', $('alarm-btn'));
      });
    });
    $('known-panel').addEventListener('click', function (e) {
      var t = e.target.closest('.kn-tab');
      if (t) go({ tab: t.getAttribute('data-tab') === 'mine' ? 'mine' : '', item: '' });
      var b = e.target.closest('[data-kn-metoo]');
      if (!b || b.disabled) return;
      b.disabled = true;
      b.textContent = '알리고 있어요';
      A.postMeToo(b.getAttribute('data-kn-metoo'), { reporterId: cache.userId, submittedById: cache.userId }).then(function () {
        lastView = null;
        return render();
      }).catch(function () {
        b.disabled = false;
        b.textContent = '다시 알려 주세요';
      });
    });
    $('kn-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', render);
    window.addEventListener('voc-data-change', render);
  }

  window.SFA_READY = (window.SFA_READY || Promise.resolve()).then(function () {
    return Promise.all([A.getKnownErrors(), A.getUsers()]);
  }).then(function (r) {
    known = r[0] || []; users = r[1] || [];
    bind();
    return render();
  });
})();
