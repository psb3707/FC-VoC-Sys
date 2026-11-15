#!/usr/bin/env python3
"""전자서명 오류 E2E (ADR-026): 한 건의 신고가 FC → AI → IT → FC·관리자로 같은 신고번호로 이어지는지 확인한다.

① FC AI 문의 → ② 되묻기(기기·초대장·고객 대기) → ③ 임시 방법 결과(진행했어요, 결함 상태 불변)
→ ④ 확인 화면 자동 채움 → 첫 제출 실패·재시도(번호 1개) → ⑤ IT 대장 찾기·발생 조건·규칙 후보·수동 연결
→ ⑥ 수정 예정(가상 날짜) 미리보기·확정 → ⑦ FC 알림 → 같은 접수 카드 → ⑧ 관리자 [지점 FC 문의].
이어서 아직 안 돼요·확인할 수 없어요·대리 접수·수정한 값·기존 추천 동작을 회귀로 본다.
페이지를 다시 열 때마다 같은 브라우저 저장소를 읽으므로 역할 전환·새로고침 일관성도 함께 확인된다.
"""
import tempfile

from intake_followup_check import evaluate, open_page
from ui_check import Chrome, find_browser

ASK = """
// 지금 화면에 자체 검사(크기·대비·겹침·주 버튼 하나, js/dev/selftest.js)를 다시 돌린다
const selftest = async (name) => {
  await wait(() => window.SfaSelftest);
  document.getElementById('selftest-result')?.remove();
  window.SfaSelftest();
  const result = JSON.parse((await wait('#selftest-result')).textContent);
  const bad = result.checks.filter(c => !c.pass).map(c => c.name + ': ' + JSON.stringify(c.detail).slice(0, 200));
  assert(!bad.length, name + ' 자체 검사 실패 ' + bad.join(' / '));
};
const answer = async (code) => { await click('[data-act=assistant-check][data-code=' + code + ']'); };
const asked = () => [...document.querySelectorAll('#pn-body .pn-assist-ai')].map(x => x.textContent);
"""


def consult(chrome, device, seminar, waiting, outcome):
    """추천 질문 "서명 알림톡을 열면 초대장이 떠요"로 상담을 마치고 [확인한 내용으로 접수하기]까지 간다."""
    evaluate(chrome, ASK + """
      await click('[data-index="1"]');
      await wait(() => $('#pn-assist-ask') && $('#pn-assist-ask').textContent.includes('휴대전화'));
      assert(!$('.pn-assist-result'), '되묻기 전에는 결과를 보이지 않음');
      assert(!$('[data-act=assistant-handoff]'), '되묻기 중에는 주 버튼 없음');
      await selftest('되묻기 화면');
      await answer('""" + device + """');
      await wait(() => $('#pn-assist-ask').textContent.includes('초대장'));
      await answer('""" + seminar + """');
      await wait(() => $('#pn-assist-ask').textContent.includes('기다리고'));
      await answer('""" + waiting + """');
      await wait(() => $('.pn-assist-result[aria-busy="false"]'));
      assert($('#pn-assist-reply').innerText.includes('알림톡 대신 문자로 서명 링크를 보내 주세요'), '승인된 임시 방법(대장 문장)');
      assert($('#pn-assist-reply').innerText.includes('② 근본 오류는 언제 고쳐지나요?'), '근본 수정 진행');
      assert(!$('[data-act=assistant-draft]'), '되묻기 상담에서는 초안 만들기 알약을 숨김');
      assert(asked().filter(t => t.includes('휴대전화에서')).length === 1, '같은 항목을 다시 묻지 않음');
      await wait('#pn-assist-ask');
      assert($('#pn-assist-ask').textContent.includes('문자로 서명 링크를 보내니 청약을 진행할 수 있었나요?'), '임시 방법 결과 질문');
      const before = (await ApiClient.getDefects({})).find(d => d.id === 'D-2026-001').status;
      const reports = IntakeDemoStore.read().reports.length;
      await click('[data-act=assistant-outcome][data-code=""" + outcome + """]');
      await wait('[data-act=assistant-handoff]');
      assert(document.querySelectorAll('#intake-panel .pn-btn').length === 1, '주 버튼 하나');
      await selftest('임시 방법 결과 뒤');
      assert((await ApiClient.getDefects({})).find(d => d.id === 'D-2026-001').status === before, '임시 방법 결과가 결함 상태를 바꾸지 않음');
      assert(IntakeDemoStore.read().reports.length === reports, '접수 전에는 기록하지 않음');
      await act('assistant-handoff');
      await wait('[data-consult-facts]');
      await selftest('확인 화면');
    """)


