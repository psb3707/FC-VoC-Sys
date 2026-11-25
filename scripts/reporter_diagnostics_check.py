#!/usr/bin/env python3
"""신고자 정보 자동 연결과 접수·발생 환경 진단 (ADR-028, REQ-IN-17·18, REQ-LG-11).

TC-01 일반 FC 접수: 로그인 사용자(가상) 이름·계정·지점이 입력 없이 연결되고 IT 결함 대장에서 같은 신고자 정보.
TC-02 AI 상담 인계: 상담 조건과 로그인 정보·접수 환경이 함께 연결, 다시 입력하지 않음.
TC-03 고객 모바일 오류: 접수 환경은 PC(자동 확인), 발생 환경은 고객 휴대전화(FC 진술), 고객 브라우저는 미확인.
TC-04 대리 접수: reporterId=FC, submittedById=관리자, 접수 환경은 관리자 세션, 지점은 FC 기준, 다른 지점 FC는 거부.
TC-05 역할 변경·권한: 이전 사용자 정보가 남지 않음, FC는 다른 FC 정보를 못 봄, 관리자는 지점 범위.
TC-06 수집 실패·출처: 브라우저를 알 수 없으면 미확인, 접수는 됨. FC가 적은 값은 FC 진술로.
TC-07 보안: AI 요청에 신고자·지점·계정·접수 환경 없음, User-Agent 전체·주소·토큰 저장 없음, 사용자 fixture 는 가상.
접수 환경 값은 실행하는 브라우저(headless Chrome)에 따라 달라지므로 형식만 확인한다.
"""
import tempfile

from consent_keypad_e2e_check import CONSENT, consult
from intake_followup_check import evaluate, open_page
from ui_check import Chrome, find_browser

DIAG = CONSENT + """
const review = async (business, text) => {
  await fill('#quick-business', business);
  await fill('#quick-oneLine', text);
  await act('quick-review');
  return await wait('[data-identity]');
};
const submitted = async () => {
  await act('quick-submit');
  await wait('#quick-receipt-id');
  const id = $('#quick-receipt-id').textContent.replace('접수번호 ', '').trim();
  return IntakeDemoStore.read().reports.find(r => r.id === id);
};
const leaks = (text) => ['Mozilla', 'HeadlessChrome', 'AppleWebKit', 'file://', '?selftest', 'DEMO-PRIVATE', 'sessionToken', 'customerId']
  .filter(word => text.includes(word));
"""


def ledger_panel(chrome, report_id, expect):
    open_page(chrome, "ledger.html", "?selftest=1#role=SALES")
    evaluate(chrome, DIAG + """
      const id = '""" + report_id + """';
      // ADR-030: 그 문의가 전달된 문의함의 현업 담당자로 연다(분류는 규칙)
      const staff = (await ApiClient.getUsers()).filter(u => u.role === 'SALES');
      let owner = null;
      for (const u of staff) { const q = await ApiClient.getInquiry(id, u.id); if (q && !q.forbidden) { owner = u.id; break; } }
      assert(owner, '문의함 담당자 ' + id);
      location.hash = '#role=SALES&user=' + owner;
      await wait(() => $('#ld-q') && $('#ld-viewer').textContent.includes(staff.find(u => u.id === owner).name));
      await fill('#ld-q', id);
      $('#ld-search').requestSubmit();
      await click('[data-open="' + id + '"]');
      const who = (await wait('#ld-body [data-report-reporter]')).innerText;
      const facts = $('#ld-body [data-report-facts]').innerText, trace = $('#ld-body [data-report-trace]').innerText;
      const expect = """ + expect + """;
      expect.who.forEach(t => assert(who.includes(t), '신고자 정보: ' + t + ' / ' + who));
      (expect.facts || []).forEach(t => assert(facts.includes(t), '오류 발생 정보: ' + t + ' / ' + facts));
      (expect.notFacts || []).forEach(t => assert(!facts.includes(t), '오류 발생 정보에 없어야 함: ' + t));
      assert(trace.includes('시스템 로그') && trace.includes('연계 전') && trace.includes('업무 요청 ID') && trace.includes('오류 코드\\n미확인') &&
        trace.includes('실제 로그를 조회하거나 분석한 결과가 아니에요'), '로그 추적 단서: 연계 전, 가짜 로그 없음');
      (expect.trace || []).forEach(t => assert(trace.includes(t), '로그 추적 단서: ' + t + ' / ' + trace));
      const heads = [...document.querySelectorAll('#ld-body h4')].map(h => h.textContent);
      assert(heads[0] === '① 문의자와 발생 환경', '문의자 정보가 ① 맨 위');
      await selftest('대장 신고자·진단 정보');
    """)


