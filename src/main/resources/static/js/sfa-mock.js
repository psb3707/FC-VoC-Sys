/* S1 SFA 메인 목업 동작 (docs/06-ui-spec.md 3절, 11절).
   상태는 주소 # 뒤에 둔다: role=FC|MANAGER|SALES|IT, user=U-001, popup=alarm, notice=next, demo=1
   클릭하면 주소를 바꾸고, 주소가 바뀌면 화면을 다시 그린다(한 경로). */
(function () {
  'use strict';
  var ROLES = ['FC', 'MANAGER', 'SALES', 'IT'];
  var DEFAULT_NOTICE = '이 화면은 다음 단계에서 만들어요.';
  var users = [];
  var noticeText = null;   // 마지막으로 누른 요소의 안내 문구 (주소에는 남기지 않음)
  var $ = function (id) { return document.getElementById(id); };

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
    var order = ['role', 'user', 'popup', 'notice', 'demo'];
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

  function renderRole(st) {
    Array.prototype.forEach.call(document.querySelectorAll('#role-seg button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-role') === st.role));
    });
    var list = usersOf(st.role);
    var sel = $('user-select');
    sel.innerHTML = '';
    list.forEach(function (u) {
      var o = document.createElement('option');
      o.value = u.id;
      o.textContent = u.name;
      sel.appendChild(o);
    });
    var cur = list.filter(function (u) { return u.id === st.user; })[0] || list[0];
    if (cur) sel.value = cur.id;
    $('ledger-link').hidden = !(st.role === 'SALES' || st.role === 'IT');
    return cur ? cur.id : null;
  }

  function renderAlarm(st, items) {
    var badge = $('alarm-badge');
    badge.textContent = String(items.length);
    badge.hidden = items.length === 0;
    $('alarm-btn').setAttribute('aria-label', items.length ? '알림 ' + items.length + '건' : '알림');

    var ul = $('alarm-list');
    ul.innerHTML = '';
    items.forEach(function (n) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'alarm-item';
      b.setAttribute('data-notice', '내 신고 경과 화면은 다음 단계에서 만들어요.');
      b.appendChild(document.createTextNode(n.bodySnapshot));
      var w = document.createElement('span');
      w.className = 'when';
      w.textContent = fmtWhen(n.at);
      b.appendChild(w);
      li.appendChild(b);
      ul.appendChild(li);
    });
    $('alarm-empty').hidden = items.length > 0;
    $('alarm-pop').hidden = st.popup !== 'alarm';
    $('alarm-btn').setAttribute('aria-expanded', String(st.popup === 'alarm'));
  }

  function render() {
    var st = readHash();
    document.body.classList.toggle('demo', st.demo === '1');
    var userId = renderRole(st);
    $('notice-text').textContent = noticeText || DEFAULT_NOTICE;
    $('notice-box').hidden = st.notice !== 'next';
    return window.ApiClient.getNotifications(userId).then(function (items) {
      renderAlarm(st, items);
    });
  }

  function bind() {
    $('role-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-role]');
      if (b) update({ role: b.getAttribute('data-role'), user: '', popup: '' });
    });
    $('user-select').addEventListener('change', function (e) { update({ user: e.target.value }); });
    $('alarm-btn').addEventListener('click', function () {
      update({ popup: readHash().popup === 'alarm' ? '' : 'alarm' });
    });
    $('notice-close').addEventListener('click', function () { noticeText = null; update({ notice: '' }); });
    // data-notice 가 있는 요소(진입점, 결함 대장 링크, 알림 항목)는 안내 상자를 연다
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-notice]');
      if (!t) return;
      noticeText = t.getAttribute('data-notice');
      update({ notice: 'next' });
    });
    // 기존 탭은 모양만 바뀐다 (새 탭은 안내 상자)
    Array.prototype.forEach.call(document.querySelectorAll('.tabs'), function (ul) {
      ul.addEventListener('click', function (e) {
        var t = e.target.closest('.tab');
        if (!t || t.hasAttribute('data-notice')) return;
        Array.prototype.forEach.call(ul.querySelectorAll('.tab'), function (x) { x.classList.toggle('is-on', x === t); });
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') update({ popup: '', notice: '' });
    });
    window.addEventListener('hashchange', render);
  }

  window.SFA_READY = window.ApiClient.getUsers().then(function (list) {
    users = list;
    bind();
    return render();
  });
})();