def check(chrome):
    chrome.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, chrome.session)

    # ①~④ FC: 상담 → 확인 화면 → 첫 제출 실패 → 재시도 → 같은 번호
    open_page(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=assistant")
    consult(chrome, "CUSTOMER_PHONE", "YES", "YES", "RESUMED")
    report_id = evaluate(chrome, ASK + """
      assert($('#quick-device').value === 'CUSTOMER_PHONE' && $('#quick-seminarHistory').value === 'YES' &&
        $('#quick-workOutcome').value === 'RESUMED', '기기·조건·업무 재개 자동 반영');
      const body = $('#pn-body').innerText;
      assert(body.includes('청약·서명') && body.includes('엉뚱한 화면이 떠요') && body.includes('고객 상담 중') &&
        body.includes('알림톡 대신 문자로 서명 링크를 보내 주세요') && body.includes('D-2026-001'), '업무·증상·영향·시도·안내 사례 반영');
      const count = IntakeDemoStore.read().reports.length;
      window.SfaHash.update({ submit: 'fail' });
      await act('quick-submit');
      await wait('#quick-error');
      assert(IntakeDemoStore.read().reports.length === count && $('#quick-device').value === 'CUSTOMER_PHONE', '실패해도 입력 유지, 번호 없음');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const id = $('#quick-receipt-id').textContent.replace('접수번호 ', '').trim();
      assert(/^R-Q\\d+$/.test(id), '접수번호 R-Q…');
      await selftest('완료 화면');
      assert($('#pn-body').innerText.includes('진행했어요 · 접수에 기록했어요'), '완료 화면의 업무 재개 기록');
      const state = IntakeDemoStore.read(), saved = state.reports.find(r => r.id === id);
      assert(state.reports.length === count + 1, '재시도해도 1건');
      const again = await ApiClient.postQuickIntake({ requestId: saved.requestId, reporterId: 'U-001', submittedById: 'U-001',
        business: 'SUBSCRIPTION', oneLine: 'x', urgent: [], extraSymptoms: [], incident: {} });
      assert(again.id === id && IntakeDemoStore.read().reports.length === count + 1, '같은 요청은 같은 번호');
      assert(saved.origin === 'ASSISTANT' && saved.incident.device === 'CUSTOMER_PHONE' && saved.conditions.SEMINAR_HISTORY === 'YES' &&
        saved.urgent.includes('CONSULTING') && saved.attemptedWorkaround === '알림톡 대신 문자로 서명 링크를 보내 주세요' &&
        saved.suggestedDefectId === 'D-2026-001' && saved.workOutcome === 'RESUMED' && saved.factSources.device === 'USER_REPORTED' &&
        saved.factSources.attempted === 'DEFECT_LEDGER' && !saved.defectId && !state.links[id], '허용 코드·출처 저장, 연결 전');
      assert(state.resumption[id].result === 'RESUMED', '접수 뒤 신고자 본인 업무 재개 회신');
      assert(!JSON.stringify(state).includes('초대장이 떠요'), '공유 저장소에 질문 원문 없음');
      assert((await ApiClient.getDefects({})).find(d => d.id === 'D-2026-001').status === 'WORKAROUND', '결함 상태 그대로');
      return id;
    """)

    # ⑤ IT: 같은 번호 찾기 → 발생 조건 → 규칙 후보(연결 전 유지) → 담당자가 묶기
    open_page(chrome, "ledger.html", "?selftest=1#role=IT&tab=unlinked")
    evaluate(chrome, ASK + """
      const id = '""" + report_id + """';
      await fill('#ld-q', id);
      $('#ld-search').requestSubmit();
      await click('[data-open="' + id + '"]');
      const facts = await wait('#ld-body [data-report-facts]');
      const text = facts.innerText;
      assert(text.includes('고객 휴대전화 · FC가 알려 줌') && text.includes('초대장 발송 이력') && text.includes('있음 · FC가 알려 줌') &&
        text.includes('고객 상담 중') && text.includes('알림톡 대신 문자로') && text.includes('진행했어요'), 'IT가 보는 발생 조건·업무 재개');
      const ai = await wait(() => $('#ld-body .ld-ai .ld-cands') && $('#ld-body .ld-ai'));
      assert(ai.innerText.includes('규칙 후보') && ai.innerText.includes('D-2026-001') && ai.innerText.includes('업무: 청약·서명') &&
        ai.innerText.includes('증상: 엉뚱한 화면이 떠요') && ai.innerText.includes('관련 조건: 초대장 발송 이력 있음') &&
        !ai.innerText.includes('비슷함'), '추천 근거, 비슷함 정도 없음');
      const sim = await ApiClient.postSimilarDefects(id);
      assert(sim.llmOutcome === 'RULE' && sim.needsHumanReview && sim.candidates.length <= 3 && sim.candidates[0].defectId === 'D-2026-001' &&
        new Set(sim.candidates.map(c => c.defectId)).size === sim.candidates.length, '규칙 후보 ≤ 3·중복 없음');
      assert(!IntakeDemoStore.read().links[id], '추천만으로는 연결되지 않음');
      await selftest('대장 신고 패널');
      await click('[data-ai-link="D-2026-001"]');
      await act('link-confirm');
      await wait(() => $('#ledger-dialog') && $('#ledger-dialog').innerText.includes('신고를 묶었어요'));
      assert(IntakeDemoStore.read().links[id] === 'D-2026-001', '담당자가 묶어야 연결');
      const d = await ApiClient.getDefect('D-2026-001');
      assert(d.reports.some(r => r.id === id), '결함의 신고 목록에 같은 번호');
    """)

    # ⑥ IT: 임시조치 → 수정 예정(가상 날짜) → 알림 미리보기 → 확정
    open_page(chrome, "ledger.html", "?selftest=1#role=IT&item=D-2026-001")
    evaluate(chrome, ASK + """
      await act('status');
      await click('[data-to=FIX_PLANNED]');
      await click('[data-act=next][data-step=pick]');
      await fill('#ld-date', '2026-11-27');
      await click('[data-act=next][data-step=detail]');
      const preview = await wait(() => $('#ledger-dialog').innerText.includes('알림') && $('#ledger-dialog').innerText.includes('김하늘(가상)') && $('#ledger-dialog'));
      assert(preview.innerText.includes('11월 27일'), '미리보기 문구에 예정일');
      await act('confirm');
      await wait(() => $('#ledger-dialog').innerText.includes('보냈어요'));
      assert((await ApiClient.getDefects({})).find(d => d.id === 'D-2026-001').status === 'FIX_PLANNED', '수정 예정');
      await click('[data-act=close-dialog]');
      const item = await wait(() => [...document.querySelectorAll('#ld-body [data-report-facts]')].length && $('#ld-body'));
      assert(item.innerText.includes('""" + report_id + """'), '상세의 묶인 신고에 같은 번호');
      await selftest('대장 결함 상세');
    """)

    # ⑦ FC: 알림 → 같은 접수 카드(지금 할 일·예정일·업무 재개)
    open_page(chrome, "index.html", "?selftest=1#role=FC&popup=alarm")
    evaluate(chrome, ASK + """
      const id = '""" + report_id + """';
      await click('[data-kn-report="' + id + '"]');
      const card = await wait(() => location.hash.includes('item=' + id) && $('#kn-body .kn-card.is-target'));
      const text = card.innerText;
      assert(text.includes('담당자가 확인했어요') && text.includes('알림톡 대신 문자로 서명 링크를 보내 주세요') &&
        text.includes('11월 27일에 고칠 예정이에요'), 'FC 카드: 지금 할 일·근본 수정 예정');
      assert(card.querySelector('[data-resume=RESUMED][aria-pressed=true]'), 'FC 카드: 업무 재개 진행했어요');
      await selftest('FC 카드');
    """)

    # ⑧ 관리자 [지점 FC 문의]: 같은 지점 FC의 같은 번호, 회신과 수정 계획(설명 원문 없음)
    open_page(chrome, "index.html", "?selftest=1#role=MANAGER&board=known&panel=known&tab=team&item=D-2026-001")
    evaluate(chrome, ASK + """
      const card = await wait('#kn-body .kn-card.is-target');
      assert(card.innerText.includes('김하늘(가상)') && card.innerText.includes('업무 재개 회신: 진행했어요') &&
        card.innerText.includes('11월 27일에 고칠 예정이에요'), '관리자: FC 회신과 수정 계획');
      const mine = (await ApiClient.getBranchReports('U-010')).find(r => r.id === '""" + report_id + """');
      assert(mine && !mine.maskedText && mine.workResumption.result === 'RESUMED', '관리자에게 설명 원문 없음');
      await selftest('관리자 지점 FC 문의');
    """)

    # 회귀: 아직 안 돼요 + 값 수정 / 확인할 수 없어요 + 모름 / 대리 접수
    open_page(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=assistant")
    consult(chrome, "UNKNOWN", "UNKNOWN", "NO", "STILL")
    evaluate(chrome, ASK + """
      assert($('#quick-device').value === 'UNKNOWN' && !$('#pn-body').innerText.includes('고객 상담 중'), '모름·대기 아님 반영');
      await fill('#quick-device', 'PHONE');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const state = IntakeDemoStore.read(), saved = state.reports.at(-1);
      assert(saved.incident.device === 'PHONE' && saved.conditions.SEMINAR_HISTORY === 'UNKNOWN' && saved.factSources.conditions === 'UNKNOWN' &&
        saved.workOutcome === 'STILL', '고친 값으로 제출');
      assert(state.resumption[saved.id].result === 'STILL' && state.followups[saved.id][0].action === 'STILL', '아직 안 돼요는 후속 기록');
    """)
    open_page(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=assistant")
    consult(chrome, "SAME", "NO", "YES", "UNKNOWN")
    evaluate(chrome, ASK + """
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const state = IntakeDemoStore.read(), saved = state.reports.at(-1);
      assert(saved.workOutcome === 'UNKNOWN' && !state.resumption[saved.id] && !saved.attemptedWorkaround, '확인할 수 없어요: 회신·시도 없음');
      const sim = await ApiClient.postSimilarDefects(saved.id);
      assert(sim.candidates[0].defectId === 'D-2026-001' && !sim.candidates[0].matched.includes('CONDITION'), '조건이 다르면 근거에서 뺌');
    """)
    open_page(chrome, "index.html", "?selftest=1#role=MANAGER&panel=intake&step=problem")
    evaluate(chrome, ASK + """
      await fill('#pn-proxy-select', 'U-011');
      await click('.pn-head #pn-mode-toggle');
      await click('[data-index="1"]');
      for (const code of ['CUSTOMER_PHONE', 'YES', 'YES']) { await wait('[data-act=assistant-check]'); await answer(code); }
      await click('[data-act=assistant-outcome][data-code=RESUMED]');
      await act('assistant-handoff');
      await wait('[data-consult-facts]');
      assert($('#quick-proxy-outcome') && !$('#quick-workOutcome'), '대리 접수: 업무 재개를 정하지 않음');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const state = IntakeDemoStore.read(), saved = state.reports.at(-1);
      assert(saved.reporterId === 'U-011' && saved.workOutcome === null && !state.resumption[saved.id], '관리자는 FC 대신 회신하지 않음');
    """)

    # 회귀: 기존 고정 추천·규칙 대체·후보 없음, 사용법 문의
    open_page(chrome, "ledger.html", "?selftest=1#role=SALES&tab=unlinked&item=R-061")
    evaluate(chrome, ASK + """
      const fixed = await ApiClient.postSimilarDefects('R-061');
      assert(fixed.llmOutcome === 'OK' && fixed.candidates[0].similarity === 'HIGH', '고정 응답 유지');
      assert((await ApiClient.postSimilarDefects('R-062')).candidates.length === 0, '후보 없음 유지');
      ApiClient.setProto({ llm: 'fail' });
      assert((await ApiClient.postSimilarDefects('R-061')).llmOutcome === 'FALLBACK', '실패 시 규칙 대체 유지');
    """)
    open_page(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=assistant")
    evaluate(chrome, ASK + """
      await click('[data-index="0"]');
      await wait(() => $('.pn-assist-result[aria-busy="false"]'));
      assert(!$('[data-act=assistant-check]') && $('[data-act=assistant-handoff]') && $('[data-act=assistant-draft]'), '사용법 문의는 기존 흐름');
    """)


if __name__ == "__main__":
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    with tempfile.TemporaryDirectory(prefix="sign-link-e2e-") as profile:
        chrome = Chrome(browser, profile)
        try:
            check(chrome)
            print("PASS: AI 되묻기·임시 방법 결과 → 접수 인계·재시도 1건 → 대장 발생 조건·규칙 후보·수동 연결 → 수정 예정 알림 → FC·관리자 경과(같은 신고번호), 회귀")
        finally:
            chrome.close()
