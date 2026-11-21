#!/usr/bin/env python3
"""고객 동의 URL 키패드 오류 E2E (ADR-027, docs/10-seed-scenarios.md 5-3절).

E2E-01 신고 이력이 없는 FC 남다래(가상, U-013)의 한 건이 AI 문의 → 접수 → IT 결함 대장 → 상태 변경 → FC 경과 → 관리자 현황까지
       같은 신고번호로 이어지는지 본다(아는 조건은 다시 묻지 않음, 되묻기 ≤ 3, 임시조치 없음 안내, 업무 진행 어려움 기록,
       규칙 후보와 근거, 수동 연결, 수정 예정일은 담당자가 직접 등록).
E2E-02 같은 오류로 간편 알리기(ME_TOO): 확인 카드 → 참여 1건, 같은 요청·이미 연결된 접수는 새 기록 없음, 알림 받는 사람에 포함.
E2E-03 상담 정보 수정: 업무를 가입설계로 바꾸면 안내 사례·시도한 임시 방법·핵심 조건이 남지 않음.
E2E-04 관리자 집계: 한 FC가 같은 결함에 2건 → FC 한 줄·펼치면 2건, 업무 재개·진행 어려움·회신 없음을 섞지 않음.
E2E-05 개인정보: 본인확인 값 조각 차단, 공유 저장소에 질문 원문 없음, 고객 휴대전화 정보는 FC 진술로만.

브라우저 자동 검사는 화면 흐름만 확인한다. 실제 스마트폰 OS 키패드가 나타나는지는 검증하지 않는다(실제 기기에서 확인 필요).
"""
import tempfile

from intake_followup_check import evaluate, open_page
from sign_link_e2e_check import ASK
from ui_check import Chrome, find_browser

CONSENT = ASK + """
const QUESTION = '고객 휴대폰에서 동의 URL 뒷자리 키패드가 안 떠요';
const support = async (code) => { await click('[data-act=assistant-support][data-code=' + code + ']'); };
"""


def consult(chrome, support, checks):
    """추천 질문(고객 동의 키패드)으로 상담을 마친다. 결과 B → 업무 진행 어려움 → 담당자 확인용 항목."""
    evaluate(chrome, CONSENT + """
      await click('[data-index="3"]');
      await wait(() => $('.pn-assist-result[aria-busy="false"]'));
      const reply = $('#pn-assist-reply').innerText;
      assert(reply.includes('현재 확인된 임시조치가 없어요') && reply.includes('고객 동의 절차가 진행되지 않는 상황을 접수에 남길게요'),
        '임시조치 없음 안내(B)');
      const help = $('[data-help-path]');
      assert(help && help.textContent.includes('바로 전화·메신저로 연결하지는 않아요') && help.textContent.includes('본인확인을 건너뛰거나'),
        '사람의 도움 경로: 확인된 것만, 우회 안내 없음');
      assert(!document.querySelector('#intake-panel a[href^="tel:"]'), '가상 전화 연결 없음');
      assert(!asked().some(t => /어느 입력란|키패드는 어떻게|휴대전화에서 동의 URL/.test(t)), '질문 문장에서 아는 항목은 묻지 않음');
      assert($('#pn-assist-ask').textContent.includes('지금 이 고객님과 업무를 이어가기 어려운 상황인가요?'), '업무 진행 어려움 질문');
      assert(!$('[data-act=assistant-outcome]'), '임시조치가 없으면 "아직 안 돼요" 결과를 묻지 않음');
      await support('""" + support + """');
      const codes = """ + repr(checks) + """;
      for (const code of codes) { await answer(code); }
      await wait('[data-act=assistant-handoff]');
      const asks = asked().filter(t => /종류인가요|어디에서 여셨나요|기다리고 계신가요/.test(t));
      assert(asks.length === 3, '담당자 확인용 되묻기 3개 ' + asks.length);
      assert(document.querySelectorAll('#intake-panel .pn-btn').length === 1 && $('[data-act=assistant-quick]'), '주 버튼 하나 + 간편 알리기');
    """)


