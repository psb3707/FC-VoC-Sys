#!/usr/bin/env python3
"""문의 분류·담당 문의함·인수·현업 대응·IT 사전 협의 (ADR-030, docs/11-test-plan.md 1-1절 E2E-01~09·11·14·15).

실제 화면과 ApiClient 를 쓴다. 분류는 규칙이며 AI 분류가 아니다. 부서·문의함은 가상 매핑이다.
그룹웨어·메신저 발송, ITGS 등록은 없다(초안은 저장하지 않는다).
"""
import tempfile

from field_verification_check import open_real, run
from ui_check import Chrome, find_browser

FLOW = """
const notes = async (user, kind) => (await ApiClient.getNotifications(user)).filter(n => !kind || n.kind === kind);
const inbox = async (user, opt) => ApiClient.getInbox(user, opt || {});
const ids = (box) => box.items.map(x => x.id);
const intake = async (reporter, business, extra) => ApiClient.postQuickIntake(Object.assign({
  requestId: 'REQ-' + reporter + '-' + business + '-' + Math.random(), reporterId: reporter, submittedById: reporter,
  business, symptom: 'CANNOT_INPUT', oneLine: '고객 동의 화면에서 뒷자리 키패드가 안 떠요', finalType: 'DEFECT',
  // AI 문의 대표 시연처럼 질문 문장에서 안 발생 조건(뒷자리·키패드)을 함께 넣는다. 자유 입력 원문은 다른 화면에 저장되지 않는다(ADR-021)
  conditions: business === 'CUSTOMER_CONSENT' ? { INPUT_STEP: 'BACK', KEYPAD_SYMPTOM: 'NO_KEYPAD' } : {},
  supportNeeded: 'YES', factSources: { supportNeeded: 'USER_REPORTED', conditions: 'USER_REPORTED' } }, extra || {}));
const STAFF = ['U-020', 'U-021', 'U-022', 'U-023', 'U-024', 'U-030'];
const counts = async (kind) => Object.fromEntries(await Promise.all(STAFF.map(async u => [u, (await notes(u, kind)).length])));
"""


