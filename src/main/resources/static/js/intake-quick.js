/* S2 일반 접수와 탭 내 임시저장 (ADR-019). S5는 기존 숫자 단계 흐름을 사용한다. */
(function () {
  'use strict';

  window.createQuickIntake = function (ui, data) {
    var A = window.ApiClient;
    var el = ui.el, btn = ui.btn, note = ui.note, rows = ui.rows;
    var meta = data.meta, options = data.options, catalog = data.catalog;
    var symptoms = meta.symptoms.concat(options.symptoms);
    var drafts = new Map();
    var serial = 0, actor, form, receipt, confirming, offer, error, invalid, busy, wide, ai, restored;
    var steps = ['problem', 'review'];
    var expanded;
    var types = [['UNCLASSIFIED', '담당자가 확인해 주세요'], ['DEFECT', '전산 오류'],
      ['USAGE', '사용법 문의'], ['IMPROVEMENT', '개선 요청']];
    var devices = [['SAME', '접수하는 기기와 같아요'], ['PC', '다른 컴퓨터'], ['PHONE', '휴대폰'], ['TABLET', '태블릿'],
      ['UNKNOWN', '아직 모르겠어요']];
    var questionChoices = ['네', '아니요', '확인 못 했어요', '지금 다시 해볼 수 없어요'];

    function start(user) {
      actor = user;
      offer = drafts.has(user);
      reset();
    }
    function reset() {
      form = { requestId: ++serial, business: '', oneLine: '', symptom: '', detail: '', extraSymptoms: [], urgent: [],
        customerScope: '', customerNo: '', device: '', screen: '', date: '', time: '', contact: '', contactTime: '',
        finalType: 'UNCLASSIFIED', onBehalf: '', condition: '', source: '', attemptedWorkaround: '' };
      receipt = null;
      confirming = busy = wide = restored = false;
      error = invalid = '';
      ai = null;
      expanded = {};
    }
    function owner(st) {
      var user = ui.user(st);
      return user ? user.id : st.role;
    }
    function isStep(step) { return steps.includes(step) || step === 'receipt'; }
    function enter(st) {
      if (actor !== owner(st)) start(owner(st));
      if (st.step === 'receipt' && !receipt) return ui.go({ step: 'problem' });
      if (st.step === 'review' && (!form.business || !form.oneLine.trim())) return ui.go({ step: 'problem' });
      ui.paint(st);
    }
    function open(st) { start(owner(st)); }
    function handoff(st, question, answer) {
      if (actor !== owner(st)) start(owner(st));
      if (offer && !hasContent() && !form.onBehalf) restoreDraft();
      error = invalid = '';
      if (!form.oneLine.trim()) form.oneLine = question;
      else if (form.oneLine.trim() !== question && !form.detail.split('\n').includes(question)) {
        var detail = [form.detail, question].filter(Boolean).join('\n');
        if (detail.length <= 1000) {
          form.detail = detail;
          expanded.description = true;
        } else {
          error = '상세 설명이 길어서 AI 질문을 옮기지 못했어요. 작성하신 내용은 그대로 있어요.';
        }
      }
      form.business = form.business || answer.business || '';
      form.symptom = form.symptom || answer.symptom || '';
      invalidateAi();
      form.source = 'ASSISTANT';
      ui.go({ step: 'problem' });
    }
    function select(key, label, choices, emptyLabel) {
      return el('div', { cls: 'pn-field' }, [el('label', { for: 'quick-' + key }, [label]),
        el('select', { id: 'quick-' + key, 'data-quick': key, 'data-fk': 'quick:' + key,
          'aria-invalid': invalid === key ? 'true' : null, 'aria-describedby': invalid === key ? 'quick-error' : null },
          [['', emptyLabel || '선택해 주세요']].concat(choices).map(function (pair) {
            return el('option', { value: pair[0], selected: form[key] === pair[0] }, [pair[1]]);
          })),
        invalid === key ? errorText() : null]);
    }
    function field(key, label, attrs) {
      var long = key === 'detail';
      var input = Object.assign({
        id: 'quick-' + key, cls: 'pn-input', 'data-quick': key, 'data-fk': 'quick:' + key,
        autocomplete: 'off', 'aria-invalid': invalid === key ? 'true' : null,
        'aria-describedby': invalid === key ? 'quick-error' : key === 'oneLine' ? 'quick-count' : null
      }, attrs);
      if (!long) input.value = form[key];
      return el('div', { cls: 'pn-field' }, [el('label', { for: input.id }, [label]),
        el(long ? 'textarea' : 'input', input, long ? [form[key]] : []),
        invalid === key ? errorText() : null]);
    }
    function details(key, title, content, initiallyOpen) {
      var state = expanded;
      var section = el('details', { cls: 'pn-details pq-details', 'data-quick-section': key,
        open: state[key] === undefined ? initiallyOpen : state[key] }, [
        el('summary', { 'data-fk': 'section:' + key }, [title]), el('div', { cls: 'pq-details-body' }, content)]);
      section.addEventListener('toggle', function () { if (section.isConnected) state[key] = section.open; });
      return section;
    }
    function errorText() {
      return error ? el('p', { cls: 'pn-err', id: 'quick-error', role: 'alert' }, [error]) : null;
    }
    function tags(key, title, optionsList, extra) {
      return el('ul', { cls: 'pn-chips' + (extra ? ' pq-urgency' : ''), 'aria-label': title }, optionsList.map(function (pair) {
        return el('li', null, [btn('pn-chip', pair[1], 'quick-toggle', { 'data-key': key, 'data-code': pair[0],
          'data-fk': key + ':' + pair[0], 'aria-pressed': String(form[key].includes(pair[0])) })]);
      }).concat(extra ? [el('li', null, [extra])] : []));
    }
    function entries(items) { return items.map(function (item) { return [item.code, item.label]; }); }
    function related() {
      return catalog.filter(function (d) {
        var sameSymptom = d.symptom === form.symptom || (form.symptom === 'SLOW' && d.symptom === 'NOT_SHOWN' && d.business === 'DESIGN');
        return d.business === form.business && (!form.symptom || sameSymptom);
      }).slice(0, 2);
    }
    function guide(d) {
      if (!d) return null;
      return el('div', { cls: 'pn-card' }, [
        el('p', { cls: 'pn-card-title' }, ['같은 증상이라면 이렇게 해 보세요']),
        el('p', null, [d.workaround || '공개된 임시 방법이 아직 없어요.']),
        d.guide && d.guide.steps ? el('ol', { cls: 'pq-guide-steps' }, d.guide.steps.map(function (step) {
          return el('li', null, [step]);
        })) : null,
        d.plannedFixDate ? el('p', null, ['수정 예정 · ', ui.fmtDate(d.plannedFixDate)]) : null,
        d.wontFixReasonText ? el('p', null, [d.wontFixReasonText, ' · 적용 날짜는 아직 안내되지 않았어요.']) : null,
        d.guide && d.guide.customerMessage ? el('div', { cls: 'pq-actions' }, [
          el('p', null, [d.guide.customerMessage]),
          btn('pn-btn-2', '고객 안내 복사', 'quick-copy', { 'data-guide': d.id })]) : null,
        el('p', { cls: 'pn-lead' }, ['이 방법으로도 진행하기 어려우면 접수에 상황을 남겨 주세요.'])]);
    }
    function recommendation(matches) {
      var id = A.findQuickIntakeGuide(form.business, form.oneLine);
      return matches.find(function (d) { return d.id === id; });
    }
    function refreshAdvice() {
      var box = document.getElementById('quick-related');
      if (!box) return;
      var matches = related(), suggested = recommendation(matches);
      var signature = suggested ? 'guide:' + suggested.id : matches.map(function (d) { return d.id; }).join(',');
      if (box.getAttribute('data-match') === signature) return;
      box.setAttribute('data-match', signature);
      box.textContent = '';
      if (suggested) {
        var summary = el('span', { cls: 'pq-guide-summary' }, [
          el('strong', null, ['지금 해볼 방법']),
          el('span', null, [suggested.workaround]),
          el('span', { cls: 'pq-guide-more' }, ['방법 자세히 보기'])
        ]);
        var card = details('method-' + suggested.id, summary, [
          el('p', { cls: 'pn-card-title' }, [suggested.title]),
          suggested.guide && suggested.guide.steps ? el('ol', { cls: 'pq-guide-steps' }, suggested.guide.steps.map(function (step) {
            return el('li', null, [step]);
          })) : null,
          suggested.plannedFixDate ? el('p', null, ['수정 예정 · ', ui.fmtDate(suggested.plannedFixDate)]) : null,
          el('div', { cls: 'pq-actions' }, [
            btn('pn-btn-2', '해봤는데 아직 안 돼요', 'quick-tried', { 'data-id': suggested.id }),
            btn('pn-btn-2', '나도 겪었어요', 'quick-participate', { 'data-id': suggested.id, disabled: busy })])
        ]);
        card.classList.add('pq-inline-guide');
        box.appendChild(card);
      } else if (matches.length) {
        box.appendChild(details('related', '이 업무의 공개 오류 (' + matches.length + '건)', matches.map(function (d) {
          return el('div', { cls: 'pq-related-case' }, [
            el('p', { cls: 'pn-card-title' }, [d.title]),
            el('p', null, [d.workaround || '아직 공개된 임시 방법이 없어요.']),
            btn('pn-btn-2', '나도 겪었어요', 'quick-participate', { 'data-id': d.id, disabled: busy })]);
        })));
      }
    }
    function problem() {
      var urgentCount = form.urgent.length + Number(form.customerScope === 'MANY');
      return {
        body: [
          el('h3', { tabindex: '-1' }, ['어떤 업무가 막혔나요?']),
          offer ? el('div', { cls: 'pn-card pq-actions' }, [
            el('p', null, ['이 탭에 작성 중인 접수가 있어요.']),
            btn('pn-btn-2', '이어서 작성', 'quick-restore'),
            btn('pn-btn-2', '저장 내용 버리기', 'quick-drop')]) : null,
          select('business', '업무', entries(meta.businesses), '어떤 업무인지 골라 주세요'),
          field('oneLine', '무슨 일이 있었나요?', { maxlength: '100', placeholder: '예) 서명 링크를 누르면 다른 화면이 떠요' }),
          el('p', { cls: 'pn-help', id: 'quick-count' }, [form.oneLine.length + '/100자 · 고객 이름과 번호는 빼고 적어 주세요.']),
          el('div', { id: 'quick-related', cls: 'pq-related', 'aria-live': 'polite' }),
          details('urgent', urgentCount ? '긴급 사정 · ' + urgentCount + '개 선택' : '긴급 사정 추가 (선택)', [
            tags('urgent', '긴급 사정과 영향 범위', options.urgency,
              btn('pn-chip', '여러 고객에게 발생', 'quick-many', { 'aria-pressed': String(form.customerScope === 'MANY') }))
          ]),
          details('description', '증상이나 상세 설명 추가 (선택)', [
            select('symptom', '대표 증상 (선택)', entries(symptoms), '고르기 어려우면 비워 두세요'),
            el('p', { cls: 'pn-label' }, ['다른 증상도 있었나요?']),
            tags('extraSymptoms', '추가 증상', entries(symptoms.filter(function (item) { return item.code !== form.symptom; }))),
            field('detail', '상세 설명 (선택)', { maxlength: '1000', placeholder: '오류가 나기 전에 하신 작업을 적어 주세요.' })
          ]),
          invalid ? null : errorText()
        ],
        foot: [btn('pn-btn', '확인으로', 'quick-review', { disabled: busy })]
      };
    }
    function review(st) {
      var scope = options.scope.map(function (pair) { return pair[0] === 'MANY' ? [pair[0], '여러 고객'] : pair; });
      var canAi = st.mode === 'B' && !form.source;
      return {
        body: [
          el('h3', { tabindex: '-1' }, ['확인하고 보내기']),
          el('div', { cls: 'pn-card pq-summary' }, [rows([
            ['업무', ui.labelOf(meta.businesses, form.business)], ['한 줄 설명', form.oneLine],
            form.detail ? ['상세 설명', form.detail] : null,
            form.attemptedWorkaround ? ['시도한 임시 방법', form.attemptedWorkaround] : null,
            form.symptom ? ['대표 증상', ui.labelOf(symptoms, form.symptom)] : null,
            form.extraSymptoms.length ? ['추가 증상', form.extraSymptoms.map(function (code) { return ui.labelOf(symptoms, code); }).join(', ')] : null,
            form.urgent.length ? ['우선 확인 요청', options.urgency.filter(function (pair) { return form.urgent.includes(pair[0]); })
              .map(function (pair) { return pair[1]; }).join(' · ')] : null])]),
          details('extra', '고객 범위·발생 환경·연락 방법 추가 (선택)', [
            select('customerScope', '한 고객에게만 발생했나요? (선택)', scope, '답을 몰라도 접수할 수 있어요'),
            form.customerScope === 'ONE' ? field('customerNo', '고객번호 (선택 · 번호 없이 접수할 수 있어요)', { maxlength: '40' }) : null,
            details('incident', '자동으로 확인한 정보와 오류가 난 환경', [
              rows([['접수하는 기기', data.context.reportedFrom.device + ' · ' + data.context.reportedFrom.browser],
                ['접수 화면', data.context.screenName], ['접수 시각', ui.fmtWhen(data.context.occurredAt)]]),
              select('device', '오류가 난 기기 (선택)', devices),
              field('screen', '오류가 난 화면 (선택)', { maxlength: '80' }),
              el('div', { cls: 'pq-grid' }, [
                field('date', '발생 날짜 (선택)', { type: 'date' }), field('time', '발생 시각 (선택)', { type: 'time' })])
            ], invalid === 'screen' || !!(form.device || form.screen || form.date || form.time)),
            details('contact', '연락받을 방법과 가능 시간', [
              el('p', null, ['응답은 내 접수내역에서 확인할 수 있어요.']),
              select('contact', '연락 방법 (선택)', options.contact),
              form.contact === 'PHONE' ? select('contactTime', '연락 가능한 시간 (선택)', options.time) : null
            ], !!form.contact),
            btn('pn-btn-2 pq-wide-toggle', wide ? '기본 너비로 보기' : '넓게 보기', 'quick-wide', { 'aria-pressed': String(wide) })
          ]),
          details('review-ai', canAi ? '개인정보 확인 및 AI 정리 (선택)' : '개인정보 확인 (선택)', [
            details('privacy', '가려지는 정보 보기', [
              el('p', null, ['고객번호는 AI와 접수 내역에 보내지 않아요. 이름과 번호는 설명에서 빼고 적어 주세요.']),
              rows([['정리에 사용하는 설명', form.oneLine], form.detail ? ['상세 설명', form.detail] : null])
            ], false),
            canAi ? aiSection() : null,
            st.mode === 'B' ? select('finalType', '문의 유형 (선택)', types, '담당자가 확인해 주세요') : null
          ]),
          invalid === 'screen' ? null : errorText()
        ],
        foot: [btn('pn-btn-2', '이전', 'quick-back', { disabled: busy }),
          btn('pn-btn', busy ? '접수 중…' : ai && ai.state === 'waiting' ? '기다리지 않고 접수하기' : '접수하기',
            'quick-submit', { disabled: busy })]
      };
    }
    function aiSection() {
      if (!ai) return el('div', { cls: 'pn-card pq-actions' }, [
        el('p', null, ['설명을 확인한 뒤 AI 정리를 요청할 수 있어요. 바로 접수해도 돼요.']),
        btn('pn-btn-2', 'AI로 정리', 'quick-ai')]);
      if (ai.state === 'waiting') return el('p', { role: 'status', cls: 'pn-lead pq-status' }, ['AI가 내용을 살펴보고 있어요.']);
      if (ai.state === 'failed') return note('', 'i-info', 'AI 정리를 불러오기 어려워요', '작성하신 내용으로 접수할 수 있어요.');
      if (ai.guidance) return el('div', { cls: 'pn-card pq-actions' }, [
        el('p', { cls: 'pn-card-title' }, ['사용 방법 안내']),
        el('p', null, [ai.guidance]),
        btn('pn-btn-2', '안내대로 했는데 안 돼요', 'quick-guide-failed'),
        btn('pn-btn-2', '아니에요, 오류예요', 'quick-guide-failed'),
        btn('pn-btn-2', '나중에 확인할게요', 'quick-guide-later'),
        btn('pn-btn-2', '해결됐어요', 'quick-guide-solved')]);
      return el('div', { cls: 'pn-card' }, [
        el('p', { cls: 'pn-card-title' }, ['AI 정리']),
        el('p', null, [form.oneLine]),
        ai.type ? el('p', { cls: 'pn-lead' }, ['AI 제안 · ' + types.find(function (type) { return type[0] === ai.type; })[1]]) : null,
        ai.askCondition ? el('div', { cls: 'pn-field' }, [
          select('condition', '이 고객에게 세미나 초대장을 보낸 적이 있나요? (선택)',
            questionChoices.map(function (label) { return [label, label]; }), '확인 필요'),
          el('p', null, [evidence()])]) : el('p', { cls: 'pn-lead' }, ['추가 조건은 담당자가 확인해요.'])
      ]);
    }
    function evidence() {
      if (!ai || !ai.askCondition) return '';
      if (form.condition === '네') return '세미나 초대장 발송 · 보낸 적 있음';
      if (form.condition === '아니요') return '세미나 초대장 발송 · 보낸 적 없음';
      return '세미나 초대장 발송 · 확인 필요' + (form.condition ? ' (' + form.condition + ')' : '');
    }
    function done() {
      var d = catalog.find(function (item) { return item.id === (receipt.guideId || receipt.defectId); });
      return {
        body: [
          el('div', { cls: 'pn-success' }, [
            ui.successMark(),
            el('h3', { tabindex: '-1' }, [receipt.kind === 'ME_TOO' ? '같은 오류 참여가 기록됐어요' : '접수됐어요'])]),
          el('div', { cls: 'pn-card pq-actions' }, [
            el('p', { cls: 'pn-card-title', id: 'quick-receipt-id', tabindex: '-1' }, ['접수번호 ', receipt.id]),
            btn('pn-btn-2', '접수번호 복사', 'quick-copy'),
            el('p', { role: 'status', id: 'quick-copy-status' }),
            rows([
              ['현재 상태', receipt.kind === 'ME_TOO' ? '같은 오류를 겪었다고 알렸어요' : '접수 완료 · 담당자 확인 대기'],
              receipt.urgent && receipt.urgent.length ? ['우선 확인 요청', '긴급 사정을 함께 남겼어요'] : null,
              receipt.attemptedWorkaround ? ['시도한 임시 방법', receipt.attemptedWorkaround] : null,
              receipt.department ? ['담당 창구', receipt.department] : null,
              ['연락', receipt.contact === 'PHONE' ? '전화 희망' +
                (receipt.contactTime ? ' · ' + options.time.find(function (pair) { return pair[0] === receipt.contactTime; })[1] : '') : 'SFA 내 접수내역'],
              ['다음 안내', '정해지면 내 접수내역에서 확인할 수 있어요.']
            ])]),
          d && d.workaround !== receipt.attemptedWorkaround ? guide(d) : null
        ],
        foot: [btn('pn-btn', '이 접수의 진행 상황 보기', 'quick-mine')]
      };
    }
    function view(st) {
      if (confirming) return {
        body: [el('h3', { tabindex: '-1', id: 'quick-confirm' }, ['작성 중인 내용을 저장하고 닫을까요?']),
          el('p', null, ['이 페이지에서 다시 열면 이어서 쓸 수 있어요. 새로고침하면 사라지며 고객번호는 임시저장하지 않아요.']),
          offer ? el('p', null, ['저장하면 앞서 임시저장한 내용을 이 접수로 바꿔요.']) : null,
          btn('pn-btn-2', '저장 없이 닫기', 'quick-discard')],
        foot: [btn('pn-btn-2', '계속 작성', 'quick-keep'), btn('pn-btn', '저장하고 닫기', 'quick-save')]
      };
      if (st.step === 'review') return review(st);
      if (st.step === 'receipt') return done();
      return problem();
    }
    function hasContent() {
      return !!(form.business || form.oneLine || form.detail || form.urgent.length || form.extraSymptoms.length ||
        form.symptom || form.customerScope || form.customerNo || form.screen || form.device || form.date || form.time || form.contact);
    }
    function restoreDraft() {
      var draft = drafts.get(actor);
      form = Object.assign({}, draft.form, { requestId: ++serial, customerNo: '' });
      ai = draft.ai;
      restored = true;
      offer = false;
    }
    function close(st, returnStep) {
      if (!form || actor !== owner(st)) start(owner(st));
      if (busy) return;
      if (confirming) return act('keep', st);
      if (!receipt && hasContent()) {
        confirming = true;
        if (st.step === 'assistant') return ui.go({ step: returnStep });
        ui.paint(st);
        document.getElementById('quick-confirm').focus();
        return;
      }
      reset();
      ui.close();
    }
    function request(st) {
      var matches = related();
      var match = recommendation(matches) || (form.symptom ? matches.find(function (d) { return d.workaround; }) : null);
      return {
        requestId: actor + ':' + form.requestId, reporterId: form.onBehalf || actor, submittedById: actor,
        business: form.business, symptom: form.symptom, oneLine: form.oneLine.trim(), detail: form.detail.trim(),
        extraSymptoms: form.extraSymptoms, urgent: form.urgent, customerScope: form.customerScope,
        incident: { device: form.device, screen: form.screen, date: form.date, time: form.time },
        screen: form.screen, contact: form.contact, contactTime: form.contact === 'PHONE' ? form.contactTime : '',
        finalType: st.mode === 'A' ? 'UNCLASSIFIED' : form.finalType, evidence: evidence(), guideId: match ? match.id : null,
        attemptedWorkaround: form.attemptedWorkaround
      };
    }
    function focusError(st, key, message) {
      invalid = key;
      error = message;
      ui.paint(st);
      var field = document.getElementById('quick-' + (key || 'error'));
      if (field) {
        if (!key) field.tabIndex = -1;
        field.focus();
      }
    }
    function submit(st) {
      var snapshot = form;
      var req = request(st);
      busy = true;
      ui.paint(st);
      return A.postQuickIntake(req, st.submit === 'fail').then(function (result) {
        if (form !== snapshot) return;
        busy = false;
        if (result.blocked) return focusError(st, '', '설명이나 화면 이름에서 번호·이메일을 지우고 다시 보내 주세요.');
        if (result.failed) return focusError(st, '', '접수하지 못했어요. 작성하신 내용은 남아 있어요. 다시 눌러 주세요.');
        finish(result);
      }).catch(function () {
        if (form !== snapshot) return;
        busy = false;
        focusError(st, '', '접수하지 못했어요. 작성하신 내용은 남아 있어요. 다시 눌러 주세요.');
      });
    }
    function finish(report) {
      if (restored) drafts.delete(actor);
      receipt = report;
      offer = confirming = wide = false;
      ui.go({ step: 'receipt', submit: '' });
    }
    function askAi(st) {
      var snapshot = form;
      return A.previewQuickIntake(request(st)).then(function (preview) {
        if (form !== snapshot || ui.read().step !== 'review') return;
        if (preview.blocked) return focusError(st, '', '설명이나 화면 이름에서 번호·이메일을 지우고 다시 요청해 주세요.');
        if (st.llm === 'slow' || st.llm === 'fail') {
          ai = { state: st.llm === 'slow' ? 'waiting' : 'failed' };
          ui.paint(st);
          return;
        }
        A.setProto({ llm: 'ok' });
        return A.postIntakeQuestion({ text: form.oneLine }).then(function (answer) {
          if (form !== snapshot || ui.read().step !== 'review' || busy) return;
          if (answer.outcome === 'UNAVAILABLE' || answer.outcome === 'BLOCKED') {
            ai = { state: 'failed' };
            return ui.paint(st);
          }
          ai = { state: 'ready', type: answer.type, guidance: answer.guidance && answer.outcome === 'GUIDANCE' ? answer.guidance : null,
            askCondition: !!(answer.defect && answer.defect.id === 'D-2026-001' && form.customerScope !== 'MANY') };
          if (answer.type && form.finalType === 'UNCLASSIFIED') form.finalType = answer.type;
          ui.paint(st);
        });
      }).catch(function () {
        if (form !== snapshot || ui.read().step !== 'review') return;
        ai = { state: 'failed' };
        ui.paint(st);
      });
    }
    function act(action, st, button) {
      if (busy) return;
      var section = button && button.closest('[data-quick-section]');
      if (section) expanded[section.getAttribute('data-quick-section')] = section.open;
      if (action === 'review') {
        if (!form.business) return focusError(st, 'business', '어떤 업무인지 골라 주세요.');
        if (!form.oneLine.trim()) return focusError(st, 'oneLine', '무슨 일이 있었는지 적어 주세요.');
        error = invalid = '';
        return ui.go({ step: 'review' });
      }
      if (action === 'tried') {
        var suggested = recommendation(related());
        if (!suggested || suggested.id !== button.getAttribute('data-id')) return;
        form.attemptedWorkaround = suggested.workaround;
        return act('review', st);
      }
      if (action === 'submit') return submit(st);
      if (action === 'mine' && receipt) {
        return ui.go({ panel: 'known', tab: 'mine', item: receipt.id, step: '', submit: '' });
      }
      if (action === 'copy' && receipt) {
        var guideId = button.getAttribute('data-guide');
        var message = guideId ? catalog.find(function (d) { return d.id === guideId; }).guide.customerMessage : receipt.id;
        return ui.copy(message, document.getElementById('quick-copy-status'), guideId ? button.previousElementSibling : document.getElementById('quick-receipt-id'));
      }
      if (action === 'participate') {
        var snapshot = form;
        busy = true;
        ui.paint(st);
        return A.postQuickParticipation(button.getAttribute('data-id'), form.onBehalf || actor, actor).then(function (report) {
          if (snapshot !== form) return;
          busy = false;
          if (report) finish(report);
          else focusError(st, '', '참여를 기록하지 못했어요. 새 오류로 접수할 수 있어요.');
        });
      }
      if (action === 'back') {
        error = invalid = '';
        return ui.go({ step: 'problem' });
      }
      if (action === 'ai') return askAi(st);
      if (action === 'guide-failed') {
        form.finalType = 'DEFECT';
        ai = { state: 'ready' };
      }
      if (action === 'guide-later') return close(st);
      if (action === 'guide-solved') {
        if (restored) drafts.delete(actor);
        reset();
        return ui.close();
      }
      if (action === 'wide') wide = !wide;
      if (action === 'restore') {
        if (hasContent() && !window.confirm('지금 입력한 내용을 임시저장한 내용으로 바꿀까요?')) return;
        restoreDraft();
      }
      if (action === 'drop' && window.confirm('임시저장한 접수를 버릴까요?')) {
        drafts.delete(actor);
        offer = false;
      }
      if (action === 'save') {
        var snapshot = form;
        return A.previewQuickIntake(request(st)).then(function (preview) {
          if (snapshot !== form || !confirming) return;
          if (preview.blocked) {
            confirming = false;
            return focusError(st, '', '번호·이메일을 지우면 이 탭에 임시저장할 수 있어요.');
          }
          drafts.set(actor, { form: Object.assign({}, form, { customerNo: '' }), ai: ai && ai.state === 'ready' ? ai : null });
          reset();
          ui.close();
        });
      }
      if (action === 'discard') {
        if (restored) drafts.delete(actor);
        reset();
        return ui.close();
      }
      if (action === 'keep') confirming = false;
      if (action === 'many') {
        form.customerScope = form.customerScope === 'MANY' ? '' : 'MANY';
        invalidateAi();
      }
      if (action === 'toggle') {
        var key = button.getAttribute('data-key'), code = button.getAttribute('data-code');
        form[key] = form[key].includes(code) ? form[key].filter(function (value) { return value !== code; }) : form[key].concat(code);
      }
      ui.paint(st);
    }
    function invalidateAi() {
      if (ai && ai.type === form.finalType) form.finalType = 'UNCLASSIFIED';
      ai = null;
      form.condition = '';
    }
    function change(st, target, eventType) {
      var key = target.getAttribute('data-quick');
      if (!key) return;
      if (key === 'business' && form.business !== target.value) form.attemptedWorkaround = '';
      if (form[key] !== target.value && ['business', 'oneLine', 'detail', 'symptom', 'customerScope'].includes(key)) {
        invalidateAi();
      }
      form[key] = target.value;
      if (key === 'oneLine') {
        document.getElementById('quick-count').textContent = target.value.length + '/100자 · 고객 이름과 번호는 빼고 적어 주세요.';
        refreshAdvice();
      }
      if (invalid === key && target.value.trim()) {
        invalid = error = '';
        target.removeAttribute('aria-invalid');
        if (key === 'oneLine') target.setAttribute('aria-describedby', 'quick-count');
        else target.removeAttribute('aria-describedby');
        var message = document.getElementById('quick-error');
        if (message) message.remove();
      }
      if (eventType !== 'change' || target.tagName !== 'SELECT') return;
      if (key === 'symptom') form.extraSymptoms = form.extraSymptoms.filter(function (code) { return code !== form.symptom; });
      if (['business', 'symptom', 'customerScope', 'contact', 'condition'].includes(key)) ui.paint(st);
    }

    return { steps: steps, isStep: isStep, open: open, enter: enter, handoff: handoff, view: view, act: act,
      change: change, close: close, refreshAdvice: refreshAdvice, isWide: function () { return wide; },
      canSwitch: function () { return !confirming && !busy; },
      questionSeed: function (st) { return actor === owner(st) ? form.oneLine : ''; },
      onBehalf: function (st, value) {
        if (actor !== owner(st)) start(owner(st));
        if (value !== undefined) form.onBehalf = value;
        return form.onBehalf;
      } };
  };
})();
