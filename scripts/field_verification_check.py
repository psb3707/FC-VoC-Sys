#!/usr/bin/env python3
"""알림 요약·수정 검증·FC 현장 확인 (ADR-029, docs/10-seed-scenarios.md 5-5절).

TC-01 간결한 수정 예정 알림 → 같은 접수 카드. TC-02 수정·배포 검증 완료(가상). TC-03 정상 확인.
TC-04 문제 지속 → IT 후속 확인·관리자 지원. TC-05 미확인·재확인. TC-06 다중 신고·수신자·멱등·권한.
TC-07 재배포(되돌린 뒤 다시 해결). 부가: 검증 없는 해결, 임시 방법 종료 여부, 대리 접수 관리자.

실제 화면을 누른다. 가상 시간을 쓰지 않는다(시각 순서·미래 금지 규칙을 보므로 실제 시계가 필요).
브라우저 자동 검사이며 실제 배포·실제 모바일 키패드는 검증하지 않는다.
"""
import tempfile

from intake_followup_check import evaluate
from sign_link_e2e_check import ASK
from ui_check import CMD_TIMEOUT, STATIC, Chrome, find_browser

FIELD = ASK + """
const kst = (minutesAgo) => new Date(Date.now() + 9 * 3600000 - minutesAgo * 60000).toISOString().slice(0, 16);
const choose = async (selector, value) => {
  const box = await wait(selector);
  box.value = value;
  box.dispatchEvent(new Event('change', { bubbles: true }));
};
const D7 = 'D-2026-007';
const defect = async (id) => (await ApiClient.getDefects({})).find(d => d.id === (id || D7));
const notices = async (user) => (await ApiClient.getNotifications(user)).filter(n => n.defectId === D7 && n.kind === 'STATUS');
// 보이는 글이 두 줄 이내이고 잘리지 않았는지
const fits = (el, lines) => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) * lines + 1 &&
  el.scrollHeight <= el.clientHeight + 1;
const dd = (root, label) => [...root.querySelectorAll('.pn-rows > div')].find(x => x.querySelector('dt').textContent === label)?.querySelector('dd').textContent || '';
"""


