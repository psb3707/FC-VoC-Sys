/* 화면 자체 검사 (docs/06-ui-spec.md 11절). index.html·ledger.html ?selftest=1 일 때만 불러온다.
   결과는 <pre id="selftest-result"> 에 {ok, checks:[{name, pass, detail}]} JSON으로 남긴다.
   요소 구분: data-a11y="new"(새 요소) | "sfa"(기존 모양·진입점) | "replica"(재현한 기존 화면·가상 데이터, 대비 제외: ADR-012) | "badge"
   data-clip-ok: 원래 화면처럼 일부러 잘라 보이는 영역(날짜 카드 슬라이더). 글자 잘림 검사 제외. */
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

    // 4~6은 SFA 홈(index.html)에만 있는 요소. SFA 밖 화면(<body data-screen>, 예: S4 ledger.html)은 건너뛴다
    var screen = document.body.getAttribute('data-screen');
    if (!screen) {
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

    // 5. SFA 공지 탭 = 06번 0-1 (높이 44, 글자 14, 위 모서리 12, 폭은 글자 폭 60px 이상, 한 줄에 5개 모두 보임)
    var tabs = all('[data-sfa="tab"]');
    var tf = tabs.filter(function (el) {
      var r = el.getBoundingClientRect();
      return !near(r.height, 44) || r.width < 60 - EPS || !near(px(cs(el).fontSize), 14) || !near(px(cs(el).borderTopLeftRadius), 12);
    }).map(function (el) { var r = el.getBoundingClientRect(); return label(el) + ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0); });
    if (tabs.length < 5) tf.push('공지 탭 수 ' + tabs.length + ' (5 필요)');
    tabs.forEach(function (el) {
      var box = el.closest('.tabs').getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.right > box.right + EPS || Math.abs(r.top - tabs[0].getBoundingClientRect().top) > EPS) tf.push(label(el) + ' 탭 줄 밖');
    });
    add('sfa-tab-token', tf, tabs.length + '개');

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
    var newOn = !!newT && newT.classList.contains('is-on');
    var otherT = newT && newT.closest('.tabs').querySelector('.tab:not([data-entry])');
    same(newT, otherT, ['height', 'fontSize', 'borderTopLeftRadius'], '공지 탭');
    if (!newOn) {
      same(newT, newT && newT.closest('.tabs').querySelector('.tab:not(.is-on):not([data-entry])'),
        ['fontWeight', 'color', 'backgroundColor', 'borderTopColor'], '공지 탭');
    } else {
      // 새 탭이 선택된 상태(board=known): 다른 탭과 비교할 수 없으므로 선택 탭 토큰(0-1)과 비교
      var ts = cs(newT);
      if (hex(parseColor(ts.backgroundColor)) !== '#ffffff') sf.push('공지 탭(선택) 바탕 ' + ts.backgroundColor);
      if (parseInt(ts.fontWeight, 10) !== 700) sf.push('공지 탭(선택) 굵기 ' + ts.fontWeight);
      if (hex(parseColor(ts.color)) !== '#292c33') sf.push('공지 탭(선택) 글자 ' + ts.color);
    }
    add('entry-same-look', sf, '퀵메뉴·공지 탭');
    }

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

    // 8. 대비 (replica 제외). 큰 글자(24px 이상, 굵은 18.66px 이상)는 3:1
    var cf = [];
    texts.forEach(function (el) {
      if (cat(el) === 'replica') return;
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
      if (!el.textContent.trim() || el.closest('[data-clip-ok]')) return false;
      var s = cs(el);
      var hx = /hidden|clip/.test(s.overflowX) || s.textOverflow === 'ellipsis';
      var hy = /hidden|clip/.test(s.overflowY);
      return (hx && el.scrollWidth > el.clientWidth + 1) || (hy && el.scrollHeight > el.clientHeight + 1);
    }).map(function (el) { return label(el) + ' ' + el.scrollWidth + '/' + el.clientWidth; }));

    // 10-1. 화면 안 시안 표시 없음 (ADR-016): 보이는 글자·탭 제목에 "시안" 이 없다
    var proto = /시안/;
    var pt = all('body *').filter(function (el) { return proto.test(ownText(el)) || proto.test(el.getAttribute('aria-label') || ''); }).map(label);
    if (proto.test(document.title)) pt.push('title "' + document.title + '"');
    add('no-proto-marker', pt);

    // 11. S2 접수 패널(열려 있을 때만): 06번 0-2·1·4절
    var pn = document.getElementById('intake-panel');
    if (pn && visible(pn)) {
      var pf = [], pr = pn.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      var wantW = window.innerWidth < 1280 ? vw : 520;
      if (!near(pr.width, wantW)) pf.push('패널 폭 ' + pr.width.toFixed(1) + ' (기대 ' + wantW + ')');
      if (!near(pr.right, vw) || !near(pr.top, 0)) pf.push('패널 위치 오른쪽·위 아님');
      if (pn.getAttribute('role') !== 'dialog' || pn.getAttribute('aria-modal') !== 'true') pf.push('role=dialog/aria-modal 없음');
      var lab = document.getElementById(pn.getAttribute('aria-labelledby') || '');
      if (!lab || !lab.textContent.trim()) pf.push('aria-labelledby 대상 없음');
      var title = pn.querySelector('.pn-head h2');
      if (!title || px(cs(title).fontSize) < 24 - EPS) pf.push('패널 제목 24px 미만');
      all('#intake-panel .pn-body h3').forEach(function (h) { if (px(cs(h).fontSize) < 24 - EPS) pf.push(label(h) + ' 제목 24px 미만'); });
      // 단계 표시줄은 스크롤 영역 밖(상단 고정)
      var steps = pn.querySelector('.pn-steps'), body = pn.querySelector('.pn-body');
      if (!steps || !body || body.contains(steps) || steps.getBoundingClientRect().bottom > body.getBoundingClientRect().top + EPS) pf.push('단계 표시줄이 상단 고정 아님');
      if (body && !/auto|scroll/.test(cs(body).overflowY)) pf.push('본문 스크롤 영역 아님');
      var asking = !!document.getElementById('pn-assist-form');
      if (asking && (!steps.hidden || !body.querySelector('.pn-assist-suggestions, .pn-assist-result'))) {
        pf.push('AI 문의의 단계 표시줄 또는 본문 구성 확인');
      }
      if (!asking && !(document.getElementById('pn-steps-text') || {}).textContent) pf.push('단계 글자 표시 없음(색만으로 전달)');
      // 주 행동 버튼: 한 화면 하나, 56px·모서리 12px·강조색 #0077b3
      var prim = all(asking ? '#intake-panel .pn-btn' : '#intake-panel .pn-foot .pn-btn');
      if (prim.length > 1) pf.push('주 행동 버튼 ' + prim.length + '개');
      prim.forEach(function (b) {
        var r = b.getBoundingClientRect(), s = cs(b);
        if (r.height < 56 - EPS || !near(px(s.borderTopLeftRadius), 12) || hex(parseColor(s.backgroundColor)) !== '#0077b3') {
          pf.push(label(b) + ' h=' + r.height + ' r=' + s.borderTopLeftRadius + ' bg=' + s.backgroundColor);
        }
      });
      // 큰 선택 카드: 아이콘 원은 장식색 #0099e6
      all('#intake-panel .pn-choice .pn-ico').forEach(function (i) {
        if (hex(parseColor(cs(i).backgroundColor)) !== '#0099e6') pf.push('선택 카드 아이콘 원 ' + cs(i).backgroundColor);
      });
      // 맨 아래는 행동 줄(.pn-foot): 패널 바닥에 붙고 그 아래 다른 줄이 없다 (ADR-016)
      var foot = document.getElementById('pn-foot');
      if (!foot || !visible(foot) || !near(foot.getBoundingClientRect().bottom, pr.bottom)) pf.push('행동 줄이 패널 맨 아래 아님');
      add('panel-token', pf, wantW + 'px');
    }

    // 12. S3 공지 카드 요약 줄(진입점, 06번 0-1 공지 목록 줄: 높이 48·글자 14·#292c33, 카드 안)
    var sums = all('#board .kn-sum');
    if (sums.length) {
      var smf = [], card = document.querySelector('.notice-card').getBoundingClientRect();
      sums.forEach(function (li) {
        var r = li.getBoundingClientRect(), s = cs(li);
        if (!near(r.height, 48) || !near(px(s.fontSize), 14) || hex(parseColor(s.color)) !== '#292c33') {
          smf.push(label(li) + ' h=' + r.height.toFixed(1) + ' font=' + s.fontSize + ' color=' + s.color);
        }
        if (li.getAttribute('data-a11y') !== 'sfa') smf.push(label(li) + ' data-a11y=sfa 아님');
        if (r.bottom > card.bottom + EPS) smf.push(label(li) + ' 공지 카드 밖');
        var t = li.querySelector('.b-title');
        if (t && cs(t).fontSize !== cs(li).fontSize) smf.push(label(t) + ' 글자 크기 다름');
      });
      var et = document.querySelector('[data-entry="tab"]');
      if (!et || !et.classList.contains('is-on')) smf.push('알려진 오류·내 신고 탭이 선택 표시 아님');
      add('s3-summary-token', smf, sums.length + '줄');
    }

    // 13. S3 패널(열려 있을 때만): S2와 같은 틀(0-2절) + 전환 탭 + 내 신고 단계 글자 (06번 5절, ADR-015)
    var kn = document.getElementById('known-panel');
    if (kn && visible(kn)) {
      var kf = [], kr = kn.getBoundingClientRect(), kvw = document.documentElement.clientWidth;
      var kW = window.innerWidth < 1280 ? kvw : 520;
      if (!near(kr.width, kW)) kf.push('패널 폭 ' + kr.width.toFixed(1) + ' (기대 ' + kW + ')');
      if (!near(kr.right, kvw) || !near(kr.top, 0)) kf.push('패널 위치 오른쪽·위 아님');
      if (kn.getAttribute('role') !== 'dialog' || kn.getAttribute('aria-modal') !== 'true') kf.push('role=dialog/aria-modal 없음');
      var kl = document.getElementById(kn.getAttribute('aria-labelledby') || '');
      if (!kl || !kl.textContent.trim()) kf.push('aria-labelledby 대상 없음');
      var kt = kn.querySelector('.pn-head h2');
      if (!kt || px(cs(kt).fontSize) < 24 - EPS) kf.push('패널 제목 24px 미만');
      all('#known-panel .pn-body h3').forEach(function (h) { if (px(cs(h).fontSize) < 24 - EPS) kf.push(label(h) + ' 제목 24px 미만'); });
      var ki = kn.querySelector('.pn-head .pn-ico');
      if (!ki || hex(parseColor(cs(ki).backgroundColor)) !== '#0099e6') kf.push('머리 아이콘 원 #0099e6 아님');
      if (document.getElementById('intake-panel') && visible(document.getElementById('intake-panel'))) kf.push('S2 패널과 함께 열림');
      // 전환 탭: tablist, 2개, 선택 하나, 선택은 굵게(색 아닌 표시)
      var tl = kn.querySelector('[role="tablist"]'), ktabs = all('#known-panel [role="tab"]');
      if (!tl) kf.push('role=tablist 없음');
      if (ktabs.length !== 2) kf.push('전환 탭 ' + ktabs.length + '개 (2 필요)');
      var sel = ktabs.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; });
      if (sel.length !== 1) kf.push('선택된 탭 ' + sel.length + '개');
      sel.forEach(function (b) { if (parseInt(cs(b).fontWeight, 10) < 700) kf.push('선택 탭 굵게 아님'); });
      // 본문 스크롤 영역
      var kb = document.getElementById('kn-body');
      if (!kb || !/auto|scroll/.test(cs(kb).overflowY)) kf.push('본문 스크롤 영역 아님');
      // 내 신고: 카드마다 지금 단계 글자 + 단계 이름 줄 + 상태 태그 (색만으로 전하지 않음)
      all('#known-panel .kn-progress').forEach(function (p) {
        var now = p.querySelector('.kn-now'), names = p.querySelector('.kn-stages');
        if (!now || !now.textContent.trim()) kf.push('단계 글자 없음');
        if (!names || !names.querySelector('[aria-current="step"]')) kf.push('지금 단계 표시(aria-current) 없음');
      });
      all('#known-panel .kn-card').forEach(function (c) {
        var tag = c.querySelector('.pn-tag');
        if (!tag || !tag.textContent.trim()) kf.push(label(c) + ' 상태 글자 없음');
      });
      // 주 행동 버튼은 한 화면 하나 이하
      var kp = all('#known-panel .pn-btn');
      if (kp.length > 1) kf.push('주 행동 버튼 ' + kp.length + '개');
      // 맨 아래는 본문(행동 줄 없음): 본문이 패널 바닥까지 (ADR-016)
      if (kb && !near(kb.getBoundingClientRect().bottom, kr.bottom)) kf.push('본문이 패널 맨 아래까지 아님');
      add('s3-panel-token', kf, kW + 'px');
    }

    // 14. S4 결함 대장 (06번 6절, 0-3절 데이터 표·페이지 머리·가운데 대화상자, ADR-014 결정 5)
    if (screen === 'ledger') {
      var lf = [], lvw = document.documentElement.clientWidth;
      var brand = document.querySelector('.ld-top h1');
      if (!brand || px(cs(brand).fontSize) < 24 - EPS) lf.push('페이지 제목 24px 미만');
      var ltabs = all('.ld-tabs [role="tab"]');
      if (!document.querySelector('.ld-tabs[role="tablist"]')) lf.push('role=tablist 없음');
      if (ltabs.length !== 2) lf.push('목록 탭 ' + ltabs.length + '개 (2 필요)');
      var lsel = ltabs.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; });
      if (lsel.length !== 1) lf.push('선택된 탭 ' + lsel.length + '개');
      lsel.forEach(function (b) { if (parseInt(cs(b).fontWeight, 10) < 700) lf.push('선택 탭 굵게 아님'); });
      // 표: 카드 안, 행 56px 이상, 세로 칸 선·바깥 테두리 없음
      all('.ld-table tbody tr').forEach(function (tr) {
        if (tr.getBoundingClientRect().height < 56 - EPS) lf.push('표 행 높이 ' + tr.getBoundingClientRect().height.toFixed(1));
      });
      all('.ld-table td, .ld-table th').forEach(function (c) {
        var s = cs(c);
        if (px(s.borderLeftWidth) || px(s.borderRightWidth)) lf.push(label(c) + ' 세로 칸 선');
      });
      all('.ld-card').forEach(function (c) {
        var s = cs(c);
        if (px(s.borderTopWidth) && s.boxShadow !== 'none') lf.push('카드 테두리+그림자 겹침');
        if (!near(px(s.borderTopLeftRadius), 24)) lf.push('카드 모서리 ' + s.borderTopLeftRadius);
      });
      if (!document.querySelector('.ld-total') || !/총 \d+건/.test(document.querySelector('.ld-total').textContent)) lf.push('"총 N건" 없음');
      // 상세 패널: S2와 같은 틀(오른쪽 520px, 1280 미만 100%)
      var lp = document.getElementById('ledger-panel');
      if (lp && visible(lp)) {
        var lr = lp.getBoundingClientRect(), lw = window.innerWidth < 1280 ? lvw : 520;
        if (!near(lr.width, lw)) lf.push('패널 폭 ' + lr.width.toFixed(1) + ' (기대 ' + lw + ')');
        if (!near(lr.right, lvw) || !near(lr.top, 0)) lf.push('패널 위치 오른쪽·위 아님');
        if (lp.getAttribute('role') !== 'dialog' || lp.getAttribute('aria-modal') !== 'true') lf.push('패널 role=dialog/aria-modal 없음');
        var lt = lp.querySelector('.pn-head h2');
        if (!lt || px(cs(lt).fontSize) < 24 - EPS) lf.push('패널 제목 24px 미만');
        var lfoot = document.getElementById('ld-foot');
        if (!lfoot || !near(lfoot.getBoundingClientRect().bottom, lr.bottom)) lf.push('행동 줄이 패널 맨 아래 아님');
        if (all('#ledger-panel .pn-btn').length !== 1) lf.push('패널 주 버튼 ' + all('#ledger-panel .pn-btn').length + '개 (1 필요)');
        // 대표 결함 패널은 단계 이름 줄 없이 글자 한 줄("N단계 중 M단계 · …")로 뜻을 전한다(06번 6절). 신고 패널에는 진행 표시가 없다
        all('#ledger-panel .kn-progress').forEach(function (p) {
          var now = p.querySelector('.kn-now');
          if (!now || !/단계/.test(now.textContent)) lf.push('진행 단계 글자 없음');
        });
      }
      // 가운데 대화상자: 화면 안, 가운데, 모서리 24px, 단계 글자, 주 버튼 하나(56px·#0077b3)
      var ld = document.getElementById('ledger-dialog');
      if (ld && visible(ld)) {
        var dr = ld.getBoundingClientRect(), vh = document.documentElement.clientHeight;
        if (Math.abs((dr.left + dr.right) / 2 - lvw / 2) > 1) lf.push('대화상자 가로 가운데 아님');
        if (dr.top < -EPS || dr.bottom > vh + EPS || dr.left < -EPS || dr.right > lvw + EPS) lf.push('대화상자가 화면 밖으로 나감');
        if (ld.getAttribute('role') !== 'dialog' || ld.getAttribute('aria-modal') !== 'true') lf.push('대화상자 role=dialog/aria-modal 없음');
        if (!near(px(cs(ld).borderTopLeftRadius), 24)) lf.push('대화상자 모서리 ' + cs(ld).borderTopLeftRadius);
        if (!(document.getElementById('ld-dlg-steps-text') || {}).textContent) lf.push('대화상자 단계 글자 없음');
        var dp = all('#ledger-dialog .pn-btn');
        if (dp.length !== 1) lf.push('대화상자 주 버튼 ' + dp.length + '개 (1 필요)');
        dp.forEach(function (b) {
          var r = b.getBoundingClientRect(), s = cs(b);
          if (r.height < 56 - EPS || !near(px(s.borderTopLeftRadius), 12) || hex(parseColor(s.backgroundColor)) !== '#0077b3') {
            lf.push(label(b) + ' h=' + r.height + ' r=' + s.borderTopLeftRadius + ' bg=' + s.backgroundColor);
          }
        });
        var dfoot = document.getElementById('ld-dlg-foot');
        if (!dfoot || !near(dfoot.getBoundingClientRect().bottom, dr.bottom)) lf.push('행동 줄이 대화상자 맨 아래 아님');
      } else if (!(lp && visible(lp)) && all('.ld-main .pn-btn').length > 1) {
        lf.push('목록 주 버튼 ' + all('.ld-main .pn-btn').length + '개');
      }
      add('s4-ledger-token', lf, lvw + 'px');

      // 패널·대화상자 본문의 덩어리끼리 겹치거나 붙지 않는가: 이어지는 두 덩어리 사이가 겹치면 실패,
      // 둘 다 그림자 있는 카드(또는 그림자 카드 목록)이면 12px 이상 떨어져야 한다 (06번 0-3 콘텐츠 카드, 신고 묶기 겹침 재발 방지)
      var gf = [];
      function shadowy(el) {
        if (cs(el).boxShadow !== 'none') return true;
        var inner = el.querySelector(':scope > li > *');
        return !!inner && cs(inner).boxShadow !== 'none';
      }
      ['ld-body', 'ld-dlg-body'].forEach(function (id) {
        var box = document.getElementById(id);
        if (!box || !visible(box)) return;
        var kids = Array.prototype.filter.call(box.children, visible);
        for (var i = 1; i < kids.length; i++) {
          var a = kids[i - 1], b = kids[i];
          var gap = b.getBoundingClientRect().top - a.getBoundingClientRect().bottom;
          if (gap < -EPS) gf.push(label(a) + ' ↔ ' + label(b) + ' 겹침 ' + gap.toFixed(1));
          else if (shadowy(a) && shadowy(b) && gap < 12 - EPS) gf.push(label(a) + ' ↔ ' + label(b) + ' 간격 ' + gap.toFixed(1));
        }
      });
      add('s4-block-gap', gf);

      // 새 신고 알림·AI 추천 (REQ-LG-06·07, ADR-017): 색만으로 알리지 않고, AI 추천은 표시가 있고 연결은 사람이 한다
      var af = [];
      all('#ld-alarm-badge, #ld-new-badge').forEach(function (b) {
        if (!/\d/.test(b.textContent)) af.push(label(b) + ' 숫자 없음');
      });
      var alarm = document.getElementById('ld-alarm');
      if (alarm && !/새 신고/.test(alarm.textContent)) af.push('알림 버튼 글자 없음');
      all('.ld-ai').forEach(function (c) {
        var tag = c.querySelector('.kn-card-head .ld-tag'), load = c.querySelector('.pn-loading');
        if (!load && (!tag || !/AI 추천|규칙 후보/.test(tag.textContent))) af.push('AI 추천 카드에 "AI 추천" 표시 없음');
        var rule = !!tag && /규칙/.test(tag.textContent);   // 규칙 후보는 카드 머리 태그로 알림
        Array.prototype.forEach.call(c.querySelectorAll('.ld-cands > li'), function (li) {
          var st = li.querySelector('.ld-cand-head .ld-tag');
          if (!rule && (!st || !/비슷함/.test(st.textContent))) af.push(label(li) + ' 비슷함 글자 없음');
          if (!li.querySelector('[data-act="link-ai"]')) af.push(label(li) + ' [이 결함에 묶기] 없음');
        });
      });
      // AI 추천이 보이는 곳에는 "사람이 확인" 안내가 있어야 한다
      var aiShown = all('.ld-ai, .ld-choice-why').length;
      if (aiShown && !/담당자가 확인/.test(((document.getElementById('ld-body') || {}).textContent || '') + ((document.getElementById('ld-dlg-body') || {}).textContent || ''))) {
        af.push('"담당자가 확인" 안내 없음');
      }
      add('s4-ai', af);

      // 정보 배치 (06번 6절, 02번 5-2절): 목록 5열·경과·확인할 것, 보조 줄도 18px, 패널 요약 카드·단계 이름 줄 없음, 역할별 순서
      var df = [];
      var dtable = document.querySelector('.ld-table[aria-label^="대표 결함 목록"]');
      if (dtable) {
        var heads = all('.ld-table[aria-label^="대표 결함 목록"] thead th').map(function (th) { return th.textContent.trim(); });
        if (heads.join('|') !== '대표 결함|영향|처리 등급|상태|확인할 것') df.push('목록 열 ' + heads.join('|'));
        Array.prototype.forEach.call(dtable.querySelectorAll('tbody tr'), function (tr) {
          var c = tr.children;
          if (!c[3] || !/지남|바뀜/.test(c[3].textContent)) df.push(tr.getAttribute('data-id') + ' 경과 없음');
          if (!c[4] || !c[4].textContent.trim()) df.push(tr.getAttribute('data-id') + ' 확인할 것 칸 빔');
        });
      }
      all('.ld-sub, .ld-flags li').forEach(function (s) {
        if (px(cs(s).fontSize) < 18 - EPS) df.push(label(s) + ' 글자 ' + cs(s).fontSize);
      });
      all('.ld-flags:not(.is-bare) li').forEach(function (li) {
        var use = li.querySelector('use'), want = li.classList.contains('is-warn') ? '#i-warn' : '#i-info';
        if (!use || use.getAttribute('href') !== want) df.push(label(li) + ' 수준 아이콘 없음');
      });
      var lpBody = document.getElementById('ld-body');
      if (lp && visible(lp) && /^대표 결함/.test((document.getElementById('ld-panel-title') || {}).textContent || '')) {
        if (lpBody.querySelector('.kn-stages')) df.push('패널 단계 이름 줄 남음');
        if (all('#ld-body .pn-card-title').some(function (t) { return t.textContent.trim() === '요약'; })) df.push('패널 요약 카드 남음');
        var h4s = all('#ld-body > h4').map(function (h) { return h.textContent.trim(); });
        var first = /role=IT/.test(location.hash) ? '원인과 상태 이력' : '안내문';
        if (h4s[0] !== first) df.push('역할별 첫 덩어리 ' + h4s[0] + ' (기대 ' + first + ')');
      }
      add('s4-density', df);
    }

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