def check(chrome):
    chrome.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, chrome.session)

    # TC-01 일반 FC 접수 (김하늘 U-001)
    open_page(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=problem")
    tc01 = evaluate(chrome, DIAG + """
      const card = await review('LOGIN', '로그인 화면이 하얗게 떠요');
      const text = card.innerText;
      assert(text.includes('김하늘(가상) · FC · 계정 U-001') && text.includes('해오름지점(가상)') &&
        text.includes('접수할 때 자동 기록 · 메인 화면 (MAIN) · 자동 확인') && /PC · Chrome \\d+ · 자동 확인/.test(text), '자동으로 연결된 정보 ' + text);
      assert(!card.querySelector('input, select, textarea, button'), '신고자 정보는 고칠 수 없음(입력 칸 없음)');
      await selftest('확인 화면 자동 연결 정보');
      const saved = await submitted();
      const json = JSON.stringify(saved);
      assert(saved.reporterId === 'U-001' && saved.submittedById === 'U-001', '신고자·접수자 ID');
      assert(!json.includes('김하늘') && !json.includes('해오름') && !('reporterName' in saved) && !('branchName' in saved),
        '이름·지점명은 저장하지 않고 조회');
      const sub = saved.diagnostics.submission;
      assert(sub.source === 'BROWSER_CAPTURED' && sub.deviceType === 'PC' && /^Chrome \\d{1,3}$/.test(sub.browser) &&
        sub.screenCode === 'MAIN' && sub.at, '접수 환경 자동 기록(종류·주 버전만) ' + JSON.stringify(sub));
      assert(!leaks(JSON.stringify(IntakeDemoStore.read())).length, 'User-Agent 전체·주소·토큰 저장 없음 ' + leaks(JSON.stringify(IntakeDemoStore.read())));
      return saved.id;
    """)
    ledger_panel(chrome, tc01, "{ who: ['김하늘(가상) · FC', 'U-001', '해오름지점(가상)', '아니요 · 본인 접수', '자동 확인'] }")

    # TC-02·03 AI 상담 인계 + 고객 모바일 오류 (남다래 U-013, 고객 동의 키패드)
    open_page(chrome, "index.html", "?selftest=1#role=FC&user=U-013&panel=intake&step=assistant")
    evaluate(chrome, DIAG + """
      window.__aiCalls = [];
      for (const name of ['postIntakeQuestion', 'planIntakeDraft', 'previewIntakeDraft']) {
        const original = ApiClient[name];
        ApiClient[name] = function () { window.__aiCalls.push(JSON.stringify([...arguments])); return original.apply(this, arguments); };
      }
    """)
    consult(chrome, "YES", ["ANDROID", "IN_APP", "YES"])
    tc02 = evaluate(chrome, DIAG + """
      await act('assistant-handoff');
      const who = (await wait('[data-identity]')).innerText;
      assert(who.includes('남다래(가상) · FC · 계정 U-013') && who.includes('해오름지점(가상)'), '상담 뒤에도 로그인 정보 연결');
      const env = $('[data-incident-env]').innerText;
      assert($('#quick-device').value === 'CUSTOMER_PHONE' && $('#quick-cond-DEVICE_OS').value === 'ANDROID' && $('#quick-cond-INPUT_STEP').value === 'BACK',
        '상담 값은 확인한 내용 카드에 그대로(다시 입력 없음)');
      assert(env.includes('AI 문의에서 확인한 내용') && !env.includes('고객 휴대전화'), '오류가 발생한 환경은 위 카드 값을 되풀이하지 않음 ' + env);
      const browserRow = [...$('[data-incident-env]').querySelectorAll('.pn-rows > div')].find(d => d.querySelector('dt').textContent === '브라우저');
      assert(browserRow.querySelector('dd').textContent === '미확인' && !env.includes('Chrome'), '고객 브라우저는 미확인(접수 PC 값 복사 없음)');
      await selftest('확인 화면 오류가 발생한 환경');
      const saved = await submitted();   // 다른 칸을 채우지 않고 바로 접수
      assert(saved.reporterId === 'U-013' && saved.submittedById === 'U-013' && saved.incident.device === 'CUSTOMER_PHONE' &&
        saved.factSources.device === 'USER_REPORTED' && saved.conditions.DEVICE_OS === 'ANDROID', '상담 조건 반영');
      assert(saved.diagnostics.submission.deviceType === 'PC' && !saved.diagnostics.incident.browser && !saved.diagnostics.incident.device &&
        saved.diagnostics.incident.source === null, '접수 환경 PC, 발생 환경 이벤트 없음');
      const calls = window.__aiCalls.join(' ');
      assert(calls.length && !/U-0\\d\\d|남다래|해오름|B-01|Chrome|MAIN/.test(calls), 'AI 요청에 신고자·지점·계정·접수 환경 없음 ' + calls);
      return saved.id;
    """)
    ledger_panel(chrome, tc02, """{ who: ['남다래(가상) · FC', 'U-013', '해오름지점(가상)', '아니요 · 본인 접수'],
      facts: ['고객 휴대전화 · FC가 알려 줌', 'Android · FC가 알려 줌', '뒷자리 입력', '고객동의·본인확인', '입력할 수 없어요'],
      notFacts: ['Chrome'], trace: ['고객 브라우저 (확인 필요)', '접수 MAIN · 발생 미확인'] }""")

    # TC-04 대리 접수 (관리자 박새벽 U-010 → 정다솜 U-011)
    open_page(chrome, "index.html", "?selftest=1#role=MANAGER&panel=intake&step=problem")
    tc04 = evaluate(chrome, DIAG + """
      const names = [...document.querySelectorAll('#pn-proxy-select option')].map(o => o.value).filter(Boolean);
      assert(names.join(',') === 'U-001,U-011,U-012,U-013', '대리 접수는 같은 지점 FC만 ' + names);
      await fill('#pn-proxy-select', 'U-011');
      const card = await review('SUBSCRIPTION', '서명 화면이 멈춰요');
      assert(card.innerText.includes('정다솜(가상) · FC · 계정 U-011') && card.innerText.includes('박새벽(가상) · 관리자 · 계정 U-010 (대신 접수)') &&
        card.innerText.includes('해오름지점(가상)'), '신고자와 접수자 구분');
      const saved = await submitted();
      assert(saved.reporterId === 'U-011' && saved.submittedById === 'U-010' && saved.diagnostics.submission.source === 'BROWSER_CAPTURED',
        '신고자 FC·접수자 관리자·접수 환경은 관리자 세션');
      const count = IntakeDemoStore.read().reports.length;
      const base = { business: 'LOGIN', oneLine: '로그인이 안 돼요', urgent: [], extraSymptoms: [], incident: {} };
      for (const [reporterId, submittedById] of [['U-003', 'U-010'], ['U-999', 'U-010'], ['U-011', 'U-012'], ['U-011', undefined]]) {
        const r = await ApiClient.postQuickIntake(Object.assign({ requestId: 'tc04-' + reporterId + '-' + submittedById, reporterId, submittedById }, base));
        assert(r.identityError, '신원 검증 오류: ' + reporterId + '/' + submittedById);
      }
      assert((await ApiClient.postQuickParticipation('D-2026-007', 'U-003', 'U-010', {})).identityError, '참여도 같은 검증');
      assert(IntakeDemoStore.read().reports.length === count, '검증 오류는 저장 0건');
      return saved.id;
    """)
    ledger_panel(chrome, tc04, "{ who: ['정다솜(가상) · FC · U-011', '해오름지점(가상)', '박새벽(가상) · 관리자 · U-010 (대신 접수)'] }")

    # TC-05 역할 변경·권한
    open_page(chrome, "index.html", "?selftest=1#role=MANAGER&panel=intake&step=problem")
    evaluate(chrome, DIAG + """
      await review('LOGIN', '로그인 확인');
      assert($('[data-identity]').innerText.includes('박새벽(가상) · 관리자'), '관리자 본인 접수');
      location.hash = '#role=FC&user=U-012&panel=intake&step=problem';
      await wait(() => $('#quick-business') && !$('#quick-business').value);
      const card = await review('LOGIN', '로그인 확인');
      assert(card.innerText.includes('조은별(가상) · FC · 계정 U-012') && !card.innerText.includes('박새벽'), '역할을 바꾸면 이전 사용자 정보 없음');
      assert(await ApiClient.getReporterContext('U-001', 'U-012', 'U-012') === null, 'FC는 다른 FC 정보를 못 봄');
      assert(await ApiClient.getReporterContext('U-010', 'U-003', 'U-003') === null, '관리자는 다른 지점 FC 정보를 못 봄');
      assert((await ApiClient.getReporterContext('U-010', 'U-011', 'U-011')).reporter.id === 'U-011', '관리자는 같은 지점 FC');
      assert((await ApiClient.getReporterContext('U-030', 'U-003', 'U-003')).reporter.branchName === '새솔지점(가상)', 'IT는 조회');
      assert(await ApiClient.getReporterContext('U-999', 'U-001', 'U-001') === null, '로그인 사용자를 못 찾으면 신원 없음');
    """)
    open_page(chrome, "index.html", "?selftest=1#role=MANAGER&board=known&panel=known&tab=team")
    evaluate(chrome, DIAG + """
      const body = (await wait('#kn-body [data-team-summary]')) && $('#kn-body').textContent;
      assert(!/U-0\\d\\d/.test(body), '관리자 지점 FC 문의에는 계정 ID 없음');
    """)

    # TC-06 수집 실패·출처
    open_page(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=problem&diagnostics=fail")
    evaluate(chrome, DIAG + """
      Object.defineProperty(navigator, 'userAgent', { get: () => '' });
      Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
      const d = await ApiClient.getIntakeDiagnostics('');
      assert(d.submission.device === null && d.submission.browser === null && d.submission.screenCode === 'MAIN', '알 수 없으면 비움');
      const card = await review('DESIGN', '보험료 계산이 늦어요');
      assert(card.innerText.includes('접수 환경\\n미확인'), '접수 환경 미확인 표시 ' + card.innerText);
      assert($('[data-incident-env]').innerText.includes('아직 확인된 발생 환경이 없어요'), '모두 미확인이면 한 줄');
      await click('[data-quick-section=extra] > summary');
      await click('[data-quick-section=incident] > summary');
      await fill('#quick-screen', '보험료 계산 화면');
      assert($('[data-incident-env]').innerText.includes('보험료 계산 화면 · FC가 알려 줌'), 'FC가 적은 값은 FC 진술로');
      assert(!$('[data-incident-env]').innerText.includes('자동 확인'), 'FC 값을 자동 수집으로 표시하지 않음');
      const saved = await submitted();
      assert(saved && saved.diagnostics.failed && saved.diagnostics.submission.browser === null, '수집 실패여도 접수됨');
    """)
    open_page(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=problem&diagnostics=mobile")
    evaluate(chrome, DIAG + """
      await review('SUBSCRIPTION', '서명 링크가 다른 화면을 열어요');
      assert($('[data-incident-env]').innerText.includes('모바일 브라우저 17.0 · 시연 진단 이벤트(가상)'), '시연 이벤트는 자동 확인과 구분');
      const saved = await submitted();
      const inc = saved.diagnostics.incident;
      assert(inc.source === 'DEMO_CONTEXT' && inc.errorCode === 'SFA-SIGN-LINK' && !('customerId' in inc) && !('sessionToken' in inc),
        '진단 이벤트는 허용 값만');
    """)

    # TC-07 보안: 저장소·사용자 fixture
    evaluate(chrome, DIAG + """
      const dump = JSON.stringify(IntakeDemoStore.read()) + JSON.stringify(localStorage);
      assert(!leaks(dump).length, '공유 저장소에 허용하지 않은 진단정보 없음 ' + leaks(dump));
      assert((await ApiClient.getUsers()).every(u => /\\(가상\\)$/.test(u.name)), '사용자 fixture 는 가상 이름');
    """)


if __name__ == "__main__":
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    with tempfile.TemporaryDirectory(prefix="reporter-diagnostics-") as profile:
        chrome = Chrome(browser, profile)
        try:
            check(chrome)
            print("PASS: TC-01 일반 접수 자동 연결, TC-02 AI 상담 인계, TC-03 고객 모바일 발생 환경 분리, TC-04 대리 접수·신원 검증, "
                  "TC-05 역할 변경·권한, TC-06 수집 실패·출처, TC-07 보안")
        finally:
            chrome.close()
