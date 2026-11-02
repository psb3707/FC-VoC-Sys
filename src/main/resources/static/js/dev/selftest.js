/* 화면 자체 검사 (docs/06-ui-spec.md 11절). index.html?selftest=1 일 때만 불러온다.
   결과는 <pre id="selftest-result"> 에 {ok, checks:[{name, pass, detail}]} JSON으로 남긴다.
   요소 구분: data-a11y="new"(새 요소) | "sfa"(기존 모양·진입점) | "placeholder"(회색 블록 글자, 대비 제외) | "badge" */
(function () {
  'use strict';
  var EPS = 0.5;
  var MAX_DETAIL = 12;

  function cs(el) { return getComputedStyle(el); }
  function px(v) { return parseFloat(v) || 0; }
  function visible(el) {
    if (!el.getClientRects().length) return false;
    var s = cs(el);
    if (s.visibility === 'hidden' || s.display === 'none' || px(s.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function ownText(el) {
    var t = '';
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) t += n.nodeValue;
    return t.replace(/\s+/g, ' ').trim();
  }
  function cat(el) { var c = el.closest('[data-a11y]'); return c ? c.getAttribute('data-a11y') : null; }
  function label(el) {
    var t = (ownText(el) || el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    var c = typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '';
    return el.tagName.toLowerCase() + c + (t ? ' "' + t.slice(0, 20) + '"' : '');
  }
  function all(sel) {
    return Array.prototype.filter.call(document.querySelectorAll(sel), function (el) {
      return !el.closest('#selftest-result, script, style, svg') && visible(el);
    });
  }

  // 색 계산
  function parseColor(s) {
    var m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return [0, 0, 0, 0];
    var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function over(top, bottom) {
    var a = top[3];
    return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
  }
  function bgOf(el) {
    var layers = [];
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var c = parseColor(cs(e).backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    var res = [255, 255, 255, 1];
    for (var i = layers.length - 1; i >= 0; i--) res = over(layers[i], res);
    return res;
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function hex(c) { return '#' + c.slice(0, 3).map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }

  var checks = [];
  function add(name, fails, extra) {
    var detail = fails.length ? fails.slice(0, MAX_DETAIL).join(' | ') + (fails.length > MAX_DETAIL ? ' | 외 ' + (fails.length - MAX_DETAIL) + '건' : '') : (extra || '');
    checks.push({ name: name, pass: fails.length === 0, detail: detail });
  }
  function near(a, b) { return Math.abs(a - b) <= EPS; }

  function run() {
    var texts = all('body *').filter(function (el) { return ownText(el); });
    var clickables = all('button, a[href], select, input, textarea, [role="button"]');

    // 1. 모든 보이는 글자에 구분 표시가 있는가
    add('marked', texts.filter(function (el) { return !cat(el); }).map(label), texts.length + '개 글자 요소');

    // 2. 새 요소 글자 18px 이상
    add('new-text-18px', texts.filter(function (el) { return cat(el) === 'new' && px(cs(el).fontSize) < 18 - EPS; })
      .map(function (el) { return label(el) + ' ' + cs(el).fontSize; }));

    // 3. 새 요소 누르는 곳 높이 56px 이상
    add('new-click-56px', clickables.filter(function (el) { return cat(el) === 'new' && el.getBoundingClientRect().height < 56 - EPS; })
      .map(function (el) { return label(el) + ' h=' + el.getBoundingClientRect().height.toFixed(1); }));

    // 4. SFA 퀵메뉴 버튼 = 06번 0-1 (높이 96, 모서리 16, 글자 14)
    var quick = all('[data-sfa="quick"]');
    var qf = [];
    if (quick.length < 10) qf.push('퀵메뉴 버튼 수 ' + quick.length + ' (10 필요)');
    quick.forEach(function (el) {
      var h = el.getBoundingClientRect().height, r = px(cs(el).borderTopLeftRadius);
      var lab = el.querySelector('.quick-label'), f = lab ? px(cs(lab).fontSize) : 0;
      if (!near(h, 96) || !near(r, 16) || !near(f, 14)) qf.push(label(lab || el) + ' h=' + h + ' r=' + r + ' font=' + f);
    });
    add('sfa-quick-token', qf, quick.length + '개');

    // 5. SFA 탭 = 06번 0-1 (높이 44, 폭 126 이상, 글자 14)
    var tabs = all('[data-sfa="tab"]');
    add('sfa-tab-token', tabs.filter(function (el) {
      var r = el.getBoundingClientRect();
      return !near(r.height, 44) || r.width < 126 - EPS || !near(px(cs(el).fontSize), 14);
    }).map(function (el) { var r = el.getBoundingClientRect(); return label(el) + ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0); }), tabs.length + '개');

    // 6. 새 진입점이 기존 것과 같은 모양인가
    var sf = [];
    function same(a, b, props, tag) {
      if (!a || !b) { sf.push(tag + ': 비교 대상 없음'); return; }
      var x = cs(a), y = cs(b);
      props.forEach(function (p) { if (x[p] !== y[p]) sf.push(tag + ' ' + p + ': ' + x[p] + ' ≠ ' + y[p]); });
    }
    var newQ = document.querySelector('[data-entry="quick"]'), oldQ = document.querySelector('[data-sfa="quick"]:not([data-entry])');
    same(newQ, oldQ, ['height', 'width', 'borderTopLeftRadius', 'boxShadow', 'backgroundColor', 'paddingTop'], '퀵메뉴');
    same(newQ && newQ.querySelector('.quick-label'), oldQ && oldQ.querySelector('.quick-label'), ['fontSize', 'fontWeight', 'color', 'lineHeight'], '퀵메뉴 글자');
    same(newQ && newQ.querySelector('.quick-ico'), oldQ && oldQ.querySelector('.quick-ico'), ['width', 'height', 'backgroundColor', 'borderTopLeftRadius'], '퀵메뉴 아이콘');
    var newT = document.querySelector('[data-entry="tab"]');
    var oldT = newT && newT.closest('.tabs').querySelector('.tab:not(.is-on):not([data-entry])');
    same(newT, oldT, ['height', 'fontSize', 'fontWeight', 'color', 'backgroundColor', 'borderTopLeftRadius', 'borderTopColor'], '공지 탭');
    add('entry-same-look', sf, '퀵메뉴·공지 탭');

    // 7. 알림 배지(0-2)와 팝업(0-1)
    var bf = [];
    all('[data-a11y="badge"]').forEach(function (el) {
      var r = el.getBoundingClientRect(), s = cs(el);
      if (Math.min(r.width, r.height) < 18 - EPS) bf.push('배지 크기 ' + r.width + 'x' + r.height);
      if (hex(parseColor(s.backgroundColor)) !== '#d93025') bf.push('배지 배경 ' + s.backgroundColor);
      if (hex(parseColor(s.color)) !== '#ffffff') bf.push('배지 글자 ' + s.color);
    });
    all('.alarm-pop').forEach(function (el) {
      var r = el.getBoundingClientRect(), s = cs(el);
      if (!near(r.width, 320)) bf.push('팝업 폭 ' + r.width);
      if (!near(px(s.borderTopLeftRadius), 12)) bf.push('팝업 모서리 ' + s.borderTopLeftRadius);
      if (hex(parseColor(s.borderTopColor)) !== '#e6ebf0') bf.push('팝업 테두리 ' + s.borderTopColor);
    });
    add('badge-popup-token', bf);

    // 8. 대비 (placeholder 제외). 큰 글자(24px 이상, 굵은 18.66px 이상)는 3:1
    var cf = [];
    texts.forEach(function (el) {
      if (cat(el) === 'placeholder') return;
      var s = cs(el), size = px(s.fontSize), bold = parseInt(s.fontWeight, 10) >= 700;
      var need = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
      var bg = bgOf(el), fg = parseColor(s.color);
      if (fg[3] < 1) fg = over(fg, bg);
      var r = ratio(fg, bg);
      if (r < need) cf.push(label(el) + ' ' + hex(fg) + '/' + hex(bg) + ' ' + r.toFixed(2) + ' < ' + need);
    });
    add('contrast', cf, texts.length + '개 검사');

    // 9. 가로 넘침 없음
    var sw = document.documentElement.scrollWidth;
    add('no-horizontal-scroll', sw > window.innerWidth ? ['scrollWidth ' + sw + ' > innerWidth ' + window.innerWidth] : [], sw + ' <= ' + window.innerWidth);

    // 10. 글자 잘림 없음 (overflow hidden/clip 인데 내용이 더 큼)
    add('no-clipped-text', all('body *').filter(function (el) {
      if (!el.textContent.trim()) return false;
      var s = cs(el);
      var hx = /hidden|clip/.test(s.overflowX) || s.textOverflow === 'ellipsis';
      var hy = /hidden|clip/.test(s.overflowY);
      return (hx && el.scrollWidth > el.clientWidth + 1) || (hy && el.scrollHeight > el.clientHeight + 1);
    }).map(function (el) { return label(el) + ' ' + el.scrollWidth + '/' + el.clientWidth; }));

    var result = { ok: checks.every(function (c) { return c.pass; }), url: location.hash, checks: checks };
    var pre = document.createElement('pre');
    pre.id = 'selftest-result';
    pre.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;margin:0';
    pre.textContent = JSON.stringify(result);
    document.body.appendChild(pre);
  }

  function start() {
    try { run(); } catch (e) {
      var pre = document.createElement('pre');
      pre.id = 'selftest-result';
      pre.textContent = JSON.stringify({ ok: false, checks: [{ name: 'selftest-error', pass: false, detail: String(e) }] });
      document.body.appendChild(pre);
    }
  }
  (window.SFA_READY || Promise.resolve()).then(function () { setTimeout(start, 50); }, start);
})();
