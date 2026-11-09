#!/usr/bin/env python3
"""Verify the image pixels and optional AI draft across the normal browser flow."""
import json
import tempfile

from intake_followup_check import evaluate, open_page
from ui_check import Chrome, find_browser

IMAGE_ACTIONS = """
const button = async (label) => (await wait(() =>
  [...document.querySelectorAll('.pq-attachment button')].find(b => b.textContent === label && b.getClientRects().length))).click();
const selectFile = async (file) => {
  const input = await wait('#quick-image-file');
  const data = new DataTransfer(); data.items.add(file); input.files = data.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
const waitForFile = () => new Promise((resolve, reject) => {
  const observer = new MutationObserver(check);
  function check() {
    const error = $('.pq-attachment [role=alert]');
    if ($('.pq-image-editor')) { observer.disconnect(); resolve(); }
    else if (error) { observer.disconnect(); reject(Error(error.textContent)); }
  }
  observer.observe($('#intake-panel'), { childList: true, subtree: true });
  check();
});
const synthetic = document.createElement('canvas');
synthetic.width = 200; synthetic.height = 100;
const context = synthetic.getContext('2d');
context.fillStyle = '#f00'; context.fillRect(0, 0, 100, 100);
context.fillStyle = '#0f0'; context.fillRect(100, 0, 100, 100);
const original = synthetic.toDataURL('image/png');
const png = await new Promise(resolve => synthetic.toBlob(resolve, 'image/png'));
const attach = async () => {
  await click('[data-quick-section=attachment] > summary');
  await selectFile(new File([png], 'private-test-name.png', { type: 'image/png' }));
  await waitForFile();
  const rectangle = async (x, y, w, h) => {
    await click('.pq-attachment details summary');
    await fill('[aria-label="왼쪽 비율"]', x);
    await fill('[aria-label="위쪽 비율"]', y);
    await fill('[aria-label="너비 비율"]', w);
    await fill('[aria-label="높이 비율"]', h);
    await button('입력한 영역 적용');
  };
  await button('자르기');
  await rectangle('10', '0', '80', '100');
  await button('가림');
  await rectangle('0', '0', '50', '100');
  await button('최종 이미지 확인');
  const preview = (await wait('.pq-attachment img')).src;
  const image = new Image(); image.src = preview; await image.decode();
  const output = document.createElement('canvas');
  output.width = image.width; output.height = image.height;
  const pixels = output.getContext('2d');
  pixels.drawImage(image, 0, 0);
  const masked = pixels.getImageData(20, 20, 1, 1).data, visible = pixels.getImageData(120, 20, 1, 1).data;
  assert(image.width === 160 && image.height === 100 && masked[0] === 0 && masked[1] === 0 &&
    masked[2] === 0 && masked[3] === 255 && visible[1] === 255 && preview !== original, '잘린 크기와 불투명 가림');
  await button('이 이미지 첨부');
  return preview;
};
"""


