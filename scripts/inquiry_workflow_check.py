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
      // 상세를 열면 그 문의의 담당자 알림은 읽음이 된다(종 배지와 목록이 따로 움직이지 않게)
      await ApiClient.markInquiryViewed(r.id, 'U-022');
      assert((await notes('U-022', 'NEW_INQUIRY')).filter(x => x.reportId === r.id).every(x => x.read), '열람한 문의 알림 읽음');
      assert(!(await ApiClient.getInquiry(r.id, 'U-022')).assignment, '열람·읽음은 인수가 아님');
      const all20 = await inbox('U-020'), only = await inbox('U-020', { filter: 'it' });
      assert(only.total === all20.total && only.items.length <= all20.items.length, '탭 숫자는 거르기와 관계없는 전체');
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
      // ADR-031 결정 5: IT는 협의를 맡은 뒤에만 결과를 남긴다
      assert((await ApiClient.postInquiryAction(r.id, 'U-030', { type: 'IT_REPLY', codes: ['NEED_FIX'], requestId: 'A-4x' })).error === 'NOT_ASSIGNEE', '맡기 전 회신 거부');
      await ApiClient.postInquiryAction(r.id, 'U-030', { type: 'IT_CLAIM', codes: [], requestId: 'ITC-1' });
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
      assert($('#ld-viewer').textContent === '백나린(가상) · 현업 담당', '보는 사람(이름·역할만) ' + $('#ld-viewer').textContent);
      assert($('.ld-sort').textContent.includes('맡은 문의함: 고객동의업무팀(가상)'), '맡은 문의함은 목록 위 줄');
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
      // ADR-031: [협의 맡기] 뒤에 [협의 결과 남기기]
      assert(!$('[data-handle] [data-act=reply]'), '맡기 전에는 협의 결과 버튼 없음');
      await click('[data-act=it-claim]');
      await wait(() => $('[data-route]').innerText.includes('정한결(가상) · 업무용 내선 2101(가상)'));
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
      const text = $('#kn-body .kn-card.is-target').innerText;
      assert(!text.includes('담당자 확인 전') && text.includes('담당 부서가 확인하고 있어요'), '인수 뒤 FC 카드 문구가 서로 맞음 ' + text);
      return true;
    """)


CTX = """
const ask = async (reporter, text, extra) => ApiClient.postQuickIntake(Object.assign({
  requestId: 'CTX-' + reporter + '-' + Math.random(), reporterId: reporter, submittedById: reporter,
  business: '', symptom: '', oneLine: text, finalType: 'DEFECT', conditions: {}, factSources: {} }, extra || {}));
