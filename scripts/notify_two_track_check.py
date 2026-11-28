#!/usr/bin/env python3
"""ADR-025 역할별 알림·두 갈래 진행 표시·업무 재개 회신·관리자 [지점 FC 문의]를 한 브라우저에서 확인한다.

대리 접수 → FC 접수 알림(설명 원문 없음) → 대장 연결·상태 변경 → 신고자/대리 접수자별 1건 →
업무 재개 회신 권한과 결함 상태 불변 → 관리자 묶음의 범위·개인정보 → 알림에서 바로 그 카드로.
"""
import tempfile

from intake_followup_check import evaluate, open_page
from ui_check import Chrome, find_browser


def check(chrome):
    # 1) 관리자(U-010)가 같은 지점 FC(U-011) 대신 접수: 확인 화면 안내 → 완료 화면 → FC 접수 알림
    open_page(chrome, "index.html", "#role=MANAGER&panel=intake&step=problem")
    report_id = evaluate(chrome, """
      await fill('#pn-proxy-select', 'U-011');
      await fill('#quick-business', 'SUBSCRIPTION');
      await fill('#quick-oneLine', '대리 확인용 서명 링크 문장');
      await act('quick-review');
      const notice = await wait('[data-proxy-notice]');
      assert(notice.innerText.includes('정다솜(가상) 님의 접수내역에 등록돼요') && notice.innerText.includes('안내받는 사람'),
        '확인 화면의 대리 접수 안내');
      await act('quick-submit');
      await wait('#quick-receipt-id');
      const body = $('#pn-body').innerText;
      assert(body.includes('접수 사실을 정다솜(가상) 님에게 알렸어요') && body.includes('담당자 확인 대기 중'), '완료 화면의 FC 알림·사실 표시');   // ADR-031 처리 상태 문구
      const record = IntakeDemoStore.read().reports.at(-1);
      assert(record.reporterId === 'U-011' && record.submittedById === 'U-010', '신고자와 대리 접수자 분리');
      const fc = (await ApiClient.getNotifications('U-011')).filter(n => n.kind === 'PROXY_RECEIPT' && n.reportId === record.id);
      assert(fc.length === 1 && !fc[0].bodySnapshot.includes('대리 확인용'), 'FC 접수 알림 1건, 설명 원문 없음');
      assert(!(await ApiClient.getNotifications('U-010')).some(n => n.kind === 'PROXY_RECEIPT'), '대리 접수자는 접수 알림 없음');
      return record.id;
    """)

    # 2) 담당자가 연결하고 상태를 바꾸면 신고자·대리 접수자에게 사람별 1건, 역할별 문구
    evaluate(chrome, """
      const id = '""" + report_id + """';
      assert(await ApiClient.postLinkReport('D-2026-001', id), '대표 결함 연결');
      const preview = await ApiClient.postStatusPreview('D-2026-001', { from: 'WORKAROUND', to: 'FIX_PLANNED', plannedFixDate: '2026-11-27' });
      const sub = preview.recipients.filter(r => r.audience === 'SUBMITTER');
      assert(sub.length === 1 && sub[0].userId === 'U-010' && sub[0].count === 2, '대리 접수자 1명, 묶음 2건');
      assert(preview.recipients.filter(r => r.userId === 'U-011').length === 1, 'FC가 같은 결함에 2건이어도 1건');
      const done = await ApiClient.postStatus('D-2026-001', { eventId: 'chk-1', from: 'WORKAROUND', to: 'FIX_PLANNED',
        plannedFixDate: '2026-11-27', actorId: 'U-030' });
      const mine = (await ApiClient.getNotifications('U-010')).filter(n => n.historyId === done.historyId);
      assert(mine.length === 1 && mine[0].audience === 'SUBMITTER' && mine[0].bodySnapshot.includes('대신 접수한 문의 2건'), '관리자 알림 문구');
      const fc = (await ApiClient.getNotifications('U-011')).filter(n => n.historyId === done.historyId);
      assert(fc.length === 1 && fc[0].bodySnapshot.includes('11월 27일에 고칠 예정'), 'FC 알림 문구(지금 할 일)');

      // 관리자가 신고자이기도 하면 신고자 알림만 1건 (D-2026-002: U-010 의 R-031 + 대신 접수 1건)
      const proxy = await ApiClient.postQuickIntake({ requestId: 'chk-proxy-2', reporterId: 'U-012', submittedById: 'U-010',
        business: 'SUBSCRIPTION', oneLine: '서명 화면 멈춤 확인', urgent: [], extraSymptoms: [], incident: {} });
      await ApiClient.postLinkReport('D-2026-002', proxy.id);
      const wont = await ApiClient.postStatus('D-2026-002', { eventId: 'chk-2', from: 'FIX_PLANNED', to: 'WONT_FIX',
        wontFixReasonCode: 'NEW_SFA', actorId: 'U-030' });
      const both = (await ApiClient.getNotifications('U-010')).filter(n => n.historyId === wont.historyId);
      assert(both.length === 1 && both[0].audience === 'REPORTER', '신고자이자 대리 접수자는 신고자 알림 1건');
    """)

    # 3) 업무 재개 회신: 신고자 본인만, 결함 상태 불변, STILL 은 후속 기록
    evaluate(chrome, """
      assert(!(await ApiClient.postWorkResumption('R-063', 'U-010', 'RESUMED')), '관리자는 FC 대신 회신 못 함');
      const before = (await ApiClient.getDefects({})).find(d => d.id === 'D-2026-001').status;
      const saved = await ApiClient.postWorkResumption('R-021', 'U-002', 'STILL');
      assert(saved && saved.result === 'STILL', '신고자 회신');
      const after = (await ApiClient.getDefects({})).find(d => d.id === 'D-2026-001').status;
      assert(before === after, '회신이 결함 상태를 바꾸지 않음');
      assert(IntakeDemoStore.read().followups['R-021'][0].action === 'STILL', '아직 안 돼요는 후속 기록으로도 남음');
      // FC U-011 이 새 알림(수정 예정)을 읽음 → 관리자 묶음에서 "알림 확인함", 아직 안 읽은 U-001 은 "알림 아직 안 봄"
      const latest = (await ApiClient.getNotifications('U-011')).find(n => n.defectId === 'D-2026-001');
      assert(await ApiClient.markNotificationRead(latest.id, 'U-011'), 'FC 알림 읽음');
    """)

    # 4) 관리자 [지점 FC 문의]: 같은 지점 FC + 대신 접수만, FC가 쓴 설명은 내가 대신 접수한 건만
    open_page(chrome, "index.html", "#role=MANAGER&panel=known&tab=team&item=D-2026-001")
    evaluate(chrome, """
      const card = await wait('#kn-body .kn-card.is-target');
      // ADR-027: 신고 건별 줄은 FC 줄을 펼쳐야 보이므로 접힌 내용까지 포함해 본다(보이면 안 되는 설명은 DOM에도 없어야 함)
      const text = card.textContent;
      assert(text.includes('정다솜(가상)') && text.includes('김하늘(가상)') && text.includes('조은별(가상)'), '같은 지점 FC 묶음');
      assert(!text.includes('이바다(가상)') && !text.includes('한가람(가상)'), '다른 지점 FC 없음');
      assert(!text.includes('세미나 초대장 화면이 떠요'), 'FC가 직접 쓴 설명은 보이지 않음');
      assert(text.includes('고객 서명 링크를 열면 초대장 화면이 나와요'), '내가 대신 접수한 설명은 보임');
      assert(text.includes('알림 확인함') && text.includes('알림 아직 안 봄'), '알림 확인을 따로 표시');
      assert(card.querySelectorAll(':scope .nt-tracks > .nt-track').length === 2, '두 갈래 진행 표시');
      assert([...document.querySelectorAll('#known-panel [role=tab]')].filter(t => !t.hidden).length === 3, '관리자 탭 3개');
    """)

    # 5) 관리자 알림 → [지점 FC 문의] 그 결함 카드
    open_page(chrome, "index.html", "#role=MANAGER&popup=alarm")
    evaluate(chrome, """
      await click('[data-kn-audience=SUBMITTER][data-kn-defect="D-2026-001"]');
      await wait(() => location.hash.includes('tab=team') && location.hash.includes('item=D-2026-001') && $('#kn-body .is-target'));
    """)

    # 6) FC: 알림에서 연 카드는 상태·대응·기록된 단계가 바로 보이고 상세 이력은 접힘(ADR-029), 업무 재개 회신 버튼, FC 역할에는 [지점 FC 문의] 없음
    open_page(chrome, "index.html", "#role=FC&panel=known&tab=mine&item=R-011")
    evaluate(chrome, """
      const card = await wait('#kn-body .kn-card.is-target');
      assert(!card.querySelector('details.kn-detail').open && card.querySelector('.nt-track > .kn-progress [aria-current=step]').getClientRects().length,
        '알림에서 연 카드: 기록된 단계는 바로, 상세 이력은 접힘');
      assert(card.innerText.includes('지금 가능한 대응') && card.innerText.includes('오류 수정 진행상황'), '두 갈래');
      assert(!card.innerText.includes('11월 27일에 고칠 예정') || card.innerText.includes('수정 예정'), '예정일은 수정 예정일 때만');
      assert($('#kn-tab-team').hidden, 'FC에게 지점 FC 문의 탭 없음');
      await click('#kn-body .is-target [data-resume=STILL]');
      await wait(() => $('#kn-body .is-target [data-resume-status]').textContent.includes('아직 안 돼요'));
      assert($('#kn-body .is-target [data-followup=URGENT]'), '아직 안 돼요 뒤 긴급 사정 남기기');
    """)


if __name__ == "__main__":
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    with tempfile.TemporaryDirectory(prefix="notify-two-track-") as profile:
        chrome = Chrome(browser, profile)
        try:
            check(chrome)
            print("PASS: 대리 접수 안내·FC 접수 알림, 역할별 수신·중복 제거, 업무 재개 권한·상태 불변, 지점 FC 묶음·개인정보, 알림에서 바로 열기")
        finally:
            chrome.close()
