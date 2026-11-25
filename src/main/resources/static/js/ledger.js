/* S4 전산 문의 관리(옛 결함 대장) (docs/06-ui-spec.md 6절, REQ-LG-01~05·13~18, docs/02-domain-rules.md 3~5절, ADR-030).
   기능 없는 화면(프론트 단계): 데이터는 ApiClient(=fixtures)만 읽고 저장하지 않는다.
   상태는 주소 # 뒤에 둔다(06번 11절 S4 주소 키).
     role=SALES|IT        보는 사람 역할 (없으면 SALES). SALES = 현업 담당자(ADR-030)
     tab=inbox|consult|defects|history  현업 [전산 문의함](기본) / IT [IT 협의 요청](기본) / [공통 오류] / [오류·조치 이력].
                          예전 unlinked 는 역할의 첫 탭
     filter=new|mine|info|it  문의함 요약 칸(신규·내 담당·추가 정보 확인·IT 협의 중)
     status= grade= type= 대표 결함 필터 (Defect.status·grade·type 코드)
     q=…                  글자 찾기 (REQ-LG-08, URL 인코딩, 40자까지). 두 탭이 함께 쓰고, 찾기는 ApiClient 가 한다
     item=D-… | R-…       오른쪽 패널: 대표 결함 상세 / 안 묶인 신고와 AI 비슷한 결함 추천(ADR-017)
     popup=alarm          머리 [새 신고] 목록 팝업 (REQ-LG-07)
     llm=ok|slow|fail     AI 추천 응답: 정상 / 늦음(로딩에서 멈춤) / 실패(규칙 후보) (REQ-LG-06)
     for=D-…              상세 패널 [신고 연결]에서 넘어온 대표 결함 (unlinked 탭에서 묶을 대상 미리 고름)
     dialog=status|link   가운데 대화상자: 상태 바꾸기 / 관련 오류 연결
     dialog=info|guide|resolve|consult|reply|reroute|itgs  담당자 대응 기록(ADR-030, item=R-… 필요) / ITGS 요청 초안
     to=<상태 코드>       상태 바꾸기: 고른 다음 상태
     dstep=pick|detail|preview|done   대화상자 단계 (detail 은 예정일·사유가 필요한 경우만)
     date=YYYY-MM-DD      수정 예정일
     reason=NEW_SFA|WORKAROUND_OK|NOT_REPRODUCIBLE|ETC  수정하지 않음 사유 코드
     memo=…               수정하지 않음의 기타 사유 (내부 메모·되돌림 설명은 주소에 적지 않는다)
     back=FIELD_RECHECK|REDEPLOY|MISRECORDED|ETC  되돌림 사유 코드 (ADR-029)
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
    SALES_SUPPORT: '영업지원팀', DESIGN_SUPPORT: '상품설계지원팀', CONTRACT_IT: '계약관리팀 + IT',
    CONSENT_IT: '고객동의업무팀(가상 매핑) + IT' };   // ADR-027: 실제 담당 부서는 확인 필요
  var BUSINESS = { LOGIN: '로그인·접속', SUBSCRIPTION: '청약·서명', CUSTOMER_LOOKUP: '고객조회', DESIGN: '가입설계',
    CONTRACT_LOOKUP: '계약조회', CUSTOMER_CONSENT: '고객동의·본인확인', ETC: '그 밖의 업무' };
  var SYMPTOM = { NOT_SHOWN: '내용이 안 보여요', CANNOT_PROCEED: '다음으로 안 넘어가요', WRONG_SCREEN: '엉뚱한 화면이 떠요',
    WRONG_INPUT: '입력이 잘못 들어가요', CANNOT_INPUT: '입력할 수 없어요(키패드가 안 떠요)', HOW_TO: '쓰는 법을 모르겠어요', ETC: '그 밖의 문제' };
  var ROLE_NAME = { SALES: '현업 담당', IT: 'IT 담당' };
  /* ADR-030: 역할별 탭. 첫 탭이 기본 */
  var TABS = { SALES: [['inbox', '전산 문의함'], ['defects', '공통 오류'], ['history', '오류·조치 이력']],
    IT: [['consult', 'IT 협의 요청'], ['defects', '공통 오류'], ['history', '오류·조치 이력']] };
  var CLOSED = ['RESOLVED', 'WONT_FIX'];
  var ACTIONS = { info: 'INFO_REQUEST', guide: 'GUIDE', resolve: 'SELF_RESOLVED', consult: 'IT_CONSULT', reply: 'IT_REPLY', reroute: 'REROUTE' };
  var ACTION_TITLE = { info: '추가 정보 요청', guide: '대응 방법 안내', resolve: '자체 해결', consult: 'IT 협의 요청', reply: '협의 결과 남기기',
    reroute: '다른 문의함으로 보내기' };
  var BASIS = { BUSINESS: 'FC가 고른 업무', SCREEN: '오류가 난 화면', HISTORY: '기존 이력' };
  var SIMILAR = { HIGH: '비슷함 높음', MEDIUM: '비슷함 보통' };   // 07번 ⑤ similarity (LOW 는 서버가 버림)

  var Q_MAX = 40;   // 찾는 낱말 최대 길이 (05번 글자 찾기 q)
  // defects·unlinked: 전체(탭 건수·배지·패널용), listed·shownReports: 필터·찾기를 거친 목록(ApiClient 결과)
  var listed = [], shownReports = [];
  var users = [], defects = [], unlinked = [], unlinkedFor = null, detail = null, preview = null, similar = null;
  var draft = { date: '', reason: '', memo: '' };   // 대화상자 입력 중인 값 (주소에는 [다음]을 누를 때 적음)
  var draftKey = '', resolutionLabels, statusResult = null, statusError = '';
  var opener = null;
  /* ADR-030: 문의함·IT 협의 목록·문의 상세·담당자 알림·대응 기록 대화상자 */
  var meta = null, inboxData = null, consults = [], inquiry = null, alarms = [], viewedSent = {};
  var actDraft = { key: '', codes: [], guideDefectId: '', inboxId: '', requestId: '' }, actPreview = null, actError = '', claimNote = '';

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
  /* 조사 "와/과": 결함 ID 끝 숫자를 읽은 소리로 정한다(영·일·삼·육·칠·팔 → 과, 이·사·오·구 → 와) */
  function wa(id) { return '2459'.indexOf(String(id).slice(-1)) >= 0 ? '와' : '과'; }
  /* 조사 "을/를": 끝 글자 받침 */
  function eulReul(word) { var c = word.charCodeAt(word.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? '을' : '를'; }
  /* 조사 "이/가": 끝 글자 받침으로, 숫자는 읽는 소리(영·일·삼·육·칠·팔 → 이)로. 영문 등은 "이(가)" */
  function iga(word) {
    var ch = word.charAt(word.length - 1), c = ch.charCodeAt(0) - 0xac00;
    if (c >= 0 && c < 11172) return c % 28 ? '이' : '가';
    if (/\d/.test(ch)) return '013678'.indexOf(ch) >= 0 ? '이' : '가';
    return '이(가)';
  }
  /* 찾은 낱말 표시(REQ-LG-08, 0-3 "찾은 낱말 표시"): 대소문자 무시, 글자 조각 + <mark> */
  function marked(text, word) {
    text = String(text == null ? '' : text);
    if (!word) return [text];
    var low = text.toLowerCase(), w = word.toLowerCase(), out = [], at = 0, i;
    while ((i = low.indexOf(w, at)) >= 0) {
      if (i > at) out.push(text.slice(at, i));
      out.push(el('mark', { cls: 'ld-mark' }, [text.slice(i, i + w.length)]));
      at = i + w.length;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  }
  function stageIndex(code) { return ORDER.indexOf(code); }
  function userName(id) { var u = users.filter(function (x) { return x.id === id; })[0]; return u ? u.name : id; }
  function isBack(from, to) { return from === WONT_FIX || stageIndex(to) < stageIndex(from); }
  function notifiable(from, to) { return !isBack(from, to) && NOTIFY.indexOf(to) >= 0; }
  function needsDetail(from, to) { return to === 'FIX_PLANNED' || to === 'RESOLVED' || to === WONT_FIX || isBack(from, to); }

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
  var KEYS = ['role', 'user', 'popup', 'tab', 'filter', 'status', 'grade', 'type', 'q', 'item', 'for', 'dialog', 'report', 'link', 'to', 'dstep',
    'date', 'reason', 'back', 'memo', 'err', 'llm', 'notify'];
  function read() {
    var st = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = i < 0 ? kv : kv.slice(0, i);
      st[decodeURIComponent(k)] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
    });
    if (!ROLE_NAME[st.role]) st.role = 'SALES';
    var tabs = TABS[st.role].map(function (t) { return t[0]; });
    if (tabs.indexOf(st.tab) < 0) st.tab = tabs[0];   // 예전 주소 tab=unlinked 도 역할의 첫 탭
    if (['new', 'mine', 'info', 'it'].indexOf(st.filter) < 0) delete st.filter;
    if (st.llm !== 'slow' && st.llm !== 'fail') delete st.llm;   // 기본(ok)은 주소에 적지 않음
    st.q = (st.q || '').trim().slice(0, Q_MAX);
    if (!st.q) delete st.q;
    return st;
  }
  function isReportId(id) { return /^R-/.test(id || ''); }
  function go(patch) {
    var st = read();
    Object.keys(patch).forEach(function (k) { st[k] = patch[k]; });
    if (st.tab === TABS[st.role][0][0]) st.tab = '';
    var order = KEYS.slice();
    Object.keys(st).forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    var next = '#' + order.filter(function (k) { return st[k]; }).map(function (k) {
      return k + '=' + encodeURIComponent(st[k]);
    }).join('&');
    if (location.hash !== next) location.hash = next; else render();
  }
  var DIALOG_KEYS = { dialog: '', to: '', dstep: '', date: '', reason: '', back: '', memo: '', err: '', report: '', link: '' };
  function closeDialogPatch(extra) {
    var p = {};
    Object.keys(DIALOG_KEYS).forEach(function (k) { p[k] = ''; });
    Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
    return p;
  }

  /* ---- ① 머리 ---- */
  function viewer(st) {
    return users.filter(function (u) { return u.id === st.user && u.role === st.role; })[0] ||
      users.filter(function (u) { return u.role === st.role; })[0] || null;
  }
  function paintTop(st) {
    var me = viewer(st);
    $('ld-viewer').textContent = (me ? me.name + ' · ' : '') + ROLE_NAME[st.role];   // 맡은 문의함은 목록 위 줄에 보인다
    $('ld-lead').textContent = st.role === 'IT'
      ? '현업이 협의를 요청한 문의와 공통 오류를 봐요. 현업이 확인한 정보에서 검토를 시작해요.'
      : '맡은 문의함으로 들어온 전산 문의를 확인하고 대응해요. 문의는 규칙으로 분류돼요.';
  }
  /* 담당자 알림 (REQ-LG-07·14, ADR-017·030): S1 알림 아이콘 배지 + 알림 팝업 모양의 목록. 읽음은 확인·인수가 아니다 */
  function unreadAlarms() { return alarms.filter(function (n) { return !n.read; }); }
  function paintAlarm(st) {
    var n = unreadAlarms().length, open = st.popup === 'alarm';
    var badge = $('ld-alarm-badge');
    badge.hidden = !n;
    badge.textContent = n ? String(n) : '';
    $('ld-alarm').setAttribute('aria-label', n ? '읽지 않은 새 알림 ' + n + '건' : '새 알림 없음');
    $('ld-alarm').setAttribute('aria-expanded', String(open));
    $('ld-alarm-pop').hidden = !open;
    if (!open) return;
    $('ld-alarm-head').textContent = n ? '읽지 않은 알림 ' + n + '건' : '새 알림';
    var list = $('ld-alarm-list');
    list.innerHTML = '';
    if (!alarms.length) {
      list.appendChild(el('li', null, [el('p', { cls: 'alarm-empty' }, ['새로 들어온 알림이 없어요'])]));
      return;
    }
    alarms.slice(0, 8).forEach(function (a) {
      var sum = a.summary || {};
      list.appendChild(el('li', null, [el('button', { type: 'button', cls: 'alarm-item' + (a.read ? ' is-read' : ''), 'data-alarm': a.reportId,
        'data-notice': a.id }, [
        el('b', null, [sum.status || '알림']), ' ' + (sum.headline || ''),
        el('span', { cls: 'when' }, [fmtWhen(a.at) + ' · ' + (sum.title || '') + (a.read ? ' · 읽음' : '')])])]));
    });
  }

  /* ---- ② 목록 ---- */
  function selectBox(id, labelText, key, value, options) {
    var s = el('select', { id: id, 'data-filter': key }, [el('option', { value: '' }, ['전체'])].concat(options.map(function (o) {
      return el('option', { value: o[0], selected: o[0] === value }, [o[1]]);
    })));
    return el('div', { cls: 'ld-filter' }, [el('label', { 'for': id }, [labelText]), s]);
  }
  /* 글자 찾기 (REQ-LG-08): Enter·[찾기]로 적용, 찾는 중이면 [지우기]. 낱말은 두 탭이 함께 쓴다 */
  function searchBox(st) {
    return el('form', { cls: 'ld-filter ld-search', role: 'search', 'aria-label': '낱말로 찾기', id: 'ld-search' }, [
      el('label', { 'for': 'ld-q' }, ['낱말로 찾기']),
      el('div', { cls: 'ld-search-row' }, [
        el('input', { id: 'ld-q', type: 'search', cls: 'ld-q', value: st.q || '', maxlength: String(Q_MAX), autocomplete: 'off',
          enterkeyhint: 'search', placeholder: '예: 알림톡' }),
        el('button', { type: 'submit', cls: 'pn-btn-2 ld-q-btn', id: 'ld-q-go' }, [icon('i-search'), '찾기']),
        st.q ? btn('pn-btn-2 ld-q-btn', '지우기', 'q-clear', { id: 'ld-q-clear', 'aria-label': '찾기 지우기' }) : null])]);
  }
  function emptySearch(st, what, extra) {
    return el('div', { cls: 'ld-card ld-empty' }, [el('p', null, ['‘' + st.q + '’' + iga(st.q) + ' ' + what]),
      el('div', { cls: 'ld-empty-acts' }, [btn('pn-btn-2', '찾기 지우기', 'q-clear'), extra || null])]);
  }
  /* ID·제목 밖(임시 방법·묶인 신고 문장)에서만 찾았으면 어디서 찾았는지 글자로 알린다 */
  function hitLine(d) {
    var m = d.matchedIn || [];
    if (!m.length || m.indexOf('ID') >= 0 || m.indexOf('TITLE') >= 0) return null;
    var where = [];
    if (m.indexOf('WORKAROUND') >= 0) where.push('임시 방법');
    if (m.indexOf('REPORT') >= 0) where.push('연결된 문의 ' + (d.matchedReportIds || []).length + '건');
    return el('span', { cls: 'ld-hit' }, ['찾은 곳: ' + where.join(' · ')]);
  }
  function defectsView(st, history) {
    // [오류·조치 이력]: 해결·수정하지 않음 공통 오류(ADR-030). 필터·찾기는 ApiClient.getDefects 가 했다
    var list = sorted(listed).filter(function (d) { return !history || CLOSED.indexOf(d.status) >= 0; });
    var filtered = !!(st.status || st.grade || st.type);
    var filters = el('div', { cls: 'ld-filters' }, [
      searchBox(st),
      selectBox('ld-f-status', '상태', 'status', st.status, ORDER.map(function (c) { return [c, stageLabel(c)]; })),
      selectBox('ld-f-grade', '처리 등급', 'grade', st.grade, Object.keys(GRADE).map(function (c) { return [c, GRADE[c]]; })),
      selectBox('ld-f-type', '유형', 'type', st.type, [['DEFECT', TYPE.DEFECT], ['IMPROVEMENT', TYPE.IMPROVEMENT]]),
      filtered ? btn('pn-btn-2 ld-reset', '조건 지우기', 'reset') : null,
      el('p', { cls: 'ld-sort' }, [icon('i-info'), '영향 지점 수 × 업무 중요도 순'])]);
    var body;
    if (!list.length && st.q) {
      body = emptySearch(st, filtered ? '들어가고 조건에 맞는 공통 오류가 없어요' : '들어간 공통 오류가 없어요',
        filtered ? btn('pn-btn-2', '조건 지우기', 'reset') : null);
    } else if (!list.length) {
      body = el('div', { cls: 'ld-card ld-empty' }, [el('p', null, [history ? '해결되거나 수정하지 않기로 한 공통 오류가 없어요' : '조건에 맞는 공통 오류가 없어요']),
        btn('pn-btn-2', '조건 지우기', 'reset')]);
    } else {
      var head = el('tr', null, ['공통 오류', '유형', '신·구', '영향 지점', '문의', '처리 등급', '상태', '담당 부서'].map(function (h, i) {
        return el('th', { scope: 'col', cls: i >= 3 && i <= 4 ? 'is-num' : null }, [h]);
      }));
      var trs = list.map(function (d) {
        return el('tr', { 'data-id': d.id, cls: st.item === d.id ? 'is-open' : null }, [
          el('td', null, [el('button', { type: 'button', cls: 'ld-open', 'data-open': d.id, 'aria-haspopup': 'dialog' }, [
            el('span', { cls: 'ld-id' }, marked(d.id, st.q)), el('span', { cls: 'ld-title' }, marked(d.title, st.q)), hitLine(d)])]),
          el('td', { cls: 'is-nowrap' }, [TYPE[d.type] || d.type]),
          el('td', { cls: 'is-nowrap' }, [GEN[d.systemGen] || d.systemGen]),
          el('td', { cls: 'is-num' }, [branchCount(d) + '곳']),
          el('td', { cls: 'is-num' }, [(d.reports || []).length + '건']),
          el('td', null, [gradeTag(d.grade)]),
          el('td', null, [statusTag(d.status), d.fieldFailCount
            ? el('span', { cls: 'ld-tag is-warn ld-field-flag' }, ['현장 문제 ' + d.fieldFailCount + '명']) : null]),
          el('td', { cls: 'is-nowrap' }, [DEPT[d.departmentCode] || d.departmentCode])]);
      });
      body = el('div', { cls: 'ld-card' }, [el('table', { cls: 'ld-table', 'aria-label': (history ? '오류·조치 이력' : '공통 오류 목록') + ', 영향 지점 수 × 업무 중요도 순' }, [
        el('thead', null, [head]), el('tbody', null, trs)])]);
    }
    return [filters, body, el('p', { cls: 'ld-total', 'aria-live': 'polite' }, ['총 ', el('b', null, [list.length + '건'])])];
  }
  function tabCount(id) {
    if (id === 'inbox') return inboxData ? inboxData.total : 0;
    if (id === 'consult') return consults.length;
    if (id === 'history') return defects.filter(function (d) { return CLOSED.indexOf(d.status) >= 0; }).length;
    return defects.length;
  }
  function tabNew(id) {
    if (id === 'inbox') return inboxData ? inboxData.fresh : 0;
    if (id === 'consult') return consults.filter(function (x) { return x.isNew; }).length;
    return 0;
  }
  function paintList(st) {
    var bar = $('ld-tabs');
    bar.innerHTML = '';
    TABS[st.role].forEach(function (t) {
      var on = t[0] === st.tab, fresh = tabNew(t[0]);
      bar.appendChild(el('button', { type: 'button', role: 'tab', cls: 'ld-tab', id: 'ld-tab-' + t[0], 'data-tab': t[0], 'aria-controls': 'ld-view',
        'aria-selected': String(on), tabindex: on ? '0' : '-1' }, [t[1] + ' ', el('span', { cls: 'ld-count' }, [String(tabCount(t[0]))]),
        fresh ? el('span', { cls: 'badge ld-tab-badge', 'data-a11y': 'badge' }, ['새 ' + fresh]) : null]));
    });
    var view = $('ld-view');
    view.setAttribute('aria-labelledby', 'ld-tab-' + st.tab);
    var act = document.activeElement;
    var keep = act && act.getAttribute('data-filter');
    var keepId = act && view.contains(act) && /^ld-q/.test(act.id || '') ? act.id : '';
    var keepBox = act && act.getAttribute && act.getAttribute('data-filter-box');
    view.innerHTML = '';
    (st.tab === 'inbox' ? inboxView(st) : st.tab === 'consult' ? consultView(st) : defectsView(st, st.tab === 'history'))
      .forEach(function (n) { if (n) view.appendChild(n); });
    if (keep && $('ld-f-' + keep)) $('ld-f-' + keep).focus();
    if (keepBox && view.querySelector('[data-filter-box="' + keepBox + '"]')) view.querySelector('[data-filter-box="' + keepBox + '"]').focus();
    // 찾기 뒤에도 찾기 줄에 머문다. [지우기]가 사라졌으면 입력란으로
    if (keepId) {
      var to = $(keepId) || $('ld-q');
      to.focus();
      if (to.id === 'ld-q') to.setSelectionRange(to.value.length, to.value.length);
    }
  }
  /* [전산 문의함] (REQ-LG-14, ADR-030): 요약 칸 4개 → 찾기 → 표. 문의번호보다 제목·업무·업무 영향을 앞에 */
  var BOXES = [['new', '신규'], ['mine', '내 담당'], ['info', '추가 정보 확인'], ['it', 'IT 협의 중']];
  function inboxView(st) {
    var box = inboxData || { items: [], counts: {}, inboxes: [] };
    var target = st['for'] ? defects.filter(function (d) { return d.id === st['for']; })[0] : null;
    var cells = el('div', { cls: 'ld-boxes', role: 'group', 'aria-label': '문의함 요약 · 누르면 그 조건으로 거름' }, BOXES.map(function (c) {
      return el('button', { type: 'button', cls: 'ld-box', 'data-filter-box': c[0], 'aria-pressed': String(st.filter === c[0]) }, [
        el('span', null, [c[1]]), el('b', null, [(box.counts[c[0]] || 0) + '건'])]);
    }));
    var note = target ? el('div', { cls: 'pn-note ld-pick-note' }, [icon('i-info'), el('div', null, [
      el('b', null, [target.id + ' 「' + target.title + '」에 연결할 문의를 고르세요']), '같은 원인으로 보이는 문의의 [연결]을 누르세요.'])]) : null;
    var shown = box.items, body;
    if (!shown.length) {
      body = st.q ? emptySearch(st, '들어간 문의가 없어요')
        : el('div', { cls: 'ld-card ld-empty' }, [el('p', null, [st.filter ? '이 조건의 문의가 없어요' : '맡은 문의함에 문의가 없어요']),
          st.filter ? btn('pn-btn-2', '조건 지우기', 'box-clear') : null]);
    } else {
      var head = el('tr', null, ['문의', '관련 업무', '업무 영향', '접수', '대응 상태', target ? '' : '담당'].map(function (h, i) {
        return el('th', { scope: 'col', 'aria-label': target && i === 5 ? '연결' : null }, [h]);
      }));
      var trs = shown.map(function (r) {
        return el('tr', { 'data-id': r.id, cls: st.item === r.id ? 'is-open' : null }, [
          el('td', null, [el('button', { type: 'button', cls: 'ld-open', 'data-open': r.id, 'aria-haspopup': 'dialog' }, [
            el('span', { cls: 'ld-title' }, marked(r.title, st.q)),
            el('span', { cls: 'ld-id' }, marked(r.id, st.q).concat([r.isNew ? el('span', { cls: 'ld-tag is-new' }, ['새로 들어옴']) : null]))])]),
          el('td', { cls: 'is-nowrap' }, [r.businessLabel]),
          el('td', null, [r.impact]),
          el('td', { cls: 'is-nowrap' }, [fmtWhen(r.createdAt)]),
          el('td', null, [el('span', { cls: 'ld-tag' + (r.handling.code === 'NEW' ? ' is-warn' : r.handling.code === 'SELF_RESOLVED' ? ' is-ok' : '') }, [r.handling.label])]),
          el('td', { cls: 'is-nowrap' }, [target ? btn('pn-btn-2', '연결', 'link', { 'data-report': r.id, 'aria-haspopup': 'dialog', 'aria-label': r.id + ' 연결' })
            : r.assignee ? r.assignee.name : '없음'])]);
      });
      body = el('div', { cls: 'ld-card' }, [el('table', { cls: 'ld-table', 'aria-label': '맡은 문의함의 문의, 최신 순' }, [
        el('thead', null, [head]), el('tbody', null, trs)])]);
    }
    return [cells, el('div', { cls: 'ld-filters' }, [searchBox(st),
      el('p', { cls: 'ld-sort' }, [icon('i-info'), '맡은 문의함: ' + ((box.inboxes || []).map(function (b) { return b.name; }).join(', ') || '없음') + ' · 규칙으로 분류'])]),
      note, body, el('p', { cls: 'ld-total', 'aria-live': 'polite' }, ['총 ', el('b', null, [shown.length + '건'])])];
  }
  /* [IT 협의 요청] (REQ-LG-17): 현업이 협의를 요청한 문의만 */
  function consultView(st) {
    var body;
    if (!consults.length) body = el('div', { cls: 'ld-card ld-empty' }, [el('p', null, ['협의 요청이 없어요'])]);
    else {
      var head = el('tr', null, ['문의', '관련 업무', '요청한 현업', '확인할 내용', '요청 시각', '협의 결과'].map(function (h) { return el('th', { scope: 'col' }, [h]); }));
      body = el('div', { cls: 'ld-card' }, [el('table', { cls: 'ld-table', 'aria-label': 'IT 협의 요청, 최신 순' }, [el('thead', null, [head]),
        el('tbody', null, consults.map(function (c) {
          return el('tr', { 'data-id': c.id, cls: st.item === c.id ? 'is-open' : null }, [
            el('td', null, [el('button', { type: 'button', cls: 'ld-open', 'data-open': c.id, 'aria-haspopup': 'dialog' }, [
              el('span', { cls: 'ld-title' }, [c.title]),
              el('span', { cls: 'ld-id' }, [c.id, c.isNew ? el('span', { cls: 'ld-tag is-new' }, ['새로 들어옴']) : null])])]),
            el('td', { cls: 'is-nowrap' }, [c.businessLabel]),
            el('td', { cls: 'is-nowrap' }, [c.requestedBy ? c.requestedBy.name : '']),
            el('td', null, [c.questions.join(' · ')]),
            el('td', { cls: 'is-nowrap' }, [fmtWhen(c.at)]),
            el('td', null, [c.reply ? el('span', { cls: 'ld-tag' }, [c.reply]) : el('span', { cls: 'ld-tag is-warn' }, ['기록 전'])])]);
        }))])]);
    }
    return [el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['전화 협의는 그대로예요']),
      '협의 결과를 남기면 현업 담당자의 문의 상세에 이어져요. 공식 개발 요청은 ITGS에서 해요.'])]), body,
      el('p', { cls: 'ld-total', 'aria-live': 'polite' }, ['총 ', el('b', null, [consults.length + '건'])])];
  }

  /* ---- ③ 상세 패널 ---- */
  /* ADR-029 결정 4: 기록된 단계만(건너뛴 단계는 칠하지 않는다). S3 와 같은 목록 */
  function progress(d) {
    var list = window.NoticeTracks.recorded(d.statusHistory).map(function (h) {
      return { name: h.verification ? '배포·검증 완료(가상)' : stageLabel(h.to), at: h.at };
    });
    return window.NoticeTracks.steps(list.length ? list : [{ name: stageLabel(d.status) }]);
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
        h.reason ? el('span', { cls: 'ld-why' }, ['사유: ' + h.reason]) : null,
        h.to === 'FIX_PLANNED' && h.plannedFixDate ? el('span', { cls: 'ld-why' }, ['예정일: ' + fmtDate(h.plannedFixDate)]) : null,
        h.verification ? el('span', { cls: 'ld-why' }, ['검증 완료(가상): ' + fmtWhen(h.verification.verifiedAt) +
          (h.verification.refId ? ' · 참조 ' + h.verification.refId : '')]) : null,
        h.note ? el('span', { cls: 'ld-why' }, ['메모(이 화면에만): ' + h.note]) : null]];
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
  /* ---- ③-2 신고 패널: 안 묶인 신고 + AI 비슷한 대표 결함 추천 (REQ-LG-06, ADR-017) ----
     AI는 후보만 낸다. 묶기는 담당자가 [이 결함에 묶기] → 신고 묶기 대화상자에서 확인하고 [묶기]를 눌러야 된다 */
  function unlinkedReport(id) { return unlinked.filter(function (r) { return r.id === id; })[0] || null; }
  function simTag(c) {
    if (!c.similarity) return el('span', { cls: 'ld-tag is-dim' }, ['규칙으로 찾음']);
    return el('span', { cls: 'ld-tag' + (c.similarity === 'HIGH' ? '' : ' is-dim') }, [SIMILAR[c.similarity] || c.similarity]);
  }
  /* ADR-027 결정 8: 후보마다 가상 데이터에서 센 연결된 신고 수·영향 지점 수와 기존 조치 */
  function relationRows(id) {
    var d = defects.filter(function (x) { return x.id === id; })[0];
    if (!d) return null;
    return rows([['연관 규모', '연결된 문의 ' + (d.reports || []).length + '건 · 영향 지점 ' + branchCount(d) + '곳'],
      ['기존 조치', '지금 상태 ' + stageLabel(d.status) + ' · 임시 방법 ' + (d.workaround ? '「' + d.workaround + '」' : '없음') +
        ' · 마지막 변경 ' + fmtDate(d.updatedAt)]]);
  }
  function ruleOutcome() { return !!similar && similar.llmOutcome === 'RULE'; }   // ADR-026 결정 8: 새 신고 규칙 후보
  function aiNote() {
    if (ruleOutcome()) {
      return el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['추천은 참고예요']),
        '같은 업무·증상·조건으로 찾았어요. 같은 원인인지는 담당자가 확인하고 연결해요.'])]);
    }
    return el('div', { cls: 'pn-note' }, [icon('i-spark'), el('div', null, [el('b', null, ['AI 추천은 참고예요']),
      '같은 원인인지는 담당자가 확인하고 연결해요. AI가 스스로 연결하지 않아요.'])]);
  }
  function aiCard(r, st) {
    var s = similar;
    if (st.llm === 'slow' || !s) {
      return el('div', { cls: 'pn-card ld-ai' }, [el('div', { cls: 'pn-loading', role: 'status' }, [el('div', { cls: 'pn-spin', 'aria-hidden': 'true' }),
        el('p', null, [el('b', null, ['AI가 유사 오류 사례를 찾고 있어요'])]),
        el('p', { cls: 'ld-meta' }, ['기다리지 않고 공통 오류 목록에서 바로 고를 수도 있어요.'])])]);
    }
    var fallback = s.llmOutcome === 'FALLBACK', rule = s.llmOutcome === 'RULE', list = s.candidates || [];
    var head = el('div', { cls: 'kn-card-head' }, [
      el('p', { cls: 'pn-card-title' }, [list.length
        ? (fallback ? '같은 업무·문제 유형의 공통 오류 ' : rule ? '같은 조건의 공통 오류 ' : '유사 오류 사례 ') + list.length + '건'
        : (fallback ? '같은 업무·문제 유형의 오류도 없어요' : rule ? '같은 조건의 공통 오류가 없어요' : '유사 오류 사례를 찾지 못했어요')]),
      el('span', { cls: 'ld-tag' + (fallback || rule ? ' is-dim' : '') }, [fallback || rule ? '규칙 후보' : 'AI 추천'])]);
    if (rule) {   // 비슷함 정도 없이 추천 근거만 글로 보인다
      return el('div', { cls: 'pn-card ld-ai' }, [head, list.length ? el('ul', { cls: 'pn-plain ld-cands' }, list.map(function (c) {
        return el('li', null, [
          el('div', { cls: 'ld-cand-head' }, [el('p', { cls: 'ld-cand-says' }, [el('b', { cls: 'ld-id' }, [c.defectId]), ' · 담당자 확인 필요'])]),
          el('p', { cls: 'ld-cand-title' }, ['「' + c.title + '」']),
          rows([['추천 근거', el('ul', { cls: 'pn-plain ld-reasons' }, (c.reasons || []).map(function (why) { return el('li', null, [why]); }))]]),
          relationRows(c.defectId),
          btn('pn-btn-2 ld-cand-btn', [icon('i-link'), '이 오류에 연결'], 'link-ai', { 'data-ai-link': c.defectId, 'aria-haspopup': 'dialog',
            'aria-label': c.defectId + '에 연결' })]);
      })) : el('p', null, ['공통 오류 목록에서 직접 골라 주세요. 같은 원인이 없으면 문의 단위로 대응해요.'])]);
    }
    if (!list.length) {
      return el('div', { cls: 'pn-card ld-ai' }, [head,
        el('p', null, [fallback ? '공통 오류 목록에서 직접 골라 주세요.'
          : '같은 원인의 공통 오류가 없으면 문의 단위로 대응해요. 그래도 비슷한 게 있는지 [관련 오류 연결]로 목록을 한 번 더 봐 주세요.']),
        fallback ? null : el('p', { cls: 'ld-meta' }, ['새 공통 오류 만들기는 확장 기능에서 열려요.'])]);
    }
    return el('div', { cls: 'pn-card ld-ai' }, [head, el('ul', { cls: 'pn-plain ld-cands' }, list.map(function (c) {
      return el('li', null, [
        // 규칙 후보는 카드 머리 "규칙 후보" 태그로 알리므로 줄마다 같은 태그를 되풀이하지 않는다
        el('div', { cls: 'ld-cand-head' }, [el('p', { cls: 'ld-cand-says' }, fallback
          ? [el('b', { cls: 'ld-id' }, [c.defectId]), wa(c.defectId) + ' 같은 업무·문제 유형이에요']
          : ['이 문의는 ', el('b', { cls: 'ld-id' }, [c.defectId]), wa(c.defectId) + ' 비슷해 보여요']), fallback ? null : simTag(c)]),
        el('p', { cls: 'ld-cand-title' }, ['「' + c.title + '」']),
        fallback ? null : el('p', { cls: 'ld-meta' }, ['이유: ' + c.reason]),   // 규칙 후보의 이유는 위 문장과 같아 되풀이하지 않음
        relationRows(c.defectId),
        btn('pn-btn-2 ld-cand-btn', [icon('i-link'), '이 오류에 연결'], 'link-ai', { 'data-ai-link': c.defectId, 'aria-haspopup': 'dialog',
          'aria-label': c.defectId + '에 연결' })]);
    }))]);
  }
  /* ---- ADR-030 문의 상세: 핵심 요약 → 분류·담당 → 담당자 대응 → 대응 기록 → ①②③ → 원본 ---- */
  function srcOf(code) { return el('span', { cls: 'pn-src' }, [' · ' + window.IntakeFacts.sourceLabel(code)]); }
  function coreCard(q) {
    var c = q.core, who = q.reporter ? q.reporter.name + ' · ' + q.reporter.branchName : '';
    var box = el('div', { 'data-core': '' }, [el('h3', { tabindex: '-1' }, [c.title]),
      el('div', { cls: 'pn-card' }, [rows([['업무', c.business],
        ['발생 단계', c.step ? [c.step.text, srcOf(c.step.source)] : '미확인'],
        ['실제 증상', [c.symptom.text, srcOf(c.symptom.source)]],
        ['업무 영향', c.impact]]),
        el('p', { cls: 'ld-meta' }, ['문의번호 ' + q.id + ' · 접수 ' + fmtWhen(q.report.createdAt) + (who ? ' · ' + who : '') +
          (q.submittedBy && q.reporter && q.submittedBy.id !== q.reporter.id ? ' · ' + q.submittedBy.name + ' 대신 문의' : '')])])]);
    return box;
  }
  function routeCard(q, me) {
    var r = q.routing, cur = q.assignment;
    var basis = r.method === 'STAFF' ? '담당자가 다른 문의함으로 보냄' :
      '규칙으로 분류 · 근거: ' + (r.basis.length ? r.basis.map(function (b) { return BASIS[b.kind]; }).join(', ') : '없음(미분류)');
    var other = cur && me && cur.assignee.id !== me.id;
    var card = el('div', { cls: 'pn-card' }, [el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title' }, ['분류·담당']),
      el('span', { cls: 'ld-tag' + (q.handling.code === 'NEW' ? ' is-warn' : '') }, [q.handling.label])]),
      rows([['문의함', r.inboxName], ['분류', basis],
        ['담당', cur ? cur.assignee.name + ' · ' + fmtWhen(cur.at) + ' 인수' : '아직 없음']]),
      other ? el('p', { cls: 'ld-meta', role: 'status' }, [cur.assignee.name + '이 담당하고 있어요. 담당을 바꾸려면 담당자가 다른 문의함으로 보내요.']) : null,
      claimNote ? el('p', { cls: 'pn-err', role: 'alert' }, [claimNote]) : null,
      q.routes.length > 1 ? el('details', { cls: 'pn-details' }, [el('summary', null, ['분류 이력 ' + q.routes.length + '건']),
        rows(q.routes.map(function (x) {
          var why = x.method === 'STAFF' ? '재분류 · ' + (meta ? pairText(meta.rerouteReasons, x.reasonCode) : '') + ' · ' + userName(x.actorId) : '규칙으로 분류';
          return [fmtWhen(x.at), x.inboxName + ' · ' + why];
        }))]) : null]);
    card.setAttribute('data-route', '');
    return card;
  }
  function pairText(pairs, code) { var hit = (pairs || []).filter(function (p) { return p[0] === code; })[0]; return hit ? hit[1] : ''; }
  function handleCard(q) {
    var can = q.can, list = [];
    if (can.act) list.push(['info', '추가 정보 요청'], ['guide', '대응 방법 안내'], ['resolve', '자체 해결'], ['consult', 'IT 협의 요청']);
    if (can.reroute) list.push(['reroute', '다른 문의함으로']);
    if (can.reply) list.push(['reply', '협의 결과 남기기']);
    if (can.act || can.reply) list.push(['itgs', 'ITGS 요청 초안']);
    if (!list.length) return null;
    var card = el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['담당자 대응']),
      el('div', { cls: 'ld-acts' }, list.map(function (x) { return btn('pn-btn-2', x[1], x[0], { 'aria-haspopup': 'dialog' }); })),
      el('p', { cls: 'ld-meta' }, [can.reply ? '협의 결과는 코드로 남기고, 전화 협의 내용은 저장하지 않아요.'
        : '대응 방법은 승인·공개된 것만 고를 수 있어요. 자유 메모는 저장하지 않아요.'])]);
    card.setAttribute('data-handle', '');
    return card;
  }
  var ACTION_NAME = { INFO_REQUEST: '추가 정보 요청', GUIDE: '대응 방법 안내', SELF_RESOLVED: '자체 해결', IT_CONSULT: 'IT 협의 요청',
    IT_REPLY: 'IT 협의 결과', REROUTE: '다른 문의함으로 보냄' };
  function actionsCard(q) {
    if (!q.actions.length) return null;
    var card = el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['대응 기록']),
      rows(q.actions.slice().reverse().map(function (a) {
        var what = a.guide ? '「' + a.guide.text + '」' : a.inboxName ? a.inboxName + ' · ' + a.labels.join(', ') : a.labels.join(', ');
        return [fmtWhen(a.at), [el('b', null, [ACTION_NAME[a.type]]), ' · ' + what + ' · ' + (a.actor ? a.actor.name : '')]];
      }), 'ld-hist')]);
    card.setAttribute('data-actions', '');
    return card;
  }
  function addedCard(q) {
    var added = q.facts.filter(function (f) { return f.source === 'USER_ADDED'; });
    if (!added.length) return null;
    return el('div', { cls: 'pn-card', 'data-added': '' }, [el('p', { cls: 'pn-card-title' }, ['FC가 추가로 알려 준 정보']),
      rows(added.map(function (f) { return [f.label, [f.valueLabel, srcOf('USER_ADDED'), el('span', { cls: 'pn-src' }, [' · ' + fmtWhen(f.at)])]]; }))]);
  }
  function unknownCard(q) {
    return el('div', { cls: 'pn-card', 'data-unknowns': '' }, [el('p', { cls: 'pn-card-title' }, ['추가 확인이 필요한 정보']),
      q.unknowns.length ? el('ul', { cls: 'pn-plain ld-reasons' }, q.unknowns.map(function (u) { return el('li', null, [u.label + ' (미확인)']); }))
        : el('p', null, ['업무에 필요한 항목은 모두 확인됐어요.']),
      el('p', { cls: 'ld-meta' }, ['[추가 정보 요청]으로 문의자에게 선택형으로 물을 수 있어요. 원인을 자동으로 판단한 결과가 아니에요.'])]);
  }
  function originalDetails(r) {
    var list = factRows(r, true);
    return el('details', { cls: 'pn-details', 'data-original': '' }, [el('summary', null, ['원본 문의와 상담 내용']),
      rows([['문의자가 쓴 말', r.maskedText || '같은 오류 참여(문장 없음)'],
        ['접수 방식', r.origin === 'ASSISTANT' ? 'AI 문의에서 이어서 접수' : r.kind === 'ME_TOO' ? '같은 오류로 간편 알리기' : '일반 접수']].concat(list)),
      el('p', { cls: 'ld-meta' }, ['상담 대화 원문은 저장하지 않아요. 위 값은 문의자가 고른 코드와 가린 문장이에요.'])]);
  }
  function paintReportPanel(st) {
    var q = inquiry, body = $('ld-body'), foot = $('ld-foot'), me = viewer(st);
    $('ld-panel-title').textContent = '문의 상세';
    body.innerHTML = ''; foot.innerHTML = '';
    if (!q || q.forbidden) {
      body.appendChild(el('h3', { tabindex: '-1' }, ['볼 수 있는 문의가 아니에요']));
      body.appendChild(el('p', { cls: 'pn-lead' }, ['맡은 문의함의 문의나 협의 요청된 문의만 볼 수 있어요.']));
      foot.appendChild(btn('pn-btn', '목록으로', 'panel-close'));
      return true;
    }
    var r = unlinkedReport(st.item) || {};
    var warn = st.llm === 'fail' ? el('div', { cls: 'pn-note pn-warn' }, [icon('i-warn'), el('div', null, [el('b', null, ['AI 추천을 받지 못했어요']),
      '같은 업무·같은 문제 유형으로 찾은 공통 오류를 보여 드려요. 담당자가 확인하고 골라 주세요.'])]) : null;
    [coreCard(q), routeCard(q, me), handleCard(q), actionsCard(q),
      el('h4', null, ['① 문의자와 발생 환경']),
      r.id ? reporterCard(r) : null, r.id ? factsCard(r) : null, addedCard(q),
      r.diagnostics ? diagnosticDetails(r.diagnostics) : null,
      r.hasAttachment ? attachmentDetails(r, st) : null,
      r.id ? draftSummaryCard(r) : null,
      el('h4', null, ['② 관련 오류와 기존 조치']),
      warn || aiNote(),
      aiCard(r, st),
      el('p', { cls: 'pn-help' }, [icon('i-info'), el('span', null, [ruleOutcome()
        ? '규칙 후보는 업무·증상·발생 조건 코드와 시도한 조치만 비교해요. 문의 문장·고객번호·보낸 사람은 쓰지 않아요.'
        : 'AI에게는 가린 문의 문장과 업무·문제 유형, 공통 오류 제목·우회법만 보내요. 고객번호와 보낸 사람은 보내지 않아요.'])]),
      handlingCard(r),
      el('h4', null, ['③ 추가 확인이 필요한 정보']),
      unknownCard(q),
      r.id ? traceCard(r) : null,
      r.id ? originalDetails(r) : null
    ].forEach(function (n) { if (n) body.appendChild(n); });
    if (q.can.claim) foot.appendChild(btn('pn-btn', '담당하기', 'claim'));
    else if (q.can.act || q.can.reply) foot.appendChild(btn('pn-btn', [icon('i-link'), '관련 오류 연결'], 'link-pick', { 'aria-haspopup': 'dialog' }));
    else foot.appendChild(btn('pn-btn', '목록으로', 'panel-close'));   // 다른 담당자의 문의: 볼 수만 있다
    return true;
  }

  function diagnosticDetails(diagnostics) {
    return el('details', { cls: 'pn-details' }, [
      el('summary', null, ['첨부된 진단정보']),
      rows([['접수하는 환경', diagnostics.submission.device || '미확인']].concat(window.IntakeDiagnosticsRows(diagnostics.submission, fmtWhen))),
      rows([['오류가 발생한 환경', diagnostics.incident.device || '미확인']].concat(window.IntakeDiagnosticsRows(diagnostics.incident, fmtWhen)))
    ]);
  }

  /* ADR-026: S2 접수와 같은 저장본에서 FC가 알려 준 발생 조건과 출처를 보인다(대화 원문은 저장되지 않음) */
  function factRows(r, withResumption) {
    var F = window.IntakeFacts, src = r.factSources || {};
    var urgency = ((((window.FIXTURES || {}).intake || {}).quick || {}).options || {}).urgency || [];
    function src2(code) { return el('span', { cls: 'pn-src' }, [' · ' + F.sourceLabel(code)]); }
    function said(text, key) { return [text, src2(src[key])]; }
    var list = [];
    if (r.incident && r.incident.device) list.push(['오류가 난 기기', said(F.deviceLabel(r.incident.device), 'device')]);
    Object.keys(r.conditions || {}).forEach(function (key) {
      list.push([F.CONDITIONS[key].label, said(F.conditionLabel(key, r.conditions[key]), 'conditions')]);
    });
    if ((r.urgent || []).length) {
      list.push(['업무 영향', said(r.urgent.map(function (code) {
        var hit = urgency.find(function (pair) { return pair[0] === code; });
        return hit ? hit[1] : code;
      }).join(' · '), 'urgent')]);
    }
    var state = F.clean(r).workaroundState;   // ADR-027: 임시조치 없음 / 안내함 / 시도함
    if (state) list.push(['임시조치', [F.workaroundLabel(state), src2(state === 'NONE' ? 'DEFECT_LEDGER' : src.attempted || 'USER_REPORTED')]]);
    if (r.attemptedWorkaround) list.push(['시도한 조치', ['「' + r.attemptedWorkaround + '」', src2(src.attempted || 'DEFECT_LEDGER')]]);
    if (r.supportNeeded) list.push(['업무 상황', said(F.supportLabel(r.supportNeeded), 'supportNeeded')]);
    var answer = r.workResumption ? F.outcomeLabel(r.workResumption.result) + ' (' + fmtWhen(r.workResumption.at) + ')' :
      r.workOutcome ? F.outcomeLabel(r.workOutcome) : '';
    if (withResumption && answer) list.push(['업무 재개', [answer, src2('USER_REPORTED')]]);
    if (r.suggestedDefectId) list.push(['AI 문의 안내 사례', [r.suggestedDefectId, el('span', { cls: 'pn-src' }, [' · 연결은 담당자가 정해요'])]]);
    return list;
  }
  /* ADR-028: 신고자 정보(조회한 이름·역할·지점, 계정 ID는 결함 대장에서만)와 접수 환경(자동 확인) */
  var ROLE = { FC: 'FC', MANAGER: '관리자', SALES: '영업 담당', IT: 'IT 담당' };
  function srcSpan(text) { return el('span', { cls: 'pn-src' }, [' · ' + text]); }
  function reporterCard(r) {
    var who = r.reporter, by = r.submittedBy, sub = (r.diagnostics || {}).submission || {};
    var env = [sub.device, sub.browser].filter(Boolean).join(' · ');
    var card = el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['문의자 정보']),
      rows([['문의자', who ? [who.name + ' · ' + (ROLE[who.role] || who.role) + ' · ', el('span', { cls: 'ld-id' }, [who.id])] : '확인 필요'],
        ['소속 지점', who ? who.branchName : '확인 필요'],
        ['대리 접수', by ? [by.name + ' · ' + (ROLE[by.role] || by.role) + ' · ', el('span', { cls: 'ld-id' }, [by.id]), ' (대신 접수)'] : '아니요 · 본인 접수'],
        ['접수 시각', [fmtWhen(r.createdAt), srcSpan('시스템')]],
        ['접수 화면', sub.screen ? [sub.screen + (sub.screenCode ? ' (' + sub.screenCode + ')' : ''), srcSpan('자동 확인')] : '미확인'],
        ['접수 환경', env ? [env, srcSpan(sub.source === 'BROWSER_CAPTURED' ? '자동 확인' : '이전 시연 기록')] : '미확인']])]);
    card.setAttribute('data-report-reporter', '');
    return card;
  }
  /* 오류 발생 정보: 업무·증상 + FC가 알려 준 발생 조건 + 발생 환경(진단 이벤트·FC 진술, 접수 환경은 복사하지 않음) */
  function incidentEnv(r) {
    var ev = (r.diagnostics || {}).incident || {}, from = window.IntakeDiagnosticsSource(ev) || '진단 이벤트';
    var inc = r.incident || {}, when = [inc.date, inc.time].filter(Boolean).join(' ');
    return {
      device: ev.device ? [ev.device, srcSpan(from)] : '미확인',
      browser: ev.browser ? [ev.browser, srcSpan(from)] : '미확인',
      at: when ? [when, srcSpan('FC가 알려 줌')] : ev.at ? [fmtWhen(ev.at), srcSpan(from)] : '미확인',
      errorCode: ev.errorCode ? [ev.errorCode, srcSpan(from)] : null,
      screenCode: ev.screenCode || null
    };
  }
  function factsCard(r) {
    var env = incidentEnv(r), list = factRows(r, true);
    var hasDevice = !!(r.incident && r.incident.device), hasOs = !!((r.conditions || {}).DEVICE_OS);
    // 환경 줄(기기·조건·OS·브라우저·발생 시각)을 모은 뒤 업무 영향·임시조치·회신 줄
    var later = ['업무 영향', '임시조치', '시도한 조치', '업무 상황', '업무 재개', 'AI 문의 안내 사례'];
    var cut = list.findIndex(function (row) { return later.indexOf(row[0]) >= 0; });
    if (cut < 0) cut = list.length;
    list = [['업무', BUSINESS[r.business] || r.business || '확인 필요'], ['증상', SYMPTOM[r.symptom] || r.symptom || '확인 필요']]
      .concat(hasDevice ? [] : [['오류가 난 기기', env.device]], list.slice(0, cut),
        hasOs ? [] : [[window.IntakeFacts.CONDITIONS.DEVICE_OS.label, '미확인']], [['브라우저', env.browser], ['발생 시각', env.at]], list.slice(cut));
    var card = el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['오류 발생 정보']), rows(list),
      el('p', { cls: 'ld-meta' }, ['고객 휴대전화의 기기·OS·접속 경로는 FC가 알려 준 값이에요. 접수한 PC의 브라우저는 여기에 쓰지 않아요.'])]);
    card.setAttribute('data-report-facts', '');
    return card;
  }
  /* ③ 로그 추적 단서(ADR-028 결정 7). 운영 로그 연계 전이라 결과를 만들지 않는다 */
  function traceCard(r) {
    var env = incidentEnv(r), sub = (r.diagnostics || {}).submission || {}, gaps = missingFacts(r);
    if (env.browser === '미확인') gaps.push('고객 브라우저 (확인 필요)');
    var card = el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['로그 추적 단서']),
      rows([['오류 코드', env.errorCode || '미확인'],
        ['화면 코드', '접수 ' + (sub.screenCode || '미확인') + ' · 발생 ' + (env.screenCode || '미확인')],
        ['발생 시각', env.at],
        ['업무 요청 ID', '연계 전 · 고객 동의 요청 등 관련 업무 요청 식별자는 업무 시스템과 연계한 뒤 확인해요'],
        ['시스템 로그', '연계 전 · 관련 시스템 로그는 아직 조회하지 않아요'],
        ['더 필요한 정보', gaps.length ? el('ul', { cls: 'pn-plain ld-reasons' }, gaps.map(function (g) { return el('li', null, [g]); })) : '없음']]),
      el('p', { cls: 'ld-meta' }, ['실제 로그를 조회하거나 분석한 결과가 아니에요. 문의자 계정·접수 시각·화면 코드로 담당 시스템에 로그를 요청할 수 있어요.'])]);
    card.setAttribute('data-report-trace', '');
    return card;
  }
  /* ③ 담당자 처리: 추가 확인이 필요한 조건(모름·빈 값)과 수정 계획의 시간 맥락 (ADR-027 결정 8) */
  function scenarioOf(id) {
    return ((((window.FIXTURES || {}).intakeAssistant || {}).defects) || []).filter(function (m) { return m.id === id; })[0] || null;
  }
  function missingFacts(r) {
    var F = window.IntakeFacts, out = [], cond = r.conditions || {};
    if (!r.incident || !r.incident.device || r.incident.device === 'UNKNOWN') out.push('오류가 난 기기');
    var top = (similar && similar.candidates || [])[0];
    var scenario = scenarioOf(r.suggestedDefectId) || (top ? scenarioOf(top.defectId) : null);
    var keys = Object.keys(cond).concat(((scenario && scenario.checks) || []).map(function (c) { return c.key; }))
      .filter(function (key, i, all) { return F.CONDITIONS[key] && all.indexOf(key) === i; });
    keys.forEach(function (key) {
      if (!cond[key]) out.push(F.CONDITIONS[key].label + ' (확인 안 됨)');
      else if (cond[key] === 'UNKNOWN') out.push(F.CONDITIONS[key].label + ' (모름)');
    });
    if (r.supportNeeded === 'UNKNOWN') out.push('업무 상황 (모름)');
    return out;
  }
  function handlingCard(r) {
    var card = el('div', { cls: 'pn-card' }, [
      el('p', { cls: 'pn-card-title' }, ['같은 원인이면 관련 오류에 연결해 주세요']),
      rows([['추가 확인', '아래 "추가 확인이 필요한 정보"를 [추가 정보 요청]으로 문의자에게 묻거나 담당 시스템에 확인해요'],
        ['수정 계획', '기술 검토 뒤 공통 오류의 [상태 바꾸기]에서 등록해요. 문의가 늘어도 예정일은 정해지지 않아요.']]),
      el('p', { cls: 'ld-meta' }, ['후보의 [이 오류에 연결]이나 아래 [관련 오류 연결]로 연결해요. 공통 오류와 관계없이 [자체 해결]로 끝낼 수도 있어요.'])]);
    card.setAttribute('data-report-handling', '');
    return card;
  }
  /* 대표 결함 상세: 묶인 신고의 발생 조건을 값별로 센다(가상 데이터에서 계산, ADR-027 결정 8) */
  function fieldSummary(d) {
    var F = window.IntakeFacts, counts = {}, order = [];
    function add(label, value) {
      if (!value) return;
      if (!counts[label]) { counts[label] = {}; order.push(label); }
      counts[label][value] = (counts[label][value] || 0) + 1;
    }
    (d.reports || []).forEach(function (r) {
      if (r.incident && r.incident.device) add('오류가 난 기기', F.deviceLabel(r.incident.device));
      Object.keys(r.conditions || {}).forEach(function (key) { if (F.CONDITIONS[key]) add(F.CONDITIONS[key].label, F.conditionLabel(key, r.conditions[key])); });
      if (r.supportNeeded) add('업무 상황', F.supportLabel(r.supportNeeded));
    });
    if (!order.length) return null;
    var card = el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['현장 조건 모아 보기']),
      rows(order.map(function (label) {
        var values = Object.keys(counts[label]).sort(function (a, b) {   // 많은 순, 모름은 끝
          return (a === '모름') - (b === '모름') || counts[label][b] - counts[label][a];
        });
        return [label, values.map(function (v) { return v + ' ' + counts[label][v] + '건'; }).join(' · ')];
      })),
      el('p', { cls: 'ld-meta' }, ['FC가 알려 준 값을 센 것이에요. 실제 기기에서 확인한 값이 아니에요.'])]);
    card.setAttribute('data-field-summary', '');
    return card;
  }
  function factsDetails(r) {
    var list = factRows(r, false);
    return list.length ? el('details', { cls: 'pn-details', 'data-report-facts': '' }, [el('summary', null, ['발생 조건 보기']), rows(list)]) : null;
  }

  function draftSummaryCard(report) {
    var summary = report.aiDraftSummary;
    if (!summary) return null;
    return el('details', { cls: 'pn-details' }, [
      el('summary', null, ['AI 접수 초안 확인 항목']),
      rows([['고객 진술', summary.customerReported ? '있음' : '미확인'],
        ['설계사 확인', summary.verifiedProvided ? '별도 내용 있음' : '미확인'],
        ['추가 확인', summary.missing.join(', ') || '없음']])
    ]);
  }

  function attachmentDetails(report, st) {
    var slot = el('div', { cls: 'pq-details-body', role: 'status' });
    var details = el('details', { cls: 'pn-details pq-details pq-attachment' }, [
      el('summary', null, ['확인된 화면 첨부 보기']), slot
    ]);
    details.addEventListener('toggle', function () {
      if (!details.open || !details.isConnected) return;
      slot.textContent = '첨부 이미지를 불러오고 있어요.';
      var agent = viewer(st);
      A.getReportAttachment(report.id, agent ? agent.id : null).then(function (image) {
        if (!details.isConnected || !details.open) return;
        slot.textContent = '';
        if (image) slot.appendChild(el('img', { src: image, cls: 'pq-image-preview', alt: '설계사가 확인하고 첨부한 이미지' }));
        else slot.textContent = '첨부를 열 수 없어요.';
      }).catch(function () {
        if (details.isConnected) slot.textContent = '첨부를 열지 못했어요. 닫았다 다시 열어 주세요.';
      });
    });
    return details;
  }

  function resolutionRows(resolution) {
    var v = resolution.verification;
    return rows([v ? ['검증 여부', '수정·배포 검증 완료 · 가상 시연용'] : ['검증 여부', '검증 기록 없음 · 해결로만'],
      ['적용 시각', fmtWhen(resolution.appliedAt)],
      v ? ['검증 완료', fmtWhen(v.verifiedAt) + ' (가상)'] : null,
      v ? ['정상 이용 안내', v.usageGuide] : null,
      v && detail && detail.workaround ? ['기존 임시 방법', v.workaroundEnded ? '사용 종료 확인' : '종료 여부 확인 전'] : null,
      ['적용 범위', resolution.scope], ['바뀐 동작', resolution.change], ['기존 건 처리', resolution.action],
      v && v.refId ? ['참조 ID', v.refId + ' (가상)'] : null,
      v && v.environment ? ['검증 환경', resolutionLabels.environment[v.environment]] : null,
      v && v.version ? ['배포 버전', v.version + ' (가상)'] : null]);
  }
  /* ADR-029 결정 5 수정 완료 후 현장 확인. FC의 답은 보기만, 후속 조사는 코드로. 답으로 상태를 바꾸지 않는다 */
  function fieldCard(d) {
    var f = d.fieldVerification;
    if (!f) return null;
    function tally(code) {
      var fcs = f.fcs.filter(function (x) { return x.result === code; });
      return fcs.length + '명' + (fcs.length ? ' · ' + fcs.map(function (x) { return x.name; }).join(', ') : '');
    }
    var card = el('div', { cls: 'pn-card' }, [
      el('p', { cls: 'pn-card-title' }, ['수정 완료 후 현장 확인']),
      el('p', { cls: 'ld-meta' }, ['FC ' + f.reporterCount + '명 · 신고 ' + f.reportCount + '건 · 이번 수정에 대한 답만 세요']),
      rows([['정상 확인', tally('CONFIRMED_OK')], ['문제 지속', tally('STILL_FAIL')], ['미확인', tally('NOT_TESTED')]]),
      f.failReports.length ? el('ul', { cls: 'pn-plain ld-field-fails' }, f.failReports.map(function (x) {
        var r = d.reports.filter(function (y) { return y.id === x.reportId; })[0];
        if (!r) return null;
        var added = (r.followups || []).filter(function (e) { return e.action === 'ADD' && e.at >= x.at; }).length;
        return el('li', { 'data-field-fail': r.id }, [
          el('p', { cls: 'ld-field-who' }, [el('span', { cls: 'ld-id' }, [r.id]),
            ' · ' + (r.reporter ? r.reporter.name + ' · ' + r.reporter.branchName : '') + ' · 후속 확인 대상']),
          el('p', { cls: 'ld-meta' }, [fmtWhen(x.at) + ' 문제 지속' + (added ? ' · 추가 내용 ' + added + '건' : '')]),
          factsDetails(r) || el('p', { cls: 'ld-meta' }, ['남은 발생 조건이 없어요. FC에게 추가로 확인해 주세요.']),
          el('p', { cls: 'ld-field-who' }, ['후속 조사 기록']),
          el('ul', { cls: 'pn-chips', 'aria-label': r.id + ' 후속 조사 기록' }, Object.keys(resolutionLabels.investigation).map(function (code) {
            return el('li', null, [btn('pn-chip', resolutionLabels.investigation[code], 'investigate', { 'data-report': r.id, 'data-code': code,
              'aria-pressed': String(!!x.investigation && x.investigation.code === code) })]);
          }))]);
      })) : null,
      el('p', { cls: 'ld-meta' }, ['FC의 답으로 상태가 바뀌지 않아요. 재발·잔존 여부는 담당자가 판단하고, 재검토는 [상태 바꾸기]에서 해요.'])]);
    card.setAttribute('data-field-verification', '');
    return card;
  }

  function deliveryCard(d) {
    if (!d.resolution || !d.delivery) return null;
    var delivery = d.delivery;
    var text = { FAILED: '발송 실패', SENT: '발송 완료', NONE: '발송 대상 없음' };
    return el('div', { cls: 'pn-card' }, [
      el('p', { cls: 'pn-card-title' }, ['해결 안내와 발송 결과']), resolutionRows(d.resolution),
      rows([['알림', text[delivery.delivery]], ['대상', delivery.notificationCount + '명'], ['시도 횟수', delivery.attempts + '회']]),
      delivery.delivery === 'FAILED' ? btn('pn-btn-2', '알림 다시 보내기', 'retry-notice', { 'data-history': delivery.historyId }) : null
    ]);
  }

  function detailKey(box) {
    var owner = box.closest('[data-field-fail], .ld-reports > li'), id = owner && owner.querySelector('.ld-id');
    return (owner && owner.hasAttribute('data-field-fail') ? 'field|' : '') + (id ? id.textContent : '') + '|' + box.querySelector('summary').textContent;
  }
  function paintPanel(st) {
    if (isReportId(st.item)) {
      var rOpen = !!inquiry;
      $('ledger-panel').hidden = !rOpen;
      $('ld-scrim').hidden = !rOpen;
      return rOpen ? paintReportPanel(st) : false;
    }
    var open = !!(st.item && detail && detail.id === st.item);
    $('ledger-panel').hidden = !open;
    $('ld-scrim').hidden = !open;
    if (!open) return false;
    var d = detail, body = $('ld-body');
    $('ld-panel-title').textContent = '공통 오류 ' + d.id;
    // 조사 기록을 남겨 다시 그려도 펼쳐 둔 접기는 그대로
    var opened = body.getAttribute('data-shown') === d.id ? Array.prototype.map.call(body.querySelectorAll('details[open]'), detailKey) : [];
    body.setAttribute('data-shown', d.id);
    body.innerHTML = '';
    var reports = (d.reports || []).map(function (r) {
      var who = (r.reporter ? r.reporter.name + ' · ' + r.reporter.branchName : '') + ' · ' + fmtDate(r.createdAt) +
        (r.submittedBy ? ' · ' + r.submittedBy.name + ' 대신 문의' : '');   // ADR-025
      var resumed = r.workResumption ? 'FC 업무 재개 회신 · ' + (r.workResumption.result === 'RESUMED' ? '진행했어요' : '아직 안 돼요') +
        ' (' + fmtWhen(r.workResumption.at) + ')' : null;
      return el('li', null, [el('span', { cls: 'ld-id' }, [r.id]), el('span', null, [r.maskedText || '"나도 겪었어요"로 보냄']),
        el('span', { cls: 'ld-who' }, [who.replace(/^ · /, '')]),
        resumed ? el('span', { cls: 'ld-who' }, [resumed]) : null,
        factsDetails(r),
        r.diagnostics ? diagnosticDetails(r.diagnostics) : null,
        r.hasAttachment ? attachmentDetails(r, st) : null,
        draftSummaryCard(r),
        (r.followups || []).length ? el('ul', { cls: 'pn-plain' }, r.followups.map(function (entry) {
          var labels = { RECURRED: '다시 발생했어요', STILL: '아직 안 돼요', ADD: '추가 내용', URGENT: '긴급 사정 추가', FIELD_FAIL: '수정 뒤에도 문제가 있어요' };
          return el('li', null, [labels[entry.action], ' · ', fmtWhen(entry.at)]);
        })) : null]);
    });
    [el('h3', { tabindex: '-1' }, [d.title]),
      el('p', { cls: 'pn-lead' }, ['마지막 변경 ' + fmtWhen(d.updatedAt)]),
      el('div', { cls: 'pn-card' }, [
        el('div', { cls: 'kn-card-head' }, [el('p', { cls: 'pn-card-title' }, ['지금 상태']), statusTag(d.status)]),
        progress(d),
        rows([d.workaround ? ['임시로 이렇게', d.workaround] : ['임시로 이렇게', '아직 없어요'], planRow(d),
          d.status === 'RESOLVED' ? ['수정·배포 검증', d.resolution && d.resolution.verification ? '완료 기록 있음 · 가상 시연용' : '기록 없음 · 해결로만 처리'] : null])]),
      fieldCard(d),
      el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['요약']),
        rows([['유형', TYPE[d.type] || d.type], ['신·구 시스템', (GEN[d.systemGen] || '') + ' 시스템'],
          ['처리 등급', [gradeTag(d.grade)]], ['담당 부서', DEPT[d.departmentCode] || d.departmentCode],
          ['영향 지점', branchCount(d) + '곳'], ['연결된 문의', (d.reports || []).length + '건 (문의자 ' + reporterCount(d) + '명)']])]),
      fieldSummary(d),
      el('h4', null, ['연결된 문의 ' + (d.reports || []).length + '건']),
      el('div', { cls: 'pn-card' }, [reports.length ? el('ul', { cls: 'pn-plain ld-reports' }, reports)
        : el('p', null, ['아직 연결된 문의가 없어요'])]),
      el('h4', null, ['오류·조치 이력']),
      el('div', { cls: 'pn-card' }, [rows(historyRows(d), 'ld-hist')]),
      el('h4', null, ['안내문']),
      noticeCard(d), deliveryCard(d)
    ].forEach(function (n) { if (n) body.appendChild(n); });
    if (opened.length) {
      Array.prototype.forEach.call(body.querySelectorAll('details'), function (box) {
        if (opened.indexOf(detailKey(box)) >= 0) box.open = true;
      });
    }
    var foot = $('ld-foot');
    foot.innerHTML = '';
    foot.appendChild(btn('pn-btn-2', [icon('i-link'), '관련 문의 연결'], 'to-link'));
    foot.appendChild(btn('pn-btn', '상태 바꾸기', 'status', { 'aria-haspopup': 'dialog' }));
    return true;
  }

  /* ---- ④ 대화상자: 상태 바꾸기 ---- */
  function syncDraft(st) {
    var key = st.dialog + '|' + st.item + '|' + st.to + '|' + st.report;
    if (key !== draftKey) {
      draftKey = key;
      draft = { date: '', reason: '', back: '', memo: '', note: '', applied: '', scope: '', change: '', action: '', approved: false,
        verify: '', verifiedAt: '', guide: '', ended: 'NO', refId: '', environment: '', version: '',
        eventId: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now() + '-' + Math.random() };
      statusError = '';
    }
    if (st.date) draft.date = st.date;
    if (st.reason) draft.reason = st.reason;
    if (st.memo) draft.memo = st.memo;
    if (st.back) draft.back = st.back;
  }
  function statusSteps(st) {
    var steps = [['pick', '다음 상태 고르기']];
    if (st.to && needsDetail(detail.status, st.to)) steps.push(['detail', st.to === 'FIX_PLANNED' ? '예정일 적기' : st.to === 'RESOLVED' ? '검증·안내 확인' : '이유 적기']);
    steps.push(['preview', '알림 미리보기']);
    return steps;
  }
  /* 화면 순서로 첫 번째로 빠지거나 틀린 칸과 안내. 다 찼으면 null */
  function missing(st) {
    var from = detail.status, to = st.to;
    function gap(field, text) { return { field: field, text: text }; }
    if (!to) return gap('', '다음 상태를 골라 주세요');
    if (to === 'RESOLVED') {
      var ok = draft.verify === 'VERIFIED', at = '#ld-resolution-';
      if (!draft.verify) return gap(at + 'verify', '검증 여부를 골라 주세요.');
      if (!draft.applied) return gap(at + 'applied', '적용 시각을 적어 주세요.');
      if (ok) {
        if (!draft.verifiedAt) return gap(at + 'verifiedAt', '검증 완료 시각을 적어 주세요.');
        if (draft.verifiedAt < draft.applied) return gap(at + 'verifiedAt', '검증 완료 시각은 적용 시각보다 뒤여야 해요.');
        if (Date.parse(draft.verifiedAt + ':00+09:00') > Date.now()) return gap(at + 'verifiedAt', '검증 완료 시각은 지금보다 앞이어야 해요.');
        if (!draft.guide.trim()) return gap(at + 'guide', '정상 이용 안내를 적어 주세요.');
      }
      if (!draft.scope) return gap(at + 'scope', '적용 범위를 골라 주세요.');
      if (!draft.change.trim()) return gap(at + 'change', '바뀐 동작을 적어 주세요.');
      if (!draft.action) return gap(at + 'action', '기존 건 처리 방법을 골라 주세요.');
      var bad = ok && ['refId', 'version'].filter(function (key) { return draft[key] && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(draft[key]); })[0];
      if (bad) return gap(at + bad, '참조 ID와 버전은 영문·숫자·점·밑줄·하이픈으로 30자까지 적어 주세요.');
      if (!draft.approved) return gap('[data-act="approve-resolution"]', '공개 안내를 확인해 주세요.');
    }
    if (isBack(from, to) && !Object.prototype.hasOwnProperty.call(resolutionLabels.backReason, draft.back)) return gap('#ld-back', '되돌리는 이유를 골라 주세요');
    if (to === 'FIX_PLANNED' && !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return gap('#ld-date', '고칠 예정일을 골라 주세요');
    if (to === WONT_FIX && !draft.reason) return gap('[data-reason]', '고치지 않는 이유를 골라 주세요');
    if (to === WONT_FIX && draft.reason === 'ETC' && !draft.memo.trim()) return gap('#ld-memo', '기타 이유를 적어 주세요');
    return null;
  }
  function reasonText() {
    return draft.reason === 'ETC' ? draft.memo.trim() : REASON_TEXT[draft.reason] || '';
  }
  function choiceSub(from, to) {
    if (isBack(from, to)) return '되돌리기 · 기록만';
    if (to === 'FIX_PLANNED') return '예정일 필요 · 알림 가요';
    if (to === WONT_FIX) return '이유 필요 · 알림 가요';
    if (to === 'RESOLVED') return '검증 여부 확인 · 알림 가요';
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
    var from = detail.status, to = st.to, gap = st.err === '1' ? missing(st) : null, err = gap ? gap.text : '';
    var out = [el('h3', { tabindex: '-1' }, [stageLabel(from) + ' → ' + stageLabel(to)])];
    function dateField() {
      return el('div', { cls: 'pn-field' }, [el('label', { 'for': 'ld-date' }, ['고칠 예정일']),
        el('input', { id: 'ld-date', type: 'date', cls: 'pn-input', 'data-draft': 'date', value: draft.date, min: '2026-11-04' })]);
    }
    if (to === 'RESOLVED') {
      out = out.concat(resolutionFields());
      if (isBack(from, to)) out.push(backField());
    } else if (isBack(from, to)) {
      out.push(el('p', { cls: 'pn-lead' }, ['앞 단계로 되돌려요. 되돌리기는 기록만 하고 알리지 않아요. 재배포는 되돌린 뒤 다시 해결해요.']));
      out.push(backField());
      if (to === 'FIX_PLANNED') out.push(dateField());
      out.push(noteField('되돌림 설명 (선택)'));
    } else if (to === 'FIX_PLANNED') {
      out.push(el('p', { cls: 'pn-lead' }, ['기술 검토 뒤 정한 고칠 날짜를 넣어 주세요. 알림에 이 날짜가 함께 나가요. 시연 날짜는 가상이에요.']));
      out.push(dateField());
    } else {
      out.push(el('p', { cls: 'pn-lead' }, ['고치지 않는 이유를 골라 주세요. 알림에 이 이유가 함께 나가요.']));
      out.push(el('ul', { cls: 'pn-chips', role: 'group', 'aria-label': '고치지 않는 이유' }, REASONS.map(function (r) {
        return el('li', null, [el('button', { type: 'button', cls: 'pn-chip', 'data-reason': r[0], 'aria-pressed': String(draft.reason === r[0]) }, [r[1]])]);
      })));
      if (draft.reason === 'ETC') {
        out.push(el('div', { cls: 'pn-field' }, [el('label', { 'for': 'ld-memo' }, ['기타 이유']),
          el('textarea', { id: 'ld-memo', 'data-draft': 'memo' }, [draft.memo])]));
      }
    }
    out.push(el('p', { cls: 'pn-err', id: 'ld-err', role: 'alert', hidden: !err }, [err]));
    return out;
  }
  function backField() {
    return el('div', { cls: 'pn-field' }, [el('label', { 'for': 'ld-back' }, ['되돌리는 이유']),
      el('select', { id: 'ld-back', 'data-draft': 'back' },
        [el('option', { value: '' }, ['골라 주세요'])].concat(Object.keys(resolutionLabels.backReason).map(function (code) {
          return el('option', { value: code, selected: draft.back === code }, [resolutionLabels.backReason[code]]);
        })))]);
  }
  /* 막힌 칸 하나만 표시하고 안내를 그 칸 바로 아래로 옮긴다. [다음]·[확정]을 눌렀을 때만 초점 */
  function markMissing(st, focus) {
    var gap = st.err === '1' && detail ? missing(st) : null;
    var field = gap && gap.field && $('ld-dlg-body').querySelector(gap.field), err = $('ld-err');
    if (!field || !err) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(field.tagName)) field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', 'ld-err');
    var fold = field.closest('details');
    if (fold) fold.open = true;
    (field.closest('.pn-field, ul') || field).insertAdjacentElement('afterend', err);
    if (focus) { field.focus(); err.scrollIntoView({ block: 'nearest' }); }
  }
  function noteField(label) {
    return el('div', { cls: 'pn-field' }, [el('label', { 'for': 'ld-note' }, [label]),
      el('textarea', { id: 'ld-note', 'data-draft': 'note', maxlength: '300', 'aria-describedby': 'ld-note-help' }, [draft.note]),
      el('p', { cls: 'pn-help', id: 'ld-note-help' }, ['이 화면에만 남고 새로고침하면 사라져요. 고객 정보는 적지 마세요.'])]);
  }
  /* ADR-029 결정 1: 검증 여부가 먼저. 검증 완료일 때만 검증 시각·정상 이용 안내·선택 참조를 연다 */
  function resolutionFields() {
    function input(label, key, field) {
      return el('div', { cls: 'pn-field' }, [el('label', { for: 'ld-resolution-' + key }, [label]), field]);
    }
    function select(label, key, options) {
      return input(label, key, el('select', { id: 'ld-resolution-' + key, 'data-draft': key },
        [el('option', { value: '' }, ['골라 주세요'])].concat(Object.keys(options).map(function (code) {
          return el('option', { value: code, selected: draft[key] === code }, [options[code]]);
        }))));
    }
    function text(label, key, attrs) {
      return input(label, key, el('input', Object.assign({ id: 'ld-resolution-' + key, cls: 'pn-input', 'data-draft': key,
        value: draft[key], autocomplete: 'off' }, attrs)));
    }
    var ok = draft.verify === 'VERIFIED';
    return [
      el('p', { cls: 'pn-lead' }, ['해결로 바꾸는 것과 실제 운영 배포는 달라요. 이 시제품의 검증 기록은 모두 가상 시연용이에요.']),
      select('검증 여부', 'verify', { VERIFIED: '수정·배포 검증 완료 (가상)', NONE: '검증 근거 없음 · 해결로만 기록' }),
      text('적용 시각 (한국 시간)', 'applied', { type: 'datetime-local' }),
      ok ? text('검증 완료 시각 (한국 시간 · 가상)', 'verifiedAt', { type: 'datetime-local' }) : null,
      ok ? text('정상 이용 안내 (FC에게 공개 · 30자)', 'guide', { maxlength: '30' }) : null,
      ok && detail.workaround ? select('기존 임시 방법', 'ended', { NO: '종료 여부 확인 전', YES: '사용 종료를 확인했어요' }) : null,
      select('적용 범위', 'scope', resolutionLabels.scope),
      input('바뀐 동작', 'change', el('textarea', { id: 'ld-resolution-change', 'data-draft': 'change', maxlength: '300' }, [draft.change])),
      select('기존 건 처리 방법', 'action', resolutionLabels.action),
      ok ? el('details', { cls: 'pn-details pq-details ld-evidence', open: !!(draft.refId || draft.environment || draft.version || draft.note) }, [
        el('summary', null, ['검증 참조·내부 메모 (선택)']),
        el('div', { cls: 'pq-details-body' }, [text('수정·배포 이력 참조 ID', 'refId', { maxlength: '30' }),
          select('검증 환경', 'environment', resolutionLabels.environment),
          text('관련 배포 버전', 'version', { maxlength: '30' }), noteField('내부 조치 메모')])]) : null,
      el('p', { cls: 'pn-lead' }, ['설계사가 고객에게 안내할 수 있는 내용만 적어 주세요. 고객 이름·번호·주소(URL)는 넣지 마세요.']),
      btn('pn-chip', '공개 안내를 확인했어요', 'approve-resolution', { 'aria-pressed': String(draft.approved) })
    ].filter(Boolean);
  }
  function statusRequest(st) {
    var me = viewer(st);
    function kst(value) { return value ? value + ':00+09:00' : null; }
    var verification = draft.verify === 'VERIFIED' ? { result: 'VERIFIED', verifiedAt: kst(draft.verifiedAt), usageGuide: draft.guide,
      workaroundEnded: draft.ended === 'YES', refId: draft.refId, environment: draft.environment, version: draft.version } : null;
    return { from: detail.status, to: st.to, plannedFixDate: draft.date || null, eventId: draft.eventId,
      actorId: me ? me.id : null, simulateFailure: st.notify === 'fail', backReason: draft.back || null, note: draft.note,
      wontFixReasonCode: st.to === WONT_FIX ? draft.reason : null, wontFixReasonText: st.to === WONT_FIX ? reasonText() : null,
      resolution: st.to === 'RESOLVED' ? { appliedAt: kst(draft.applied), scope: draft.scope, change: draft.change,
        action: draft.action, approved: draft.approved, verification: verification } : null };
  }
  function previewView(st) {
    var from = detail.status, to = st.to, p = preview || {};
    var change = rows([['바뀌는 상태', stageLabel(from) + ' → ' + stageLabel(to)],
      to === 'FIX_PLANNED' && draft.date ? ['고칠 예정일', fmtDate(draft.date)] : null,
      to === WONT_FIX ? ['고치지 않는 이유', reasonText()] : null,
      isBack(from, to) ? ['되돌리는 이유', resolutionLabels.backReason[draft.back] || ''] : null]);
    if (!p.notifiable) {
      return [el('h3', { tabindex: '-1' }, ['이 변경은 기록만 하고 알리지 않아요']),
        el('div', { cls: 'pn-card' }, [change]),
        el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [el('b', null, ['왜 알리지 않나요?']),
          isBack(from, to) ? '되돌리기는 기록만 남겨요. 같은 결함에 알림이 여러 번 가지 않게 하려는 규칙이에요.'
            : '문제 확인·원인 파악은 "확인 중" 알림이 반복되지 않도록 기록만 남겨요.'])])];
    }
    // ADR-025: 신고자(FC)와 대신 접수한 관리자에게 역할별 문구. 한 사람 1건
    if (p.resolution) Array.prototype.slice.call(resolutionRows(p.resolution).children).forEach(function (row) { change.appendChild(row); });   // 한 목록(줄 사이 1px)
    var submitters = p.recipients.filter(function (r) { return r.audience === 'SUBMITTER'; });
    return [el('h3', { tabindex: '-1' }, ['묶인 신고자 ' + (p.reporterCount != null ? p.reporterCount : p.recipientCount) + '명' +
        (submitters.length ? ' · 대신 접수한 관리자 ' + submitters.length + '명' : '') + '에게 알림']),
      el('div', { cls: 'pn-card' }, [change]),
      p.summary ? el('div', { cls: 'pn-card', 'data-notice-preview': '' }, [el('p', { cls: 'pn-card-title' }, ['FC 알림에 보이는 요약']),
        rows([['오류명', p.summary.title], ['상태', p.summary.status], ['핵심 안내', p.summary.headline], ['보조 안내', p.summary.line],
          ['누르면', p.summary.action]])]) : null,
      el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, [submitters.length ? 'FC 알림 기록 문구' : '알림 기록 문구']),
        el('p', { cls: 'ld-quote' }, [p.body])]),
      submitters.length ? el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['대신 접수한 관리자 알림 기록 문구']),
        el('p', { cls: 'ld-quote' }, [submitters[0].body])]) : null,
      el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['받는 사람 ' + p.recipientCount + '명']),
        el('ul', { cls: 'ld-recipients' }, p.recipients.map(function (r) {
          return el('li', null, [r.name + ' ', el('span', null, [r.branchName + (r.audience === 'SUBMITTER' ? ' · 대신 접수 ' + r.count + '건' : '')])]);
        }))]),
      el('div', { cls: 'pn-note' }, [icon('i-bell'), el('div', null, [el('b', null, ['FC와 관리자는 SFA 화면 알림에서 봐요']),
        '실제 문자나 메일은 보내지 않고, 알림 기록만 남겨요. 같은 사람이 여러 번 신고했거나 대신 접수했어도 알림은 한 번이에요.'])])];
  }
  function doneView(st) {
    var p = preview || {};
    return [el('div', { cls: 'pn-end' }, [el('span', { cls: 'pn-ico is-ok' }, [icon('i-check')]),
      el('h3', { tabindex: '-1' }, ['상태를 "' + stageLabel(st.to) + '"' + ro(stageLabel(st.to)) + ' 바꿨어요']),
      el('p', { cls: 'pn-lead' }, [statusResult && statusResult.delivery === 'FAILED' ? '상태는 기록했어요. 알림 발송은 실패했어요. 다시 보낼 수 있어요.' :
        (statusResult ? statusResult.delivery === 'SENT' : p.notifiable)
        ? '받는 사람 ' + (statusResult ? statusResult.notificationCount : p.recipientCount) + '명에게 SFA 알림을 보냈어요.'
        : '알림 없이 상태 이력에 기록만 남겼어요.'])])];
  }

  /* ---- ④ 대화상자: 신고 묶기 ---- */
  function linkReport(st) { return unlinked.filter(function (r) { return r.id === st.report; })[0] || null; }
  function linkPickView(st) {
    var r = linkReport(st);
    var err = st.err === '1' && !st.link ? '연결할 공통 오류를 골라 주세요' : '';
    var who = r && r.reporter ? r.reporter.name + ' · ' + r.reporter.branchName + ' · ' + fmtDate(r.createdAt) : '';
    // AI 추천 후보(ADR-017)는 따로 위에 모으고 나머지는 "다른 대표 결함"으로. 고르고 [묶기]를 누르는 건 담당자
    var s = st.llm === 'slow' ? null : similar, cands = s && s.reportId === st.report ? s.candidates || [] : [];
    var fallback = !!s && s.llmOutcome === 'FALLBACK';
    var candIds = cands.map(function (c) { return c.defectId; });
    var rest = sorted(defects).filter(function (d) { return candIds.indexOf(d.id) < 0; });
    function choice(d, c) {
      return el('li', null, [el('button', { type: 'button', cls: 'pn-choice', 'data-link': d.id, 'aria-pressed': String(st.link === d.id) }, [
        el('span', null, [d.title]),
        el('span', { cls: 'ld-choice-sub' }, [d.id + ' · ' + stageLabel(d.status) +
          (c ? ' · ' + (c.similarity ? SIMILAR[c.similarity] : '규칙으로 찾음') : '')]),
        c ? el('span', { cls: 'ld-choice-why' }, [c.reason]) : null,
        el('span', { cls: 'pn-tick' }, [icon('i-check')])])]);
    }
    var aiPart;
    if (st.llm === 'slow' || !s) {
      aiPart = [el('div', { cls: 'pn-note' }, [icon('i-spark'), el('div', null, [el('b', null, ['AI가 비슷한 대표 결함을 찾고 있어요']),
        '기다리지 않고 아래 목록에서 바로 고를 수 있어요.'])])];
    } else if (cands.length) {
      // 실패는 지연·없음과 같은 안내 상자 모양(경고)으로 목록 위에 알린다
      aiPart = [fallback ? el('div', { cls: 'pn-note pn-warn' }, [icon('i-warn'), el('div', null, [el('b', null, ['AI 추천을 받지 못했어요']),
          '같은 업무·문제 유형으로 찾은 결함이에요. 담당자가 확인해요.'])]) : null,
        el('h4', { id: 'ld-link-ai' }, [(fallback ? '같은 업무·문제 유형의 결함 ' : s.llmOutcome === 'RULE' ? '같은 조건으로 찾은 결함 '
          : 'AI가 비슷하다고 본 결함 ') + cands.length + '건']),
        fallback ? null : el('p', { cls: 'pn-help' }, [icon(s.llmOutcome === 'RULE' ? 'i-info' : 'i-spark'), el('span', null,
          [s.llmOutcome === 'RULE' ? '규칙 후보 · 참고만 하고 담당자가 확인해요.' : 'AI 추천 · 참고만 하고 담당자가 확인해요.'])]),
        el('ul', { cls: 'pn-choices ld-one', role: 'group', 'aria-labelledby': 'ld-link-ai' }, cands.map(function (c) {
          return choice(defects.filter(function (d) { return d.id === c.defectId; })[0] || { id: c.defectId, title: c.title, status: c.status }, c);
        }))];
    } else {
      aiPart = [el('div', { cls: 'pn-note' + (fallback ? ' pn-warn' : '') }, [icon(fallback ? 'i-warn' : 'i-spark'), el('div', null, fallback
        ? [el('b', null, ['AI 추천을 받지 못했어요']), '아래 목록에서 직접 골라 주세요.']
        : [el('b', null, ['비슷한 대표 결함을 찾지 못했어요 (' + (s.llmOutcome === 'RULE' ? '규칙 후보' : 'AI 추천') + ')']), '같은 원인의 결함이 없으면 새 대표 결함으로 만들어요. 아래 목록도 한 번 더 봐 주세요.'])])];
    }
    // 묶을 신고(정보 카드)와 고를 대표 결함(선택 버튼)은 소제목으로 나눠 카드끼리 붙어 보이지 않게 한다
    return [el('h3', { tabindex: '-1' }, ['어느 공통 오류에 연결할까요?']),
      r ? el('h4', null, ['연결할 문의']) : null,
      r ? el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, [r.id + ' · ' + (BUSINESS[r.business] || '')]),
        el('p', null, [r.maskedText || '같은 오류 참여']), el('p', { cls: 'ld-meta' }, [who])]) : null]
      .concat(aiPart, [
        el('h4', { id: 'ld-link-list' }, [cands.length ? '다른 공통 오류 ' + rest.length + '건' : '공통 오류 ' + defects.length + '건 중 고르기']),
        el('ul', { cls: 'pn-choices ld-one', role: 'group', 'aria-labelledby': 'ld-link-list' }, rest.map(function (d) { return choice(d, null); })),
        el('p', { cls: 'pn-err', role: 'alert', hidden: !err }, [err])]);
  }
  function linkDoneView(st) {
    var d = defects.filter(function (x) { return x.id === st.link; })[0];
    return [el('div', { cls: 'pn-end' }, [el('span', { cls: 'pn-ico is-ok' }, [icon('i-check')]),
      el('h3', { tabindex: '-1' }, [st.report + ' 문의를 연결했어요']),
      el('p', { cls: 'pn-lead' }, [(d ? d.id + ' 「' + d.title + '」' : '') + '에 연결했어요. 다음 상태 변경부터 이 문의자에게도 알림이 가요.'])])];
  }

  /* ---- ④-3 담당자 대응 기록 대화상자 (ADR-030): 고르기 → 받는 사람 확인 → 기록 ---- */
  function actionAllowed(kind) {
    var can = inquiry.can;
    if (kind === 'reply') return can.reply;
    if (kind === 'reroute') return can.reroute;
    return can.act;
  }
  function syncAct(st) {
    var key = st.dialog + '|' + st.item;
    if (actDraft.key !== key) {
      actDraft = { key: key, codes: [], guideDefectId: '', inboxId: '',
        requestId: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now() + '-' + Math.random() };
      actPreview = null; actError = '';
    }
  }
  function actRequest(st) {
    return { type: ACTIONS[st.dialog], codes: actDraft.codes.slice(), guideDefectId: actDraft.guideDefectId, inboxId: actDraft.inboxId,
      requestId: actDraft.requestId };
  }
  function chipList(label, pairs, multi) {
    return el('ul', { cls: 'pn-chips', role: 'group', 'aria-label': label }, pairs.map(function (p) {
      return el('li', null, [btn('pn-chip', p[1], 'act-code', { 'data-code': p[0], 'data-multi': multi ? '1' : null,
        'aria-pressed': String(actDraft.codes.indexOf(p[0]) >= 0) })]);
    }));
  }
  function actionPick(st) {
    var kind = st.dialog, q = inquiry, view = [];
    if (kind === 'info') {
      view.push(el('h3', { tabindex: '-1' }, ['어떤 정보를 더 받을까요?']),
        el('p', { cls: 'pn-lead' }, ['문의자가 선택형으로 답해요. 모든 질문에 "잘 모르겠어요"가 있어요.']),
        chipList('요청할 항목', meta.infoItems.map(function (x) { return [x.key, x.label]; }), true),
        q.unknowns.length ? el('p', { cls: 'ld-meta' }, ['아직 미확인: ' + q.unknowns.map(function (u) { return u.label; }).join(', ')]) : null);
    } else if (kind === 'guide') {
      var open = defects.filter(function (d) { return d.published && d.workaround && CLOSED.indexOf(d.status) < 0; });
      view.push(el('h3', { tabindex: '-1' }, ['어떤 대응 방법을 안내할까요?']),
        el('p', { cls: 'pn-lead' }, ['승인·공개된 공통 오류의 임시 방법만 안내할 수 있어요. 이 문의에 맞는지 확인하고 골라 주세요.']),
        el('ul', { cls: 'pn-choices ld-one', role: 'group', 'aria-label': '안내할 대응 방법' }, open.map(function (d) {
          return el('li', null, [el('button', { type: 'button', cls: 'pn-choice', 'data-guide': d.id, 'aria-pressed': String(actDraft.guideDefectId === d.id) }, [
            el('span', null, [d.workaround]), el('span', { cls: 'ld-choice-sub' }, [d.id + ' 「' + d.title + '」']),
            el('span', { cls: 'pn-tick' }, [icon('i-check')])])]);
        })));
    } else if (kind === 'resolve') {
      view.push(el('h3', { tabindex: '-1' }, ['어떻게 처리했나요?']),
        el('p', { cls: 'pn-lead' }, ['IT에 전달하지 않고 이 문의를 마쳐요. 문의자에게 정해진 문구로 안내돼요.']),
        chipList('처리 결과', meta.selfResolutions, false));
    } else if (kind === 'consult') {
      view.push(el('h3', { tabindex: '-1' }, ['IT에 무엇을 확인할까요?']),
        el('p', { cls: 'pn-lead' }, ['IT 담당자에게 이 문의의 핵심 요약·확인된 정보·미확인 사항이 그대로 전달돼요. 다시 적지 않아도 돼요.']),
        chipList('확인할 내용', meta.consultQuestions, true),
        el('div', { cls: 'pn-card' }, [rows([['업무 영향', q.core.impact],
          ['확인된 정보', q.facts.length ? q.facts.length + '개' : '없음'],
          ['미확인 사항', q.unknowns.map(function (u) { return u.label; }).join(', ') || '없음']])]));
    } else if (kind === 'reply') {
      view.push(el('h3', { tabindex: '-1' }, ['협의 결과를 골라 주세요']),
        el('p', { cls: 'pn-lead' }, ['전화 협의를 마친 뒤 결과만 남겨요. 원인을 확정한 기록이 아니에요.']),
        chipList('협의 결과', meta.consultReplies, false));
    } else if (kind === 'reroute') {
      view.push(el('h3', { tabindex: '-1' }, ['어느 문의함으로 보낼까요?']),
        el('p', { cls: 'pn-lead' }, ['문의 내용과 이력은 그대로 옮겨지고, 문의자는 다시 접수하지 않아요. 담당은 비워져요.']),
        el('ul', { cls: 'pn-choices ld-one', role: 'group', 'aria-label': '보낼 문의함' }, meta.inboxes.filter(function (b) {
          return b.id !== q.routing.inboxId;
        }).map(function (b) {
          return el('li', null, [el('button', { type: 'button', cls: 'pn-choice', 'data-inbox': b.id, 'aria-pressed': String(actDraft.inboxId === b.id) }, [
            el('span', null, [b.name]), el('span', { cls: 'pn-tick' }, [icon('i-check')])])]);
        })),
        el('p', { cls: 'pn-card-title' }, ['보내는 이유']),
        chipList('보내는 이유', meta.rerouteReasons, false));
    }
    if (actError) view.push(el('p', { cls: 'pn-err', role: 'alert' }, [actError]));
    return view;
  }
  function actionPreviewView(st) {
    var p = actPreview || { recipients: [], summary: {} }, s2 = p.summary || {};
    var who = p.recipients.map(function (u) { return u.name; }).join(', ');
    var box = el('div', { cls: 'pn-card' }, [el('p', { cls: 'pn-card-title' }, ['받는 사람 ' + p.recipients.length + '명']),
      el('p', null, [who || '알림 없이 기록만 해요']),
      p.recipients.length ? el('div', { cls: 'ld-preview' }, [el('p', null, [el('b', null, [s2.status || '']), ' · ' + (s2.title || '')]),
        el('p', null, [s2.headline || '']), s2.line ? el('p', { cls: 'ld-meta' }, [s2.line]) : null]) : null,
      el('p', { cls: 'ld-meta' }, ['앱 안 알림만 만들어요. 그룹웨어·메신저·문자로 보내지 않아요.'])]);
    box.setAttribute('data-notice-preview', '');
    return [el('h3', { tabindex: '-1' }, [ACTION_TITLE[st.dialog] + ' · 받는 사람 확인']), box,
      actError ? el('p', { cls: 'pn-err', role: 'alert' }, [actError]) : null];
  }
  function actionDialog(st, foot) {
    syncAct(st);
    $('ld-dlg-title').textContent = ACTION_TITLE[st.dialog];
    var steps = [['pick', ACTION_TITLE[st.dialog]], ['preview', '받는 사람 확인']];
    var step = st.dstep === 'done' ? 'done' : st.dstep === 'preview' && actPreview ? 'preview' : 'pick';
    if (step === 'done') {
      foot.appendChild(btn('pn-btn', '닫기', 'close-dialog'));
      return { steps: steps, at: steps.length, view: [el('div', { cls: 'pn-end' }, [el('span', { cls: 'pn-ico is-ok' }, [icon('i-check')]),
        el('h3', { tabindex: '-1' }, [ACTION_TITLE[st.dialog] + eulReul(ACTION_TITLE[st.dialog]) + ' 기록했어요']),
        el('p', { cls: 'pn-lead' }, [actPreview && actPreview.recipients.length ? actPreview.recipients.length + '명에게 앱 안 알림을 만들었어요.' : '알림 없이 기록했어요.'])])] };
    }
    if (step === 'pick') {
      foot.appendChild(btn('pn-btn-2', '취소', 'close-dialog'));
      foot.appendChild(btn('pn-btn', '다음', 'action-next'));
      return { steps: steps, at: 0, view: actionPick(st) };
    }
    foot.appendChild(btn('pn-btn-2', '이전', 'action-prev'));
    foot.appendChild(btn('pn-btn', '기록하기', 'action-save'));
    return { steps: steps, at: 1, view: actionPreviewView(st) };
  }
  var itgsCache = null;
  function itgsDialog(foot) {
    $('ld-dlg-title').textContent = 'ITGS 요청 초안';
    var d = itgsCache;
    foot.appendChild(btn('pn-btn-2', '닫기', 'close-dialog'));
    foot.appendChild(btn('pn-btn', '복사하기', 'itgs-copy'));
    var card = el('div', { cls: 'pn-card' }, d ? d.sections.map(function (sec) {
      return el('div', { cls: 'ld-itgs-sec' }, [el('p', { cls: 'pn-card-title' }, [sec.label]),
        el('ul', { cls: 'pn-plain' }, sec.lines.map(function (line) { return el('li', null, [line]); }))]);
    }) : [el('p', null, ['초안을 만드는 중이에요'])]);
    // 안내 상자와 초안을 한 덩어리로: "공식 양식 아님 · 저장하지 않아요"가 초안과 함께 읽힌다
    var box = el('div', { 'data-itgs': '' }, [el('div', { cls: 'pn-note' }, [icon('i-info'), el('div', null, [
      el('b', null, ['공식 양식 아님 · 저장하지 않아요']), '확인된 정보로 만든 초안이에요. 내용을 확인해 ITGS에 직접 옮겨 주세요. 합의·결재·배정은 ITGS에서 해요.'])]), card]);
    return { steps: [['view', '초안 확인']], at: 0, view: [el('h3', { tabindex: '-1' }, ['ITGS에 올릴 요청 내용 초안']),
      box, el('p', { cls: 'ld-meta', role: 'status', id: 'ld-itgs-status' }, [''])] };
  }
  function itgsText() {
    if (!itgsCache) return '';
    return itgsCache.sections.map(function (sec) { return '■ ' + sec.label + '\n' + sec.lines.map(function (l) { return '- ' + l; }).join('\n'); }).join('\n\n');
  }

  function paintDialog(st) {
    var kind = st.dialog === 'status' && detail && detail.id === st.item ? 'status'
      : st.dialog === 'link' && linkReport(st) ? 'link'
      // 기록 뒤 끝 화면은 권한이 바뀌어도(재분류로 문의함이 바뀜) 보여 준다
      : ACTIONS[st.dialog] && inquiry && ((st.dstep === 'done' && actPreview) || (!inquiry.forbidden && actionAllowed(st.dialog))) ? 'action'
      : st.dialog === 'itgs' && inquiry && !inquiry.forbidden && (inquiry.can.act || inquiry.can.reply) ? 'itgs' : '';
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
      if ((step === 'preview' || (done && !statusResult)) && missing(st)) step = needsDetail(detail.status, st.to) ? 'detail' : 'pick';
      if (step !== st.dstep && st.dstep) done = false;
      at = done ? steps.length : steps.map(function (s) { return s[0]; }).indexOf(step);
      view = done ? doneView(st) : step === 'pick' ? pickView(st) : step === 'detail' ? detailView(st) : previewView(st);
      if (done) {
        // 알림이 간 변경이면 주 버튼으로 SFA 알림까지 순환을 잇고, 기록만 했으면 [닫기]가 주 버튼
        if (statusResult && statusResult.delivery === 'FAILED') {
          foot.appendChild(btn('pn-btn-2', '닫기', 'close-dialog'));
          foot.appendChild(btn('pn-btn', '알림 다시 보내기', 'retry-notice', { 'data-history': statusResult.historyId }));
        } else if (statusResult ? statusResult.delivery === 'SENT' : preview && preview.notifiable) {
          foot.appendChild(btn('pn-btn-2', '닫기', 'close-dialog'));
          var recipient = statusResult && statusResult.recipientId;
          foot.appendChild(el('a', { cls: 'pn-btn', href: 'index.html#role=FC' + (recipient ? '&user=' + recipient : '') + '&popup=alarm' }, [icon('i-bell'), 'SFA 화면에서 알림 확인']));
        } else {
          foot.appendChild(btn('pn-btn', '닫기', 'close-dialog'));
        }
      } else {
        if (statusError) view.push(el('p', { cls: 'pn-err', role: 'alert' }, [statusError]));
        foot.appendChild(at > 0 ? btn('pn-btn-2', '이전', 'prev') : btn('pn-btn-2', '취소', 'close-dialog'));
        foot.appendChild(btn('pn-btn', step === 'preview' ? '확정' : '다음', step === 'preview' ? 'confirm' : 'next', { 'data-step': step }));
      }
    } else if (kind === 'action' || kind === 'itgs') {
      var built = kind === 'action' ? actionDialog(st, foot) : itgsDialog(foot);
      steps = built.steps; at = built.at; view = built.view;
    } else {
      $('ld-dlg-title').textContent = '관련 오류 연결';
      steps = [['pick', '공통 오류 고르기']];
      at = done && st.link ? 1 : 0;
      view = at ? linkDoneView(st) : linkPickView(st);
      if (at) foot.appendChild(btn('pn-btn', '닫기', 'close-dialog'));
      else {
        foot.appendChild(btn('pn-btn-2', '취소', 'close-dialog'));
        foot.appendChild(btn('pn-btn', '연결하기', 'link-confirm'));
      }
    }
    // 머리 아이콘: 상태 바꾸기 ⇄, 관련 오류 연결 링크, 담당자 대응 체크, ITGS 초안 안내
    $('ledger-dialog').querySelector('.pn-head use').setAttribute('href', '#' + ({ status: 'i-swap', link: 'i-link', action: 'i-check', itgs: 'i-info' }[kind]));
    $('ld-dlg-steps').hidden = kind === 'itgs';   // 한 단계뿐인 초안 보기에는 진행 막대를 두지 않는다
    // 단계 표시줄: 글자("N단계 중 M단계 · 이름")로 뜻을 전하고 막대는 장식
    var total = steps.length;
    $('ld-dlg-steps-text').innerHTML = '';
    $('ld-dlg-steps-text').appendChild(done && at >= total
      ? el('span', null, [el('b', null, ['끝']), kind === 'status' && preview && preview.notifiable && (!statusResult || statusResult.delivery === 'SENT') ? ' · 알림을 보냈어요'
        : kind === 'action' && actPreview && actPreview.recipients.length ? ' · 기록하고 알림을 만들었어요' : ' · 기록했어요'])
      : el('span', null, [total + '단계 중 ' + (at + 1) + '단계 · ', el('b', null, [steps[at][1]])]));
    $('ld-dlg-track').innerHTML = '';
    steps.forEach(function (s, i) {
      $('ld-dlg-track').appendChild(el('li', { cls: i < at ? 'is-done' : i === at ? 'is-now' : null }));
    });
    view.forEach(function (n) { if (n) body.appendChild(n); });
    if (kind === 'status') markMissing(st, false);
    return true;
  }

  /* ---- 그리기 ---- */
  var lastFocus = '', blocked = false;   // blocked: 막힌 [다음]·[확정] 뒤 한 번만 그 칸으로
  function render() {
    var st = read();
    var me = viewer(st), meId = me ? me.id : '';
    paintTop(st);
    // 문의 패널·연결 대화상자가 쓰는 미연결 문의 저장본. 보는 담당자가 바뀌면 다시 읽는다
    var needUnlinked = unlinkedFor === meId ? Promise.resolve(unlinked) : A.getUnlinkedReports(meId);
    return needUnlinked.then(function (list) {
      unlinked = list || []; unlinkedFor = meId;
      // 목록의 필터·찾기는 ApiClient 가 한다(백엔드 단계에서 GET /api/… 로 바뀜, REQ-LG-08·14)
      return Promise.all([
        st.role === 'SALES' ? A.getInbox(meId, { filter: st.filter, q: st.q }) : null,
        st.role === 'IT' ? A.getItConsults(meId) : [],
        A.getNotifications(meId),
        st.tab === 'defects' || st.tab === 'history' ? A.getDefects({ status: st.status, grade: st.grade, type: st.type, q: st.q }) : listed
      ]);
    }).then(function (r) {
      inboxData = r[0]; consults = r[1] || []; listed = r[3] || [];
      alarms = (r[2] || []).filter(function (n) { return n.audience === 'STAFF'; });
      return st.item && !isReportId(st.item) ? A.getDefect(st.item) : null;
    }).then(function (d) {
      detail = d;
      if (!isReportId(st.item)) { inquiry = null; return null; }
      return A.getInquiry(st.item, meId).then(function (q) {
        inquiry = q;
        // 상세를 처음 열면 "문의 확인" 기록(알림 읽음·인수와 별도, ADR-030 결정 4)
        if (!q || q.forbidden || viewedSent[st.item + '|' + meId] || q.viewedBy.indexOf(meId) >= 0) return null;
        viewedSent[st.item + '|' + meId] = true;
        return A.markInquiryViewed(st.item, meId).then(function () { return A.getInquiry(st.item, meId); }).then(function (q2) { inquiry = q2; });
      });
    }).then(function () {
      // AI 비슷한 결함 추천: 문의 패널이나 연결 대화상자가 열릴 때. 지연(llm=slow)은 응답 없이 로딩에서 멈춘다
      var rid = st.dialog === 'link' ? st.report : isReportId(st.item) && inquiry && !inquiry.forbidden ? st.item : '';
      similar = null;
      if (rid && st.llm !== 'slow') {
        A.setProto({ llm: st.llm === 'fail' ? 'fail' : 'ok' });
        return A.postSimilarDefects(rid).then(function (s) { similar = s; });
      }
    }).then(function () {
      if (st.dialog === 'itgs' && inquiry && !inquiry.forbidden) return A.getItgsDraft(st.item, meId).then(function (dr) { itgsCache = dr; });
      if (ACTIONS[st.dialog]) syncAct(st);
    }).then(function () {
      if (st.dialog === 'status' && detail && st.to) {
        syncDraft(st);
        return A.postStatusPreview(detail.id, statusRequest(st));
      }
      return null;
    }).then(function (p) {
      preview = p;
      paintAlarm(st);
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
      if (dlg && blocked && st.err === '1') { markMissing(st, true); blocked = false; }
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
    // 신고를 묶고 끝 화면에서 닫으면 그 신고 패널도 닫는다(프론트 단계는 저장하지 않아 목록은 그대로)
    var linked = (st.dialog === 'link' || st.dialog === 'reroute') && st.dstep === 'done';   // 재분류 뒤에는 이 문의를 더 볼 수 없다
    if (linked) unlinkedFor = null;
    statusResult = null; actPreview = null; actError = ''; actDraft.key = '';
    go(closeDialogPatch(linked && isReportId(st.item) ? { item: '' } : null));
    setTimeout(function () {
      var panelOpen = !$('ledger-panel').hidden;
      var t = panelOpen ? $('ld-foot').querySelector('.pn-btn')
        : st.dialog === 'link' ? document.querySelector('[data-report="' + st.report + '"] .pn-btn-2') : $('ld-foot').querySelector('.pn-btn');
      if (t) t.focus();
    }, 0);
  }
  function nextStep(step) {
    var st = read();
    var patch = { err: '', date: draft.date, reason: draft.reason, back: draft.back, memo: st.to === WONT_FIX ? draft.memo : '' };
    if (step === 'pick') {
      if (!st.to) { go({ err: '1' }); return; }
      patch.dstep = needsDetail(detail.status, st.to) ? 'detail' : 'preview';
    } else if (step === 'detail') {
      st.date = draft.date; st.reason = draft.reason;
      if (missing(st)) { patch.err = '1'; blocked = true; go(patch); return; }
      patch.dstep = 'preview';
    }
    go(patch);
  }
  function prevStep() {
    var st = read();
    var steps = statusSteps(st).map(function (s) { return s[0]; });
    var i = steps.indexOf(st.dstep || 'pick');
    go({ dstep: i > 1 ? steps[i - 1] : '', err: '', date: draft.date, reason: draft.reason, back: draft.back, memo: st.to === WONT_FIX ? draft.memo : '' });
  }

  function onClick(e) {
    var t = e.target;
    // 새 신고 알림 팝업: 버튼으로 열고 닫고, 항목을 누르면 그 신고 패널(AI 추천), 바깥을 누르면 닫는다
    if (t.closest('#ld-alarm')) { go({ popup: read().popup === 'alarm' ? '' : 'alarm' }); return; }
    var alarmItem = t.closest('[data-alarm]');
    if (alarmItem) {
      // 누르면 읽음이 되고 그 문의 상세가 열린다. 읽음은 확인·인수가 아니다(ADR-030)
      opener = null;
      var who = viewer(read()), rid = alarmItem.getAttribute('data-alarm');
      (who ? A.markNotificationRead(alarmItem.getAttribute('data-notice'), who.id) : Promise.resolve()).then(function () {
        go(closeDialogPatch({ popup: '', tab: '', filter: '', 'for': '', item: rid }));
      });
      return;
    }
    if (read().popup === 'alarm' && !t.closest('#ld-alarm-pop')) { go({ popup: '' }); return; }
    var tab = t.closest('.ld-tab');
    if (tab) { go(closeDialogPatch({ tab: tab.getAttribute('data-tab'), item: '', 'for': '' })); return; }
    var open = t.closest('[data-open]');
    if (open) { openItem(open.getAttribute('data-open'), open); return; }
    var row = t.closest('.ld-table:not(.is-static) tbody tr');
    if (row && !t.closest('button, a, select')) { openItem(row.getAttribute('data-id'), row.querySelector('.ld-open')); return; }
    var choice = t.closest('[data-to]');
    if (choice) { go({ to: choice.getAttribute('data-to'), err: '', dstep: '', date: '', reason: '', back: '', memo: '' }); return; }
    var reason = t.closest('[data-reason]');
    if (reason) { draft.reason = reason.getAttribute('data-reason'); go({ reason: draft.reason, memo: draft.memo, err: '' }); return; }
    var link = t.closest('[data-link]');
    if (link) { go({ link: link.getAttribute('data-link'), err: '' }); return; }
    var fbox = t.closest('[data-filter-box]');
    if (fbox) { var f = fbox.getAttribute('data-filter-box'); go(closeDialogPatch({ filter: read().filter === f ? '' : f, item: '' })); return; }
    var pickGuide = t.closest('[data-guide]'), pickInbox = t.closest('[data-inbox]');
    if (pickGuide || pickInbox) {
      if (pickGuide) actDraft.guideDefectId = pickGuide.getAttribute('data-guide'); else actDraft.inboxId = pickInbox.getAttribute('data-inbox');
      actError = '';
      paintDialog(read());
      var again = document.querySelector(pickGuide ? '[data-guide="' + actDraft.guideDefectId + '"]' : '[data-inbox="' + actDraft.inboxId + '"]');
      if (again) again.focus();
      return;
    }
    var b = t.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act'), st = read();
    if (ACTIONS[act] || act === 'itgs') { opener = b; itgsCache = null; go({ dialog: act, dstep: '', err: '' }); return; }
    if (act === 'reset') go({ status: '', grade: '', type: '' });
    else if (act === 'box-clear') go({ filter: '' });
    else if (act === 'panel-close') closePanel();
    else if (act === 'claim') {
      var who2 = viewer(st);
      b.disabled = true;
      A.claimInquiry(st.item, who2 ? who2.id : '', 'CL-' + st.item + '-' + (who2 ? who2.id : '')).then(function (res) {
        claimNote = res && res.error === 'ALREADY_ASSIGNED' ? res.assignee.name + '이 이미 담당하고 있어요. 기록은 바뀌지 않았어요.'
          : res && res.error ? '이 문의는 담당할 수 없어요.' : '';
        unlinkedFor = null;
        return render();
      }).then(function () { var h = $('ld-foot').querySelector('.pn-btn') || $('ld-body').querySelector('h3'); if (h) h.focus(); });
    }
    else if (act === 'act-code') {
      var code = b.getAttribute('data-code'), i = actDraft.codes.indexOf(code);
      if (b.getAttribute('data-multi')) { if (i >= 0) actDraft.codes.splice(i, 1); else actDraft.codes.push(code); }
      else actDraft.codes = [code];
      actError = '';
      paintDialog(st);
      var same = document.querySelector('[data-act="act-code"][data-code="' + code + '"]');
      if (same) same.focus();
    }
    else if (act === 'action-next') {
      var need = { info: '받을 항목을 하나 이상 골라 주세요', consult: 'IT에 확인할 내용을 하나 이상 골라 주세요', resolve: '처리 결과를 골라 주세요',
        reply: '협의 결과를 골라 주세요' }[st.dialog];
      if (need && !actDraft.codes.length) { actError = need; paintDialog(st); return; }
      if (st.dialog === 'guide' && !actDraft.guideDefectId) { actError = '안내할 대응 방법을 골라 주세요'; paintDialog(st); return; }
      if (st.dialog === 'reroute' && (!actDraft.inboxId || !actDraft.codes.length)) { actError = '보낼 문의함과 이유를 골라 주세요'; paintDialog(st); return; }
      var who3 = viewer(st);
      A.previewInquiryAction(st.item, who3 ? who3.id : '', actRequest(st)).then(function (pv) {
        if (!pv || pv.error) { actError = '이 대응은 기록할 수 없어요. 담당과 선택을 다시 확인해 주세요.'; paintDialog(st); return; }
        actPreview = pv; actError = '';
        go({ dstep: 'preview' });
      });
    }
    else if (act === 'action-prev') go({ dstep: '' });
    else if (act === 'action-save') {
      var who4 = viewer(st);
      b.disabled = true;
      A.postInquiryAction(st.item, who4 ? who4.id : '', actRequest(st)).then(function (res) {
        if (!res || res.error) { actError = '기록하지 못했어요. 다시 시도해 주세요.'; b.disabled = false; paintDialog(read()); return; }
        unlinkedFor = null;
        go({ dstep: 'done' });
      });
    }
    else if (act === 'itgs-copy') {
      var out = $('ld-itgs-status');
      var done = function (ok2) { if (out) out.textContent = ok2 ? '복사했어요. ITGS 요청 화면에 붙여 넣고 내용을 확인해 주세요.' : '복사하지 못했어요. 글을 직접 선택해 복사해 주세요.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(itgsText()).then(function () { done(true); }, function () { done(false); });
      else done(false);
    }
    else if (act === 'q-clear') { go({ q: '' }); setTimeout(function () { if ($('ld-q')) $('ld-q').focus(); }, 0); }
    else if (act === 'status') { opener = b; statusResult = null; go({ dialog: 'status', to: '', dstep: '', err: '', date: '', reason: '', back: '', memo: '' }); }
    else if (act === 'to-link') go(closeDialogPatch({ tab: '', filter: '', item: '', 'for': st.item }));
    else if (act === 'link') go({ dialog: 'link', report: b.getAttribute('data-report'), link: st['for'] || '', dstep: '', err: '' });
    // 신고 패널에서: AI 후보의 [이 결함에 묶기]는 그 결함을 미리 고른 신고 묶기, 주 버튼은 미리 고르지 않음 (연결은 [묶기]에서 사람이)
    else if (act === 'link-ai') go({ dialog: 'link', report: st.item, link: b.getAttribute('data-ai-link'), dstep: '', err: '' });
    else if (act === 'link-pick') go({ dialog: 'link', report: st.item, link: st['for'] || '', dstep: '', err: '' });
    else if (act === 'link-confirm') {
      if (!st.link) { go({ err: '1' }); return; }
      A.postLinkReport(st.link, st.report).then(function (result) { if (result) go({ dstep: 'done', err: '' }); });
    }
    else if (act === 'close-dialog') closeDialog();
    else if (act === 'next') nextStep(b.getAttribute('data-step'));
    else if (act === 'prev') prevStep();
    else if (act === 'approve-resolution') {
      draft.approved = !draft.approved;
      b.setAttribute('aria-pressed', String(draft.approved));
    }
    else if (act === 'investigate') {
      var report = b.getAttribute('data-report'), me = viewer(st);
      if (!me || !detail || !detail.fieldVerification) return;
      b.disabled = true;
      A.postFieldInvestigation(report, me.id, detail.fieldVerification.resolutionEventId, b.getAttribute('data-code'))
        .then(render).then(function () {
          var again = document.querySelector('[data-act="investigate"][data-report="' + report + '"][aria-pressed="true"]');
          if (again) again.focus();
        });
    }
    else if (act === 'retry-notice') {
      b.disabled = true;
      A.retryStatusNotification(b.getAttribute('data-history')).then(function (result) {
        if (st.dialog === 'status' && result) statusResult = result;
        render();
      });
    }
    else if (act === 'confirm') {
      if (missing(st)) { blocked = true; go({ dstep: 'detail', err: '1' }); return; }
      b.disabled = true;
      A.postStatus(detail.id, statusRequest(st)).then(function (result) {
        if (result.error) { statusError = result.error; return render(); }
        statusResult = result;
        go({ dstep: 'done' });
      });
    }
  }
  function onInput(e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-draft');
    if (!k || draft[k] === e.target.value) return;
    draft[k] = e.target.value;
    if (['applied', 'scope', 'change', 'action', 'verify', 'verifiedAt', 'guide', 'ended'].includes(k)) {
      draft.approved = false;
      var approval = document.querySelector('[data-act="approve-resolution"]');
      if (approval) approval.setAttribute('aria-pressed', 'false');
    }
  }
  function onChange(e) {
    onInput(e);
    if (e.target.id === 'ld-resolution-verify') {   // 검증 여부에 따라 칸이 바뀐다
      paintDialog(read());
      $('ld-resolution-verify').focus();
      return;
    }
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
  function onSubmit(e) {
    if (e.target.id !== 'ld-search') return;
    e.preventDefault();
    go({ q: ($('ld-q').value || '').trim().slice(0, Q_MAX) });
  }
  function onKey(e) {
    var st = read();
    // 찾기 입력란에서 Esc: 낱말을 지운다(패널·대화상자는 이때 열려 있지 않음)
    if (e.key === 'Escape' && e.target.id === 'ld-q' && (e.target.value || st.q)) {
      e.preventDefault();
      e.target.value = '';
      if (st.q) go({ q: '' });
      return;
    }
    var dlgOpen = !$('ledger-dialog').hidden, panelOpen = !$('ledger-panel').hidden;
    if (e.key === 'Escape') {
      if (st.popup === 'alarm') { e.preventDefault(); go({ popup: '' }); $('ld-alarm').focus(); }
      else if (dlgOpen) { e.preventDefault(); closeDialog(); } else if (panelOpen) { e.preventDefault(); closePanel(); }
      return;
    }
    var tab = e.target.closest && e.target.closest('.ld-tab');
    if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      var ids = TABS[st.role].map(function (x) { return x[0]; }), at2 = ids.indexOf(st.tab);
      var next = ids[(at2 + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
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
    document.addEventListener('submit', onSubmit);
    $('ld-close').addEventListener('click', closePanel);
    $('ld-dlg-close').addEventListener('click', closeDialog);
    $('ld-scrim').addEventListener('click', closePanel);
    window.addEventListener('hashchange', render);
    A.watchIntakeUpdates(function () {
      if (read().dialog) return;
      unlinkedFor = null;
      A.getDefects().then(function (items) { defects = items; render(); });
    });
  }

  window.SFA_READY = Promise.all([A.getUsers(), A.getDefects(), A.getResolutionLabels(), A.getInquiryMeta()]).then(function (r) {
    users = r[0] || []; defects = r[1] || []; resolutionLabels = r[2]; meta = r[3];   // 안 묶인 신고는 보는 담당자 기준이라 render() 에서 읽는다
    bind();
    return render();
  });
})();
