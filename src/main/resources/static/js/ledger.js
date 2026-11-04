/* S4 결함 대장 (docs/06-ui-spec.md 6절, REQ-LG-01~05, docs/02-domain-rules.md 3~5절).
   기능 없는 화면(프론트 단계): 데이터는 ApiClient(=fixtures)만 읽고 저장하지 않는다.
   상태는 주소 # 뒤에 둔다(06번 11절 S4 주소 키).
     role=SALES|IT        보는 사람 역할 (없으면 SALES)
     tab=defects|unlinked 목록 탭 (없으면 defects)
     status= grade= type= 대표 결함 필터 (Defect.status·grade·type 코드)
     item=D-…             오른쪽 상세 패널
     for=D-…              상세 패널 [신고 연결]에서 넘어온 대표 결함 (unlinked 탭에서 묶을 대상 미리 고름)
     dialog=status|link   가운데 대화상자: 상태 바꾸기 / 신고 묶기
     to=<상태 코드>       상태 바꾸기: 고른 다음 상태
     dstep=pick|detail|preview|done   대화상자 단계 (detail 은 예정일·사유가 필요한 경우만)
     date=YYYY-MM-DD      수정 예정일
     reason=NEW_SFA|WORKAROUND_OK|NOT_REPRODUCIBLE|ETC  수정하지 않음 사유 코드
     memo=…               기타 사유·되돌림 사유
     err=1                빈칸으로 [다음]을 눌렀을 때의 막힘 안내를 보인 상태
     report=R-…  link=D-… 신고 묶기: 묶을 신고 / 고른 대표 결함
   영향 지점 수·신고 수는 저장하지 않고 묶인 신고와 신고자 지점으로 센다(REQ-LG-01). */
