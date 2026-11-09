#!/usr/bin/env python3
"""Check the simulated intake → ledger → resolution → follow-up flow in one browser."""
import tempfile

from ui_check import Chrome, STATIC, find_browser


def evaluate(chrome, expression):
    result = chrome.send("Runtime.evaluate", {
        "expression": "(async () => {" + HELPERS + expression + "})()",
        "awaitPromise": True, "returnByValue": True,
    }, chrome.session)
    if result.get("exceptionDetails"):
        raise AssertionError(result["exceptionDetails"].get("exception", {}).get("description"))
    return result["result"].get("value")


HELPERS = """
const $ = (s) => document.querySelector(s);
const assert = (ok, message) => { if (!ok) throw Error(message + ' ' + location.hash); };
const wait = async (check) => {
  for (let i = 0; i < 80; i++) {
    const value = typeof check === 'string' ? $(check) : check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw Error('화면 상태를 기다리다 실패: ' + check + ' ' + location.hash);
};
const click = async (selector) => (await wait(selector)).click();
const act = (name) => click('[data-act="' + name + '"]');
const fill = async (selector, value) => {
  const input = await wait(selector);
  input.value = value;
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
};
await window.SFA_READY;
"""


def open_page(chrome, file, address):
    chrome.open((STATIC / file).as_uri() + address, 1280, 900)
    chrome.send("Emulation.setVirtualTimePolicy", {"policy": "advance"}, chrome.session)