def check_routing(chrome):
    """E2E-01 접수 → 부서 문의함, E2E-02 미분류·공통 분류, E2E-03 재분류, E2E-14 대리 접수"""
    open_real(chrome, "ledger.html", "#role=SALES")
    run(chrome, FLOW + """
      // E2E-01: 고객동의·본인확인 → 고객동의업무팀(가상) 문의함. 그 문의함 담당자 둘에게만 신규 문의 알림
      const before = await counts('NEW_INQUIRY');
      const r = await intake('U-013', 'CUSTOMER_CONSENT');
      assert(r.id === 'R-Q1', '접수 ' + JSON.stringify(r));
      const route = (await ApiClient.getInquiry(r.id, 'U-021')).routing;
      assert(route.inboxId === 'IB-CONSENT' && route.method === 'RULE' && route.basis.some(b => b.kind === 'BUSINESS'), '규칙 분류 ' + JSON.stringify(route));
      const after = await counts('NEW_INQUIRY');
      const grew = STAFF.filter(u => after[u] !== before[u]);
      assert(JSON.stringify(grew) === JSON.stringify(['U-021', 'U-022']) && after['U-021'] - before['U-021'] === 1, '신규 문의 알림은 그 문의함 담당자만 ' + JSON.stringify([before, after]));
      assert(ids(await inbox('U-021')).includes('R-Q1') && !ids(await inbox('U-023')).includes('R-Q1'), '그 부서 문의함에만');
      assert(!(await ApiClient.getItConsults('U-030')).some(x => x.id === 'R-Q1'), 'IT에는 협의 요청 전 안 보임');

      // E2E-02: 근거가 없으면 미분류, 업무와 오류 화면이 다르면 공통 분류, 업무 없이 화면만 있으면 그 화면의 문의함
      const none = await intake('U-001', 'ETC', { symptom: 'ETC', oneLine: '어느 메뉴인지 모르겠는데 화면이 하얘요' });
      const both = await intake('U-002', 'CUSTOMER_CONSENT', { diagnosticMode: 'mobile' });
      const screen = await intake('U-003', 'ETC', { symptom: 'ETC', diagnosticMode: 'mobile', oneLine: '링크를 여니 다른 화면이 떠요' });
      const routeOf = async (id) => (await ApiClient.getInquiry(id, 'U-020')).routing || (await ApiClient.getInquiry(id, 'U-023')).routing;
      assert((await routeOf(none.id)).inboxId === 'IB-UNCLASSIFIED', '근거 없음 → 미분류');
      assert((await routeOf(both.id)).inboxId === 'IB-TRIAGE', '업무 둘 → 공통 분류');
      const byScreen = await routeOf(screen.id);
      assert(byScreen.inboxId === 'IB-SUBSCRIPTION' && byScreen.basis.map(b => b.kind).join() === 'SCREEN', '화면 ID로 분류 ' + JSON.stringify(byScreen));
      const triage = ids(await inbox('U-020'));
      assert(triage.includes(none.id) && triage.includes(both.id) && triage.includes('R-062') && triage.includes('R-014'), '미분류·공통 분류는 최누리 문의함');
      assert(ids(await inbox('U-023')).includes('R-061'), '시드 R-061(청약) → 청약업무팀');
      assert(ids(await inbox('U-020')).includes('R-066'), '시드 R-066(로그인) → 영업지원팀');

      // E2E-03: 재분류. 문의·대화·이력은 그대로, 새 문의함 담당자에게 알림, 분류 이력 2건, 담당이 비워짐
      assert((await ApiClient.postInquiryAction('R-062', 'U-021', { type: 'REROUTE', inboxId: 'IB-SUBSCRIPTION', codes: ['WRONG_BUSINESS'], requestId: 'RR-0' })).error, '다른 문의함 담당자는 재분류 못 함');
      const n23 = (await notes('U-023', 'NEW_INQUIRY')).length;
      const moved = await ApiClient.postInquiryAction('R-062', 'U-020', { type: 'REROUTE', inboxId: 'IB-SUBSCRIPTION', codes: ['WRONG_BUSINESS'], requestId: 'RR-1' });
      assert(moved && !moved.error, '재분류 ' + JSON.stringify(moved));
      await ApiClient.postInquiryAction('R-062', 'U-020', { type: 'REROUTE', inboxId: 'IB-SUBSCRIPTION', codes: ['WRONG_BUSINESS'], requestId: 'RR-1' });
      const d62 = await ApiClient.getInquiry('R-062', 'U-023');
      assert(d62.routes.length === 2 && d62.routes[1].reasonCode === 'WRONG_BUSINESS' && d62.routes[1].actorId === 'U-020', '분류 이력 2건 ' + JSON.stringify(d62.routes));
      assert(d62.report.maskedText === '첨부 메뉴 글자가 겹쳐 보여요' && !d62.assignment, '내용 보존·담당 비움');
      assert((await notes('U-023', 'NEW_INQUIRY')).length === n23 + 1, '새 문의함 알림 1건(같은 요청 두 번)');
      assert(!ids(await inbox('U-020')).includes('R-062') && ids(await inbox('U-023')).includes('R-062'), '문의함 이동');
      assert((await ApiClient.getInquiry('R-062', 'U-020')).forbidden, '보낸 뒤 앞 문의함 담당자는 상세 못 봄');
      // 인수한 문의를 재분류하면 담당이 비고 새 문의함에서 신규로 시작한다
      await ApiClient.claimInquiry('R-014', 'U-020', 'CL-14');
      await ApiClient.postInquiryAction('R-014', 'U-020', { type: 'REROUTE', inboxId: 'IB-CUSTOMER', codes: ['WRONG_BUSINESS'], requestId: 'RR-14' });
      const d14 = await ApiClient.getInquiry('R-014', 'U-024');
      assert(!d14.assignment && d14.handling.code === 'NEW' && d14.can.claim, '재분류 뒤 담당 비움 ' + JSON.stringify(d14.assignment));
      assert(!ids(await inbox('U-020')).includes('R-014'), '앞 담당자 문의함에서 빠짐');

      // E2E-14: 대리 접수는 문의자 기준으로 분류하고 문의자와 접수자를 구분
      const proxy = await intake('U-011', 'SUBSCRIPTION', { submittedById: 'U-010', symptom: 'WRONG_SCREEN', oneLine: '서명 화면이 멈춰요' });
      const pd = await ApiClient.getInquiry(proxy.id, 'U-023');
      assert(pd.routing.inboxId === 'IB-SUBSCRIPTION' && pd.reporter.id === 'U-011' && pd.submittedBy.id === 'U-010', '대리 접수 구분');
      return true;
    """)