(function () {
  'use strict';
  var A = window.ApiClient;
  var $ = function (id) { return document.getElementById(id); };

  /* ---- 코드 → 화면 문구 (쉬운 말, 06번 1절. S3 known-panel.js 와 같은 단계 이름) ---- */
  var STAGES = [['RECEIVED', '접수'], ['REPRODUCED', '문제 확인'], ['CAUSE_FOUND', '원인 파악'],
    ['WORKAROUND', '임시조치'], ['FIX_PLANNED', '수정 예정'], ['RESOLVED', '해결']];
  var WONT_FIX = 'WONT_FIX', WONT_FIX_LABEL = '수정하지 않음';
  var ORDER = STAGES.map(function (s) { return s[0]; }).concat([WONT_FIX]);
  var NOTIFY = ['WORKAROUND', 'FIX_PLANNED', 'RESOLVED', WONT_FIX];   // 02번 4절
  var REASONS = [['NEW_SFA', '새 시스템에서 해결'], ['WORKAROUND_OK', '임시 방법으로 충분'],
    ['NOT_REPRODUCIBLE', '다시 해봐도 생기지 않음'], ['ETC', '기타(직접 적기)']];
  var REASON_TEXT = { NEW_SFA: '새 시스템에서 고쳐질 예정이에요', WORKAROUND_OK: '임시 방법으로 충분히 쓸 수 있어요',
    NOT_REPRODUCIBLE: '다시 해봐도 같은 문제가 생기지 않아요' };
  var TYPE = { DEFECT: '결함', IMPROVEMENT: '개선', USAGE: '사용법', UNCLASSIFIED: '미분류' };
  var GEN = { OLD: '기존', NEW: '신규' };
  var GRADE = { IMMEDIATE: '즉시', NORMAL: '일반', BATCH: '모아서' };
  var GRADE_WEIGHT = { IMMEDIATE: 3, NORMAL: 2, BATCH: 1 };   // 업무 중요도: 처리 등급(02번 1절)으로 갈음
  var DEPT = { SUBSCRIPTION_IT: '청약업무팀 + IT', CUSTOMER_IT: '고객관리팀 + IT', LOGIN_SUPPORT: '영업지원팀',
    SALES_SUPPORT: '영업지원팀', DESIGN_SUPPORT: '상품설계지원팀', CONTRACT_IT: '계약관리팀 + IT' };
  var BUSINESS = { LOGIN: '로그인·접속', SUBSCRIPTION: '청약·서명', CUSTOMER_LOOKUP: '고객조회', DESIGN: '가입설계',
    CONTRACT_LOOKUP: '계약조회', ETC: '그 밖의 업무' };
  var ROLE_NAME = { SALES: '영업팀', IT: 'IT 담당' };

  var users = [], defects = [], unlinked = [], detail = null, preview = null;
  var draft = { date: '', reason: '', memo: '' };   // 대화상자 입력 중인 값 (주소에는 [다음]을 누를 때 적음)
  var draftKey = '';
  var opener = null;

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
      return el('div', null, [el('dt', null, [r[0]]), el('dd', null, [].concat(r[1]))]);
    }));
  }
  function btn(cls, text, act, extra) {
    var a = { type: 'button', cls: cls, 'data-act': act };
    Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
    return el('button', a, [].concat(text));
  }
  function fmtDate(iso) { return parseInt(iso.slice(5, 7), 10) + '월 ' + parseInt(iso.slice(8, 10), 10) + '일'; }
  function fmtWhen(iso) { return fmtDate(iso) + ' ' + iso.slice(11, 16); }
  function stageLabel(code) {
    if (code === WONT_FIX) return WONT_FIX_LABEL;
    var s = STAGES.filter(function (x) { return x[0] === code; })[0];
    return s ? s[1] : code;
  }
  /* 조사 "(으)로": 받침이 있으면 "으로", 없거나 ㄹ 받침이면 "로" */
  function ro(word) {
    var c = word.charCodeAt(word.length - 1) - 0xac00, jong = c >= 0 && c < 11172 ? c % 28 : 0;
    return jong && jong !== 8 ? '으로' : '로';
  }
  function stageIndex(code) { return ORDER.indexOf(code); }
  function userName(id) { var u = users.filter(function (x) { return x.id === id; })[0]; return u ? u.name : id; }
  function isBack(from, to) { return from === WONT_FIX || stageIndex(to) < stageIndex(from); }
  function notifiable(from, to) { return !isBack(from, to) && NOTIFY.indexOf(to) >= 0; }
  function needsDetail(from, to) { return to === 'FIX_PLANNED' || to === WONT_FIX || isBack(from, to); }

  function statusTag(code) {
    var cls = code === 'RESOLVED' ? ' is-ok' : code === WONT_FIX ? ' is-dim' : '';
    return el('span', { cls: 'ld-tag' + cls }, [stageLabel(code)]);
  }
  function gradeTag(code) {
    var cls = code === 'IMMEDIATE' ? ' is-warn' : code === 'BATCH' ? ' is-dim' : '';
    return el('span', { cls: 'ld-tag' + cls }, [GRADE[code] || '없음']);
  }

  /* 영향 지점 수·신고 수는 화면에서 센다 (REQ-LG-01) */
  function branchCount(d) {
    var seen = {};
    (d.reports || []).forEach(function (r) { if (r.reporter) seen[r.reporter.branchId] = true; });
    return Object.keys(seen).length;
  }
  function reporterCount(d) {
    var seen = {};
    (d.reports || []).forEach(function (r) { seen[r.reporterId] = true; });
    return Object.keys(seen).length;
  }
  function score(d) { return branchCount(d) * (GRADE_WEIGHT[d.grade] || 1); }
  function sorted(list) {
    return list.slice().sort(function (a, b) {
      return score(b) - score(a) || (b.reports || []).length - (a.reports || []).length || (a.id < b.id ? -1 : 1);
    });
  }

  /* ---- 주소 상태 (06번 11절) ---- */
  var KEYS = ['role', 'user', 'tab', 'status', 'grade', 'type', 'item', 'for', 'dialog', 'report', 'link', 'to', 'dstep',
    'date', 'reason', 'memo', 'err'];
  function read() {
    var st = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = i < 0 ? kv : kv.slice(0, i);
      st[decodeURIComponent(k)] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
    });
    if (!ROLE_NAME[st.role]) st.role = 'SALES';
    st.tab = st.tab === 'unlinked' ? 'unlinked' : 'defects';
    return st;
  }
  function go(patch) {
    var st = read();
    Object.keys(patch).forEach(function (k) { st[k] = patch[k]; });
    if (st.tab === 'defects') st.tab = '';
    var order = KEYS.slice();
    Object.keys(st).forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    var next = '#' + order.filter(function (k) { return st[k]; }).map(function (k) {
      return k + '=' + encodeURIComponent(st[k]);
    }).join('&');
    if (location.hash !== next) location.hash = next; else render();
  }
  var DIALOG_KEYS = { dialog: '', to: '', dstep: '', date: '', reason: '', memo: '', err: '', report: '', link: '' };
  function closeDialogPatch(extra) {
    var p = {};
    Object.keys(DIALOG_KEYS).forEach(function (k) { p[k] = ''; });
    Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
    return p;
  }

  /* ---- ① 머리 ---- */
  function paintTop(st) {
    var me = users.filter(function (u) { return u.id === st.user && u.role === st.role; })[0] ||
      users.filter(function (u) { return u.role === st.role; })[0];
    $('ld-viewer').textContent = (me ? me.name + ' · ' : '') + ROLE_NAME[st.role];
  }

  /* ---- ② 목록 ---- */
  function selectBox(id, labelText, key, value, options) {
    var s = el('select', { id: id, 'data-filter': key }, [el('option', { value: '' }, ['전체'])].concat(options.map(function (o) {
      return el('option', { value: o[0], selected: o[0] === value }, [o[1]]);
    })));
    return el('div', { cls: 'ld-filter' }, [el('label', { 'for': id }, [labelText]), s]);
  }
  function defectsView(st) {
    var list = sorted(defects.filter(function (d) {
      return (!st.status || d.status === st.status) && (!st.grade || d.grade === st.grade) && (!st.type || d.type === st.type);
    }));
    var filtered = !!(st.status || st.grade || st.type);
    var filters = el('div', { cls: 'ld-filters' }, [
      selectBox('ld-f-status', '상태', 'status', st.status, ORDER.map(function (c) { return [c, stageLabel(c)]; })),
      selectBox('ld-f-grade', '처리 등급', 'grade', st.grade, Object.keys(GRADE).map(function (c) { return [c, GRADE[c]]; })),
      selectBox('ld-f-type', '유형', 'type', st.type, [['DEFECT', TYPE.DEFECT], ['IMPROVEMENT', TYPE.IMPROVEMENT]]),
      filtered ? btn('pn-btn-2 ld-reset', '조건 지우기', 'reset') : null,
      el('p', { cls: 'ld-sort' }, [icon('i-info'), '영향 지점 수 × 업무 중요도 순'])]);
    var body;
    if (!list.length) {
      body = el('div', { cls: 'ld-card ld-empty' }, [el('p', null, ['조건에 맞는 대표 결함이 없어요']),
        btn('pn-btn-2', '조건 지우기', 'reset')]);
    } else {
      var head = el('tr', null, ['대표 결함', '유형', '신·구', '영향 지점', '신고', '처리 등급', '상태', '담당 부서'].map(function (h, i) {
        return el('th', { scope: 'col', cls: i >= 3 && i <= 4 ? 'is-num' : null }, [h]);
      }));
      var trs = list.map(function (d) {
        return el('tr', { 'data-id': d.id, cls: st.item === d.id ? 'is-open' : null }, [
          el('td', null, [el('button', { type: 'button', cls: 'ld-open', 'data-open': d.id, 'aria-haspopup': 'dialog' }, [
            el('span', { cls: 'ld-id' }, [d.id]), el('span', { cls: 'ld-title' }, [d.title])])]),
          el('td', { cls: 'is-nowrap' }, [TYPE[d.type] || d.type]),
          el('td', { cls: 'is-nowrap' }, [GEN[d.systemGen] || d.systemGen]),
          el('td', { cls: 'is-num' }, [branchCount(d) + '곳']),
          el('td', { cls: 'is-num' }, [(d.reports || []).length + '건']),
          el('td', null, [gradeTag(d.grade)]),
          el('td', null, [statusTag(d.status)]),
          el('td', { cls: 'is-nowrap' }, [DEPT[d.departmentCode] || d.departmentCode])]);
      });
      body = el('div', { cls: 'ld-card' }, [el('table', { cls: 'ld-table', 'aria-label': '대표 결함 목록, 영향 지점 수 × 업무 중요도 순' }, [
        el('thead', null, [head]), el('tbody', null, trs)])]);
    }
    return [filters, body, el('p', { cls: 'ld-total', 'aria-live': 'polite' }, ['총 ', el('b', null, [list.length + '건'])])];
  }
  function unlinkedView(st) {
    var target = st['for'] ? defects.filter(function (d) { return d.id === st['for']; })[0] : null;
    var note = el('div', { cls: 'pn-note ld-pick-note' }, [icon('i-info'), el('div', null, target
      ? [el('b', null, [target.id + ' 「' + target.title + '」에 묶을 신고를 고르세요']), '같은 원인으로 보이는 신고의 [묶기]를 누르세요.']
      : [el('b', null, ['같은 원인의 대표 결함에 묶어 주세요']), '묶으면 그 결함의 상태가 바뀔 때 이 신고자에게도 알림이 가요.'])]);
    var body;
    if (!unlinked.length) {
      body = el('div', { cls: 'ld-card ld-empty' }, [el('p', null, ['아직 안 묶인 신고가 없어요'])]);
    } else {
      var head = el('tr', null, ['신고', '업무', '보낸 사람', '지점', '보낸 날', ''].map(function (h, i) {
        return el('th', { scope: 'col', 'aria-label': i === 5 ? '묶기' : null }, [h]);
      }));
      var trs = unlinked.map(function (r) {
        return el('tr', { 'data-report': r.id }, [
          el('td', null, [el('span', { cls: 'ld-id' }, [r.id]), el('span', { cls: 'ld-title' }, [r.maskedText || '"나도 겪었어요" 신고'])]),
          el('td', { cls: 'is-nowrap' }, [BUSINESS[r.business] || r.business]),
          el('td', { cls: 'is-nowrap' }, [r.reporter ? r.reporter.name : '']),
          el('td', { cls: 'is-nowrap' }, [r.reporter ? r.reporter.branchName : '']),
          el('td', { cls: 'is-nowrap' }, [fmtWhen(r.createdAt)]),
          el('td', null, [btn('pn-btn-2', '묶기', 'link', { 'data-report': r.id, 'aria-haspopup': 'dialog',
            'aria-label': r.id + ' 묶기' })])]);
      });
      body = el('div', { cls: 'ld-card' }, [el('table', { cls: 'ld-table is-static', 'aria-label': '아직 안 묶인 신고, 최신 순' }, [
        el('thead', null, [head]), el('tbody', null, trs)])]);
    }
    return [note, body,
      el('p', { cls: 'ld-total', 'aria-live': 'polite' }, ['총 ', el('b', null, [unlinked.length + '건'])])];
  }
  function paintList(st) {
    $('ld-count-defects').textContent = defects.length;
    $('ld-count-unlinked').textContent = unlinked.length;
    Array.prototype.forEach.call(document.querySelectorAll('.ld-tab'), function (b) {
      var on = b.getAttribute('data-tab') === st.tab;
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('tabindex', on ? '0' : '-1');
    });
    var view = $('ld-view');
    view.setAttribute('aria-labelledby', 'ld-tab-' + st.tab);
    var keep = document.activeElement && document.activeElement.getAttribute('data-filter');
    view.innerHTML = '';
    (st.tab === 'unlinked' ? unlinkedView(st) : defectsView(st)).forEach(function (n) { if (n) view.appendChild(n); });
    if (keep && $('ld-f-' + keep)) $('ld-f-' + keep).focus();
  }

  /* ---- ③ 상세 패널 ---- */
  function progress(d) {
    var code = d.status, wont = code === WONT_FIX;
    var at = stageIndex(code);
    if (wont) {
      var h = (d.statusHistory || []).filter(function (x) { return x.to === WONT_FIX; }).pop();
      at = h ? stageIndex(h.from) : 0;
    }
    var now = el('p', { cls: 'kn-now' }, wont
      ? [el('b', null, [WONT_FIX_LABEL]), ' · ' + STAGES[Math.max(at, 0)][1] + ' 단계에서 끝났어요']
      : [STAGES.length + '단계 중 ' + (at + 1) + '단계 · ', el('b', null, [stageLabel(code)])]);
    var track = el('ol', { cls: 'pn-track', 'aria-hidden': 'true' }, STAGES.map(function (s, i) {
      return el('li', { cls: wont ? (i <= at ? 'is-done' : null) : (i < at ? 'is-done' : i === at ? 'is-now' : null) });
    }));
    var names = STAGES.map(function (s, i) {
      var cur = !wont && i === at;
      return el('li', { cls: cur ? 'is-now' : null, 'aria-current': cur ? 'step' : null }, [s[1] + (cur ? '(지금)' : '')]);
    });
    names.push(el('li', { cls: 'is-alt' + (wont ? ' is-now' : ''), 'aria-current': wont ? 'step' : null },
      [WONT_FIX_LABEL + (wont ? '(지금)' : '')]));
    return el('div', { cls: 'kn-progress' }, [now, track, el('ol', { cls: 'kn-stages', 'aria-label': '처리 단계' }, names)]);
  }
  function planRow(d) {
    if (d.status === WONT_FIX) return ['고치지 않는 이유', d.wontFixReasonText || REASON_TEXT[d.wontFixReasonCode] || ''];
    if (d.plannedFixDate) return ['고칠 예정', fmtDate(d.plannedFixDate)];
    return null;
  }
  function historyRows(d) {
    return (d.statusHistory || []).slice().reverse().map(function (h) {
      var what = (h.from ? stageLabel(h.from) + ' → ' : '') + stageLabel(h.to);
      return [fmtWhen(h.at), [el('span', null, [what + ' · ' + userName(h.actorId)]),
        el('span', { cls: 'ld-tag' + (h.notifiable ? '' : ' is-dim') }, [h.notifiable ? '알림 보냄' : '기록만']),
        h.reason ? el('span', { cls: 'ld-why' }, ['사유: ' + h.reason]) : null]];
    });
  }
  function noticeCard(d) {
    var n = d.fcNotice;
    var kids;
    if (n && n.status === 'APPROVED') {
      kids = [el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title' }, ['FC용 안내문']), el('span', { cls: 'ld-tag is-ok' }, ['승인됨'])]),
        el('p', null, [n.approvedText]),
        el('p', { cls: 'kn-meta' }, ['FC의 "내 신고"에 이 안내문이 보여요.'])];
    } else if (n && n.status === 'DRAFT') {
      kids = [el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title' }, ['FC용 안내문']), el('span', { cls: 'ld-tag is-dim' }, ['승인 전'])]),
        el('p', null, [n.draftText]),
        el('p', { cls: 'kn-meta' }, ['승인하기 전에는 FC 화면에 나오지 않아요.'])];
    } else {
      kids = [el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title' }, ['FC용 안내문']), el('span', { cls: 'ld-tag is-dim' }, ['없음'])]),
        el('p', { cls: 'kn-meta' }, ['아직 안내문이 없어요. 알림에는 정해진 문구가 나가요.'])];
    }
    return el('div', { cls: 'pn-card' }, kids);
  }
  function paintPanel(st) {
    var open = !!(st.item && detail && detail.id === st.item);
    $('ledger-panel').hidden = !open;
    $('ld-scrim').hidden = !open;
    if (!open) return false;
    var d = detail, body = $('ld-body');
    $('ld-panel-title').textContent = '대표 결함 ' + d.id;
    body.innerHTML = '';
    var reports = (d.reports || []).map(function (r) {
      var who = (r.reporter ? r.reporter.name + ' · ' + r.reporter.branchName : '') + ' · ' + fmtDate(r.createdAt);
      return el('li', null, [el('span', { cls: 'ld-id' }, [r.id]), el('span', null, [r.maskedText || '"나도 겪었어요"로 보냄']),
        el('span', { cls: 'ld-who' }, [who.replace(/^ · /, '')])]);
    });
    [el('h3', { tabindex: '-1' }, [d.title]),
      el('p', { cls: 'pn-lead' }, ['마지막 변경 ' + fmtWhen(d.updatedAt)]),
      el('div', { cls: 'pn-card' }, [
        el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title' }, ['지금 상태']), statusTag(d.status)]),
        progress(d),
        rows([d.workaround ? ['임시로 이렇게', d.workaround] : ['임시로 이렇게', '아직 없어요'], planRow(d)])]),
      el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['요약']),
        rows([['유형', TYPE[d.type] || d.type], ['신·구 시스템', (GEN[d.systemGen] || '') + ' 시스템'],
          ['처리 등급', [gradeTag(d.grade)]], ['담당 부서', DEPT[d.departmentCode] || d.departmentCode],
          ['영향 지점', branchCount(d) + '곳'], ['묶인 신고', (d.reports || []).length + '건 (신고자 ' + reporterCount(d) + '명)']])]),
      el('h4', null, ['묶인 신고 ' + (d.reports || []).length + '건']),
      el('div', { cls: 'pn-card' }, [reports.length ? el('ul', { cls: 'pn-plain ld-reports' }, reports)
        : el('p', null, ['아직 묶인 신고가 없어요'])]),
      el('h4', null, ['상태 이력']),
      el('div', { cls: 'pn-card' }, [rows(historyRows(d), 'ld-hist')]),
      el('h4', null, ['안내문']),
      noticeCard(d)
    ].forEach(function (n) { body.appendChild(n); });
    var foot = $('ld-foot');
    foot.innerHTML = '';
    foot.appendChild(btn('pn-btn-2', [icon('i-link'), '신고 연결'], 'to-link'));
    foot.appendChild(btn('pn-btn', '상태 바꾸기', 'status', { 'aria-haspopup': 'dialog' }));
    return true;
  }

  /* ---- ④ 대화상자: 상태 바꾸기 ---- */
  function syncDraft(st) {
    var key = st.dialog + '|' + st.item + '|' + st.to + '|' + st.report;
    if (key !== draftKey) { draftKey = key; draft = { date: '', reason: '', memo: '' }; }
    if (st.date) draft.date = st.date;
    if (st.reason) draft.reason = st.reason;
    if (st.memo) draft.memo = st.memo;
  }
  function statusSteps(st) {
    var steps = [['pick', '다음 상태 고르기']];
    if (st.to && needsDetail(detail.status, st.to)) steps.push(['detail', st.to === 'FIX_PLANNED' ? '예정일 적기' : '이유 적기']);
    steps.push(['preview', '알림 미리보기']);
    return steps;
  }
  function missing(st) {
    var from = detail.status, to = st.to;
    if (!to) return '다음 상태를 골라 주세요';
    if (to === 'FIX_PLANNED' && !isBack(from, to) && !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return '고칠 예정일을 골라 주세요';
    if (to === WONT_FIX && !draft.reason) return '고치지 않는 이유를 골라 주세요';
    if (to === WONT_FIX && draft.reason === 'ETC' && !draft.memo.trim()) return '기타 이유를 적어 주세요';
    if (isBack(from, to) && !draft.memo.trim()) return '되돌리는 이유를 적어 주세요';
    return '';
  }
  function reasonText() {
    return draft.reason === 'ETC' ? draft.memo.trim() : REASON_TEXT[draft.reason] || '';
  }
  function choiceSub(from, to) {
    if (isBack(from, to)) return '되돌리기 · 기록만';
    if (to === 'FIX_PLANNED') return '예정일 필요 · 알림 가요';
    if (to === WONT_FIX) return '이유 필요 · 알림 가요';
    return notifiable(from, to) ? '알림 가요' : '기록만 해요';
  }
  function pickView(st) {
    var from = detail.status;
    var choices = ORDER.filter(function (c) { return c !== from; }).map(function (c) {
      var on = st.to === c;
      return el('li', null, [el('button', { type: 'button', cls: 'pn-choice', 'data-to': c, 'aria-pressed': String(on) }, [
        el('span', null, [stageLabel(c)]), el('span', { cls: 'ld-choice-sub' }, [choiceSub(from, c)]),
        el('span', { cls: 'pn-tick' }, [icon('i-check')])])]);
    });
    return [el('h3', { tabindex: '-1' }, ['다음 상태를 골라 주세요']),
      el('p', { cls: 'pn-lead' }, [detail.id + ' 「' + detail.title + '」 · 지금 상태 ', el('b', null, [stageLabel(from)])]),
      el('ul', { cls: 'pn-choices' }, choices),
      el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['알림은 의미 있는 변경만 가요']),
        '임시조치·수정 예정·해결·수정하지 않음만 알리고, 문제 확인·원인 파악과 되돌리기는 기록만 해요.'])])];
  }
  function detailView(st) {
    var from = detail.status, to = st.to, err = st.err === '1' ? missing(st) : '';
    var out = [el('h3', { tabindex: '-1' }, [stageLabel(from) + ' → ' + stageLabel(to)])];
    if (isBack(from, to)) {
      out.push(el('p', { cls: 'pn-lead' }, ['앞 단계로 되돌려요. 되돌리기는 기록만 하고 알리지 않아요.']));
      out.push(el('div', { cls: 'pn-field' }, [el('label', { 'for': 'ld-memo' }, ['되돌리는 이유']),
        el('textarea', { id: 'ld-memo', 'data-draft': 'memo', 'aria-invalid': err ? 'true' : null, 'aria-describedby': err ? 'ld-err' : null }, [draft.memo])]));
    } else if (to === 'FIX_PLANNED') {
      out.push(el('p', { cls: 'pn-lead' }, ['고칠 날짜를 정해 주세요. 알림에 이 날짜가 함께 나가요.']));
      out.push(el('div', { cls: 'pn-field' }, [el('label', { 'for': 'ld-date' }, ['고칠 예정일']),
        el('input', { id: 'ld-date', type: 'date', cls: 'pn-input', 'data-draft': 'date', value: draft.date, min: '2026-11-04',
          'aria-invalid': err ? 'true' : null, 'aria-describedby': err ? 'ld-err' : null })]));
    } else {
      out.push(el('p', { cls: 'pn-lead' }, ['고치지 않는 이유를 골라 주세요. 알림에 이 이유가 함께 나가요.']));
      out.push(el('ul', { cls: 'pn-chips', role: 'group', 'aria-label': '고치지 않는 이유' }, REASONS.map(function (r) {
        return el('li', null, [el('button', { type: 'button', cls: 'pn-chip', 'data-reason': r[0], 'aria-pressed': String(draft.reason === r[0]) }, [r[1]])]);
      })));
      if (draft.reason === 'ETC') {
        out.push(el('div', { cls: 'pn-field' }, [el('label', { 'for': 'ld-memo' }, ['기타 이유']),
          el('textarea', { id: 'ld-memo', 'data-draft': 'memo', 'aria-invalid': err ? 'true' : null, 'aria-describedby': err ? 'ld-err' : null }, [draft.memo])]));
      }
    }
    out.push(el('p', { cls: 'pn-err', id: 'ld-err', role: 'alert', hidden: !err }, [err]));
    return out;
  }
  function previewView(st) {
    var from = detail.status, to = st.to, p = preview || {};
    var change = rows([['바뀌는 상태', stageLabel(from) + ' → ' + stageLabel(to)],
      to === 'FIX_PLANNED' && draft.date ? ['고칠 예정일', fmtDate(draft.date)] : null,
      to === WONT_FIX ? ['고치지 않는 이유', reasonText()] : null,
      isBack(from, to) ? ['되돌리는 이유', draft.memo] : null]);
    if (!p.notifiable) {
      return [el('h3', { tabindex: '-1' }, ['이 변경은 기록만 하고 알리지 않아요']),
        el('div', { cls: 'pn-card' }, [change]),
        el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['왜 알리지 않나요?']),
          isBack(from, to) ? '되돌리기는 기록만 남겨요. 같은 결함에 알림이 여러 번 가지 않게 하려는 규칙이에요.'
            : '문제 확인·원인 파악은 "확인 중" 알림이 반복되지 않도록 기록만 남겨요.'])])];
    }
    return [el('h3', { tabindex: '-1' }, ['묶인 신고자 ' + p.recipientCount + '명에게 알림']),
      el('div', { cls: 'pn-card' }, [change]),
      el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['알림 문구']), el('p', { cls: 'ld-quote' }, [p.body])]),
      el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['받는 사람 ' + p.recipientCount + '명']),
        el('ul', { cls: 'ld-recipients' }, p.recipients.map(function (r) {
          return el('li', null, [r.name + ' ', el('span', null, [r.branchName])]);
        }))]),
      el('div', { cls: 'pn-note' }, [icon('i-bell'), el('div', null, [el('b', null, ['FC는 SFA 화면 알림에서 봐요']),
        '실제 문자나 메일은 보내지 않고, 알림 기록만 남겨요. 같은 사람이 여러 번 신고했어도 알림은 한 번이에요.'])])];
  }
  function doneView(st) {
    var p = preview || {};
    return [el('div', { cls: 'pn-end' }, [el('span', { cls: 'pn-ico is-ok' }, [icon('i-check')]),
      el('h3', { tabindex: '-1' }, ['상태를 "' + stageLabel(st.to) + '"' + ro(stageLabel(st.to)) + ' 바꿨어요']),
      el('p', { cls: 'pn-lead' }, [p.notifiable
        ? '묶인 신고자 ' + p.recipientCount + '명에게 알림을 보냈어요. FC는 SFA 화면 알림을 눌러 내 신고에서 확인해요.'
        : '알림 없이 상태 이력에 기록만 남겼어요.'])])];
  }

  /* ---- ④ 대화상자: 신고 묶기 ---- */
  function linkReport(st) { return unlinked.filter(function (r) { return r.id === st.report; })[0] || null; }
  function linkPickView(st) {
    var r = linkReport(st);
    var err = st.err === '1' && !st.link ? '묶을 대표 결함을 골라 주세요' : '';
    var who = r && r.reporter ? r.reporter.name + ' · ' + r.reporter.branchName + ' · ' + fmtDate(r.createdAt) : '';
    return [el('h3', { tabindex: '-1' }, ['어느 대표 결함에 묶을까요?']),
      r ? el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, [r.id + ' · ' + (BUSINESS[r.business] || '')]),
        el('p', null, [r.maskedText || '"나도 겪었어요" 신고']), el('p', { cls: 'kn-meta' }, [who])]) : null,
      el('ul', { cls: 'pn-choices ld-one', role: 'group', 'aria-label': '대표 결함' }, sorted(defects).map(function (d) {
        return el('li', null, [el('button', { type: 'button', cls: 'pn-choice', 'data-link': d.id, 'aria-pressed': String(st.link === d.id) }, [
          el('span', null, [d.title]), el('span', { cls: 'ld-choice-sub' }, [d.id + ' · ' + stageLabel(d.status)]),
          el('span', { cls: 'pn-tick' }, [icon('i-check')])])]);
      })),
      el('p', { cls: 'pn-err', role: 'alert', hidden: !err }, [err])];
  }
  function linkDoneView(st) {
    var d = defects.filter(function (x) { return x.id === st.link; })[0];
    return [el('div', { cls: 'pn-end' }, [el('span', { cls: 'pn-ico is-ok' }, [icon('i-check')]),
      el('h3', { tabindex: '-1' }, [st.report + ' 신고를 묶었어요']),
      el('p', { cls: 'pn-lead' }, [(d ? d.id + ' 「' + d.title + '」' : '') + '에 묶었어요. 다음 상태 변경부터 이 신고자에게도 알림이 가요.'])])];
  }

  function paintDialog(st) {
    var kind = st.dialog === 'status' && detail && detail.id === st.item ? 'status'
      : st.dialog === 'link' && linkReport(st) ? 'link' : '';
    $('ledger-dialog').hidden = !kind;
    $('ld-dlg-scrim').hidden = !kind;
    if (!kind) return false;
    syncDraft(st);
    var body = $('ld-dlg-body'), foot = $('ld-dlg-foot');
    body.innerHTML = ''; foot.innerHTML = '';
    var steps, at, view, done = st.dstep === 'done';
    if (kind === 'status') {
      $('ld-dlg-title').textContent = '상태 바꾸기';
      steps = statusSteps(st);
      var step = st.to ? st.dstep || 'pick' : 'pick';
      if (step === 'detail' && !needsDetail(detail.status, st.to)) step = 'preview';
      if ((step === 'preview' || done) && missing(st)) step = needsDetail(detail.status, st.to) ? 'detail' : 'pick';
      if (step !== st.dstep && st.dstep) done = false;
      at = done ? steps.length : steps.map(function (s) { return s[0]; }).indexOf(step);
      view = done ? doneView(st) : step === 'pick' ? pickView(st) : step === 'detail' ? detailView(st) : previewView(st);
      if (done) {
        // 알림이 간 변경이면 주 버튼으로 SFA 알림까지 순환을 잇고, 기록만 했으면 [닫기]가 주 버튼
        if (preview && preview.notifiable) {
          foot.appendChild(btn('pn-btn-2', '닫기', 'close-dialog'));
          foot.appendChild(el('a', { cls: 'pn-btn', href: 'index.html#role=FC&popup=alarm' }, [icon('i-bell'), 'SFA 화면에서 알림 확인']));
        } else {
          foot.appendChild(btn('pn-btn', '닫기', 'close-dialog'));
        }
      } else {
        foot.appendChild(at > 0 ? btn('pn-btn-2', '이전', 'prev') : btn('pn-btn-2', '취소', 'close-dialog'));
        foot.appendChild(btn('pn-btn', step === 'preview' ? '확정' : '다음', step === 'preview' ? 'confirm' : 'next', { 'data-step': step }));
      }
    } else {
      $('ld-dlg-title').textContent = '신고 묶기';
      steps = [['pick', '대표 결함 고르기']];
      at = done && st.link ? 1 : 0;
      view = at ? linkDoneView(st) : linkPickView(st);
      if (at) foot.appendChild(btn('pn-btn', '닫기', 'close-dialog'));
      else {
        foot.appendChild(btn('pn-btn-2', '취소', 'close-dialog'));
        foot.appendChild(btn('pn-btn', '묶기', 'link-confirm'));
      }
    }
    // 단계 표시줄: 글자("N단계 중 M단계 · 이름")로 뜻을 전하고 막대는 장식
    var total = steps.length;
    $('ld-dlg-steps-text').innerHTML = '';
    $('ld-dlg-steps-text').appendChild(done && at >= total
      ? el('span', null, [el('b', null, ['끝']), kind === 'status' && preview && preview.notifiable ? ' · 알림을 보냈어요' : ' · 기록했어요'])
      : el('span', null, [total + '단계 중 ' + (at + 1) + '단계 · ', el('b', null, [steps[at][1]])]));
    $('ld-dlg-track').innerHTML = '';
    steps.forEach(function (s, i) {
      $('ld-dlg-track').appendChild(el('li', { cls: i < at ? 'is-done' : i === at ? 'is-now' : null }));
    });
    view.forEach(function (n) { if (n) body.appendChild(n); });
    return true;
  }

  /* ---- 그리기 ---- */
  var lastFocus = '';
  function render() {
    var st = read();
    paintTop(st);
    var need = st.item ? A.getDefect(st.item) : Promise.resolve(null);
    return need.then(function (d) {
      detail = d;
      if (st.dialog === 'status' && d && st.to) {
        syncDraft(st);
        return A.postStatusPreview(d.id, { from: d.status, to: st.to, plannedFixDate: draft.date || null,
          wontFixReasonText: st.to === WONT_FIX ? reasonText() : null });
      }
      return null;
    }).then(function (p) {
      preview = p;
      paintList(st);
      var panel = paintPanel(st);
      var dlg = paintDialog(st);
      // 처음 열리거나 단계가 바뀌면 그 창의 제목으로 포커스 (aria-modal)
      var key = [st.item, st.dialog, st.to, st.dstep, st.report].join('|');
      if (key !== lastFocus) {
        lastFocus = key;
        var h = dlg ? $('ld-dlg-body').querySelector('h3') : panel ? $('ld-body').querySelector('h3') : null;
        if (h) h.focus({ preventScroll: true });
        if (dlg) $('ld-dlg-body').scrollTop = 0;
        else if (panel && !st.dialog) $('ld-body').scrollTop = 0;
      }
    });
  }

  /* ---- 동작 ---- */
  function openItem(id, from) {
    opener = from || null;
    go(closeDialogPatch({ item: id }));
  }
  function closePanel() {
    var id = read().item;
    go(closeDialogPatch({ item: '' }));
    var t = opener && document.body.contains(opener) ? opener : document.querySelector('[data-open="' + id + '"]');
    if (t) t.focus();
    opener = null;
  }
  function closeDialog() {
    var st = read();
    go(closeDialogPatch());
    setTimeout(function () {
      var t = st.dialog === 'link' ? document.querySelector('[data-report="' + st.report + '"] .pn-btn-2') : $('ld-foot').querySelector('.pn-btn');
      if (t) t.focus();
    }, 0);
  }
  function nextStep(step) {
    var st = read();
    var patch = { err: '', date: draft.date, reason: draft.reason, memo: draft.memo };
    if (step === 'pick') {
      if (!st.to) { go({ err: '1' }); return; }
      patch.dstep = needsDetail(detail.status, st.to) ? 'detail' : 'preview';
    } else if (step === 'detail') {
      st.date = draft.date; st.reason = draft.reason; st.memo = draft.memo;
      if (missing(st)) { patch.err = '1'; go(patch); return; }
      patch.dstep = 'preview';
    }
    go(patch);
  }
  function prevStep() {
    var st = read();
    var steps = statusSteps(st).map(function (s) { return s[0]; });
    var i = steps.indexOf(st.dstep || 'pick');
    go({ dstep: i > 1 ? steps[i - 1] : '', err: '', date: draft.date, reason: draft.reason, memo: draft.memo });
  }

  function onClick(e) {
    var t = e.target;
    var tab = t.closest('.ld-tab');
    if (tab) { go(closeDialogPatch({ tab: tab.getAttribute('data-tab'), item: '', 'for': '' })); return; }
    var open = t.closest('[data-open]');
    if (open) { openItem(open.getAttribute('data-open'), open); return; }
    var row = t.closest('.ld-table:not(.is-static) tbody tr');
    if (row && !t.closest('button, a, select')) { openItem(row.getAttribute('data-id'), row.querySelector('.ld-open')); return; }
    var choice = t.closest('[data-to]');
    if (choice) { go({ to: choice.getAttribute('data-to'), err: '', dstep: '', date: '', reason: '', memo: '' }); return; }
    var reason = t.closest('[data-reason]');
    if (reason) { draft.reason = reason.getAttribute('data-reason'); go({ reason: draft.reason, memo: draft.memo, err: '' }); return; }
    var link = t.closest('[data-link]');
    if (link) { go({ link: link.getAttribute('data-link'), err: '' }); return; }
    var b = t.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act'), st = read();
    if (act === 'reset') go({ status: '', grade: '', type: '' });
    else if (act === 'status') { opener = b; go({ dialog: 'status', to: '', dstep: '', err: '' }); }
    else if (act === 'to-link') go(closeDialogPatch({ tab: 'unlinked', item: '', 'for': st.item }));
    else if (act === 'link') go({ dialog: 'link', report: b.getAttribute('data-report'), link: st['for'] || '', dstep: '', err: '' });
    else if (act === 'link-confirm') {
      if (!st.link) { go({ err: '1' }); return; }
      A.postLinkReport(st.link, st.report).then(function () { go({ dstep: 'done', err: '' }); });
    }
    else if (act === 'close-dialog') closeDialog();
    else if (act === 'next') nextStep(b.getAttribute('data-step'));
    else if (act === 'prev') prevStep();
    else if (act === 'confirm') {
      A.postStatus(detail.id, { from: detail.status, to: st.to, plannedFixDate: draft.date || null,
        wontFixReasonCode: st.to === WONT_FIX ? draft.reason : null, wontFixReasonText: st.to === WONT_FIX ? reasonText() : null,
        reason: isBack(detail.status, st.to) ? draft.memo : null }).then(function () { go({ dstep: 'done' }); });
    }
  }
  function onInput(e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-draft');
    if (k) draft[k] = e.target.value;
  }
  function onChange(e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-filter');
    if (f) { var p = {}; p[f] = e.target.value; go(p); }
  }
  function trap(box, e) {
    var f = Array.prototype.filter.call(box.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]'),
      function (x) { return !x.disabled && x.getClientRects().length; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], inside = box.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
  }
  function onKey(e) {
    var st = read();
    var dlgOpen = !$('ledger-dialog').hidden, panelOpen = !$('ledger-panel').hidden;
    if (e.key === 'Escape') {
      if (dlgOpen) { e.preventDefault(); closeDialog(); } else if (panelOpen) { e.preventDefault(); closePanel(); }
      return;
    }
    var tab = e.target.closest && e.target.closest('.ld-tab');
    if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      var next = st.tab === 'unlinked' ? 'defects' : 'unlinked';
      go(closeDialogPatch({ tab: next, item: '', 'for': '' }));
      $('ld-tab-' + next).focus();
      return;
    }
    if (e.key === 'Tab') {
      if (dlgOpen) trap($('ledger-dialog'), e); else if (panelOpen) trap($('ledger-panel'), e);
    }
  }

  function bind() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    $('ld-close').addEventListener('click', closePanel);
    $('ld-dlg-close').addEventListener('click', closeDialog);
    $('ld-scrim').addEventListener('click', closePanel);
    window.addEventListener('hashchange', render);
  }

  window.SFA_READY = Promise.all([A.getUsers(), A.getDefects(), A.getUnlinkedReports()]).then(function (r) {
    users = r[0] || []; defects = r[1] || []; unlinked = r[2] || [];
    bind();
    return render();
  });
})();