def check(chrome):
    open_page(chrome, "index.html", "#role=FC&panel=intake&step=problem&diagnostics=mobile")
    report_id = evaluate(chrome, """
      await fill('#quick-business', 'SUBSCRIPTION');
      await fill('#quick-oneLine', '서명 알림톡을 열면 초대장이 떠요');
      await act('quick-review');
      await click('[data-quick-section=diagnostics] summary');
      const diagnostic = $('[data-quick-section=diagnostics]').innerText;
      assert(diagnostic.includes('사무실 컴퓨터') && diagnostic.includes('고객 휴대폰') &&
        diagnostic.includes('SFA-SIGN-LINK'), '두 환경과 오류코드 표시');
      await act('quick-submit');
      const receipt = await wait('#quick-receipt-id');
      const record = window.IntakeDemoStore.read().reports[0];
      const duplicate = await ApiClient.postQuickIntake({ requestId: record.requestId, reporterId: record.reporterId });
      assert(duplicate.id === record.id && IntakeDemoStore.read().reports.length === 1, '동일 제출 중복 방지');
      const json = JSON.stringify(record);
      assert(receipt.textContent.includes(record.id) && !json.includes('DEMO-PRIVATE') &&
        !json.includes('초대장이 떠요'), '진단 허용 목록과 원문 제외');
      return record.id;
    """)
    open_page(chrome, "index.html", "#role=FC&panel=known&tab=mine&item=" + report_id)
    badge = evaluate(chrome, """
      await wait('#kn-body .is-target [open], #kn-body .is-target .pn-card-title');
      const saved = (await ApiClient.getMyReports('U-001')).find(r => r.id === location.hash.split('item=')[1]);
      assert(saved && saved.diagnostics.incident.device === '고객 휴대폰', '새로 열린 내역의 접수번호·진단');
      return Number($('#alarm-badge').textContent);
    """)
    intake_session = chrome.session
    target = chrome.send("Target.createTarget", {"url": "about:blank"})["targetId"]
    ledger_session = chrome.send("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
    chrome.session = ledger_session
    chrome.send("Page.enable", {}, chrome.session)
    open_page(chrome, "ledger.html", "#role=IT&tab=unlinked&notify=fail&item=" + report_id)
    evaluate(chrome, """
      await click('#ld-body details summary');
      assert($('#ld-body').innerText.includes('고객 휴대폰'), '연결 전 대장의 진단 보기');
      await act('link-pick');
      await click('[data-link="D-2026-001"]');
      await act('link-confirm');
      await wait(() => $('#ld-dlg-body').innerText.includes('신고를 묶었어요'));
      await act('close-dialog');
      location.hash = '#role=IT&item=D-2026-001&notify=fail';
      await wait(() => $('#ld-body').innerText.includes('서명 알림톡이 초대장'));
      await act('status');
      await click('[data-to=RESOLVED]');
      await act('next');
      await fill('#ld-resolution-applied', '2026-11-09T15:30');
      await fill('#ld-resolution-scope', 'LINKED');
      await fill('#ld-resolution-change', '알림톡에서 올바른 서명 화면이 열려요.');
      await fill('#ld-resolution-action', 'RESEND');
      await act('approve-resolution');
      await act('next');
      await wait(() => $('#ld-dlg-body').innerText.includes('기존 링크를 다시 보내 주세요'));
      await act('confirm');
      await wait(() => $('#ld-dlg-body').innerText.includes('알림 발송은 실패했어요'));
      assert(!(await ApiClient.getNotifications('U-001')).length, '실패한 알림은 보이지 않음');
      await act('retry-notice');
      await wait(() => $('#ld-dlg-body').innerText.includes('알림을 보냈어요'));
      const event = IntakeDemoStore.read().history.at(-1);
      await ApiClient.postStatus(event.defectId, { eventId: event.eventId, to: event.to });
      await ApiClient.retryStatusNotification(event.id);
      const notices = await ApiClient.getNotifications('U-001');
      assert(notices.length === 1 && notices[0].bodySnapshot.includes('15:30'), '재시도·재처리 중복 방지와 적용 시각');
      assert(!(await ApiClient.getNotifications('U-007')).length, '다른 설계사 알림 격리');
    """)
    chrome.session = intake_session
    evaluate(chrome, """
      await wait(() => Number($('#alarm-badge').textContent) === """ + str(badge + 1) + """);
      await click('#alarm-btn');
      await click('[data-kn-report="' + location.hash.split('item=')[1].split('&')[0] + '"]');
      const card = await wait(() => {
        const target = $('#kn-body .is-target');
        return target && target.innerText.includes('수정 완료 안내') && target;
      });
      assert(card.innerText.includes('기존 링크를 다시 보내 주세요'), '알림에서 해당 접수와 후속 조치 확인');
      await wait(() => Number($('#alarm-badge').textContent) === """ + str(badge) + """);
      await click('#kn-body .is-target .pq-followup summary');
      await click('#kn-body .is-target [data-followup=RECURRED]');
      await wait(() => $('#kn-body .is-target').innerText.includes('이 접수에 내용을 추가했어요'));
      const state = IntakeDemoStore.read();
      assert(state.followups[card.dataset.id][0].action === 'RECURRED', '동일 접수의 재발 이력');
      assert(!(await ApiClient.getMyReports('U-007')).some(r => r.id === card.dataset.id), '접수 소유자 분리');
    """)
    chrome.session = ledger_session
    open_page(chrome, "ledger.html", "#role=IT&item=D-2026-001")
    evaluate(chrome, """
      await wait(() => $('#ld-body').innerText.includes('다시 발생했어요'));
      assert($('#ld-body').innerText.includes('발송 완료'), '담당자 대장의 재발 이력과 발송 결과');
    """)
    chrome.session = intake_session
    chrome.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, chrome.session)
    open_page(chrome, "index.html", "#role=FC&panel=intake&step=assistant&diagnostics=fail")
    evaluate(chrome, """
      await click('[data-index="0"]');
      await act('assistant-handoff');
      await act('quick-review');
      await click('[data-quick-section=diagnostics] summary');
      assert($('[data-quick-section=diagnostics]').innerText.includes('자동으로 가져오지 못했어요'), 'AI 접수의 진단 실패 안내');
      assert($('#pn-body').innerText.includes('비밀번호는 어떻게 바꾸나요?'), 'AI 질문이 그대로 남음');
      await act('quick-submit');
      await wait('#quick-receipt-id');
    """)


if __name__ == "__main__":
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    with tempfile.TemporaryDirectory(prefix="intake-followup-") as profile:
        chrome = Chrome(browser, profile)
        try:
            check(chrome)
            print("PASS: 진단 자동 첨부·실패 대체, 접수 복원, 대장 연결, 발송 재시도·중복 방지, 읽음·재발")
        finally:
            chrome.close()