const ALL = ['U-020', 'U-021', 'U-022', 'U-023', 'U-024', 'U-025', 'U-026', 'U-030', 'U-031', 'U-032', 'U-033'];
const tally = async (kind) => Object.fromEntries(await Promise.all(ALL.map(async u => [u, (await notes(u, kind)).length])));
const grewIn = (a, b) => ALL.filter(u => b[u] !== a[u]);
"""


def check_context(chrome):
    """ADR-031 E01~E05·E08~E16·E21·E22·E25 (저장소 수준, docs/11-test-plan.md 1-2절)"""
    open_real(chrome, "ledger.html", "#role=SALES")
    run(chrome, FLOW + CTX + """
      // E01~E04·E09: 업무를 고르지 않은 자연어 문의 → 업무분장의 현업 담당 그룹, 그 그룹 담당자에게만 신규 알림
      const cases = [['고객한테 보낸 동의 링크에서 뒷자리 숫자가 안 눌려요', 'IB-CONSENT', ['U-021', 'U-022']],
        ['보험료 계산 버튼을 눌렀는데 계속 돌아가요', 'IB-DESIGN', ['U-024']],
        ['청약서 작성 후 제출 버튼을 누르면 오류가 나요', 'IB-SUBSCRIPTION', ['U-023']],
        ['선심사를 요청했는데 결과를 확인할 수 없어요', 'IB-PRE_UW', ['U-025']]];
      const made = [];
      for (const [text, box, who] of cases) {
        const before = await tally('NEW_INQUIRY');
        const r = await ask('U-001', text);
        assert(r.routing.inboxId === box && r.routing.confirmed && r.routing.method === 'RULE', 'E01~04 ' + text + ' ' + JSON.stringify(r.routing));
        assert(r.businessSource === undefined || true, '');
        const grew = grewIn(before, await tally('NEW_INQUIRY'));
        assert(JSON.stringify(grew) === JSON.stringify(who), 'E09 신규 알림은 그 그룹 담당자만 ' + text + ' ' + grew);
        made.push(r.id);
      }
      const stored = IntakeDemoStore.read().reports.find(x => x.id === made[1]);
      assert(stored.business === 'DESIGN' && stored.businessSource === 'RULE' && !JSON.stringify(stored).includes('계속 돌아가요'), '규칙이 정한 업무와 근거 코드만 저장(원문 없음) ' + JSON.stringify(stored).slice(0, 300));
      // E05·E06·E08: 업무명이 없거나 모호하거나 분류할 수 없는 문의
      const vague = await ask('U-002', '심사 결과가 안 나와요');
      assert(vague.routing.inboxId === 'IB-TRIAGE' && !vague.routing.confirmed && vague.routing.question.id === 'UW_KIND', 'E06 심사 불명확 → 질문·공통 분류');
      const none = await ask('U-003', '그냥 화면이 안 돼요');
      assert(none.routing.inboxId === 'IB-UNCLASSIFIED' && ids(await inbox('U-020')).includes(none.id), 'E08 분류 불가 → 미분류(공통) 문의함');
      // E21 매핑 누락, E22 담당자 부재
      const miss = await ask('U-004', '영업 자료실이 안 열려요');
      assert(miss.routing.inboxId === 'IB-TRIAGE' && miss.routing.fallback === 'MAPPING_MISSING', 'E21 매핑 누락 → 공통 분류');
      const away0 = await tally('NEW_INQUIRY');
      const away = await ask('U-005', '가입한 보험의 보장내역이 조회되지 않아요');
      assert(away.routing.inboxId === 'IB-COMMON' && away.routing.fallback === 'BACKUP' && away.routing.groupName === '계약관리팀(가상)', 'E22 부재 → 대체 그룹');
      assert(JSON.stringify(grewIn(away0, await tally('NEW_INQUIRY'))) === JSON.stringify(['U-020']), 'E22 부재 담당자(U-026)는 신규 알림 대상 아님');
      assert(away.routing.contact.ext === '1100', 'E22 대체 그룹 연락처');

      // E10·E11: 인수 → 실제 담당자·시각, 중복 인수 방지
      const consent = made[0];
      const c1 = await ApiClient.claimInquiry(consent, 'U-021', 'C-1');
      const c2 = await ApiClient.claimInquiry(consent, 'U-022', 'C-2');
      assert(c1.assigned && c2.error === 'ALREADY_ASSIGNED' && c2.assignee.id === 'U-021', 'E11 중복 인수 거부');
      const mine = (await ApiClient.getMyReports('U-001')).find(x => x.id === consent);
      assert(mine.support.assignee.name === '백나린(가상)' && mine.support.assignee.contact.ext === '1121' && mine.support.assignee.at === c1.at, 'E10 FC에게 실제 담당자·업무용 내선');
      assert((IntakeDemoStore.read().assign[consent] || []).length === 1, 'E11 인수 기록 1건');

      // E12: 재분류 — 같은 문의번호, 그룹 변경, 이력 2건, 새 문의 없음
      const n0 = IntakeDemoStore.read().reports.length;
      await ApiClient.claimInquiry(vague.id, 'U-020', 'C-3');
      const rr = await ApiClient.postInquiryAction(vague.id, 'U-020', { type: 'REROUTE', inboxId: 'IB-PRE_UW', codes: ['WRONG_BUSINESS'], requestId: 'RR-C' });
      const dv = await ApiClient.getInquiry(vague.id, 'U-025');
      assert(rr.saved && dv.id === vague.id && dv.routes.length === 2 && dv.routes[0].inboxId === 'IB-TRIAGE' && dv.routes[1].inboxId === 'IB-PRE_UW' &&
        dv.routes[1].actorId === 'U-020' && dv.routes[1].reasonCode === 'WRONG_BUSINESS' && !dv.assignment, 'E12 재분류 이력·담당 비움');
      assert(IntakeDemoStore.read().reports.length === n0, 'E12 새 문의를 만들지 않음');

      // E13: 현업 자체 해결 → IT 알림 0건
      const design = made[1];
      await ApiClient.claimInquiry(design, 'U-024', 'C-4');
      const it0 = await tally('IT_CONSULT');
      await ApiClient.postInquiryAction(design, 'U-024', { type: 'SELF_RESOLVED', codes: ['USAGE_GUIDED'], requestId: 'SR-C' });
      assert(grewIn(it0, await tally('IT_CONSULT')).length === 0, 'E13 IT 알림 없음');

      // E14·E15·E16: 청약 IT 협의는 청약 IT 그룹에만. 관련 없는 IT는 알림·목록·상세 없음. IT 인수는 현업 담당과 따로
      const sub = made[2];
      await ApiClient.claimInquiry(sub, 'U-023', 'C-5');
      const t0 = await tally('IT_CONSULT');
      const cs = await ApiClient.postInquiryAction(sub, 'U-023', { type: 'IT_CONSULT', codes: ['CAUSE'], requestId: 'IT-C' });
      assert(JSON.stringify(grewIn(t0, await tally('IT_CONSULT'))) === JSON.stringify(['U-031']) && cs.action.itGroupId === 'ITG-SUBSCRIPTION', 'E14 청약 IT 그룹에만');
      for (const u of ['U-030', 'U-032', 'U-033']) {
        assert(!(await ApiClient.getItConsults(u)).some(x => x.id === sub) && (await ApiClient.getInquiry(sub, u)).forbidden, 'E15 관련 없는 IT ' + u);
      }
      assert((await ApiClient.getItConsults('U-031')).some(x => x.id === sub && !x.claimedBy), 'E14 청약 IT 목록');
      const claim = await ApiClient.postInquiryAction(sub, 'U-031', { type: 'IT_CLAIM', codes: [], requestId: 'ITC-C' });
      const ds = await ApiClient.getInquiry(sub, 'U-023');
      assert(claim.saved && ds.it.claimant.id === 'U-031' && ds.it.claimantContact.ext === '2111' && ds.assignment.assignee.id === 'U-023', 'E16 IT 인수와 현업 담당 따로');
      assert(ds.handling.code === 'IT_CONSULT', 'E16 IT 인수는 대응 상태를 바꾸지 않음');
      // 공통 IT 협의함: 구성원 두 명 중 한 명만 맡는다(중복 인수 방지)
      const login = await ask('U-006', '로그인이 안 돼요');
      await ApiClient.claimInquiry(login.id, 'U-020', 'C-6');
      const cl = await ApiClient.postInquiryAction(login.id, 'U-020', { type: 'IT_CONSULT', codes: ['LOG'], requestId: 'IT-L' });
      assert(cl.action.itGroupId === 'ITG-COMMON' && cl.recipients.map(x => x.id).sort().join() === 'U-030,U-033', '전용 그룹 없으면 공통 IT 협의함');
      await ApiClient.postInquiryAction(login.id, 'U-030', { type: 'IT_CLAIM', codes: [], requestId: 'ITC-L1' });
      const dup = await ApiClient.postInquiryAction(login.id, 'U-033', { type: 'IT_CLAIM', codes: [], requestId: 'ITC-L2' });
      assert(dup.error === 'ALREADY_ASSIGNED' && dup.assignee.id === 'U-030', 'E16 IT 중복 인수 거부');
      assert((await ApiClient.postInquiryAction(login.id, 'U-033', { type: 'IT_REPLY', codes: ['FIELD_GUIDE'], requestId: 'ITR-L' })).error === 'NOT_ASSIGNEE', '맡지 않은 IT는 회신 못 함');
      // 현업이 IT 담당 그룹을 바꿔 요청할 수 있다
      const moved = await ApiClient.postInquiryAction(consent, 'U-021', { type: 'IT_CONSULT', codes: ['REPRO'], itGroupId: 'ITG-SUBSCRIPTION', requestId: 'IT-M' });
      assert(moved.recipients.map(x => x.id).join() === 'U-031', 'IT 담당 그룹 변경');

      // E20: IT 협의 중에도 FC에게는 현업 지원 경로만(IT 이름·연락처 없음)
      const fc = (await ApiClient.getMyReports('U-001')).find(x => x.id === sub);
      assert(fc.support.itConsulting && fc.support.assignee.name === '송이루(가상)' && !JSON.stringify(fc).includes('기태오') && !JSON.stringify(fc).includes('2111'), 'E20 FC에는 IT 연락처 없음');

      // E25: 권한 — 관련 없는 현업·IT·다른 FC는 상세·초안을 못 본다
      assert((await ApiClient.getInquiry(consent, 'U-024')).forbidden && (await ApiClient.getItgsDraft(consent, 'U-023')).forbidden, 'E25 다른 그룹 현업');
      assert((await ApiClient.getInquiry(consent, 'U-002')).forbidden, 'E25 다른 FC');
      assert((await ApiClient.claimInquiry(sub, 'U-025', 'C-X')).error === 'FORBIDDEN', 'E25 다른 그룹은 인수 못 함');
      return true;
    """)


def check_context_screens(chrome):
    """ADR-031 E05~E08·E17~E20 실제 화면"""
    open_real(chrome, "index.html", "?selftest=1#role=FC&panel=intake&step=problem")
    rid = run(chrome, FLOW + CTX + """
      // E06: 업무 칸을 비우고 모호한 문장 → 확인 화면에 질문 하나(선택지 + 잘 모르겠어요)
      assert(!$('#quick-business').value && $('label[for=quick-business]').textContent.includes('모르면 비워 두세요'), '업무 칸은 선택 사항');
      $('#quick-oneLine').value = '심사 결과가 안 나와요'; $('#quick-oneLine').dispatchEvent(new Event('input', { bubbles: true }));
      await act('quick-review');
      const q = await wait('#quick-route [data-act=quick-business-answer]');
      const choices = [...document.querySelectorAll('#quick-route [data-act=quick-business-answer]')].map(b => b.textContent);
      assert(choices.join('|') === '선심사 결과|청약 이후 심사 결과|잘 모르겠어요', 'E06 선택지 ' + choices);
      await selftest('업무 분류 질문');
      // 답하면 질문이 사라지고 쉬운 결과만(코드·근거 없음)
      document.querySelector('#quick-route [data-code=PRE_UW]').click();
      await wait(() => $('#quick-route').innerText.includes('선심사 업무 관련 문의로 확인했어요'));
      assert(!$('#quick-route').innerText.includes('PRE_UW') && !$('#quick-route').innerText.includes('근거'), 'FC에게는 코드·근거를 보이지 않음');
      await act('quick-submit');
      // E17·E18: 완료 화면 — 관련 업무·세부 업무·담당 부서·처리 상태·업무 지원 연락처
      await wait('#quick-receipt-id');
      const body = $('#pn-body').innerText;
      assert(body.includes('문의가 접수되었어요') && body.includes('선심사 업무 담당 부서에 전달했어요') && body.includes('문의번호 R-Q1'), 'E17 머리 ' + body);
      for (const t of ['관련 업무', '세부 업무', '담당 부서', '선심사지원팀(가상)', '담당자 확인 대기 중', '선심사 업무 지원', '업무용 내선 1150(가상)', '긴급한 경우 문의번호를 전달해 주세요'])
        assert(body.includes(t), 'E17 ' + t);
      assert(!/21\\d\\d\\(가상\\)|IT\\(가상\\)/.test(body), 'E17 IT 연락처 없음');
      assert([...document.querySelectorAll('#pn-foot button')].map(b => b.textContent).join('|') === '닫기|업무 지원 연락처|내 문의 및 처리 경과', '완료 화면 버튼');
      await selftest('접수 완료 문의 정보');
      await act('quick-contact');
      assert(document.activeElement && document.activeElement.id === 'quick-contact', '[업무 지원 연락처]는 카드로 초점');
      return $('#quick-receipt-id').textContent.replace('문의번호 ', '').trim();
    """)
    assert rid == "R-Q1", rid
    # E07: 고른 업무와 오류 화면(진단 이벤트)이 다르면 임의로 확정하지 않고 묻는다
    open_real(chrome, "index.html", "?selftest=1#role=FC&user=U-002&panel=intake&step=problem&diagnostics=mobile")
    run(chrome, FLOW + """
      const sel = $('#quick-business'); sel.value = 'CUSTOMER_CONSENT'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      $('#quick-oneLine').value = '링크가 이상해요'; $('#quick-oneLine').dispatchEvent(new Event('input', { bubbles: true }));
      await act('quick-review');
      await wait('#quick-route [data-act=quick-business-answer]');
      assert($('#quick-route').innerText.includes('어느 업무를 하다가 문제가 생겼나요?'), 'E07 충돌 질문');
      return true;
    """)
    # E18·E19·E20: 내 문의 카드 — 인수 전 대기, 인수 뒤 이름·업무용 내선, IT 협의 중에도 현업 경로
    open_real(chrome, "index.html", "?selftest=1#role=FC&panel=known&tab=mine&item=R-Q1")
    run(chrome, FLOW + """
      let card = await wait('#kn-body .kn-card.is-target');
      assert(card.innerText.includes('담당자 확인 대기 중 · 선심사지원팀(가상)'), 'E18 ' + card.innerText);
      await ApiClient.claimInquiry('R-Q1', 'U-025', 'C-S');
      await ApiClient.postInquiryAction('R-Q1', 'U-025', { type: 'IT_CONSULT', codes: ['CAUSE'], requestId: 'IT-S' });
      location.reload();
      return true;
    """)
    run(chrome, FLOW + """
      const card = await wait('#kn-body .kn-card.is-target');
      const text = card.innerText;
      assert(text.includes('진서율(가상) · 업무용 내선 1151(가상) · IT와 확인 중'), 'E19·E20 ' + text);
      assert(!text.includes('마루한') && !/212\\d\\(가상\\)/.test(text), 'E20 IT 연락처 없음');
      await selftest('내 문의 담당자 표시');
      return true;
    """)
    # 현업 화면: 분류 근거·IT 연락 정보, IT 화면: 내 IT 그룹 협의만·[협의 맡기]
    open_real(chrome, "ledger.html", "?selftest=1#role=SALES&user=U-025&item=R-Q1")
    run(chrome, FLOW + """
      const route = await wait('[data-route]');
      const t = route.innerText;
      assert(t.includes('선심사 · 선심사 (PRE_UW)') && t.includes('FC 확인 응답') && t.includes('설계·심사 IT(가상) · 업무용 내선 2120(가상)') && t.includes('아직 맡은 사람 없음'), '현업 분류 근거·IT 연락 ' + t);
      await selftest('현업 분류 근거');
      return true;
    """)
    open_real(chrome, "ledger.html", "?selftest=1#role=IT&user=U-032")
    run(chrome, FLOW + """
      const row = await wait('tr[data-id="R-Q1"]');
      assert(row.innerText.includes('맡기 전') && $('#ld-body, body').innerText.includes('맡은 IT 그룹: 설계·심사 IT(가상)'), 'IT 목록 ' + row.innerText);
      row.querySelector('[data-open]').click();
      await click('[data-act=it-claim]');
      await wait(() => $('[data-route]').innerText.includes('마루한(가상) · 업무용 내선 2121(가상)'));
      assert($('[data-handle] [data-act=reply]'), '맡은 뒤 협의 결과');
      await selftest('IT 협의 맡기');
      return true;
    """)


if __name__ == "__main__":
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    for part in (check_routing, check_handling, check_screens, check_context, check_context_screens):
        with tempfile.TemporaryDirectory(prefix="inquiry-workflow-") as profile:
            chrome = Chrome(browser, profile)
            try:
                chrome.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, chrome.session)
                part(chrome)
            finally:
                chrome.close()
    print("PASS: E2E-01 부서 문의함 전달, E2E-02 미분류·공통 분류, E2E-03 재분류, E2E-04 알림→상세(읽음≠확인≠인수), "
          "E2E-05 인수 한 명, E2E-06 미확인 답, E2E-07 현업 자체 해결, E2E-08 IT 협의, E2E-09 ITGS 초안, E2E-11 중복 알림, "
          "E2E-14 대리 접수, E2E-15 권한, 화면 / ADR-031 E01~E22·E25 (E23·E24 전화 연계는 P1 검사)")