def check(chrome):
    open_page(chrome, "index.html", "#role=FC&panel=intake&step=problem&attachment=fail")
    first = evaluate(chrome, IMAGE_ACTIONS + """
      await fill('#quick-business', 'SUBSCRIPTION');
      await fill('#quick-oneLine', '서명 알림톡을 열면 초대장이 떠요');
      await act('quick-review');
      await click('[data-quick-section=attachment] > summary');
      await selectFile(new File(['invalid'], 'not-an-image.txt', { type: 'text/plain' }));
      await wait('.pq-attachment [role=alert]');
      assert($('#pn-body').innerText.includes('초대장이 떠요'), '파일 거부 때 설명 유지');
      await click('[data-quick-section=attachment] > summary');
      const preview = await attach();
      await act('quick-submit');
      await wait('#quick-error');
      assert(IntakeDemoStore.read().reports.length === 0 && $('.pq-attachment img').src === preview, '첨부 실패는 접수 없이 확정본 유지');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const state = IntakeDemoStore.read(), id = state.reports[0].id;
      assert(state.attachments[id] === preview && !JSON.stringify(state).includes(original) &&
        !JSON.stringify(state).includes('private-test-name'), '확정본만 저장');
      assert(await ApiClient.getReportAttachment(id, 'U-001') === null, 'FC 첨부 조회 제한');
      return { id, preview };
    """)
    open_page(chrome, "ledger.html", "#role=IT&tab=unlinked&item=" + first["id"])
    evaluate(chrome, """
      await click('.pq-attachment summary');
      const image = await wait('.pq-attachment img');
      assert(image.src === """ + json.dumps(first["preview"]) + """, '담당자 열람본은 확인본과 동일');
    """)
    chrome.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, chrome.session)
    open_page(chrome, "index.html", "#role=FC&panel=intake&step=assistant&diagnostics=mobile")
    evaluate(chrome, IMAGE_ACTIONS + """
      await fill('#pn-assist-text', '홍길동 고객님이 서명을 끝냈다고 하셨어요');
      $('#pn-assist-form').requestSubmit();
      await act('assistant-draft');
      await wait('[data-act=quick-draft-generate]');
      assert($('#pn-body').innerText.includes('[이름]') && !$('#pn-body').innerText.includes('홍길동'), 'AI 전송 미리보기의 이름 가림');
      const originalPlan = ApiClient.planIntakeDraft;
      ApiClient.planIntakeDraft = (req, mode) => {
        assert(!('attachment' in req) && !JSON.stringify(req).includes('홍길동'), 'AI에 가린 텍스트만 전달');
        return originalPlan(req, mode);
      };
      await act('quick-draft-generate');
      await wait('#quick-draft-verified');
      assert(document.querySelectorAll('#pn-body [data-draft-field]').length <= 3, '되묻기는 최대 세 가지');
      await act('quick-draft-review');
      await wait('#quick-draft-customer');
      assert($('#quick-draft-customer').value.includes('끝냈다고 하셨어요') &&
        !$('#quick-draft-verified').value && $('#quick-draft-unknown').textContent.includes('실제 서명 완료 여부'),
        '고객 진술과 직접 확인 분리');
      await fill('#quick-draft-verified', '서명 완료를 확인하지 못했어요. 다른 화면으로 이동하는 건 직접 확인했어요.');
      assert($('#quick-draft-unknown').textContent.includes('실제 서명 완료 여부'), '부정 답변을 완료 사실로 바꾸지 않음');
      const preview = await attach();
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const record = (await ApiClient.getMyReports('U-001')).find(r => r.aiDraft);
      const stored = IntakeDemoStore.read();
      assert(record.aiDraft.verified.includes('다른 화면으로 이동') && record.grade === 'IMMEDIATE' &&
        stored.attachments[record.id] === preview, '수정한 초안, 업무 규칙과 확정 첨부를 함께 제출');
      assert(stored.reports.find(r => r.id === record.id).aiDraftSummary.missing.includes('실제 서명 완료 여부') &&
        !JSON.stringify(stored).includes('다른 화면으로 이동'), '공유 저장은 초안의 확인 상태만 유지');
      const known = await originalPlan({ text: '서명 알림톡이 열리지 않아요',
        detail: '재현 순서: 서명 알림톡을 열었어요', environmentKnown: true,
        impactKnown: true, fields: { attempted: '문자로 다시 보냈어요' } });
      assert(known.questions.length === 0, '이미 답했거나 수집한 내용은 묻지 않음');
    """)
    open_page(chrome, "index.html", "#role=FC&panel=intake&step=assistant&llm=fail&attachment=fail")
    evaluate(chrome, IMAGE_ACTIONS + """
      await click('[data-index="1"]');
      await act('assistant-draft');
      await act('quick-draft-generate');
      await wait(() => $('#pn-body').innerText.includes('AI 질문을 불러오지 못했어요'));
      await act('quick-draft-review');
      await fill('#quick-business', 'SUBSCRIPTION');
      assert($('#quick-oneLine').value.includes('초대장이 떠요'), 'AI 실패 시 설명 보존');
      await act('quick-review');
      await attach();
      await act('quick-submit');
      await wait('#quick-error');
      await button('이미지 삭제');
      await act('quick-submit');
      const receipt = await wait('#quick-receipt-id');
      const record = IntakeDemoStore.read().reports.find(r => receipt.textContent.includes(r.id));
      assert(record && !record.hasAttachment, '실패한 첨부를 빼고 글로 접수');
    """)


if __name__ == "__main__":
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    with tempfile.TemporaryDirectory(prefix="intake-second-phase-") as profile:
        chrome = Chrome(browser, profile)
        try:
            check(chrome)
            print("PASS: 자르기·불투명 가림·확정본 열람, 파일·AI 실패 대체, 가린 AI 입력과 초안 수정")
        finally:
            chrome.close()