def check(chrome):
    chrome.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, chrome.session)

    # E2E-01 ①~④ FC 남다래: 상담 → 확인 화면 → 접수
    open_page(chrome, "index.html", "?selftest=1#role=FC&user=U-013&panel=intake&step=assistant")
    evaluate(chrome, CONSENT + """
      assert((await ApiClient.getMyReports('U-013')).length === 0, '신고 이력이 없는 FC');
    """)
    consult(chrome, "YES", ["ANDROID", "IN_APP", "YES"])
    report_id = evaluate(chrome, CONSENT + """
      await selftest('고객 동의 상담 끝');
      const before = (await ApiClient.getDefects({})).find(d => d.id === 'D-2026-007');
      const count = IntakeDemoStore.read().reports.length;
      await act('assistant-handoff');
      await wait('[data-consult-facts]');
      assert($('#quick-device').value === 'CUSTOMER_PHONE' && $('#quick-cond-INPUT_STEP').value === 'BACK' &&
        $('#quick-cond-KEYPAD_SYMPTOM').value === 'NO_KEYPAD' && $('#quick-cond-DEVICE_OS').value === 'ANDROID' &&
        $('#quick-cond-URL_PATH').value === 'IN_APP' && $('#quick-supportNeeded').value === 'YES' && !$('#quick-workOutcome'),
        '확인 화면 자동 채움(임시조치 결과 상자 없음)');
      const body = $('#pn-body').innerText;
      assert(body.includes('고객동의·본인확인') && body.includes('입력할 수 없어요') && body.includes('고객 상담 중') &&
        body.includes('승인된 임시조치 없음') && body.includes('D-2026-007'), '업무·증상·영향·임시조치 없음·안내 사례');
      await selftest('고객 동의 확인 화면');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const id = $('#quick-receipt-id').textContent.replace('접수번호 ', '').trim();
      assert(/^R-Q\\d+$/.test(id), '접수번호');
      assert($('#pn-body').innerText.includes('업무 진행 어려움'), '완료 화면 업무 상황');
      await selftest('고객 동의 완료 화면');
      const state = IntakeDemoStore.read(), saved = state.reports.find(r => r.id === id);
      assert(state.reports.length === count + 1, '신고 1건');
      assert(saved.business === 'CUSTOMER_CONSENT' && saved.symptom === 'CANNOT_INPUT' && saved.grade === 'IMMEDIATE' &&
        saved.departmentCode === 'CONSENT_IT' && saved.workaroundState === 'NONE' && saved.workOutcome === null &&
        saved.attemptedWorkaround === null && saved.supportNeeded === 'YES' && saved.incident.device === 'CUSTOMER_PHONE' &&
        saved.conditions.INPUT_STEP === 'BACK' && saved.conditions.KEYPAD_SYMPTOM === 'NO_KEYPAD' &&
        saved.conditions.DEVICE_OS === 'ANDROID' && saved.conditions.URL_PATH === 'IN_APP' && saved.urgent.includes('CONSULTING') &&
        saved.factSources.conditions === 'USER_REPORTED' && saved.factSources.supportNeeded === 'USER_REPORTED' &&
        saved.suggestedDefectId === 'D-2026-007' && !state.links[id], '허용 코드 저장, 연결 전');
      assert(!state.resumption[id] && !state.followups[id], '시도하지 않은 임시조치의 결과는 기록하지 않음');
      assert(await ApiClient.postWorkResumption(id, 'U-013', 'STILL') === null && !IntakeDemoStore.read().resumption[id],
        '임시조치를 시도하지 않은 접수에 "아직 안 돼요" 기록 거부');
      assert((await ApiClient.getDefects({})).find(d => d.id === 'D-2026-007').status === before.status, '결함 상태 그대로');
      return id;
    """)

    # E2E-01 ⑤ IT: 같은 번호 → 세 덩어리 → 규칙 후보·근거 → 수동 연결
    open_page(chrome, "ledger.html", "?selftest=1#role=IT&tab=unlinked")
    evaluate(chrome, CONSENT + """
      const id = '""" + report_id + """';
      await fill('#ld-q', id);
      $('#ld-search').requestSubmit();
      await click('[data-open="' + id + '"]');
      const facts = await wait('#ld-body [data-report-facts]');
      const heads = [...document.querySelectorAll('#ld-body h4')].map(h => h.textContent);
      assert(heads.join('|') === '① 신고자와 발생 환경|② 기존 결함과의 연관성|③ 담당자 처리', '신고 패널 세 덩어리 ' + heads.join('|'));
      const text = facts.innerText;
      assert(text.includes('고객 휴대전화 · FC가 알려 줌') && text.includes('뒷자리 입력') && text.includes('키패드가 안 나타남') &&
        text.includes('Android · FC가 알려 줌') && text.includes('앱 안 브라우저') && text.includes('승인된 임시조치 없음 · 결함 대장 기준') &&
        text.includes('업무 진행 어려움'), 'FC가 확인한 정보(값마다 출처)');
      const ai = await wait(() => $('#ld-body .ld-ai .ld-cands') && $('#ld-body .ld-ai'));
      const cand = ai.innerText;
      assert(cand.includes('규칙 후보') && cand.includes('D-2026-007') && cand.includes('업무: 고객동의·본인확인') &&
        cand.includes('증상: 입력할 수 없어요') && cand.includes('관련 조건: 문제가 생긴 입력란 뒷자리 입력') &&
        cand.includes('AI 문의: 안내한 사례') && cand.includes('연결된 신고 3건 · 영향 지점 3곳') && cand.includes('임시 방법 없음') &&
        !cand.includes('비슷함'), '추천 근거·연관 규모·기존 조치, 점수 없음');
      const sim = await ApiClient.postSimilarDefects(id);
      assert(sim.llmOutcome === 'RULE' && sim.candidates[0].defectId === 'D-2026-007' && sim.candidates.every(c => c.similarity === null) &&
        !sim.candidates.some(c => c.defectId === 'D-2026-001'), '다른 업무 결함은 후보 아님');
      const handling = $('#ld-body [data-report-handling]').innerText;
      assert($('#ld-body [data-report-trace]').innerText.includes('추가로 필요한 정보') && handling.includes('기술 검토 뒤') && handling.includes('예정일은 정해지지 않아요'),
        '담당자 처리: 추가 확인·수정 계획 맥락');
      assert(!IntakeDemoStore.read().links[id], '추천만으로는 연결되지 않음');
      await selftest('고객 동의 대장 신고 패널');
      await click('[data-ai-link="D-2026-007"]');
      await act('link-confirm');
      await wait(() => $('#ledger-dialog') && $('#ledger-dialog').innerText.includes('신고를 묶었어요'));
      assert(IntakeDemoStore.read().links[id] === 'D-2026-007', '담당자가 묶어야 연결');
      const d = await ApiClient.getDefect('D-2026-007');
      assert(d.reports.some(r => r.id === id) && d.status === 'RECEIVED' && !d.plannedFixDate, '연결돼도 상태·예정일은 그대로');
    """)

    # E2E-01 ⑥ IT: 현장 조건 모아 보기 → 기술 검토 뒤 수정 예정(가상 날짜) → 알림 미리보기 → 확정
    open_page(chrome, "ledger.html", "?selftest=1#role=IT&item=D-2026-007")
    evaluate(chrome, CONSENT + """
      const summary = (await wait('#ld-body [data-field-summary]')).innerText;
      assert(summary.includes('뒷자리 입력 4건') && summary.includes('Android 2건') && summary.includes('업무 진행 어려움(추가 지원 필요) 3건') &&
        summary.includes('실제 기기에서 확인한 값이 아니에요'), '현장 조건 모아 보기(가상 데이터에서 계산)');
      await selftest('고객 동의 결함 상세');
      await act('status');
      await click('[data-to=FIX_PLANNED]');
      await click('[data-act=next][data-step=pick]');
      await wait(() => $('#ledger-dialog') && $('#ledger-dialog').innerText.includes('기술 검토 뒤 정한 고칠 날짜'));   // 수정 계획 시간 맥락
      await fill('#ld-date', '2026-12-04');
      await click('[data-act=next][data-step=detail]');
      const preview = await wait(() => $('#ledger-dialog').innerText.includes('남다래(가상)') && $('#ledger-dialog'));
      assert(preview.innerText.includes('12월 4일') && preview.innerText.includes('임시 방법은 아직 없어요') &&
        !preview.innerText.includes('안내된 임시 방법을 써 주세요'), '임시 방법이 없는 결함의 알림 문구');
      assert((await ApiClient.getDefects({})).find(d => d.id === 'D-2026-007').status === 'RECEIVED', '확정 전에는 상태 그대로');
      await act('confirm');
      await wait(() => $('#ledger-dialog').innerText.includes('보냈어요'));
      assert((await ApiClient.getDefects({})).find(d => d.id === 'D-2026-007').status === 'FIX_PLANNED', '담당자 조작으로만 수정 예정');
    """)

    # E2E-01 ⑦ FC 남다래: 알림 → 내 접수내역 같은 카드
    open_page(chrome, "index.html", "?selftest=1#role=FC&user=U-013&popup=alarm")
    evaluate(chrome, CONSENT + """
      const id = '""" + report_id + """';
      await click('[data-kn-report="' + id + '"]');
      const card = await wait(() => location.hash.includes('item=' + id) && $('#kn-body .kn-card.is-target'));
      const text = card.innerText;
      assert(text.includes('담당자가 확인했어요') && text.includes('현재 확인된 임시조치가 없어요') && text.includes('12월 4일에 고칠 예정이에요'),
        'FC 카드: 임시조치 없음·수정 예정');
      assert(!card.querySelector('[data-resume]'), '임시 방법이 없으면 업무 재개 회신 버튼 없음');
      await selftest('고객 동의 FC 카드');
    """)

    # E2E-02 간편 알리기: 같은 지점 FC 정다솜(가상, U-011)
    open_page(chrome, "index.html", "?selftest=1#role=FC&user=U-011&panel=intake&step=assistant")
    consult(chrome, "NO", ["UNKNOWN", "UNKNOWN", "NO"])
    quick_id = evaluate(chrome, CONSENT + """
      const count = IntakeDemoStore.read().reports.length;
      await act('assistant-quick');
      const card = await wait('[data-quick-confirm]');
      assert(card.innerText.includes('고객 동의 URL에서 뒷자리 숫자 키패드가 열리지 않아요') && card.innerText.includes('뒷자리 입력') &&
        card.innerText.includes('승인된 임시조치 없음'), '간편 알리기 확인 카드');
      assert($('#pn-assist-form').hidden && !$('#pn-assist-form').getClientRects().length, '확인 중에는 질문 입력란 숨김');
      assert(IntakeDemoStore.read().reports.length === count, 'FC가 확인하기 전에는 기록 없음');
      await selftest('간편 알리기 확인');
      await act('assistant-quick-confirm');
      await wait('#quick-receipt-id');
      assert($('#pn-body').innerText.includes('같은 오류 참여가 기록됐어요'), '참여 완료');
      const state = IntakeDemoStore.read(), saved = state.reports.at(-1);
      assert(state.reports.length === count + 1 && saved.kind === 'ME_TOO' && saved.defectId === 'D-2026-007' &&
        saved.conditions.INPUT_STEP === 'BACK' && saved.workaroundState === 'NONE' && saved.workOutcome === null &&
        saved.supportNeeded === 'NO' && saved.incident.device === 'CUSTOMER_PHONE', '참여 1건(허용 코드만)');
      const again = await ApiClient.postQuickParticipation('D-2026-007', 'U-011', 'U-011', { requestId: saved.requestId });
      assert(again.duplicate && again.id === saved.id && IntakeDemoStore.read().reports.length === count + 1, '같은 요청 재시도는 새 기록 없음');
      const linked = await ApiClient.postQuickParticipation('D-2026-007', 'U-012', 'U-012', { requestId: 'other' });
      assert(linked.duplicate && linked.id === 'R-073' && IntakeDemoStore.read().reports.length === count + 1, '이미 연결된 접수가 있으면 새 기록 없음');
      assert((await ApiClient.getMyReports('U-011')).some(r => r.id === saved.id), '내 접수내역에 참여');
      const preview = await ApiClient.postStatusPreview('D-2026-007', { from: 'FIX_PLANNED', to: 'WONT_FIX', wontFixReasonCode: 'ETC' });
      assert(preview.recipients.some(r => r.userId === 'U-011' && r.reportId === saved.id), '알림 받는 사람에 포함');
      return saved.id;
    """)
    evaluate(chrome, CONSENT + """
      await act('quick-mine');
      await wait('#kn-body .kn-card.is-target');
      location.hash = '#role=FC&user=U-011&panel=intake&step=assistant';
      await wait('[data-index="3"]');
      await click('[data-index="3"]');
      await support('NO');
      for (const code of ['UNKNOWN', 'UNKNOWN', 'NO']) { await answer(code); }
      const count = IntakeDemoStore.read().reports.length;
      await act('assistant-quick');
      await act('assistant-quick-confirm');
      await wait('#quick-receipt-id');
      assert($('#pn-body').innerText.includes('이미 이 오류로 알린 접수가 있어요') && $('#quick-receipt-id').textContent.includes('""" + quick_id + """') &&
        IntakeDemoStore.read().reports.length === count, '두 번 알려도 기존 접수');
    """)

    # E2E-03 상담 정보 수정: 고객 동의 → 가입설계, 전자서명(시도한 임시 방법) → 가입설계
    open_page(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=assistant")
    consult(chrome, "UNKNOWN", ["UNKNOWN", "UNKNOWN", "UNKNOWN"])
    evaluate(chrome, CONSENT + """
      await act('assistant-handoff');
      await wait('[data-consult-facts]');
      await act('quick-back');
      await fill('#quick-business', 'DESIGN');
      await act('quick-review');
      await wait('#quick-consult-note');
      assert($('#quick-consult-note').textContent.includes('AI 문의에서 안내한 사례를 뺐어요') && !$('#quick-cond-INPUT_STEP') &&
        !$('#pn-body').innerText.includes('D-2026-007') && !$('#pn-body').innerText.includes('승인된 임시조치 없음'), '안내 사례·핵심 조건 제거');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const saved = IntakeDemoStore.read().reports.at(-1);
      assert(saved.business === 'DESIGN' && saved.suggestedDefectId === null && saved.workaroundState === null &&
        !saved.conditions.INPUT_STEP && !saved.conditions.KEYPAD_SYMPTOM && saved.attemptedWorkaround === null, '다른 업무 접수에 이전 사례가 남지 않음');
      const sim = await ApiClient.postSimilarDefects(saved.id);
      assert(!sim.candidates.some(c => c.defectId === 'D-2026-007'), '고객 동의 결함 추천 근거 무효화');
      const direct = await ApiClient.postQuickIntake({ requestId: 'e2e-03-direct', reporterId: 'U-001', submittedById: 'U-001',
        business: 'DESIGN', symptom: 'NOT_SHOWN', oneLine: '보험료가 늦게 떠요', urgent: [], extraSymptoms: [], incident: {},
        suggestedDefectId: 'D-2026-007', workaroundState: 'NONE', workOutcome: 'STILL', attemptedWorkaround: 'x' });
      const stored = IntakeDemoStore.read().reports.find(r => r.id === direct.id);
      assert(stored.suggestedDefectId === null && stored.workOutcome === null && stored.attemptedWorkaround === null,
        '저장할 때도 다른 업무 안내 사례·임시조치 없는 결과를 버림');
    """)
    open_page(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=assistant")
    evaluate(chrome, CONSENT + """
      await click('[data-index="1"]');
      await answer('YES');
      await click('[data-act=assistant-outcome][data-code=RESUMED]');
      for (const code of ['CUSTOMER_PHONE', 'YES']) { await answer(code); }
      await act('assistant-handoff');
      await wait('[data-consult-facts]');
      assert($('#pn-body').innerText.includes('알림톡 대신 문자로'), '시도한 임시 방법 인계');
      await act('quick-back');
      await fill('#quick-business', 'DESIGN');
      await act('quick-review');
      await wait('#quick-consult-note');
      assert(!$('#pn-body').innerText.includes('알림톡 대신 문자로') && !$('#quick-cond-SEMINAR_HISTORY'), '시도한 임시 방법·조건 제거');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const state = IntakeDemoStore.read(), saved = state.reports.at(-1);
      assert(saved.attemptedWorkaround === null && saved.workOutcome === null && saved.suggestedDefectId === null &&
        !state.resumption[saved.id], '시도하지 않은 임시조치·업무 재개가 남지 않음');
    """)

    # E2E-04 관리자 집계: 조은별(가상, U-012)이 같은 결함에 두 번째 신고 → IT 연결 → FC 한 줄
    open_page(chrome, "index.html", "?selftest=1#role=FC&user=U-012&panel=intake&step=problem")
    second = evaluate(chrome, CONSENT + """
      await fill('#quick-business', 'CUSTOMER_CONSENT');
      await fill('#quick-oneLine', '동의 URL 뒷자리 칸에서 키패드가 또 안 나와요');
      await act('quick-review');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const id = $('#quick-receipt-id').textContent.replace('접수번호 ', '').trim();
      assert(await ApiClient.postLinkReport('D-2026-007', id), 'IT가 연결');
      return id;
    """)
    open_page(chrome, "index.html", "?selftest=1#role=MANAGER&board=known&panel=known&tab=team&item=D-2026-007")
    evaluate(chrome, CONSENT + """
      const card = await wait('#kn-body .kn-card.is-target');
      const rows = card.querySelectorAll('[data-fc="U-012"]');
      assert(rows.length === 1, '같은 FC는 한 줄 ' + rows.length);
      const row = rows[0], head = row.querySelector('summary').textContent;
      assert(head.includes('조은별(가상) FC') && head.includes('관련 신고 2건') && head.includes('최근 업무 상황: 임시조치 미확인'), 'FC 한 줄 요약 ' + head);
      row.querySelector('summary').click();
      await wait(() => row.open);
      assert(row.querySelectorAll('dt').length === 2 && row.textContent.includes('R-073') && row.textContent.includes('""" + second + """'),
        '펼치면 신고 2건');
      assert(card.querySelectorAll('[data-fc]').length === 3 && card.querySelector('.kn-meta').textContent.startsWith('FC 3명'),
        '결함 카드의 FC 수 = 줄 수');
      const nada = card.querySelector('[data-fc="U-013"] summary').textContent;
      assert(nada.includes('남다래(가상) FC') && nada.includes('최근 업무 상황: 업무 진행 어려움'), '진행 어려움 FC');
      const summary = $('[data-team-summary]').innerText;
      const line = (label) => summary.split('\\n').find((t, i, all) => all[i - 1] === label) || '';
      assert(line('업무를 못 함').includes('남다래(가상)') && !line('업무를 못 함').includes('조은별(가상)'),
        '회신 없음·미확인을 업무 중단으로 세지 않음 ' + summary);
      assert(line('추가 확인 필요').includes('조은별(가상)'), '추가 확인이 필요한 FC');
      const sign = [...document.querySelectorAll('#kn-body .kn-card')].find(c => c.getAttribute('data-id') === 'D-2026-001');
      assert(sign.querySelector('[data-fc="U-012"] summary').textContent.includes('회신 없음') &&
        sign.querySelector('[data-fc="U-011"] summary').textContent.includes('업무 재개'), '업무 재개와 회신 없음 구분');
      const mine = (await ApiClient.getBranchReports('U-010')).filter(r => r.defectId === 'D-2026-007');
      assert(mine.every(r => !r.maskedText) && mine.every(r => ['U-011', 'U-012', 'U-013'].includes(r.reporter.id)),
        '같은 지점 FC만, 설명 원문 없음');
      await selftest('관리자 FC별 묶음');
    """)

    # E2E-05 개인정보: 본인확인 값 조각 차단, 저장소에 원문 없음, 고객 기기 정보는 FC 진술
    open_page(chrome, "index.html", "?selftest=1#role=FC&user=U-013&panel=intake&step=assistant")
    evaluate(chrome, CONSENT + """
      for (const text of ['고객 주민번호 뒷자리 1234567 입력하면 키패드가 안 떠요', '뒷자리 1 누르면 키패드가 안 떠요', '생년월일 900101 넣으면 안 돼요']) {
        assert((await ApiClient.postIntakeQuestion({ text })).outcome === 'BLOCKED', '차단: ' + text);
      }
      assert((await ApiClient.postIntakeQuestion({ text: QUESTION })).outcome === 'MATCH', '값 없는 설명은 그대로');
      assert((await ApiClient.previewQuickIntake({ oneLine: '앞자리 12 입력 후 멈춤', detail: '', screen: '' })).blocked, '접수 설명도 차단');
      const count = IntakeDemoStore.read().reports.length;
      await fill('#pn-assist-text', '주민번호 뒷자리 7 입력 칸에서 키패드가 안 떠요');
      $('#pn-assist-form').requestSubmit();
      await wait(() => $('#pn-body .pn-err') || $('#pn-foot .pn-err') || $('.pn-assist-foot .pn-err'));
      assert(IntakeDemoStore.read().reports.length === count, '차단 입력은 저장 0건');
      const dump = JSON.stringify(IntakeDemoStore.read()) + JSON.stringify(localStorage);
      assert(!dump.includes(QUESTION) && !dump.includes('키패드가 안 떠요') && !/주민|뒷자리\\s*\\d/.test(dump), '공유 저장소에 질문 원문·본인확인 값 없음');
      const consent = IntakeDemoStore.read().reports.filter(r => r.business === 'CUSTOMER_CONSENT' || r.defectId === 'D-2026-007');
      assert(consent.length >= 2 && consent.every(r => !Object.values(r.factSources || {}).includes('BROWSER_CAPTURED') &&
        (!r.diagnostics || (!r.diagnostics.incident.device && !r.diagnostics.incident.browser))), '고객 휴대전화 정보는 자동 수집으로 표시하지 않음');
    """)

    # 업무 재개 기록 한 번(ADR-027 결정 10): 첫 기록 실패 → 접수번호 유지·[다시 기록하기] → 1건, 같은 회신 다시 보내도 1건
    open_page(chrome, "index.html", "?selftest=1#role=FC&user=U-002&panel=intake&step=assistant&resume=fail")
    evaluate(chrome, CONSENT + """
      await click('[data-index="1"]');
      await answer('YES');
      await click('[data-act=assistant-outcome][data-code=STILL]');
      for (const code of ['CUSTOMER_PHONE', 'YES']) { await answer(code); }
      await act('assistant-handoff');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const id = $('#quick-receipt-id').textContent.replace('접수번호 ', '').trim();
      assert($('#quick-resume-failed') && $('#pn-body').innerText.includes('아직 기록하지 못했어요'), '접수 성공과 회신 실패를 따로 표시');
      assert(!IntakeDemoStore.read().resumption[id], '실패한 회신은 다시 부르지 않음(반복 호출 없음)');
      await selftest('업무 재개 기록 실패');
      await act('quick-resume-retry');
      await wait(() => !$('#quick-resume-failed'));
      let state = IntakeDemoStore.read();
      assert(state.resumption[id].result === 'STILL' && state.followups[id].length === 1 && $('#pn-body').innerText.includes('접수에 기록했어요'),
        '다시 기록하기 → 1건');
      const again = await ApiClient.postWorkResumption(id, 'U-002', 'STILL', id + ':STILL');
      const same = await ApiClient.postWorkResumption(id, 'U-002', 'STILL');
      state = IntakeDemoStore.read();
      assert(again.duplicate && same.duplicate && state.followups[id].length === 1, '같은 회신을 다시 받아도 후속 기록 1건');
    """)

if __name__ == "__main__":
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    with tempfile.TemporaryDirectory(prefix="consent-keypad-e2e-") as profile:
        chrome = Chrome(browser, profile)
        try:
            check(chrome)
            print("PASS: E2E-01 고객 동의 키패드(같은 신고번호: 빠른 도움 → 접수 → 대장 세 덩어리·수동 연결 → 수정 예정 → FC·관리자), "
                  "E2E-02 간편 알리기(중복 없음), E2E-03 상담 정보 수정, E2E-04 관리자 FC별 집계, E2E-05 개인정보, 업무 재개 기록 한 번")
        finally:
            chrome.close()
