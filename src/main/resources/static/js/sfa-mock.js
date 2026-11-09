/* S1 SFA 메인 목업 동작 (docs/06-ui-spec.md 3절, 11절, ADR-012).
   상태는 주소 # 뒤에 둔다: role=FC|MANAGER|SALES|IT, user=U-001, popup=alarm, notice=next, demo=1,
     board=system|ceo|sales|known (공지 탭. 없으면 일반공지. known 이면 S3 요약 줄을 js/known-panel.js 가 그린다)
   클릭하면 주소를 바꾸고, 주소가 바뀌면 화면을 다시 그린다(한 경로).
   화면 안에 시안 표시나 역할 전환 버튼은 없다(ADR-016). 역할·사용자는 주소로만 바꾼다(06번 11절 시연 주소 목록).
   ?compare=1(scripts/ui_compare.py)은 <html class="compare"> 만 붙인다. 지금은 숨길 요소가 없다. */
(function () {
  'use strict';
  var ROLES = ['FC', 'MANAGER', 'SALES', 'IT'];
  var DEFAULT_NOTICE = '이 화면은 다음 단계에서 만들어요.';
  var users = [];
  var home = {};
  var BOARDS = ['general', 'system', 'ceo', 'sales', 'known'];
  var noticeText = null;   // 마지막으로 누른 요소의 안내 문구 (주소에는 남기지 않음)
  var $ = function (id) { return document.getElementById(id); };

  /* 작은 요소 생성 도우미: el('div', 'cls', [자식 또는 글자]) */
  function el(tag, cls, kids) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    (kids || []).forEach(function (k) {
      if (k == null) return;
      e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    });
    return e;
  }
  function icon(id) {
    var ns = document.querySelector('svg').namespaceURI;   // SVG 이름공간 (주소 문자열을 코드에 두지 않음)
    var s = document.createElementNS(ns, 'svg');
    var u = document.createElementNS(ns, 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }
  function fill(id, nodes) {
    var box = $(id);
    box.innerHTML = '';
    nodes.forEach(function (n) { box.appendChild(n); });
  }
  function mmdd(iso) { return iso.slice(5, 7) + '.' + iso.slice(8, 10); }

  function readHash() {
    var st = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = i < 0 ? kv : kv.slice(0, i);
      st[decodeURIComponent(k)] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
    });
    if (ROLES.indexOf(st.role) < 0) st.role = 'FC';
    return st;
  }

  function writeHash(st) {
    // S1 키 다음에 S2 접수 패널 키(js/intake-panel.js), 그 밖의 키는 받은 순서대로 유지
    // S3(js/known-panel.js): board, panel=known, tab, item
    var order = ['role', 'user', 'popup', 'notice', 'demo', 'board', 'panel', 'tab', 'item',
      'mode', 'known', 'llm', 'case', 'step', 'alert'];
    Object.keys(st).forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    var parts = order.filter(function (k) { return st[k]; }).map(function (k) {
      return k + '=' + encodeURIComponent(st[k]);
    });
    var next = '#' + parts.join('&');
    if (location.hash !== next) location.hash = next; else render();
  }

  function update(patch) {
    var st = readHash();
    Object.keys(patch).forEach(function (k) { st[k] = patch[k]; });
    writeHash(st);
  }

  function usersOf(role) { return users.filter(function (u) { return u.role === role; }); }

  function fmtWhen(iso) {
    // "2026-11-02T10:20:00+09:00" -> "11월 2일 10:20" (시간대 변환 없이 표기 그대로)
    return parseInt(iso.slice(5, 7), 10) + '월 ' + parseInt(iso.slice(8, 10), 10) + '일 ' + iso.slice(11, 16);
  }

  /* ---- 가상 데이터로 실제 SFA 자리 채우기 (한 번만) ---- */
  function renderHome() {
    var h = home;
    fill('perf', (h.performance || []).map(function (p) {
      return el('div', 'perf-cell', [el('span', 'perf-label', [p.label, el('small', null, ['(' + p.unit + ')'])]),
        el('span', 'perf-value', [p.value])]);
    }));
    fill('activity', (h.activity || []).map(function (a) {
      return el('div', 'act-card', [el('span', null, [a.label]), el('b', 'num', [a.count])]);
    }));
    fill('customers', (h.customerGroups || []).map(function (g) {
      var rows = g.rows.map(function (r) { return el('li', null, [el('span', null, [r.label]), el('b', null, [r.count])]); });
      return el('div', 'cust-card', [el('div', 'cust-head', [el('span', null, [g.title]), el('b', 'num', [g.count])]),
        el('ul', null, rows)]);
    }));
    fill('days', (h.days || []).map(function (d) {
      var head = el('div', 'day-head', [el('span', 'day-date', [mmdd(d.date)]),
        el('span', 'day-wd', [d.today ? d.weekday + '(TODAY)' : d.weekday])]);
      var go = el('span', 'day-go');
      go.appendChild(icon('i-right'));
      var ico = el('span', 'day-ico');
      var mascot = document.createElement('img');
      mascot.src = 'img/mascot.png';
      mascot.alt = '';
      ico.appendChild(mascot);
      return el('div', 'day-card' + (d.today ? ' is-today' : ''), [head, go, ico,
        el('span', 'day-msg', [d.eventCount ? '일정 ' + d.eventCount + '건' : '일정이 없습니다.'])]);
    }));
    fill('pills', (h.summaries || []).map(function (s) {
      return el('div', 'pill', [el('span', null, [s.label]), el('b', null, [s.count])]);
    }));
    fill('design-rows', (h.designHistory || []).map(function (r) {
      return el('tr', null, [el('td', 'c-no', [r.designNo]), el('td', null, [r.customerName]),
        el('td', 'c-prod', [r.productName]), el('td', 'c-date', [r.designedAt.replace(/-/g, '.')])]);
    }));
  }

  function renderBoard(st) {
    var board = BOARDS.indexOf(st.board) < 0 ? 'general' : st.board;
    Array.prototype.forEach.call(document.querySelectorAll('#notice-tabs .tab'), function (x) {
      x.classList.toggle('is-on', x.getAttribute('data-board') === board);
      x.setAttribute('aria-pressed', String(x.getAttribute('data-board') === board));
    });
    if (board === 'known') return;   // S3 요약 줄은 js/known-panel.js 가 그린다
    var list = (home.boards || {})[board] || [];
    fill('board', list.map(function (n) {
      return el('li', null, [el('span', 'b-title', [n.title]), el('span', 'b-date', [n.postedAt])]);
    }));
  }

  function renderRole(st) {
    var list = usersOf(st.role);
    var cur = list.filter(function (u) { return u.id === st.user; })[0] || list[0];
    $('profile-name').textContent = cur ? cur.name : '';
    $('profile-sub').textContent = home.profileSub || '';
    return cur ? cur.id : null;
  }

  function renderAlarm(st, items) {
    var badge = $('alarm-badge');
    var unread = items.filter(function (n) { return !n.read; }).length;
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
    $('alarm-btn').setAttribute('aria-label', unread ? '새 알림 ' + unread + '건' : '알림');

    var ul = $('alarm-list');
    ul.innerHTML = '';
    items.forEach(function (n) {
      var b = el('button', 'alarm-item', [n.bodySnapshot, el('span', 'when', [fmtWhen(n.at) + (n.read ? ' · 읽음' : '')])]);
      b.type = 'button';
      b.setAttribute('data-kn-defect', n.defectId);   // 누르면 S3 패널 [내 신고] (js/known-panel.js)
      b.setAttribute('data-kn-notice', n.id);
      if (n.reportId) b.setAttribute('data-kn-report', n.reportId);
      b.setAttribute('aria-haspopup', 'dialog');
      ul.appendChild(el('li', null, [b]));
    });
    $('alarm-empty').hidden = items.length > 0;
    $('alarm-pop').hidden = st.popup !== 'alarm';
    $('alarm-btn').setAttribute('aria-expanded', String(st.popup === 'alarm'));
  }

  function render() {
    var st = readHash(), hash = location.hash;
    document.body.classList.toggle('demo', st.demo === '1');
    var userId = renderRole(st);
    renderBoard(st);
    $('notice-text').textContent = noticeText || DEFAULT_NOTICE;
    $('notice-box').hidden = st.notice !== 'next';
    return window.ApiClient.getNotifications(userId).then(function (items) {
      if (location.hash === hash) renderAlarm(st, items);
    });
  }

  function bind() {
    $('alarm-btn').addEventListener('click', function () {
      update({ popup: readHash().popup === 'alarm' ? '' : 'alarm' });
    });
    $('notice-close').addEventListener('click', function () { noticeText = null; update({ notice: '' }); });
    // data-notice 가 있는 요소(진입점 등)는 안내 상자를 연다
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-notice]');
      if (!t) return;
      noticeText = t.getAttribute('data-notice');
      update({ notice: 'next' });
    });
    // 공지 탭: 주소의 board 만 바꾼다 (알려진 오류·내 신고 탭이면 S3 요약 줄)
    $('notice-tabs').addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (!t) return;
      var b = t.getAttribute('data-board');
      update({ board: b === 'general' ? '' : b });
    });
    // 업무 탭: 모양만 바뀐다 (목록은 가입설계 이력 고정)
    $('work-tabs').addEventListener('click', function (e) {
      var t = e.target.closest('.stab');
      if (!t) return;
      Array.prototype.forEach.call(this.querySelectorAll('.stab'), function (x) { x.classList.toggle('is-on', x === t); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') update({ popup: '', notice: '' });
    });
    window.addEventListener('hashchange', render);
    window.ApiClient.watchIntakeUpdates(function () {
      var st = readHash(), hash = location.hash;
      var cur = usersOf(st.role).find(function (u) { return u.id === st.user; }) || usersOf(st.role)[0];
      window.ApiClient.getNotifications(cur ? cur.id : null).then(function (items) {
        if (location.hash === hash) renderAlarm(st, items);
      });
    });
  }

  if (/[?&]compare=1(&|$)/.test(location.search)) document.documentElement.classList.add('compare');

  // 다른 화면 모듈(접수 패널)도 같은 주소 상태를 쓴다
  window.SfaHash = { read: readHash, update: update };

  window.SfaCopy = function (value, status, fallback) {
    function done(copied) {
      if (status) status.textContent = copied ? '복사했어요.' : '자동으로 복사하지 못했어요. 글자를 선택해 복사해 주세요.';
      if (!copied && fallback) {
        var range = document.createRange();
        range.selectNodeContents(fallback);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    if (!navigator.clipboard) return done(false);
    return navigator.clipboard.writeText(value).then(function () { done(true); }, function () { done(false); });
  };

  window.SFA_READY = Promise.all([window.ApiClient.getUsers(), window.ApiClient.getSfaHome()]).then(function (r) {
    users = r[0];
    home = r[1];
    renderHome();
    bind();
    return render();
  });
})();
