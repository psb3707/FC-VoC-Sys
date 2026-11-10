/* Playwright MCP browser_run_code_unsafe(filename=...)용 검증. 실행 중인 S4 탭에서 시작한다.
   별도 브라우저 컨텍스트를 사용하므로 사용자의 시연 데이터를 초기화하지 않는다. */
async (page) => {
  const origin = new URL(page.url()).origin;
  const context = await page.context().browser().newContext();
  const p = await context.newPage(), checks = [], errors = [];
  p.on('pageerror', error => errors.push(String(error)));
  const check = (name, pass) => { if (!pass) throw new Error(name); checks.push(name); };
  const navigate = async hash => {
    await p.goto(origin + '/ledger.html?check=' + checks.length + '#' + hash);
    await p.waitForFunction(() => !!document.querySelector('.ld-total'));
  };
  const move = async hash => {
    await p.evaluate(value => { location.hash = value; }, hash);
    await p.waitForTimeout(100);
  };
  const click = name => p.getByRole('button', { name, exact: true }).click();
  const waitText = (selector, text) => p.waitForFunction(([selector, text]) => {
    const element = document.querySelector(selector);
    return !!element && element.innerText.includes(text);
  }, [selector, text]);
  try {
    await navigate('role=SALES&tab=unlinked&business=ALL');
    check('업무 전체 접수 건수', await p.locator('#ld-count-unlinked').textContent() === '3');
    await p.getByLabel('담당 업무', { exact: true }).focus();
    await p.getByLabel('담당 업무', { exact: true }).selectOption('SUBSCRIPTION');
    await p.waitForTimeout(100);
    check('업무 필터 포커스 유지', await p.evaluate(() => document.activeElement.id === 'wf-business'));
    check('업무 범위 집계', await p.locator('#ld-count-unlinked').textContent() === '1');
    await click('R-061 서명 알림톡을 열면 행사 안내 화면이 나와요');
    check('기존 건 연결 노출', await p.getByRole('button', { name: '기존 건에 연결', exact: true }).isVisible());
    check('한국 시각 표시', (await p.locator('#ld-body').innerText()).includes('(한국 시간)'));
    await click('추가정보 요청');
    await p.getByLabel('현장에 요청할 질문', { exact: true }).fill('열린 화면과 발송 이력을 확인해 주세요.');
    await click('접기'); await click('추가정보 요청');
    check('초안 보존', (await p.getByLabel('현장에 요청할 질문', { exact: true }).inputValue()).includes('발송 이력'));
    await click('확인·적용'); await waitText('#ld-body', '추가정보 대기');
    check('추가정보 대기', (await p.locator('#ld-body').innerText()).includes('추가정보 대기'));
    await click('안내 후 종료');
    await p.getByLabel('현장에 전달할 내용', { exact: true }).fill('문자 링크를 이용해 주세요.');
    await p.getByLabel('처리 결과·종료 사유', { exact: true }).fill('가상 접수의 진행 확인');
    await click('확인·적용');
    check('공유 전 사람 확인', (await p.locator('#wf-form-error').innerText()).includes('확인 표시'));
    await p.locator('[name=confirmed]').check(); await click('확인·적용'); await waitText('#ld-body', '처리 완료');
    check('안내 후 종료', (await p.locator('#ld-body').innerText()).includes('처리 완료'));
    await click('재검토'); await p.getByLabel('재발 내용·재검토 이유', { exact: true }).fill('같은 현상이 다시 발생');
    await click('확인·적용'); await waitText('#ld-body', '재확인 필요');
    check('재검토 표시', (await p.locator('#ld-body').innerText()).includes('재확인 필요'));
    await p.locator('summary').filter({ hasText: '관련 사례 · AI 추천' }).click();
    await click('이 접수의 처리 방법 찾기'); await p.waitForTimeout(100);
    check('AI 질문 포커스', await p.evaluate(() => document.activeElement.id === 'wf-question'));
    await click('서명 링크 오류 대응');
    check('답변 출처', (await p.locator('#wf-ai-result').innerText()).includes('D-2026-001'));
    await p.getByRole('button', { name: '이번 건과 비교하기', exact: true }).first().click(); await p.waitForTimeout(100);
    await click('참고 사례로 연결'); await waitText('#ld-body', '참고 사례 1건');
    check('참고 연결', (await p.locator('#ld-body').innerText()).includes('참고 사례 1건'));
    await click('이 관리 건에 연결'); await click('묶기'); await waitText('#ld-dlg-body', '묶었어요');
    check('접수 실제 연결', (await p.locator('#ld-dlg-body').innerText()).includes('묶었어요'));
    await move('role=SALES&tab=defects&business=ALL&item=D-2026-001');
    await p.locator('summary').filter({ hasText: '접수 연결 수정' }).click();
    p.once('dialog', dialog => dialog.accept('다른 발생 조건 확인으로 연결 해제'));
    await p.locator('.wf-source').filter({ hasText: 'R-061 ·' }).getByRole('button', { name: '연결 해제', exact: true }).click();
    await p.waitForTimeout(100);
    check('연결 해제', !(await p.locator('.ld-reports').innerText()).includes('R-061'));
    await click('상태·처리 결과 변경');
    await click('수정 예정 예정일 필요 · 알림 가요'); await click('다음');
    await p.getByLabel('고칠 예정일', { exact: true }).fill('2026-11-25'); await click('다음');
    check('알림 미리보기', (await p.locator('#ld-dlg-body').innerText()).includes('받는 사람'));
    await click('확정'); await waitText('#ld-dlg-body', '알림을 보냈어요');
    check('상태 변경과 알림', (await p.locator('#ld-dlg-body').innerText()).includes('알림을 보냈어요'));
    const fc = await context.newPage();
    await fc.goto(origin + '/index.html#role=FC&user=U-001&panel=known&tab=mine');
    await fc.evaluate(() => window.SFA_READY);
    check('기존 FC 알림 유지', await fc.evaluate(async () => (await ApiClient.getNotifications('U-001')).some(n => n.defectId === 'D-2026-001')));
    await p.evaluate(() => ApiClient.unlinkLedgerReport('R-011', '다른 조건 확인', 'U-020'));
    const detached = await fc.evaluate(async () => (await ApiClient.getMyReports('U-001')).find(r => r.id === 'R-011'));
    check('연결 해제 후 FC 이전 안내 제거', detached.defectId === null && detached.defect === null && detached.fcNotice === null);
    await fc.close();
    await move('role=SALES&tab=unlinked&business=ALL&item=R-062');
    await click('새 관리 건 등록');
    await p.getByLabel('제목', { exact: true }).fill('첨부 메뉴 표시 확인');
    await p.getByLabel('주 업무', { exact: true }).selectOption('DESIGN');
    await p.getByLabel('다음 조치', { exact: true }).fill('확대 비율별 화면 확인');
    await click('확인·적용'); await waitText('#ld-body h3', '첨부 메뉴 표시 확인');
    check('신규 관리 건 등록', await p.locator('#ld-body h3').textContent() === '첨부 메뉴 표시 확인');
    await click('담당 변경·IT 협조');
    await p.getByLabel('IT 협조 담당', { exact: true }).selectOption('U-030');
    await p.getByLabel('확인 내용·협조 질문·이관 이유', { exact: true }).fill('화면 겹침 재현 협조 요청');
    await click('확인·적용'); await p.waitForTimeout(100);
    check('IT 협조', (await p.locator('#ld-body').innerText()).includes('정한결(가상)'));
    const storage = await p.evaluate(() => localStorage.getItem('fc-voc-intake-demo-v1'));
    check('자유 서술 영구 저장 없음', !storage.includes('확대 비율별 화면 확인') && !storage.includes('화면 겹침 재현 협조 요청'));
    for (const mode of ['empty', 'old', 'mismatch', 'slow', 'fail']) {
      await navigate('role=SALES&ai=1&' + (['slow', 'fail'].includes(mode) ? 'llm=' + mode : 'aiCase=' + mode));
      await click('서명 링크 오류 대응');
      const result = await p.locator('#wf-ai-result').innerText();
      const expected = { empty: '찾지 못했습니다', old: '과거 조치', mismatch: '같은 원인이라고 판단할 수 없어요', slow: '찾고 있어요', fail: '정리하지 못했어요' }[mode];
      check('AI 분기 ' + mode, result.includes(expected));
    }
    for (const width of [1024, 1280, 1920]) {
      await p.setViewportSize({ width, height: 800 });
      await p.goto(origin + '/ledger.html?selftest=1&size=' + width + '#role=SALES&tab=defects&business=ALL');
      await p.waitForSelector('#selftest-result', { state: 'attached' });
      const result = JSON.parse(await p.locator('#selftest-result').textContent());
      check('레이아웃·접근성 ' + width, result.ok);
    }
    check('브라우저 실행 오류 없음', errors.length === 0);
    return { passed: checks.length, checks, errors };
  } finally { await context.close(); }
}