def open_real(chrome, file, address, w=1280, h=900):
    s = chrome.session
    chrome.send("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False}, s)
    for url in ("about:blank", (STATIC / file).as_uri() + address):
        chrome.events.clear()
        chrome.send("Page.navigate", {"url": url}, s)
        chrome.wait_event("Page.loadEventFired", CMD_TIMEOUT)


def run(chrome, body):
    return evaluate(chrome, FIELD + body)


def consult(chrome, user, support, answers, quick=False):
    open_real(chrome, "index.html", f"?selftest=1#role=FC&user={user}&panel=intake&step=assistant")
    return run(chrome, """
      await click('[data-index="3"]');
      await click('[data-act=assistant-support][data-code=""" + support + """]');
      for (const code of """ + repr(answers) + """) await answer(code);
      """ + ("await act('assistant-quick'); await act('assistant-quick-confirm');" if quick
             else "await act('assistant-handoff'); await wait('[data-identity]'); await act('quick-submit');") + """
      return (await wait('#quick-receipt-id')).textContent.replace('접수번호 ', '').trim();
    """)


def link(chrome, report_id):
    open_real(chrome, "ledger.html", f"?selftest=1#role=SALES&user=U-021&tab=unlinked&q={report_id}&item={report_id}")  # ADR-030: 고객동의업무팀(가상) 현업이 연결
    run(chrome, """
      await click('[data-ai-link="D-2026-007"]');
      await act('link-confirm');
      await wait(() => IntakeDemoStore.read().links['""" + report_id + """'] === D7);
    """)


def resolve(chrome, guide="기존 상품소개동의 절차대로 진행해 주세요.", ref="DEMO-FIX-007"):
    """결함 대장에서 수정·배포 검증 완료(가상)를 입력하고 확정한다."""
    open_real(chrome, "ledger.html", "?selftest=1#role=IT&item=D-2026-007")
    return run(chrome, """
      await act('status');
      await click('[data-to=RESOLVED]');
      await click('[data-act=next][data-step=pick]');
      await wait('#ld-resolution-verify');
      await click('[data-act=next][data-step=detail]');
      await wait(() => $('#ld-err') && $('#ld-err').textContent.includes('검증 여부'));
      assert(!$('#ld-resolution-guide'), '검증 완료를 고르기 전에는 검증 칸이 없음');
      await choose('#ld-resolution-verify', 'VERIFIED');
      await fill('#ld-resolution-applied', kst(3));
      await fill('#ld-resolution-verifiedAt', kst(-120));
      await fill('#ld-resolution-guide', '""" + guide + """');
      await click('.ld-evidence > summary');
      await fill('#ld-resolution-refId', '""" + ref + """');
      await choose('#ld-resolution-environment', 'SIM_TEST');
      await fill('#ld-note', '시연용 내부 메모 원문');
      await choose('#ld-resolution-scope', 'LINKED');
      await fill('#ld-resolution-change', '고객 동의 화면에서 숫자를 입력할 수 있어요.');
      await choose('#ld-resolution-action', 'RETRY');
      await act('approve-resolution');
      await click('[data-act=next][data-step=detail]');
      await wait(() => $('#ld-err') && $('#ld-err').textContent.includes('지금보다 앞'));
      await fill('#ld-resolution-verifiedAt', kst(1));
      await act('approve-resolution');   // 값을 바꾸면 공개 확인을 다시 받는다
      await selftest('검증 완료 입력');
      await click('[data-act=next][data-step=detail]');
      const preview = (await wait('[data-notice-preview]')).innerText;
      assert(preview.includes('고객 동의 입력 오류') && preview.includes('수정 완료') && preview.includes('""" + guide + """'), '알림 미리보기 ' + preview);
      assert($('#ledger-dialog').innerText.includes('가상 시연용'), '가상 완료 기록임을 표시');
      assert((await defect()).status === 'FIX_PLANNED', '확정 전에는 그대로');
      assert(!location.hash.includes(encodeURIComponent('시연용 내부 메모 원문')), '내부 메모는 주소에 없음');
      await selftest('검증 완료 알림 미리보기');
      await act('confirm');
      await wait(() => $('#ledger-dialog').innerText.includes('보냈어요'));
      const d = await defect();
      assert(d.status === 'RESOLVED' && d.resolution.verification.simulated === true && d.resolution.verification.refId === '""" + ref + """',
        '가상 검증 완료 기록');
      assert(!JSON.stringify(IntakeDemoStore.read()).includes('시연용 내부 메모 원문'), '내부 메모 원문은 저장소에 없음');
      return d.resolutionEventId;
    """)


def open_notice(chrome, user, report_id=None):
    open_real(chrome, "index.html", f"?selftest=1#role=FC&user={user}&popup=alarm")
    return run(chrome, """
      const item = await wait('.alarm-item[data-kn-defect="D-2026-007"]');
      item.click();
      const card = await wait(() => location.hash.includes('panel=known') && $('#kn-body .kn-card.is-target'));
      const id = card.getAttribute('data-id');
      """ + (f"assert(id === '{report_id}', '알림이 같은 접수번호로 이동 ' + id);" if report_id else "") + """
      return id;
    """)


def verify(chrome, user, report_id, result):
    open_real(chrome, "index.html", f"?selftest=1#role=FC&user={user}&panel=known&tab=mine&item={report_id}")
    run(chrome, """
      await click('#kn-body .is-target [data-verify=""" + result + """]');
      await wait('#kn-body .is-target [data-verify=""" + result + """][aria-pressed=true]');
      await wait(() => document.activeElement && document.activeElement.hasAttribute('data-verify-status'));
    """)


def check_main(chrome):
    # 준비: V6 와 같은 구성(FC 3명·신고 4건, 전체 신고자 5명·6건)
    r1 = consult(chrome, "U-013", "YES", ["ANDROID", "IN_APP", "YES"])
    r2 = consult(chrome, "U-011", "NO", ["UNKNOWN", "UNKNOWN", "NO"], quick=True)
    r3 = consult(chrome, "U-012", "YES", ["IOS", "UNKNOWN", "YES"])
    link(chrome, r1)
    link(chrome, r3)

    # ---- TC-01 간결한 수정 예정 알림
    open_real(chrome, "ledger.html", "?selftest=1#role=IT&item=D-2026-007")
    run(chrome, """
      await act('status');
      await click('[data-to=FIX_PLANNED]');
      await click('[data-act=next][data-step=pick]');
      await fill('#ld-date', '2026-12-04');
      await click('[data-act=next][data-step=detail]');
      await wait('[data-notice-preview]');
      await act('confirm');
      await wait(() => $('#ledger-dialog').innerText.includes('보냈어요'));
    """)
    open_real(chrome, "index.html", "?selftest=1#role=FC&user=U-013&popup=alarm")
    run(chrome, """
      const items = await wait(() => document.querySelectorAll('.alarm-item').length && document.querySelectorAll('.alarm-item'));
      assert(items.length === 1, '상태 변경 알림 1건');
      const item = items[0], get = (c) => item.querySelector('.' + c);
      assert(get('al-title').textContent === '고객 동의 입력 오류' && get('al-status').textContent === '수정 예정' &&
        get('al-headline').textContent === '12월 4일 수정 예정' && get('al-line').textContent === '현재 확인된 임시조치는 없어요' &&
        get('al-action').textContent === '처리경과 확인', '오류명·상태·일정·핵심 안내 ' + item.innerText);
      assert(item.querySelectorAll('.pn-tag').length === 1, '상태 태그 하나');
      for (const c of ['al-title', 'al-headline', 'al-line']) assert(fits(get(c), 2), '2줄 이내 ' + c);
      assert(!item.innerText.includes('긴급') && !item.innerText.includes('뒷자리'), '긴 설명은 팝업에 없음');
      await selftest('수정 예정 알림');
    """)
    open_notice(chrome, "U-013", r1)
    run(chrome, """
      const card = $('#kn-body .is-target'), text = card.innerText;
      const times = [...card.querySelectorAll('.kn-stage-at')].map(x => x.textContent);
      assert(times.join() === times.slice().sort().join(), '단계 시각은 순서대로 ' + times);
      assert(card.querySelector('.kn-card-head .pn-tag').textContent === '수정 예정' && text.includes('접수번호 """ + r1 + """'), 'A 상태·접수번호');
      assert(text.indexOf('지금 가능한 대응') < text.indexOf('오류 수정 진행상황') && text.indexOf('오류 수정 진행상황') < text.indexOf('상세 이력'), 'B → C → D');
      const steps = [...card.querySelectorAll('.kn-stages li > span:first-child')].map(x => x.textContent).join('|');
      assert(steps === '접수|담당자 확인|수정 예정 · 지금', '기록된 단계만 ' + steps);
      const more = card.querySelector('.kn-detail');
      assert(!more.open, '상세 이력은 접힘');
      more.querySelector('summary').click();
      await wait(() => more.open && more.innerText.includes('예정일 12월 4일'));
      await selftest('접수 상세');
    """)

    # ---- TC-02 수정·배포 검증 완료
    others = run(chrome, """
      const base = { appliedAt: kst(3) + ':00+09:00', scope: 'LINKED', change: '숫자를 입력할 수 있어요.', action: 'RETRY', approved: true };
      const good = { result: 'VERIFIED', verifiedAt: kst(1) + ':00+09:00', usageGuide: '기존 절차대로 진행해 주세요.' };
      const bad = [['미래 검증 시각', { verifiedAt: kst(-120) + ':00+09:00' }, 'U-030'],
        ['검증 시각이 적용보다 앞', { verifiedAt: kst(9) + ':00+09:00' }, 'U-030'], ['번호', { usageGuide: '010-0000-0000로 연락' }, 'U-030'],
        ['주소', { usageGuide: 'www.example.invalid 확인' }, 'U-030'], ['긴 안내', { usageGuide: '가'.repeat(31) }, 'U-030'],
        ['참조 형식', { refId: 'token=abc' }, 'U-030'], ['FC가 기록', {}, 'U-013'], ['관리자가 기록', {}, 'U-010'], ['행위자 없음', {}, null]];
      for (const [name, patch, actorId] of bad) {
        const r = await ApiClient.postStatus(D7, { from: 'FIX_PLANNED', to: 'RESOLVED', eventId: 'bad-' + name, actorId,
          resolution: Object.assign({}, base, { verification: Object.assign({}, good, patch) }) });
        assert(r.error, '거부: ' + name);
      }
      assert((await defect()).status === 'FIX_PLANNED', '거부된 요청은 상태 그대로');
      return JSON.stringify((await ApiClient.getDefects({})).filter(d => d.id !== D7).map(d => [d.id, d.status, d.updatedAt]).sort());
    """)
    first = resolve(chrome)
    run(chrome, """
      const now = JSON.stringify((await ApiClient.getDefects({})).filter(d => d.id !== D7).map(d => [d.id, d.status, d.updatedAt]).sort());
      assert(now === """ + repr(others) + """, '다른 결함 상태 변경 없음');
    """)

    # ---- TC-06(수신) 사람별 1건, 모든 수신자가 자기 카드로
    run(chrome, """
      const event = IntakeDemoStore.read().history.find(h => h.id === '""" + first + """');
      const ids = event.recipients.map(r => r.userId).sort().join(',');
      assert(ids === 'U-003,U-008,U-011,U-012,U-013', '연결된 신고자 5명, 사람별 1건 ' + ids);
      for (const u of ids.split(',')) assert((await notices(u)).filter(n => n.historyId === '""" + first + """').length === 1, u + ' 1건');
      assert(!(await notices('U-010')).length, '대리 접수가 없으면 관리자 알림 없음');
      const again = await ApiClient.postStatus(D7, { from: 'FIX_PLANNED', to: 'RESOLVED', eventId: event.eventId });
      assert(again.historyId === event.id && (await notices('U-012')).length === 2, '재전송해도 같은 이력·알림');
    """)
    open_notice(chrome, "U-003", "R-071")
    open_notice(chrome, "U-012", r3)

    # ---- TC-03 정상 이용 확인
    open_real(chrome, "index.html", "?selftest=1#role=FC&user=U-013&popup=alarm")
    run(chrome, """
      const item = await wait('.alarm-item');
      const text = item.innerText;
      assert(item.querySelector('.al-status').textContent === '수정 완료' && item.querySelector('.al-action').textContent === '정상 이용 확인', '수정 완료 알림');
      assert(text.includes('기존 상품소개동의 절차대로 진행해 주세요.') && text.includes('배포·검증 완료(가상)') && text.includes('계속되면 접수에서'),
        '무엇·어떻게·계속되면 ' + text);
      assert(!/\\d+월 \\d+일/.test(item.querySelector('.al-headline').textContent + item.querySelector('.al-line').textContent), '날짜는 수정 예정에만');
      for (const c of ['al-title', 'al-headline', 'al-line']) assert(fits(item.querySelector('.' + c), 2), '2줄 이내 ' + c);
      assert(document.querySelectorAll('.alarm-item .al-status')[1].textContent === '수정 예정', '지난 알림은 보낸 때의 상태');
      await selftest('수정 완료 알림');
    """)
    open_notice(chrome, "U-013", r1)
    run(chrome, """
      const card = await wait('#kn-body .is-target .kn-verify');
      assert(card.innerText.includes('수정된 고객 동의 화면을 정상적으로 이용할 수 있나요?') && card.querySelectorAll('[data-verify]').length === 3, '질문·세 선택지');
      assert(!card.querySelector('[aria-pressed=true]') && !IntakeDemoStore.read().verifications.length, '읽음은 현장 확인이 아님');
      const steps = [...document.querySelectorAll('#kn-body .is-target .kn-stages li > span:first-child')].map(x => x.textContent).join('|');
      assert(steps === '접수|담당자 확인|수정 예정|배포·검증 완료(가상) · 지금', '기록된 단계 ' + steps);
      const times = [...document.querySelectorAll('#kn-body .is-target .kn-stage-at')].map(x => x.textContent);
      assert(times.join() === times.slice().sort().join(), '완료가 수정 예정보다 앞서 보이지 않음 ' + times);
      await selftest('현장 확인 질문');
    """)
    verify(chrome, "U-013", r1, "CONFIRMED_OK")
    run(chrome, """
      const state = IntakeDemoStore.read(), v = state.verifications.at(-1);
      assert(v.reportId === '""" + r1 + """' && v.defectId === D7 && v.resolutionEventId === '""" + first + """' && v.result === 'CONFIRMED_OK' &&
        v.actorId === 'U-013' && v.at, '확인 결과 저장');
      assert(!state.resumption[v.reportId] && !state.followups[v.reportId], '업무 재개 회신·후속 기록과 분리');
      assert((await defect()).status === 'RESOLVED', '대표 결함 상태 유지');
    """)

    # ---- TC-04 문제 지속
    history = run(chrome, "return IntakeDemoStore.read().history.length;")
    verify(chrome, "U-012", r3, "STILL_FAIL")
    run(chrome, """
      const state = IntakeDemoStore.read();
      assert(state.followups['""" + r3 + """'][0].action === 'FIELD_FAIL' && state.history.length === """ + str(history) + """, '후속 기록, 상태 이력 변화 없음');
      await click('#kn-body .is-target [data-verify-add]');
      const box = await wait(() => document.activeElement && document.activeElement.tagName === 'TEXTAREA' && document.activeElement);
      await selftest('문제 지속 추가 상황');
      box.value = '입력칸을 눌러도 같은 증상이라는 추가 설명';
      await click('#kn-body .is-target [data-followup=ADD]');
      await wait(() => (IntakeDemoStore.read().followups['""" + r3 + """'] || []).some(e => e.action === 'ADD'));
      assert(!JSON.stringify(IntakeDemoStore.read()).includes('같은 증상이라는 추가 설명'), '추가 설명 원문은 저장소에 없음');
    """)
    open_real(chrome, "ledger.html", "?selftest=1#role=IT&tab=defects&item=D-2026-007")   # ADR-030: IT 첫 탭은 협의 요청, 목록 표시는 [공통 오류]
    run(chrome, """
      const card = await wait('[data-field-verification]');
      assert(card.innerText.includes('FC 5명 · 신고 6건') && dd(card, '정상 확인').startsWith('1명') && dd(card, '문제 지속').startsWith('1명') &&
        dd(card, '미확인').startsWith('3명'), 'IT 현장 확인 현황 ' + card.innerText);
      const fail = card.querySelector('[data-field-fail=""" + r3 + """]');
      assert(fail && fail.innerText.includes('후속 확인 대상') && fail.innerText.includes('추가 내용 1건') && fail.textContent.includes('iOS'), '문제 지속 FC·발생 조건');
      assert($('.ld-field-flag').textContent === '현장 문제 1명', '목록에서 후속 확인 대상');
      await click('[data-act=investigate][data-code=STARTED]');
      await wait('[data-act=investigate][data-code=STARTED][aria-pressed=true]');
      const x = IntakeDemoStore.read().investigations;
      assert(x.length === 1 && x[0].actorId === 'U-030', '후속 조사 기록');
      assert((await defect()).status === 'RESOLVED', '자동 재오픈 없음');
      await selftest('IT 현장 확인 현황');
    """)

    # ---- TC-05 미확인
    run(chrome, """
      const d = await ApiClient.getDefect(D7);
      assert(d.fieldVerification.fcs.find(f => f.id === 'U-011').result === 'NOT_TESTED', '답 없음 = 미확인');
    """)
    verify(chrome, "U-011", r2, "NOT_TESTED")
    run(chrome, """
      assert(!IntakeDemoStore.read().followups['""" + r2 + """'], '미확인은 후속 조치 없음');
      const f = (await ApiClient.getDefect(D7)).fieldVerification;
      assert(f.counts.STILL_FAIL === 1 && f.counts.NOT_TESTED === 3 && f.failReports.length === 1, '미확인은 문제 지속 아님');
      assert(!$('#kn-body .is-target').innerText.includes('담당자가 확인했어요'), '같은 오류 참여는 담당자 확인이 아님');
      assert($('#kn-body .is-target [data-verify=CONFIRMED_OK]') && !$('#kn-body .is-target [data-verify-add]'), '이후 다시 고를 수 있음');
    """)
    open_real(chrome, "index.html", "?selftest=1#role=MANAGER&board=known&panel=known&tab=team&item=D-2026-007")
    run(chrome, """
      const card = await wait('#kn-body .kn-card.is-target'), sum = $('[data-team-summary]');
      assert(card.querySelector('.kn-meta').textContent.startsWith('FC 3명 · 신고 4건') && card.querySelectorAll('[data-fc]').length === 3, 'FC 3명·신고 4건');
      const row = (u) => card.querySelector('[data-fc=' + u + '] summary').textContent;
      assert(row('U-013').includes('정상 진행 확인') && row('U-012').includes('추가 지원 필요') && row('U-012').includes('관련 신고 2건') &&
        row('U-011').includes('확인 필요'), '관리자 FC별 현장 확인');
      assert(card.querySelector('[data-fc]').getAttribute('data-fc') === 'U-012', '지원 필요가 맨 위');
      assert(dd(sum, '추가 지원 필요').includes('조은별(가상)') && !dd(sum, '추가 지원 필요').includes('정다솜') && !dd(sum, '업무를 못 함').includes('정다솜'),
        '지원 필요 요약, 미확인은 중단 아님');
      card.querySelector('[data-fc=U-012]').open = true;
      assert(card.querySelectorAll('[data-fc=U-012] dt').length === 2, '신고 건별 기록');
      assert(!card.querySelector('[data-verify]') && !/U-0\\d\\d/.test(card.textContent) && !card.textContent.includes('같은 증상이라는'),
        '관리자는 대신 답하지 못하고 계정·설명 없음');
      await selftest('관리자 현장 확인');
    """)
    verify(chrome, "U-011", r2, "CONFIRMED_OK")

    # ---- TC-06 멱등·권한·최신 답
    open_real(chrome, "index.html", "?selftest=1#role=FC&user=U-008&panel=known&tab=mine&item=R-072")
    run(chrome, """
      const chip = await wait('#kn-body .is-target [data-verify=NOT_TESTED]');
      chip.click(); chip.click();
      await wait('#kn-body .is-target [data-verify=NOT_TESTED][aria-pressed=true]');
      assert(IntakeDemoStore.read().verifications.filter(v => v.reportId === 'R-072').length === 1, '화면에서 두 번 눌러도 1건');
    """)
    run(chrome, """
      const ev = '""" + first + """', n = () => IntakeDemoStore.read().verifications.length;
      let count = n();
      await Promise.all([ApiClient.postFieldVerification('R-071', 'U-003', ev, 'NOT_TESTED', 'q1'), ApiClient.postFieldVerification('R-071', 'U-003', ev, 'NOT_TESTED', 'q1')]);
      assert(n() === count + 1, '중복 클릭 1건');
      assert((await ApiClient.postFieldVerification('R-071', 'U-003', ev, 'CONFIRMED_OK', 'q1')).duplicate && n() === count + 1, '같은 요청 재시도 1건');
      assert((await ApiClient.postFieldVerification('""" + r1 + """', 'U-013', ev, 'CONFIRMED_OK')).duplicate, '같은 답 1건');
      count = n();
      for (const [who, args] of [['관리자', ['""" + r1 + """', 'U-010', ev, 'STILL_FAIL']], ['IT', ['""" + r1 + """', 'U-030', ev, 'STILL_FAIL']],
        ['다른 FC', ['""" + r1 + """', 'U-011', ev, 'STILL_FAIL']], ['다른 해결 이력', ['R-072', 'U-008', 'H-Q999', 'CONFIRMED_OK']],
        ['해결 전 결함', ['R-011', 'U-001', ev, 'CONFIRMED_OK']], ['모르는 값', ['R-072', 'U-008', ev, 'FIXED']]]) {
        assert(await ApiClient.postFieldVerification(...args) === null, '거부: ' + who);
      }
      assert(n() === count, '거부는 저장 0건');
      assert(await ApiClient.postFieldInvestigation('""" + r3 + """', 'U-012', ev, 'STARTED') === null, 'FC는 조사 기록 불가');
      assert(await ApiClient.postFieldInvestigation('""" + r1 + """', 'U-030', ev, 'STARTED') === null, '문제 지속이 아닌 신고는 조사 대상 아님');
      let f = (await ApiClient.getDefect(D7)).fieldVerification;
      assert(f.fcs.find(x => x.id === 'U-012').result === 'STILL_FAIL', '답 없는 다른 신고가 덮지 않음');
      await ApiClient.postFieldVerification('R-073', 'U-012', ev, 'CONFIRMED_OK');
      f = (await ApiClient.getDefect(D7)).fieldVerification;
      assert(f.fcs.find(x => x.id === 'U-012').result === 'CONFIRMED_OK' && f.failReports.length === 1 && f.reporterCount === 5 && f.reportCount === 6,
        'FC 최신 답으로 세되 신고별 문제 지속은 남음');
      const mine = JSON.stringify((await ApiClient.getMyReports('U-013')).concat(await ApiClient.getBranchReports('U-010')));
      assert(!mine.includes('DEMO-FIX-007') && !mine.includes('SIM_TEST'), '참조·환경은 FC·관리자에게 내리지 않음');
    """)
    open_real(chrome, "index.html", "?selftest=1#role=MANAGER&board=known&panel=known&tab=team&item=D-2026-007")
    run(chrome, """
      const row = (await wait('#kn-body .is-target [data-fc=U-012] summary')).textContent;
      assert(row.includes('정상 진행 확인') && row.includes('문제 지속 신고 1건'), '최신 답 + 남은 문제 신고 ' + row);
    """)

    # ---- TC-07 재배포
    before = run(chrome, "return (await notices('U-013')).length;")
    open_real(chrome, "ledger.html", "?selftest=1#role=IT&item=D-2026-007")
    run(chrome, """
      await act('status');
      await click('[data-to=FIX_PLANNED]');
      await click('[data-act=next][data-step=pick]');
      await wait('#ld-back');
      await fill('#ld-date', '2026-12-11');
      await click('[data-act=next][data-step=detail]');
      await wait(() => $('#ld-err') && $('#ld-err').textContent.includes('되돌리는 이유'));
      assert($('#ld-back[aria-invalid=true]') && !$('#ld-date[aria-invalid=true]'), '빠진 칸만 표시(날짜는 채움)');
      await choose('#ld-back', 'REDEPLOY');
      await selftest('되돌림 입력');
      await click('[data-act=next][data-step=detail]');
      await wait(() => $('#ledger-dialog').innerText.includes('알리지 않아요'));
      await act('confirm');
      await wait(() => $('#ledger-dialog').innerText.includes('기록만 남겼어요'));
      const d = await ApiClient.getDefect(D7);
      assert(d.status === 'FIX_PLANNED' && d.plannedFixDate === '2026-12-11' && d.statusHistory.at(-1).reason === '재배포 준비', '되돌림·사유 저장');
      assert(!d.fieldVerification && (await notices('U-013')).length === """ + str(before) + """, '되돌림은 알림 없음');
    """)
    open_real(chrome, "index.html", f"?selftest=1#role=FC&user=U-013&panel=known&tab=mine&item={r1}")
    run(chrome, """
      const card = await wait('#kn-body .is-target');
      assert(!card.querySelector('.kn-verify') && !card.innerText.includes('배포·검증 완료'), '재검토 중에는 완료 단계·질문 없음');
    """)
    second = resolve(chrome, ref="DEMO-FIX-007-2")
    assert second != first, "재배포는 새 해결 이력"
    run(chrome, """
      const f = (await ApiClient.getDefect(D7)).fieldVerification;
      assert(f.resolutionEventId === '""" + second + """' && f.counts.NOT_TESTED === 5 && !f.counts.CONFIRMED_OK && !f.counts.STILL_FAIL && !f.failReports.length,
        '새 배포는 모두 미확인');
      assert(await ApiClient.postFieldVerification('""" + r1 + """', 'U-013', '""" + first + """', 'STILL_FAIL') === null, '이전 회차 답 거부');
      assert((await notices('U-013')).length === """ + str(before + 1) + """, '새 해결 알림 1건');
    """)
    open_notice(chrome, "U-013", r1)
    run(chrome, """
      const card = await wait('#kn-body .is-target');
      assert(!card.querySelector('[data-verify][aria-pressed=true]'), '새 배포의 FC 확인은 미확인');
      assert(card.querySelector('.kn-detail').textContent.includes('이전 수정에 대한 확인 · 정상 진행했어요'), '이전 답은 이력에만');
    """)
    open_real(chrome, "index.html", "?selftest=1#role=MANAGER&board=known&panel=known&tab=team&item=D-2026-007")
    run(chrome, """
      const card = await wait('#kn-body .kn-card.is-target');
      const rows = [...card.querySelectorAll('[data-fc] summary .pn-tag')].map(x => x.textContent);
      assert(rows.length === 3 && rows.every(x => x === '확인 필요'), '관리자도 새 회차는 확인 필요 ' + rows);
    """)


def check_variants(chrome):
    """임시 방법 종료 여부, 검증 없는 해결, 대리 접수 관리자 알림."""
    open_real(chrome, "index.html", "?selftest=1#role=FC")
    run(chrome, """
      const base = { business: 'CUSTOMER_CONSENT', symptom: 'CANNOT_INPUT', oneLine: '동의 화면 키패드가 안 떠요', urgent: [], extraSymptoms: [], incident: {} };
      for (const i of [1, 2]) {
        const r = await ApiClient.postQuickIntake(Object.assign({ requestId: 'proxy-' + i, reporterId: 'U-011', submittedById: 'U-010' }, base));
        await ApiClient.postLinkReport(D7, r.id);
      }
      const at = (m) => kst(m) + ':00+09:00';
      const res = (verification) => ({ appliedAt: at(3), scope: 'LINKED', change: '화면이 정상으로 열려요.', action: 'RETRY', approved: true, verification });
      const ok = (extra) => Object.assign({ result: 'VERIFIED', verifiedAt: at(1), usageGuide: '기존 절차대로 진행해 주세요.' }, extra);
      await ApiClient.postStatus(D7, { from: 'RECEIVED', to: 'RESOLVED', eventId: 'p', actorId: 'U-030', resolution: res(ok({ workaroundEnded: true })) });
      assert((await defect()).resolution.verification.workaroundEnded === false, '임시 방법이 없으면 종료 안내도 없음');
      await ApiClient.postStatus('D-2026-001', { from: 'WORKAROUND', to: 'RESOLVED', eventId: 'w1', actorId: 'U-030', resolution: res(ok({})) });
      await ApiClient.postStatus('D-2026-002', { from: 'FIX_PLANNED', to: 'RESOLVED', eventId: 'w2', actorId: 'U-030', resolution: res(ok({ workaroundEnded: true })) });
      await ApiClient.postStatus('D-2026-003', { from: 'CAUSE_FOUND', to: 'RESOLVED', eventId: 'n', actorId: 'U-030', resolution: res(null) });
      const plain = (await ApiClient.getNotifications('U-005')).find(n => n.defectId === 'D-2026-003');
      assert(plain.summary.status === '해결' && !plain.bodySnapshot.includes('수정 완료') && !plain.bodySnapshot.includes('고쳤'), '검증 없는 해결은 수정 완료가 아님');
      const manager = (await ApiClient.getNotifications('U-010')).filter(n => n.defectId === D7);
      assert(manager.length === 1 && manager[0].audience === 'SUBMITTER' && manager[0].summary.headline === '대신 접수 2건', '대리 접수 관리자 1건');
      assert((await ApiClient.getNotifications('U-011')).filter(n => n.defectId === D7 && n.kind === 'STATUS').length === 1, 'FC도 1건');
    """)
    open_real(chrome, "index.html", "?selftest=1#role=FC&panel=known&tab=mine&item=R-011")
    run(chrome, """
      const card = await wait('#kn-body .is-target');
      assert(card.innerText.includes('종료 여부는 확인 전') && !card.innerText.includes('쓰지 않아도') && card.querySelector('.kn-verify'), '종료 확인 전에는 종료 안내 없음');
      assert($('[data-id=R-012]').innerText.includes('이전 임시 방법은 이제 쓰지 않아도 돼요'), '담당자가 확인한 종료만 안내');
    """)
    open_real(chrome, "index.html", "?selftest=1#role=FC&user=U-003&panel=known&tab=mine&item=R-041")
    run(chrome, """
      const steps = (await wait('#kn-body .is-target .kn-stages')).textContent;
      assert(steps.includes('원인 파악 (접수 전부터)'), '내 접수보다 앞선 결함 기록을 구분 ' + steps);
    """)
    open_real(chrome, "index.html", "?selftest=1#role=FC&user=U-005&panel=known&tab=mine&item=R-044")
    run(chrome, """
      const card = await wait('#kn-body .is-target');
      assert(card.querySelector('.kn-card-head .pn-tag').textContent === '해결' && !card.querySelector('.kn-verify') && !card.textContent.includes('수정 완료'),
        '검증 없는 해결에는 현장 확인 없음');
      await selftest('검증 없는 해결');
    """)
    open_real(chrome, "index.html", "?selftest=1#role=MANAGER&popup=alarm")
    run(chrome, """
      const item = await wait('.alarm-item[data-kn-defect="D-2026-007"]');
      assert(item.innerText.includes('대신 접수 2건') && item.innerText.includes('FC 현황 확인'), '관리자 요약');
      await selftest('관리자 알림');
      item.click();
      const card = await wait(() => location.hash.includes('tab=team') && $('#kn-body .is-target'));
      assert(!card.querySelector('[data-verify]'), '관리자 화면에 대신 답하기 없음');
    """)
    open_real(chrome, "index.html", "?selftest=1#role=MANAGER&panel=known&tab=mine")
    run(chrome, """
      await wait('#kn-body .kn-card');
      assert($('#kn-body').innerText.includes('FC 현장 확인 · 확인 전'), '대리 접수자는 FC 답을 글자로');
      assert([...document.querySelectorAll('#kn-body .kn-card')].filter(c => c.innerText.includes('대신 접수')).every(c => !c.querySelector('[data-verify]')), '대리 접수 건에 버튼 없음');
    """)


def check_screen_rules(chrome):
    """디자인 리뷰에서 나온 규칙: 단계·이력 시각, 반복 없음, 빠진 칸 안내, 좁은 폭, 접기 유지. 어긴 것을 한 번에 모은다."""
    bad = []

    def expect(name, body):
        if not run(chrome, body):
            bad.append(name)

    rid = consult(chrome, "U-013", "YES", ["ANDROID", "IN_APP", "YES"])
    link(chrome, rid)
    open_real(chrome, "index.html", "#role=FC")
    run(chrome, """
      await ApiClient.postStatus(D7, { from: 'RECEIVED', to: 'FIX_PLANNED', eventId: 's1', actorId: 'U-030', plannedFixDate: '2026-12-04' });
    """)

    open_real(chrome, "ledger.html", "#role=IT&item=D-2026-007", 1280, 800)
    run(chrome, """
      await act('status');
      await click('[data-to=RESOLVED]');
      await click('[data-act=next][data-step=pick]');
      await wait('#ld-resolution-verify');
      await click('[data-act=next][data-step=detail]');
      await wait(() => !$('#ld-err').hidden);
      await new Promise(r => setTimeout(r, 300));
    """)
    expect("빠진 칸으로 초점", "return document.activeElement.id === 'ld-resolution-verify';")
    expect("빠진 칸만 표시", """
      const marked = [...document.querySelectorAll('#ld-dlg-body [aria-invalid=true]')];
      return marked.length === 1 && marked[0].id === 'ld-resolution-verify' && marked[0].getAttribute('aria-describedby') === 'ld-err' &&
        getComputedStyle(marked[0]).borderTopWidth === '2px';""")
    expect("막힘 안내가 화면 안", """
      const e = $('#ld-err').getBoundingClientRect(), b = $('#ld-dlg-body').getBoundingClientRect();
      return e.top >= b.top && e.bottom <= b.bottom;""")

    open_real(chrome, "ledger.html", "#role=IT&item=D-2026-007")
    run(chrome, """
      await act('status');
      await click('[data-to=CAUSE_FOUND]');
      await click('[data-act=next][data-step=pick]');
      await wait('#ld-back');
      await click('#ld-dlg-foot [data-act=prev]');
      await click('[data-to=RECEIVED]');
      await click('[data-act=next][data-step=pick]');
      await wait('#ld-back');
      await click('[data-act=next][data-step=detail]');
      await wait('#ld-back[aria-invalid=true]');
    """)
    open_real(chrome, "index.html", "#role=FC")
    run(chrome, """
      const r = await ApiClient.postStatus(D7, { from: 'FIX_PLANNED', to: 'RESOLVED', eventId: 's2', actorId: 'U-030', resolution: {
        appliedAt: kst(3) + ':00+09:00', scope: 'LINKED', change: '고객 동의 화면에서 숫자를 입력할 수 있어요.', action: 'RETRY', approved: true,
        verification: { result: 'VERIFIED', verifiedAt: kst(1) + ':00+09:00', usageGuide: '기존 상품소개동의 절차대로 진행해 주세요.' } } });
      assert(!r.error, '검증 완료 준비');
    """)

    open_real(chrome, "index.html", f"#role=FC&user=U-013&panel=known&tab=mine&item={rid}", 390, 844)
    run(chrome, """
      await click('#kn-body .is-target .kn-detail > summary');
      await wait('#kn-body .is-target .kn-detail[open]');
    """)
    expect("상세 이력이 390px 안", """
      return [...document.querySelectorAll('#kn-body .is-target .kn-detail .pn-note, #kn-body .is-target .kn-history, #kn-body .is-target .kn-detail .pn-rows')]
        .every(x => x.scrollWidth <= x.clientWidth + 1);""")
    expect("현장 확인 버튼은 좁은 폭에서 같은 폭", """
      return new Set([...document.querySelectorAll('#kn-body .is-target [data-verify]')].map(x => Math.round(x.getBoundingClientRect().width))).size === 1;""")
    expect("상세 이력 첫 줄은 내 접수", """
      const own = (await ApiClient.getMyReports('U-013')).find(r => r.id === '""" + rid + """').createdAt;
      const first = $('#kn-body .is-target .kn-history > div');
      return first.querySelector('dt').textContent.includes(Number(own.slice(8, 10)) + '일 ' + own.slice(11, 16)) && first.querySelector('dd').textContent === '내 접수';""")
    expect("진행상황에 완료를 한 번만", """
      const track = $('#kn-body .is-target').querySelectorAll('.nt-track')[1].cloneNode(true);
      track.querySelectorAll('.pn-sr-only').forEach(x => x.remove());   // 화면 읽기용 글은 보이지 않는다
      return (track.textContent.match(/검증 완료/g) || []).length === 1;""")
    run(chrome, """
      await click('#kn-body .is-target [data-verify=NOT_TESTED]');
      await wait('#kn-body .is-target [data-verify=NOT_TESTED][aria-pressed=true]');
    """)
    expect("답한 뒤에도 펼친 상세 이력 유지", "return $('#kn-body .is-target .kn-detail').open;")

    open_real(chrome, "index.html", "#role=MANAGER&board=known&panel=known&tab=team&item=D-2026-007")
    run(chrome, "await wait('#kn-body .kn-card.is-target');")
    expect("관리자에게 접수하라고 하지 않음", "return !$('#kn-body .kn-card.is-target').innerText.includes('접수로 알려');")

    open_real(chrome, "index.html", "#role=FC")
    owners = run(chrome, "return (await ApiClient.getUsers()).filter(u => u.role === 'FC').map(u => u.id);")
    for user in owners:
        open_real(chrome, "index.html", f"#role=FC&user={user}&panel=known&tab=mine")
        wrong = run(chrome, """
          await wait('#kn-body h3');
          const key = (t) => { const m = t.match(/(\\d+)월 (\\d+)일 (\\d+):(\\d+)/); return m ? m[1] * 1e6 + m[2] * 1e4 + m[3] * 100 + +m[4] : 0; };
          const mine = await ApiClient.getMyReports('""" + user + """'), out = [];
          for (const card of document.querySelectorAll('#kn-body .kn-card[data-id]')) {
            const times = [...card.querySelectorAll('.kn-stage-at')].map(x => key(x.textContent)).filter(Boolean);
            if (times.some((t, i) => i && t < times[i - 1])) out.push('시각 순서 ' + card.dataset.id);
            const li = [...card.querySelectorAll('.kn-stages li')];
            if (li.some(x => !x.querySelector('.kn-stage-at'))) out.push('시각 칸 빔 ' + card.dataset.id);
            if (li.filter(x => x.classList.contains('is-now')).length !== 1) out.push('지금 단계 하나 ' + card.dataset.id);
            const r = mine.find(x => x.id === card.dataset.id), now = card.querySelector('.kn-stages li.is-now');
            if (r && r.defect && r.defect.status === 'WORKAROUND' && now && !now.textContent.includes('임시 방법 안내')) out.push('지금 = 현재 상태 ' + r.id);
          }
          return out;
        """)
        bad += wrong
    assert not bad, "화면 규칙 어김: " + ", ".join(bad)


def check_fc_only(chrome):
    """현장 확인은 신고자 본인이면서 FC 역할만(ADR-029 보완). 어긴 것을 한 번에 모은다."""
    bad = []

    def expect(name, body):
        if not run(chrome, body):
            bad.append(name)

    open_real(chrome, "index.html", "#role=FC")
    event = run(chrome, """
      const at = (m) => kst(m) + ':00+09:00';
      // 시드 R-031 은 관리자 본인 명의. 영업·IT 본인 명의 신고를 같은 결함에 하나씩 더한다
      for (const who of ['U-020', 'U-030']) {
        const r = await ApiClient.postQuickIntake({ requestId: 'own-' + who, reporterId: who, submittedById: who, business: 'SUBSCRIPTION',
          symptom: 'CANNOT_PROCEED', oneLine: '서명 화면이 멈춰요', urgent: [], extraSymptoms: [], incident: {} });
        await ApiClient.postLinkReport('D-2026-002', r.id);
      }
      const r = await ApiClient.postStatus('D-2026-002', { from: 'FIX_PLANNED', to: 'RESOLVED', eventId: 'fc-only', actorId: 'U-030', resolution: {
        appliedAt: at(3), scope: 'LINKED', change: '화면이 정상으로 열려요.', action: 'RETRY', approved: true,
        verification: { result: 'VERIFIED', verifiedAt: at(1), usageGuide: '기존 절차대로 진행해 주세요.' } } });
      assert(!r.error, '검증 완료 준비');
      return r.historyId;
    """)
    for who in ("U-010", "U-020", "U-030"):
        expect("저장 거부 " + who, """
          const r = (await ApiClient.getMyReports('""" + who + """')).find(x => x.defectId === 'D-2026-002' && x.reporterId === '""" + who + """');
          assert(r, '본인 명의 신고 준비');
          const before = IntakeDemoStore.read().verifications.length;
          const saved = await ApiClient.postFieldVerification(r.id, '""" + who + """', '""" + event + """', 'STILL_FAIL');
          return saved === null && IntakeDemoStore.read().verifications.length === before && !(IntakeDemoStore.read().followups[r.id] || []).length;""")
        expect("알림 행동 글 " + who, """
          const n = (await ApiClient.getNotifications('""" + who + """')).find(x => x.historyId === '""" + event + """');
          return n && n.audience === 'REPORTER' && n.summary.status === '수정 완료' && n.summary.action === '처리경과 확인';""")
    expect("FC 알림은 그대로", """
      const d = await ApiClient.getDefect('D-2026-002');
      const fc = d.reports.find(r => r.reporterId !== 'U-010' && r.reporterId !== 'U-020' && r.reporterId !== 'U-030');
      return (await ApiClient.getNotifications(fc.reporterId)).find(x => x.historyId === '""" + event + """').summary.action === '정상 이용 확인';""")
    expect("집계는 FC 신고만", """
      const d = await ApiClient.getDefect('D-2026-002'), f = d.fieldVerification;
      const roles = new Map((await ApiClient.getUsers()).map(u => [u.id, u.role]));
      const fcReports = d.reports.filter(r => roles.get(r.reporterId) === 'FC');
      return f.fcs.every(x => roles.get(x.id) === 'FC') && f.reportCount === fcReports.length && f.reports.length === fcReports.length &&
        f.reporterCount === new Set(fcReports.map(r => r.reporterId)).size;""")
    expect("FC 본인은 그대로 저장", """
      const d = await ApiClient.getDefect('D-2026-002');
      const roles = new Map((await ApiClient.getUsers()).map(u => [u.id, u.role]));
      const r = d.reports.find(x => roles.get(x.reporterId) === 'FC');
      return !!(await ApiClient.postFieldVerification(r.id, r.reporterId, '""" + event + """', 'CONFIRMED_OK'));""")
    expect("전에 저장된 관리자 답은 읽지 않음", """
      await IntakeDemoStore.update(s => {
        s.verifications.push({ id: 'FV-90', seq: 90, reportId: 'R-031', defectId: 'D-2026-002', resolutionEventId: '""" + event + """',
          result: 'STILL_FAIL', at: kst(0) + ':00+09:00', actorId: 'U-010', requestId: null });
      });
      const r = (await ApiClient.getMyReports('U-010')).find(x => x.id === 'R-031');
      const d = (await ApiClient.getDefects({})).find(x => x.id === 'D-2026-002');
      return !r.fieldVerification && !r.fieldHistory.length && d.fieldFailCount === 0 &&
        await ApiClient.postFieldInvestigation('R-031', 'U-030', '""" + event + """', 'STARTED') === null;""")

    open_real(chrome, "index.html", "?selftest=1#role=MANAGER&user=U-010&panel=known&tab=mine&item=R-031")
    run(chrome, "await wait('#kn-body .is-target'); await selftest('관리자 본인 신고');")
    expect("관리자 본인 카드에 질문 없음", """
      const card = $('#kn-body .is-target');
      return card.innerText.includes('기존 절차대로 진행해 주세요.') && !card.querySelector('.kn-verify, [data-verify]') && !card.innerText.includes('FC 현장 확인');""")
    for role, who in (("SALES", "U-020"), ("IT", "U-030")):
        open_real(chrome, "index.html", f"#role={role}&user={who}&panel=known&tab=mine")
        run(chrome, "await wait('#kn-body .kn-card');")
        expect("본인 카드에 질문 없음 " + who, "return !document.querySelector('#kn-body [data-verify]');")
    open_real(chrome, "ledger.html", "?selftest=1#role=IT&item=D-2026-002")
    run(chrome, "await wait('[data-field-verification]'); await selftest('FC만 세는 현장 확인 현황');")
    expect("IT 현황은 FC 기준", """
      const card = $('[data-field-verification]'), f = (await ApiClient.getDefect('D-2026-002')).fieldVerification;
      return card.innerText.includes('FC ' + f.reporterCount + '명 · 신고 ' + f.reportCount + '건') &&
        !['박새벽', '최누리', '정한결'].some(name => card.innerText.includes(name));""")
    assert not bad, "FC만 규칙 어김: " + ", ".join(bad)


if __name__ == "__main__":
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    for part in (check_main, check_variants, check_screen_rules, check_fc_only):
        with tempfile.TemporaryDirectory(prefix="field-verification-") as profile:
            chrome = Chrome(browser, profile)
            try:
                chrome.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, chrome.session)
                part(chrome)
            finally:
                chrome.close()
    print("PASS: TC-01 간결한 수정 예정 알림, TC-02 수정·배포 검증 완료(가상), TC-03 정상 확인, TC-04 문제 지속, "
          "TC-05 미확인, TC-06 다중 신고·수신자·멱등·권한, TC-07 재배포, 검증 없는 해결·임시 방법 종료·대리 접수, 화면 규칙, FC 역할만")