def check_handling(chrome):
    """E2E-04·05 인수, E2E-06 미확인, E2E-07 자체 해결, E2E-08 IT 협의, E2E-09 ITGS 초안, E2E-11 중복, E2E-15 권한"""
    open_real(chrome, "ledger.html", "#role=SALES")
    run(chrome, FLOW + """
      const r = await intake('U-013', 'CUSTOMER_CONSENT');
      // E2E-04: 읽음·확인·인수는 따로
      const n = (await notes('U-021', 'NEW_INQUIRY'))[0];
      await ApiClient.markNotificationRead(n.id, 'U-021');
      let d = await ApiClient.getInquiry(r.id, 'U-021');
      assert(!d.assignment && !d.viewedBy.includes('U-021') && d.handling.code === 'NEW', '읽음은 확인·인수가 아님');
      await ApiClient.markInquiryViewed(r.id, 'U-021');
      d = await ApiClient.getInquiry(r.id, 'U-021');
      assert(d.viewedBy.includes('U-021') && !d.assignment, '확인은 인수가 아님');
      let card = (await ApiClient.getMyReports('U-013')).find(x => x.id === r.id);
      assert(card.handling.code === 'NEW', 'FC는 담당자 확인 전');

      // E2E-05: 인수 한 명, 같은 요청 1건, 다른 문의함 담당자 거부
      const first = await ApiClient.claimInquiry(r.id, 'U-021', 'CL-1');
      const again = await ApiClient.claimInquiry(r.id, 'U-021', 'CL-1');
      const other = await ApiClient.claimInquiry(r.id, 'U-022', 'CL-2');
      const outside = await ApiClient.claimInquiry(r.id, 'U-023', 'CL-3');
      assert(first.assigned && again.duplicate && other.error === 'ALREADY_ASSIGNED' && other.assignee.id === 'U-021' && outside.error === 'FORBIDDEN', '인수 ' + JSON.stringify([first, again, other, outside]));
      card = (await ApiClient.getMyReports('U-013')).find(x => x.id === r.id);
      assert(card.handling.code === 'ASSIGNED' && card.handling.label === '담당 부서 확인 중', 'FC 카드 ' + JSON.stringify(card.handling));

      // 인수하지 않은 사람은 대응 기록을 못 남김. 대응 방법은 승인·공개된 임시 방법만
      assert((await ApiClient.postInquiryAction(r.id, 'U-022', { type: 'INFO_REQUEST', codes: ['URL_PATH'], requestId: 'A-0' })).error, '인수 안 한 사람');
      assert((await ApiClient.postInquiryAction(r.id, 'U-021', { type: 'GUIDE', guideDefectId: 'D-2026-007', requestId: 'A-G0' })).error, '임시 방법 없는 공통 오류는 안내 못 함');

      // E2E-06 + E2E-11: 추가 정보 요청 → 문의자(본인)만 선택형으로 답, 모르는 값은 미확인. 같은 요청은 알림 1건
      const before = (await notes('U-013', 'INFO_REQUEST')).length;
      await ApiClient.postInquiryAction(r.id, 'U-021', { type: 'INFO_REQUEST', codes: ['URL_PATH', 'REPEAT'], requestId: 'A-1' });
      await ApiClient.postInquiryAction(r.id, 'U-021', { type: 'INFO_REQUEST', codes: ['URL_PATH', 'REPEAT'], requestId: 'A-1' });
      assert((await notes('U-013', 'INFO_REQUEST')).length === before + 1, '추가 정보 알림 1건');
      assert(!(await ApiClient.postInfoReply(r.id, 'U-012', { URL_PATH: 'IN_APP' }, 'IR-0')), '다른 FC는 답 못 함');
      const reply = await ApiClient.postInfoReply(r.id, 'U-013', { URL_PATH: 'IN_APP', REPEAT: 'UNKNOWN' }, 'IR-1');
      assert(reply && reply.saved, '답 저장');
      d = await ApiClient.getInquiry(r.id, 'U-021');
      assert(d.handling.code === 'INFO_ARRIVED', '추가 정보 도착 ' + d.handling.code);
      const added = d.facts.filter(f => f.source === 'USER_ADDED').map(f => f.key + '=' + f.value).sort().join();
      assert(added === 'REPEAT=UNKNOWN,URL_PATH=IN_APP', 'FC가 추가로 알려 줌 ' + added);

      // E2E-08: IT 협의 요청 → IT 1명 알림, IT는 현업 확인 내용을 그대로 봄. 협의 결과는 IT만
      const it0 = (await notes('U-030', 'IT_CONSULT')).length;
      await ApiClient.postInquiryAction(r.id, 'U-021', { type: 'IT_CONSULT', codes: ['CAUSE', 'REPRO'], requestId: 'A-2' });
      assert((await notes('U-030', 'IT_CONSULT')).length === it0 + 1, 'IT 협의 알림 1건');
      assert((await notes('U-022', 'IT_CONSULT')).length === 0, '현업 다른 담당자에게는 없음');
      const consult = (await ApiClient.getItConsults('U-030')).find(x => x.id === r.id);
      assert(consult && consult.questions.join() === '원인 확인,재현 확인' && consult.requestedBy.id === 'U-021', 'IT 협의 목록 ' + JSON.stringify(consult));
      const itView = await ApiClient.getInquiry(r.id, 'U-030');
      assert(!itView.forbidden && itView.facts.some(f => f.source === 'USER_ADDED') && itView.unknowns.length > 0, 'IT가 현업 확인 내용·미확인 사항을 봄');
      assert((await ApiClient.postInquiryAction(r.id, 'U-021', { type: 'IT_REPLY', codes: ['NEED_FIX'], requestId: 'A-3' })).error, '현업은 협의 결과를 못 남김');
      await ApiClient.postInquiryAction(r.id, 'U-030', { type: 'IT_REPLY', codes: ['NEED_FIX'], requestId: 'A-4' });
      d = await ApiClient.getInquiry(r.id, 'U-021');
      assert(d.handling.code === 'IT_REPLIED' && d.handling.label.includes('수정·배포 필요'), 'IT 회신 ' + JSON.stringify(d.handling));

      // E2E-09: ITGS 요청 초안은 기존 정보로 채우고 저장하지 않음
      const snapshot = JSON.stringify(IntakeDemoStore.read());
      const draft = await ApiClient.getItgsDraft(r.id, 'U-030');
      const text = JSON.stringify(draft);
      assert(draft.notice.includes('공식 양식 아님') && ['요청 제목', '업무 배경', '오류 증상과 발생 조건', '업무 영향', '현업 대응', 'IT 협의 내용', '요청 조치'].every(x => text.includes(x)), '초안 항목 ' + text);
      assert(text.includes('고객 동의 진행 어려움') && text.includes('수정·배포 필요') && text.includes('링크를 연 경로'), '초안 내용');
      assert(JSON.stringify(IntakeDemoStore.read()) === snapshot, '초안은 저장하지 않음');
      assert((await ApiClient.getItgsDraft(r.id, 'U-023')).forbidden, '다른 문의함 담당자는 초안 못 봄');

      // E2E-07: 현업 자체 해결 — IT 요청 없이 문의자에게 안내 1건
      const g5 = (await notes('U-005', 'INQUIRY_GUIDE')).length, it1 = (await notes('U-030')).length;
      await ApiClient.claimInquiry('R-066', 'U-020', 'CL-66');
      await ApiClient.postInquiryAction('R-066', 'U-020', { type: 'SELF_RESOLVED', codes: ['USAGE_GUIDED'], requestId: 'A-66' });
      await ApiClient.postInquiryAction('R-066', 'U-020', { type: 'SELF_RESOLVED', codes: ['USAGE_GUIDED'], requestId: 'A-66' });
      assert((await notes('U-005', 'INQUIRY_GUIDE')).length === g5 + 1 && (await notes('U-030')).length === it1, '자체 해결 안내 1건, IT 0건');
      const done = (await ApiClient.getMyReports('U-005')).find(x => x.id === 'R-066');
      assert(done.handling.code === 'SELF_RESOLVED' && done.handling.label === '처리 완료', 'FC 카드 처리 완료');

      // 대응 방법 안내: 승인·공개된 임시 방법이면 문의자와 대리 접수자에게
      const p = await intake('U-011', 'SUBSCRIPTION', { submittedById: 'U-010', symptom: 'WRONG_SCREEN', oneLine: '서명 링크가 다른 화면을 열어요' });
      await ApiClient.claimInquiry(p.id, 'U-023', 'CL-P');
      const g11 = (await notes('U-011', 'INQUIRY_GUIDE')).length, g10 = (await notes('U-010', 'INQUIRY_GUIDE')).length;
      await ApiClient.postInquiryAction(p.id, 'U-023', { type: 'GUIDE', guideDefectId: 'D-2026-001', requestId: 'A-G1' });
      assert((await notes('U-011', 'INQUIRY_GUIDE')).length === g11 + 1 && (await notes('U-010', 'INQUIRY_GUIDE')).length === g10 + 1, '문의자·대리 접수자 각 1건');

      // E2E-15: 권한
      assert((await ApiClient.getInquiry(r.id, 'U-023')).forbidden, '다른 문의함 담당자');
      assert((await ApiClient.getInquiry('R-061', 'U-030')).forbidden, '협의 요청 없는 문의는 IT도 못 봄');
      assert((await ApiClient.getInquiry('R-061', 'U-010')).forbidden, '다른 지점 관리자');
      assert((await ApiClient.getInquiry(r.id, 'U-012')).forbidden, '다른 FC');
      assert(!(await ApiClient.getInquiry(r.id, 'U-013')).forbidden, '문의자 본인');
      return true;
    """)


