/* ADR-023. S4 공동 대응 화면. 데이터 접근은 ApiClient를 통해서만 한다. */
(function () {
  'use strict';
  var A = window.ApiClient, host, data, all = [], reports = [], users = [], ai = null, question = '', aiTarget = '', compare = '', form = '', drafts = {}, message = '';
  var stages = { CHECKING: '확인 중', WAITING: '추가정보 대기', ACTION: '조치 중', REVIEW: '재확인 필요', DONE: '처리 완료' };
  var $ = function (id) { return document.getElementById(id); }, pendingFocus = null, requestedFocus = '';
  function captureFocus() {
    var active = document.activeElement;
    pendingFocus = active && active.id ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  }
  function restoreFocus() {
    var requested = requestedFocus, saved = pendingFocus, node = $(requested || (saved && saved.id)); requestedFocus = ''; pendingFocus = null;
    if (!node || !node.getClientRects().length) return;
    node.focus({ preventScroll: true });
    if (requested === 'wf-field-sharedText') node.scrollIntoView({ block: 'center' });
    if (saved && node.id === saved.id && saved.start != null && ['text', 'search'].includes(node.type)) node.setSelectionRange(saved.start, saved.end);
  }
  function timeValue(value) { return new Date(value && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value + '+09:00' : value); }
  function when(value) {
    if (!value) return '미정'; var date = timeValue(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date) + ' (한국 시간)' : '시각 확인 필요';
  }
  function e(tag, attrs, kids) { return host.el(tag, attrs, kids); }
  function button(label, action, value, primary) { return e('button', { type: 'button', cls: primary ? 'pn-btn' : 'pn-btn-2', id: action === 'ai' ? 'wf-ai-open' : null, 'data-wf': action, 'data-value': value || '' }, [label]); }
  function p(value, cls) { return e('p', { cls: cls || '' }, [value || '미확인']); }
  function tag(value, warn) { return e('span', { cls: 'ld-tag' + (warn ? ' is-warn' : '') }, [value]); }
  function box(title, children) { return e('section', { cls: 'pn-card wf-card' }, [e('h4', null, [title])].concat(children)); }
  function disclosure(title, children) { return e('details', { cls: 'pn-details wf-details' }, [e('summary', null, [title])].concat(children)); }
  function name(id) { var u = users.find(function (v) { return v.id === id; }); return u ? u.name : '미배정'; }
  function meta(item) {
    var saved = data.records[item.id] || {}, business = item.business || ((item.reports || [])[0] || {}).business || 'ETC';
    return Object.assign({ business: business, step: '세부 업무 확인 필요', ownerId: '', collaboratorId: '', nextAction: '발생 상황과 업무 영향 확인', impact: '업무 영향 확인 필요', facts: item.maskedText || '', missing: '발생 조건과 재현 여부 확인', stage: item.status === 'RESOLVED' || item.status === 'WONT_FIX' ? 'DONE' : 'CHECKING', references: [], events: [] }, saved);
  }
  function isReport(item) { return /^R-/.test(item.id); }
  function business(st) { return st.business === 'ALL' ? '' : Object.hasOwn(st, 'business') ? st.business : data.defaults[st.role] || ''; }
  function scope(item, st) { return !business(st) || meta(item).business === business(st); }
  function done(item) { return meta(item).stage === 'DONE'; }
  function overdue(m) { return !!m.due && timeValue(m.due).getTime() < Date.now() && m.stage !== 'DONE'; }
  function label(item) { var m = meta(item); return m.stage === 'DONE' ? (item.status === 'WONT_FIX' ? '처리 종료' : '처리 완료') : stages[m.stage] || '확인 중'; }
  function itemBy(id) { return all.concat(reports).find(function (v) { return v.id === id; }); }
  function sorted(items) { return items.slice().sort(function (a, b) {
    var x = meta(a), y = meta(b);
    return Number(!!y.urgent) - Number(!!x.urgent) || Number(overdue(y)) - Number(overdue(x)) || String(a.createdAt || a.updatedAt).localeCompare(String(b.createdAt || b.updatedAt)) || a.id.localeCompare(b.id);
  }); }
  function select(label, key, value, options) {
    var id = 'wf-' + key;
    return e('div', { cls: 'ld-filter' }, [e('label', { for: id }, [label]), e('select', { id: id, 'data-wf-filter': key }, options.map(function (o) { return e('option', { value: o[0], selected: value === o[0] }, [o[1]]); }))]);
  }
  function toolbar(st) {
    var root = $('wf-toolbar'); root.replaceChildren();
    root.appendChild(e('div', { cls: 'wf-scope' }, [select('담당 업무', 'business', business(st), [['', '전체 업무']].concat(Object.entries(data.businesses))), button('이전 처리 방법 찾기', 'ai', '', true)]));
    root.appendChild(p('내 업무의 접수를 확인하고 필요한 담당자와 대응해요.', 'ld-meta'));
    var aiRoot = $('wf-ai'); aiRoot.hidden = st.ai !== '1';
    if (st.ai === '1') paintAI(st);
  }
  function list(st) {
    toolbar(st);
    var pools = { unlinked: reports.filter(function (r) { return !done(r); }), defects: all.filter(function (d) { return !done(d); }), cases: all.concat(reports.filter(done)).filter(done) };
    ['unlinked', 'defects', 'cases'].forEach(function (key) {
      $('ld-count-' + key).textContent = pools[key].filter(function (r) { return scope(r, st); }).length;
      var t = $('ld-tab-' + key), on = st.tab === key;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    });
    var count = reports.filter(function (r) { return scope(r, st) && !done(r) && r.isNew; }).length;
    $('ld-new-badge').hidden = !count; $('ld-new-badge').textContent = count ? '새 ' + count : '';
    var chosen = (pools[st.tab] || pools.unlinked).filter(function (r) { return scope(r, st); });
    var me = host.viewer(st), word = (st.q || '').toLowerCase();
    chosen = chosen.filter(function (r) {
      var m = meta(r);
      return (!st.mine || m.ownerId === (me && me.id) || m.collaboratorId === (me && me.id)) &&
        (!st.queue || (st.queue === 'OVERDUE' ? overdue(m) : m.stage === st.queue)) &&
        (!st.status || r.status === st.status) && (!st.grade || r.grade === st.grade) && (!st.type || r.type === st.type) &&
        (!word || [r.id, r.title, r.maskedText, r.workaround, m.nextAction].concat((r.reports || []).map(function (v) { return v.maskedText; })).some(function (v) { return String(v || '').toLowerCase().includes(word); }));
    });
    var controls = e('div', { cls: 'ld-filters wf-filters' }, [host.searchBox(st),
      select('확인 범위', 'mine', st.mine || '', [['', '업무 전체'], ['1', '내가 확인할 건']]),
      select('상황', 'queue', st.queue || '', [['', '전체 상황'], ['WAITING', '추가정보 대기'], ['REVIEW', '재확인 필요'], ['OVERDUE', '확인일 경과']]),
      (st.q || st.queue || st.mine || st.grade || st.status || st.type) ? button('조건 지우기', 'clear') : null]);
    var view = $('ld-view'); view.setAttribute('aria-labelledby', 'ld-tab-' + st.tab); view.replaceChildren(controls);
    if (st.for) { var target = all.find(function (v) { return v.id === st.for; }); if (target) view.appendChild(p('연결 대상: ' + target.id + ' · ' + target.title + ' — 연결할 접수를 열어 주세요.', 'wf-message')); }
    if (!chosen.length) view.appendChild(e('div', { cls: 'ld-card ld-empty' }, [p('조건에 맞는 내역이 없어요.'), button('조건 지우기', 'clear'), business(st) ? button('전체 업무 보기', 'all-business') : null]));
    else {
      var table = e('table', { cls: 'ld-table', 'aria-label': st.tab === 'unlinked' ? '검토 대기 접수 목록' : st.tab === 'cases' ? '처리 사례 목록' : '진행 건 목록' }, [
        e('thead', null, [e('tr', null, ['문제', '업무·단계', '영향·현재 상황', '담당·다음 조치'].map(function (h) { return e('th', { scope: 'col' }, [h]); }))]),
        e('tbody', null, sorted(chosen).map(function (r) {
          var m = meta(r), branches = new Set((r.reports || []).filter(function (v) { return v.reporter; }).map(function (v) { return v.reporter.branchId; }));
          return e('tr', { 'data-id': r.id, 'data-report': isReport(r) ? r.id : null }, [
            e('td', null, [e('button', { type: 'button', cls: 'ld-open', 'data-open': r.id, 'aria-haspopup': 'dialog' }, [e('span', { cls: 'ld-id' }, [r.id]), e('span', { cls: 'ld-title' }, host.marked(r.title || r.maskedText || '동일 오류 참여', st.q))]),
              !isReport(r) ? p(branches.size + '개 지점 · 접수 ' + (r.reports || []).length + '건', 'ld-meta') : p(r.reporter ? r.reporter.branchName : '가상 접수', 'ld-meta')]),
            e('td', null, [p(data.businesses[m.business]), p(m.step, 'ld-meta')]),
            e('td', null, [tag(label(r), m.stage === 'REVIEW'), m.urgent ? tag('긴급 확인', true) : null, p(m.impact)]),
            e('td', null, [p(name(m.ownerId)), p(m.nextAction || m.outcome || '처리 결과 확인', 'ld-meta'), m.due && !done(r) ? p((overdue(m) ? '확인일 경과 · ' : '다음 확인 · ') + when(m.due), overdue(m) ? 'wf-warning' : 'ld-meta') : null])]);
        }))]);
      view.appendChild(e('div', { cls: 'ld-card wf-table' }, [table]));
    }
    view.appendChild(p('총 ' + chosen.length + '건', 'ld-total'));
  }
  function field(label, key, value, kind, options) {
    var input = kind === 'select' ? e('select', { name: key, id: 'wf-field-' + key }, options.map(function (o) { return e('option', { value: o[0], selected: value === o[0] }, [o[1]]); })) :
      kind === 'textarea' ? e('textarea', { name: key, id: 'wf-field-' + key, rows: '3', maxlength: '2000' }, [value || '']) :
        e('input', { name: key, id: 'wf-field-' + key, type: kind || 'text', value: value || '', maxlength: '300' });
    return e('div', { cls: 'pn-field' }, [e('label', { for: 'wf-field-' + key }, [label]), input]);
  }
  function editor(r, m) {
    var key = r.id + ':' + form, d = Object.assign({}, m, drafts[key] || {}), agents = users.filter(function (u) { return ['SALES', 'IT'].includes(u.role); }).map(function (u) { return [u.id, u.name + ' · ' + (u.role === 'IT' ? 'IT' : '영업팀')]; });
    var f = e('form', { id: 'wf-editor', 'data-item': r.id, 'data-kind': form, cls: 'pn-card wf-card' }, [e('h4', null, [{ edit: '담당·다음 조치', create: '새 관리 건 등록', request: '추가정보 요청', close: '안내 후 종료', note: '내부 확인 기록', share: '현장 공유 내용', reopen: '재검토', transfer: '담당 변경·IT 협조' }[form]])]);
    var fields = [];
    if (form === 'create') fields.push(field('제목', 'title', d.title || r.maskedText));
    if (['edit', 'create', 'transfer'].includes(form)) fields = fields.concat([
      field('주 업무', 'business', d.business, 'select', Object.entries(data.businesses)), field('세부 업무', 'step', d.step),
      field('현재 책임자', 'ownerId', d.ownerId, 'select', [['', '담당자를 골라 주세요']].concat(agents)),
      field('IT 협조 담당', 'collaboratorId', d.collaboratorId || '', 'select', [['', '협조 요청 없음']].concat(agents.filter(function (a) { return users.find(function (u) { return u.id === a[0]; }).role === 'IT'; }))),
      field('다음 조치', 'nextAction', d.nextAction, 'textarea'), field('다음 확인 시점', 'due', d.due, 'datetime-local')]);
    if (form === 'request') fields = fields.concat([field('현장에 요청할 질문', 'sharedText', d.sharedText || '발생 화면, 기기와 브라우저, 발생 시각을 확인해 주세요.', 'textarea'), field('다음 확인 시점', 'due', d.due, 'datetime-local')]);
    if (['note', 'transfer', 'reopen'].includes(form)) fields.push(field(form === 'note' ? '직접 확인한 내용·근거' : form === 'transfer' ? '확인 내용·협조 질문·이관 이유' : '재발 내용·재검토 이유', 'note', d.note, 'textarea'));
    if (form === 'reopen') fields = fields.concat([field('현재 책임자', 'ownerId', d.ownerId, 'select', [['', '담당자를 골라 주세요']].concat(agents)), field('다음 조치', 'nextAction', d.nextAction || '재발 조건 확인', 'textarea'), field('다음 확인 시점', 'due', d.due, 'datetime-local')]);
    if (['close', 'share'].includes(form)) fields.push(field('현장에 전달할 내용', 'sharedText', d.sharedText || r.workaround, 'textarea'));
    if (form === 'close') fields.push(field('처리 결과·종료 사유', 'outcome', d.outcome, 'textarea'));
    fields.forEach(function (v) { f.appendChild(v); });
    f.appendChild(p('작성 내용은 이 페이지를 사용하는 동안 유지돼요. 새로고침 전에 필요한 내용을 복사해 주세요.', 'ld-meta'));
    if (form === 'share' || form === 'close') f.appendChild(e('label', { cls: 'wf-check' }, [e('input', { type: 'checkbox', name: 'confirmed', checked: d.confirmed === 'on' }), '현장에 공유할 내용과 개인정보 포함 여부를 확인했어요.']));
    f.appendChild(e('p', { id: 'wf-form-error', role: 'alert', cls: 'pn-err' }, []));
    f.appendChild(e('div', { cls: 'wf-actions' }, [button('접기', 'form-close'), e('button', { type: 'submit', cls: 'pn-btn' }, ['확인·적용'])]));
    return f;
  }
  function details(st, r, legacy) {
    if (!r) return;
    var m = meta(r), body = $('ld-body'), foot = $('ld-foot');
    // 기존 진단·첨부·상태 이력은 DOM을 재사용하여 회귀를 줄인다.
    var evidence = Array.from(body.querySelectorAll(':scope > details, :scope > .pn-card .ld-reports'));
    var legacyNodes = Array.from(body.children), statusHistory = legacyNodes.find(function (v) { return !!v.querySelector('.ld-hist'); });
    body.replaceChildren();
    $('ld-panel-title').textContent = (isReport(r) ? '접수 ' : '관리 건 ') + r.id;
    body.appendChild(e('h3', { tabindex: '-1' }, [r.title || r.maskedText || '동일 오류 참여']));
    body.appendChild(e('div', { cls: 'wf-summary' }, [tag(data.businesses[m.business] + ' · ' + m.step), tag(label(r)), m.urgent ? tag('긴급 확인', true) : null]));
    body.appendChild(p(m.impact, 'wf-impact'));
    var newFollowups = (r.reports || []).flatMap(function (v) { return v.followups || []; });
    if (m.stage === 'REVIEW' || newFollowups.length) body.appendChild(box('새 확인 사항', [p(m.stage === 'REVIEW' ? '재확인이 필요해요. 담당자와 다음 조치를 확인해 주세요.' : '후속 접수가 있어요. 재발·우회법 실패 여부를 확인해 주세요.'), p(newFollowups.map(function (v) { return ({ RECURRED: '다시 발생', STILL: '아직 안 됨', URGENT: '긴급 사정 추가', ADD: '추가 내용' }[v.action] || v.action) + (v.text ? ': ' + v.text : ''); }).join(' / ')), button('재검토 기록', 'form', 'reopen')]));
    body.appendChild(box('담당·다음 조치', [host.rows([['현재 책임자', name(m.ownerId)], ['IT 협조', m.collaboratorId ? name(m.collaboratorId) : '요청 없음'], ['다음 조치', m.nextAction || '종료'], ['다음 확인', when(m.due)]]), button('담당·다음 조치 변경', 'form', 'edit'), button('담당 변경·IT 협조', 'form', 'transfer')]));
    var publicText = m.sharedText || (r.fcNotice && r.fcNotice.status === 'APPROVED' && r.fcNotice.approvedText) || r.workaround || '';
    body.appendChild(box('현장 공유 내용', [p(publicText || '확인한 내용을 정리해 현장에 전달해 주세요.'), p(m.sharedAt ? '공유 완료 기록 · ' + when(m.sharedAt) : '공유 완료 기록 없음 · 복사만으로는 전달되지 않아요.', 'ld-meta'),
      e('div', { cls: 'wf-actions' }, [button('공유 내용 작성', 'form', 'share'), publicText ? button('내용 복사', 'copy') : null, publicText ? button('공유 완료 기록', 'shared') : null])]));
    body.appendChild(box('발생 상황·확인 근거', [host.rows([['확인한 사실', m.facts || r.maskedText || '직접 확인 기록 없음'], ['추가 확인', m.missing || '추가 확인 항목 없음'], [r.createdAt ? '접수 시각' : '마지막 변경', when(r.createdAt || r.updatedAt)]]),
      r.detail ? p(r.detail) : null, r.urgent && r.urgent.length ? p('긴급 사정: ' + r.urgent.join(', ')) : null, r.contact ? p('연락 희망: ' + r.contact + (r.contactTime ? ' · ' + r.contactTime : '')) : null, button('내부 확인 기록', 'form', 'note')]));
    if (message) body.appendChild(e('p', { role: 'status', cls: 'wf-message' }, [message]));
    if (form) body.appendChild(editor(r, m));
    var cases = data.cases.filter(function (c) { return c.business === m.business; });
    body.appendChild(disclosure('관련 사례 · AI 추천', [p('AI 추천은 참고예요. 적용 조건은 담당자가 확인해요.', 'ld-meta'),
      st.llm === 'slow' ? p('AI가 사례를 찾고 있어요. 직접 검색하거나 접수를 계속 처리할 수 있어요.') : st.llm === 'fail' ? p('AI 추천을 받지 못했어요. 직접 사례를 검색해 주세요.') : p(cases.length ? '같은 업무의 사례 ' + cases.length + '건' : '일치하는 사례가 없어요. 신규 등록이나 추가 확인을 진행해 주세요.'),
      e('div', { cls: 'wf-actions' }, [button('이 접수의 처리 방법 찾기', 'ask-item'), button('기존 관리 건 고르기', 'link-pick')]),
      st.llm ? null : e('ul', { cls: 'pn-plain' }, cases.map(function (c) { return e('li', { cls: 'wf-source' }, [p(c.title), p(c.difference, 'ld-meta'), button('조건 비교', 'compare', c.id)]); }))]));
    if (compare) {
      var c = data.cases.find(function (v) { return v.id === compare; });
      if (c) body.appendChild(box('사례 조건 비교', [e('div', { cls: 'wf-compare' }, [e('div', null, [e('h4', null, ['이번 접수']), p(r.title || r.maskedText), p(m.facts), p('미확인: ' + m.missing)]), e('div', null, [e('h4', null, [c.title]), p(c.condition), p(c.difference), p(c.check)])]), button('근거 사례 보기', 'source', c.sourceId), button('참고 사례로 연결', 'reference', c.id), !isReport(r) ? null : button('이 관리 건에 연결', 'link-source', c.sourceId)]));
    }
    if (m.references.length) body.appendChild(disclosure('참고 사례 ' + m.references.length + '건', m.references.map(function (id) { var c = data.cases.find(function (v) { return v.id === id; }); return c ? button(c.title, 'compare', id) : p(id); })));
    evidence.forEach(function (node) { body.appendChild(node.matches('details') ? node : disclosure('관련 접수 ' + (r.reports || []).length + '건', [node])); });
    if ((r.reports || []).length) body.appendChild(disclosure('접수 연결 수정', r.reports.map(function (v) { return e('div', { cls: 'wf-source' }, [p(v.id + ' · ' + (v.maskedText || '동일 오류 참여')), button('연결 해제', 'unlink', v.id)]); })));
    if (statusHistory) body.appendChild(disclosure('기존 상태 이력', [statusHistory]));
    body.appendChild(disclosure('업무 처리 이력', (m.events || []).length ? m.events.slice().reverse().map(function (v) { return p(when(v.at) + ' · ' + v.action + ' · ' + name(v.actorId) + (v.note ? '\n' + v.note : '')); }) : [p('추가 기록 없음')]));
    if (r.wontFixReasonText || m.outcome) body.appendChild(box('처리 결과·사유', [p(m.outcome || r.wontFixReasonText)]));
    // 기존 해결 안내·발송 재시도는 보존한다.
    legacyNodes.filter(function (v) { return /해결 안내와 발송 결과/.test(v.textContent); }).forEach(function (v) { body.appendChild(v); });
    foot.replaceChildren();
    if (isReport(r) && !done(r)) foot.append(button('기존 건에 연결', 'link-pick'), button('추가정보 요청', 'form', 'request'), button('안내 후 종료', 'form', 'close'), button('새 관리 건 등록', 'form', 'create', true));
    else if (isReport(r)) foot.append(button('재검토', 'form', 'reopen', true));
    else foot.append(host.btn('pn-btn-2', '접수 연결', 'to-link'), done(r) ? button('재검토', 'form', 'reopen') : button('추가정보 요청', 'form', 'request'), host.btn('pn-btn', '상태·처리 결과 변경', 'status', { 'aria-haspopup': 'dialog' }));
  }
  function paintAI(st) {
    var root = $('wf-ai'), savedInput = $('wf-question');
    if (savedInput) question = savedInput.value;
    root.replaceChildren(e('div', { cls: 'wf-heading' }, [e('h2', null, ['어떻게 대응하면 될까요?']), button('닫기', 'ai-close')]));
    root.appendChild(p('AI가 관련 기록을 찾아 정리해요. 검색 범위: ' + (data.businesses[business(st)] || '전체 업무') + (aiTarget ? ' · 이번 접수 ' + aiTarget : ''), 'ld-meta'));
    root.appendChild(e('form', { id: 'wf-ai-form', role: 'search', 'aria-label': '이전 처리 방법 검색' }, [e('label', { for: 'wf-question' }, ['증상이나 궁금한 처리 방법을 적어 주세요']), e('div', { cls: 'wf-question-row' }, [e('input', { id: 'wf-question', name: 'question', value: question, maxlength: '300', placeholder: '서명 알림톡이 다른 화면으로 열리면 어떻게 처리했나요?', autocomplete: 'off' }), e('button', { type: 'submit', cls: 'pn-btn', id: 'wf-ai-submit' }, ['찾기'])])]));
    if (!ai || ai.outcome === 'EMPTY') root.appendChild(e('div', { cls: 'wf-actions' }, [button('서명 링크 오류 대응', 'example', '서명 알림톡이 다른 화면으로 열리면 어떻게 처리했어?'), button('보험료 계산 지연 대응', 'example', '가입설계 보험료 계산이 늦으면 어떻게 확인했어?'), business(st) ? button('전체 업무로 확대', 'ai-expand') : null]));
    var result = e('div', { id: 'wf-ai-result', 'aria-live': 'polite', 'aria-atomic': 'false' }, []); root.appendChild(result);
    if (!ai) return;
    if (ai.outcome === 'CLARIFY') {
      result.appendChild(e('div', { cls: 'wf-clarify' }, [e('h3', null, ['어떤 증상인가요?']), p('다른 화면이 열리는 문제와 화면이 멈추는 문제는 처리 방법이 달라요.'),
        e('div', { cls: 'wf-actions' }, ai.choices.map(function (choice) { return button(choice.label, 'clarify', choice.question); }))]));
      return;
    }
    if (ai.outcome !== 'OK') {
      result.appendChild(p({ WAITING: '이전 처리 기록을 찾고 있어요. 기다리지 않고 낱말 검색이나 접수 처리를 계속할 수 있어요.', FAILED: '처리 기록을 정리하지 못했어요. 낱말로 찾거나 직접 접수를 확인해 주세요.', EMPTY: '현재 업무에서 일치하는 처리 기록을 찾지 못했습니다. 업무 범위를 넓히거나 발생 화면과 증상을 더 구체적으로 적어 주세요.' }[ai.outcome]));
      if (ai.outcome !== 'WAITING') result.appendChild(button('다시 찾기', 'retry'));
      return;
    }
    var c = ai.cases[0], guide = c.guide, uncertain = ai.old || ai.mismatch;
    var status = ai.old ? '과거 조치 · 현재 유효성 미확인' : ai.mismatch ? '발생 조건 확인 필요' : guide.stateLabel;
    var answer = e('article', { cls: 'wf-guidance', 'aria-label': '처리 방법 답변' }, [
      tag(status, uncertain || guide.state === 'INVESTIGATING'),
      e('h3', { cls: 'wf-answer-lead' }, [ai.mismatch ? '현재 정보만으로 적용할 처리 방법을 정할 수 없어요.' : guide.lead]),
      p(ai.old ? '과거 조치 기록입니다. 현재 화면과 업무에서도 쓸 수 있는지 담당자에게 확인하기 전에는 바로 적용하지 마세요.' : ai.mismatch ? '비슷한 기록은 있지만 같은 원인이라고 판단할 수 없어요. 아래 조건부터 확인해 주세요.' : guide.context),
      e('section', { cls: 'wf-guide-step' }, [e('h4', null, ['먼저 확인해 주세요']), e('ol', null, guide.checks.map(function (v) { return e('li', null, [v]); }))]),
      e('section', { cls: 'wf-guide-step' }, [e('h4', null, [uncertain ? '확인 후 판단해 주세요' : guide.state === 'INVESTIGATING' ? '이렇게 확인을 요청해 주세요' : '같은 조건이면']),
        p(uncertain ? '이번 건의 발생 조건과 이전 기록의 차이를 정리해 담당자에게 적용 가능 여부를 확인해 주세요. 같은 처리 방법을 쓸 수 있다고 확정하지 마세요.' : guide.match)]),
      e('section', { cls: 'wf-guide-step' }, [e('h4', null, [guide.state === 'INVESTIGATING' ? '증상이 다르면' : '조건이 다르거나 계속 안 되면']), p(guide.otherwise)]),
      e('div', { cls: 'wf-evidence' }, [p('참고 기록 · ' + c.sourceId + ' · ' + c.at + ' · ' + c.title, 'ld-meta'),
        e('div', { cls: 'wf-actions' }, [button('이전 처리 기록 보기', 'source', c.sourceId), aiTarget ? button('이번 건과 비교하기', 'compare-target', c.id) : null]),
        disclosure('이전 기록에서 확인한 내용', [p('적용 조건: ' + c.condition), p('당시 결과: ' + c.result), p(ai.old ? '과거 기록 · 현재 적용 가능 여부 미확인' : c.validity, 'ld-meta')])])]);
    result.appendChild(answer);
    if (aiTarget && itemBy(aiTarget)) result.appendChild(disclosure('현장 안내·확인 요청에 활용', [p('초안으로 가져온 뒤 내용을 검토해 주세요. 자동으로 전달되거나 기록되지 않아요.', 'ld-meta'),
      e('div', { cls: 'wf-actions' }, [uncertain ? null : button('현장 안내 초안 만들기', 'guide-draft', c.id), button('확인 요청 내용 정리하기', 'request-draft', c.id)])]));
    if (ai.cases.length > 1) result.appendChild(disclosure('증상이 다르면 확인할 기록', ai.cases.slice(1).map(function (other) { return e('div', { cls: 'wf-related-record' }, [p(other.title), p(other.difference, 'ld-meta'), button('이 증상의 처리 방법 보기', 'clarify', other.condition + ' 이전 처리 방법을 알려 주세요.')]); })));
  }
  function refresh() { form = ''; message = message || '적용했어요.'; return host.render(); }
  function current() { return itemBy(host.read().item); }
  function ask() {
    captureFocus(); var st = host.read(); question = $('wf-question') ? $('wf-question').value : question;
    return A.askLedgerCases({ question: question, business: business(st), mode: st.llm, variant: st.aiCase }).then(function (result) { ai = result; paintAI(host.read()); restoreFocus(); });
  }
  function click(event) {
    var b = event.target.closest('[data-wf]'); if (!b) return;
    event.preventDefault(); var act = b.dataset.wf, value = b.dataset.value, r = current(), st = host.read();
    if (act === 'ai') { aiTarget = ''; requestedFocus = st.ai === '1' ? 'wf-ai-open' : 'wf-question'; host.go({ ai: st.ai === '1' ? '' : '1' }); }
    else if (act === 'ai-close') { requestedFocus = 'wf-ai-open'; host.go({ ai: '' }); }
    else if (act === 'all-business' || act === 'ai-expand') { ai = null; host.go({ business: 'ALL', item: '', queue: '', mine: '', status: '', grade: '', type: '', q: '' }); }
    else if (act === 'clear') host.go({ q: '', mine: '', queue: '', grade: '', type: '', status: '' });
    else if (act === 'form') { form = value; message = ''; host.render().then(function () { var f = $('wf-editor'); if (f) { f.scrollIntoView({ block: 'start' }); f.querySelector('input,select,textarea').focus(); } }); }
    else if (act === 'form-close') { form = ''; host.render(); }
    else if (act === 'ask-item') { form = ''; requestedFocus = 'wf-question'; aiTarget = r.id; question = r.title || r.maskedText || ''; ai = null; host.go({ ai: '1', item: '', business: meta(r).business }); }
    else if (act === 'example' || act === 'clarify') { requestedFocus = 'wf-question'; question = value; $('wf-question').value = value; ask(); }
    else if (act === 'guide-draft' || act === 'request-draft') {
      var target = itemBy(aiTarget), source = data.cases.find(function (v) { return v.id === value; });
      if (!target || !source) return;
      var kind = act === 'guide-draft' ? 'share' : 'request';
      var content = kind === 'share' ? source.guide.forward : ai && (ai.old || ai.mismatch) ?
        '이전 기록 ' + source.sourceId + '의 현재 적용 가능 여부를 확인해 주세요.\n' + source.guide.checks.join('\n') : source.guide.request;
      drafts[target.id + ':' + kind] = Object.assign({}, drafts[target.id + ':' + kind], { sharedText: content, confirmed: '' });
      form = kind; message = '이전 기록을 바탕으로 만든 초안이에요. 적용 조건과 공유할 내용을 검토해 주세요.';
      requestedFocus = 'wf-field-sharedText';
      host.go({ item: target.id, ai: '', business: meta(target).business });
    }
    else if (act === 'retry') ask();
    else if (act === 'source') { form = ''; compare = ''; host.go({ item: value, dialog: '' }); }
    else if (act === 'compare') { compare = value; host.render().then(function () { var title = Array.from($('ld-body').querySelectorAll('h4')).find(function (h) { return h.textContent === '사례 조건 비교'; }); if (title) title.scrollIntoView(); }); }
    else if (act === 'compare-target') { compare = value; host.go({ item: aiTarget, ai: '' }); }
    else if (act === 'reference') {
      var refs = Array.from(new Set(meta(r).references.concat([value])));
      A.saveLedgerWorkflow(r.id, { references: refs, event: '참고 사례 연결', actorId: host.viewer(st).id }).then(refresh);
    } else if (act === 'link-pick') {
      if (r && isReport(r)) host.go({ dialog: 'link', report: r.id, link: st.for || '', dstep: '' });
      else host.go({ tab: 'unlinked', item: '', for: r ? r.id : '' });
    } else if (act === 'link-source') host.go({ dialog: 'link', report: r.id, link: value, dstep: '' });
    else if (act === 'shared') {
      if (!window.confirm('실제로 현장에 전달한 내용인가요?')) return;
      A.saveLedgerWorkflow(r.id, { sharedAt: new Date().toISOString(), event: '현장 공유 완료 기록', actorId: host.viewer(st).id }).then(refresh);
    } else if (act === 'unlink') {
      var reason = window.prompt('다른 원인이거나 잘못 연결했다면 이유를 적어 주세요. 검토 대기 접수로 돌아갑니다.');
      if (!reason || !reason.trim()) return;
      A.unlinkLedgerReport(value, reason, host.viewer(st).id).then(refresh);
    } else if (act === 'copy') {
      var m = meta(r), valueToCopy = m.sharedText || (r.fcNotice && r.fcNotice.status === 'APPROVED' && r.fcNotice.approvedText) || r.workaround;
      if (!navigator.clipboard) { window.prompt('내용을 선택해 복사해 주세요.', valueToCopy); return; }
      navigator.clipboard.writeText(valueToCopy).then(function () { message = '복사했어요. 실제 전달 후 공유 완료를 기록해 주세요.'; host.render(); }).catch(function () { window.prompt('복사를 다시 시도하거나 아래 내용을 직접 복사해 주세요.', valueToCopy); });
    }
  }
  function submit(event) {
    if (event.target.id === 'wf-ai-form') { event.preventDefault(); ask(); return; }
    if (event.target.id !== 'wf-editor') return;
    event.preventDefault(); var f = event.target, req = Object.fromEntries(new FormData(f)), kind = f.dataset.kind, r = current();
    req.actorId = host.viewer(host.read()).id;
    var error = '';
    if (['edit', 'create', 'transfer', 'reopen'].includes(kind) && (!req.ownerId || !req.nextAction.trim())) error = '현재 책임자와 다음 조치를 적어 주세요.';
    if (['note', 'transfer', 'reopen'].includes(kind) && !req.note.trim()) error = '확인 내용이나 변경 이유를 적어 주세요.';
    if (kind === 'request' && (!req.sharedText.trim() || !req.due)) error = '요청할 질문과 다음 확인 시점을 적어 주세요.';
    if (['share', 'close'].includes(kind) && (!req.sharedText.trim() || req.confirmed !== 'on')) error = '공유 내용을 적고 확인 표시를 해 주세요.';
    if (kind === 'close' && !req.outcome.trim()) error = '처리 결과와 종료 사유를 적어 주세요.';
    if (kind === 'create' && !req.title.trim()) error = '제목을 적어 주세요.';
    if (req.collaboratorId && req.collaboratorId === req.ownerId) error = '현재 책임자와 협조 담당자는 다르게 골라 주세요.';
    if (error) { $('wf-form-error').textContent = error; return; }
    if (kind === 'request') { req.stage = 'WAITING'; req.nextAction = '요청한 정보 회신 확인'; }
    if (kind === 'reopen') req.stage = 'REVIEW';
    if (kind === 'note') req.facts = req.note;
    if (kind === 'share' || kind === 'request') req.sharedAt = '';
    req.event = { edit: '담당·다음 조치 변경', transfer: '담당 변경·IT 협조', request: '추가정보 요청', note: '내부 확인 기록', share: '현장 공유 내용 확인', reopen: '재검토' }[kind];
    var submitButton = f.querySelector('[type=submit]'); submitButton.disabled = true;
    var promise = kind === 'create' ? A.createLedgerCase(r, req) : kind === 'close' ? A.closeLedgerReport(r.id, req) : A.saveLedgerWorkflow(r.id, req);
    promise.then(function (result) {
      if (result.error) { $('wf-form-error').textContent = result.error; submitButton.disabled = false; return; }
      delete drafts[r.id + ':' + kind]; form = ''; message = '적용했어요.';
      if (kind === 'create') host.go({ item: result.id, tab: 'defects', business: req.business }); else refresh();
    }).catch(function () { $('wf-form-error').textContent = '적용하지 못했어요. 입력은 유지돼요. 다시 시도해 주세요.'; submitButton.disabled = false; });
  }
  window.LedgerWorkflow = {
    init: function (callbacks) {
      host = callbacks; document.addEventListener('click', click); document.addEventListener('submit', submit);
      document.addEventListener('input', function (event) { var f = event.target.closest('#wf-editor'); if (f) drafts[f.dataset.item + ':' + f.dataset.kind] = Object.fromEntries(new FormData(f)); });
      document.addEventListener('change', function (event) {
        var key = event.target.dataset.wfFilter; if (!key) return;
        var patch = { item: '', dialog: '', for: '' }; patch[key] = event.target.value || (key === 'business' ? 'ALL' : '');
        if (key === 'business') { ai = null; patch.queue = ''; patch.mine = ''; patch.status = ''; patch.grade = ''; patch.type = ''; }
        host.go(patch);
      });
      document.addEventListener('keydown', function (event) {
        var tab = event.target.closest('.ld-tab');
        if (!tab || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.stopImmediatePropagation(); event.preventDefault();
        var keys = ['unlinked', 'defects', 'cases'], at = keys.indexOf(host.read().tab), next = keys[(at + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
        host.go({ tab: next, item: '', dialog: '', status: '', grade: '', type: '', queue: '' }); $('ld-tab-' + next).focus();
      }, true);
    },
    load: function (st) { return Promise.all([A.getLedgerWorkflow(), A.getDefects(), A.getUnlinkedReports((host.viewer(st) || {}).id)]).then(function (v) { data = v[0]; all = v[1]; reports = v[2]; users = host.users(); }); },
    list: list, details: details, captureFocus: captureFocus, restoreFocus: restoreFocus,
    item: itemBy,
    news: function () { return reports.filter(function (r) { return !done(r) && r.isNew; }); },
    resetDetail: function () { form = ''; compare = ''; message = ''; },
    clearFilters: function (st) { return { tab: st.tab, item: '', for: '', dialog: '', status: '', grade: '', type: '', queue: '', q: '' }; }
  };
})();