def check_screens(chrome):
    """화면: 알림 → 상세, 인수·중복 인수, 대응 대화상자, IT 협의 요청, ITGS 초안, FC 추가 정보 답"""
    open_real(chrome, "index.html", "?selftest=1#role=FC&user=U-013")
    run(chrome, FLOW + "await intake('U-013', 'CUSTOMER_CONSENT'); return true;")
    open_real(chrome, "ledger.html", "?selftest=1#role=SALES&user=U-021")
    run(chrome, FLOW + """
      assert(document.title === '전산 문의 관리' && $('.ld-brand').textContent === '전산 문의 관리', '화면 이름');
      assert($('#ld-viewer').textContent.includes('현업 담당') && $('#ld-viewer').textContent.includes('고객동의업무팀(가상)'), '보는 사람 ' + $('#ld-viewer').textContent);
      assert($('[data-tab=inbox][aria-selected=true]'), '현업 첫 탭은 전산 문의함');
      const row = await wait('tr[data-id="R-Q1"]');
      assert(row.innerText.includes('고객 동의 진행 어려움') && row.innerText.includes('상품소개동의') && row.innerText.includes('신규'), '목록 줄 ' + row.innerText);
      assert($('[data-filter-box=new]').textContent.includes('1'), '요약 신규');
      await selftest('전산 문의함');
      await click('#ld-alarm');
      const item = await wait('[data-alarm="R-Q1"]');
      assert(item.innerText.includes('신규 문의'), '알림 문구');
      item.click();
      await wait(() => location.hash.includes('item=R-Q1') && $('[data-core]'));
      const core = $('[data-core]').innerText;
      assert(['상품소개동의', '뒷자리', '키패드', '고객 동의 진행 어려움'].every(x => core.includes(x)), '핵심 요약 ' + core);
      assert($('[data-route]').innerText.includes('규칙으로 분류'), '분류 근거 표시');
      await selftest('문의 상세(인수 전)');
      await act('claim');
      await wait(() => $('[data-route]').innerText.includes('백나린(가상)'));
      assert($('[data-handle]'), '인수 뒤 담당자 대응');
      return true;
    """)
    open_real(chrome, "ledger.html", "?selftest=1#role=SALES&user=U-022&item=R-Q1")
    run(chrome, FLOW + """
      await wait('[data-route]');
      assert(!$('[data-act=claim]') && $('[data-route]').innerText.includes('백나린(가상)이 담당하고 있어요'), '다른 담당자');
      assert(!$('[data-handle]'), '인수 안 한 사람은 대응 버튼 없음');
      return true;
    """)
    open_real(chrome, "ledger.html", "?selftest=1#role=SALES&user=U-021&item=R-Q1")
    run(chrome, FLOW + """
      await click('[data-handle] [data-act=consult]');
      await wait(() => location.hash.includes('dialog=consult'));
      await click('[data-code=CAUSE]'); await click('[data-code=REPRO]');
      await act('action-next');
      const preview = (await wait('[data-notice-preview]')).innerText;
      assert(preview.includes('정한결(가상)') && preview.includes('1명'), '받는 사람 미리보기 ' + preview);
      await selftest('IT 협의 요청 미리보기');
      await act('action-save');
      await wait(() => $('#ledger-dialog').innerText.includes('기록했어요'));
      return true;
    """)
    open_real(chrome, "ledger.html", "?selftest=1#role=IT")
    run(chrome, FLOW + """
      assert($('[data-tab=consult][aria-selected=true]'), 'IT 첫 탭은 IT 협의 요청');
      const row = await wait('tr[data-id="R-Q1"]');
      assert(row.innerText.includes('원인 확인') && row.innerText.includes('백나린(가상)'), 'IT 목록 ' + row.innerText);
      await selftest('IT 협의 요청');
      row.querySelector('[data-open]').click();
      await wait('[data-core]');
      await click('[data-handle] [data-act=reply]');
      await click('[data-code=NEED_FIX]');
      await act('action-next'); await act('action-save');
      await wait(() => $('#ledger-dialog').innerText.includes('기록했어요'));
      await act('close-dialog');
      await click('[data-handle] [data-act=itgs]');
      const box = (await wait('[data-itgs]')).innerText;
      assert(box.includes('공식 양식 아님') && box.includes('수정·배포 필요'), 'ITGS 초안 ' + box);
      assert($('[data-act=itgs-copy]'), '복사 버튼');
      await selftest('ITGS 초안');
      return true;
    """)
    open_real(chrome, "ledger.html", "?selftest=1#role=SALES&user=U-021&item=R-Q1")
    run(chrome, FLOW + """
      await click('[data-handle] [data-act=info]');
      await click('[data-code=REPEAT]');
      await act('action-next'); await act('action-save');
      await wait(() => $('#ledger-dialog').innerText.includes('기록했어요'));
      return true;
    """)
    # 재분류: 기록 뒤에는 앞 문의함 담당자가 이 문의를 볼 수 없지만 끝 화면은 보이고, 닫으면 패널도 닫힌다
    open_real(chrome, "ledger.html", "?selftest=1#role=SALES&user=U-020&item=R-062")
    run(chrome, FLOW + """
      await click('[data-handle] [data-act=reroute]');
      await click('[data-inbox=IB-SUBSCRIPTION]'); await click('[data-code=WRONG_BUSINESS]');
      await act('action-next');
      assert((await wait('[data-notice-preview]')).innerText.includes('송이루(가상)'), '새 문의함 담당자에게 알림');
      await act('action-save');
      await wait(() => $('#ledger-dialog').innerText.includes('다른 문의함으로 보내기를 기록했어요'));
      await selftest('재분류 끝');
      await act('close-dialog');
      await wait(() => $('#ledger-panel').hidden && !location.hash.includes('item='));
      return true;
    """)
    open_real(chrome, "index.html", "?selftest=1#role=FC&user=U-013&popup=alarm")
    run(chrome, FLOW + """
      const item = await wait('.alarm-item[data-kn-kind=INFO_REQUEST]');
      item.click();
      const card = await wait(() => location.hash.includes('item=R-Q1') && $('#kn-body .kn-card.is-target [data-info-request]'));
      assert(card.innerText.includes('반복'), '추가 정보 질문 ' + card.innerText);
      await selftest('FC 추가 정보 답');
      card.querySelector('[data-info-code=REPEAT][data-info-value=UNKNOWN]').click();
      card.querySelector('[data-act=info-send]').click();
      await wait(() => $('#kn-body .kn-card.is-target').innerText.includes('보낸 답'));
      return true;
    """)


if __name__ == "__main__":
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    for part in (check_routing, check_handling, check_screens):
        with tempfile.TemporaryDirectory(prefix="inquiry-workflow-") as profile:
            chrome = Chrome(browser, profile)
            try:
                chrome.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, chrome.session)
                part(chrome)
            finally:
                chrome.close()
    print("PASS: E2E-01 부서 문의함 전달, E2E-02 미분류·공통 분류, E2E-03 재분류, E2E-04 알림→상세(읽음≠확인≠인수), "
          "E2E-05 인수 한 명, E2E-06 미확인 답, E2E-07 현업 자체 해결, E2E-08 IT 협의, E2E-09 ITGS 초안, E2E-11 중복 알림, "
          "E2E-14 대리 접수, E2E-15 권한, 화면")
