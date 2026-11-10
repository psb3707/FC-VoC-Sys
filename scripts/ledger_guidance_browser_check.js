/* ADR-024. 실행 중인 S4의 Playwright MCP에서 filename으로 실행. 독립 컨텍스트 사용. */
async (page) => {
  const origin = new URL(page.url()).origin, ctx = await page.context().browser().newContext();
  const p = await ctx.newPage(), checks = [], errors = [];
  p.on('pageerror', error => errors.push(String(error)));
  const check = (name, pass) => { if (!pass) throw Error(name); checks.push(name); };
  const click = name => p.getByRole('button', { name, exact: true }).click();
  const open = async (hash) => {
    await p.goto(origin + '/ledger.html?guideCheck=' + checks.length + '#' + hash);
    await p.waitForFunction(() => !!document.querySelector('.ld-total'));
  };
  const ask = async question => {
    await p.locator('#wf-question').fill(question);
    await p.locator('#wf-ai-submit').click();
    await p.waitForFunction(() => !!document.querySelector('#wf-ai-result').textContent.trim());
  };
  try {
    await open('role=SALES&ai=1');
    check('목적 중심 진입 문구', await p.getByRole('button', { name: '이전 처리 방법 찾기', exact: true }).isVisible());
    check('열린 영역 제목', await p.getByRole('heading', { name: '어떻게 대응하면 될까요?', exact: true }).isVisible());
    await click('서명 링크 오류 대응');
    check('예시 질문 후 포커스 유지', await p.evaluate(() => document.activeElement.id === 'wf-question'));
    await ask('서명 알림톡이 초대장 화면으로 열리면 어떻게 처리했나요?');
    check('가장 관련 있는 답변 하나', await p.locator('#wf-ai-result .wf-guidance').count() === 1);
    check('핵심 답 먼저 표시', (await p.locator('.wf-answer-lead').textContent()).includes('문자로 서명 링크'));
    check('반복 사례 표 제거', await p.locator('#wf-ai-result .pn-rows').count() === 0);
    check('확인·조건별 행동 3개', await p.locator('.wf-guide-step').count() === 3);
    check('근거와 처리 시점', (await p.locator('.wf-evidence').innerText()).includes('D-2026-001 · 2026-11-02'));
    const related = p.locator('details').filter({ has: p.locator('summary').filter({ hasText: '증상이 다르면 확인할 기록' }) });
    check('다른 증상 기록 기본 접힘', await related.count() === 1 && !(await related.evaluate(el => el.open)));
    await ask('서명 오류를 전에 어떻게 처리했나요?');
    check('모호한 질문은 되묻기', await p.getByRole('heading', { name: '어떤 증상인가요?', exact: true }).isVisible());
    check('모호할 때 해결책 미제시', await p.locator('.wf-guidance').count() === 0);
    await click('서명 화면이 멈춰요');
    check('되묻기 선택 후 포커스 유지', await p.evaluate(() => document.activeElement.id === 'wf-question'));
    check('증상 선택으로 답변 좁히기', (await p.locator('.wf-answer-lead').textContent()).includes('닫고 다시 열어'));
    check('선택한 증상의 근거', (await p.locator('.wf-evidence').innerText()).includes('D-2026-002'));
    await open('role=SALES&business=DESIGN&ai=1');
    await ask('가입설계 보험료 계산 지연은 어떻게 처리했나요?');
    check('조사 중은 해결 방법 미확정', (await p.locator('.wf-answer-lead').textContent()).includes('해결 방법은 아직 확인되지'));
    check('조사 중에는 확인 요청 안내', (await p.locator('.wf-guidance').innerText()).includes('가입설계 담당자에게 전달'));
    for (const mode of ['old', 'mismatch']) {
      await open('role=SALES&ai=1&aiCase=' + mode);
      await ask('서명 알림톡이 초대장으로 열려요. 처리 방법을 알려 주세요.');
      check(mode + ' 확정 권고 방지', (await p.locator('.wf-guidance').innerText()).includes('바로 적용하지 마세요') || (await p.locator('.wf-guidance').innerText()).includes('같은 원인이라고 판단할 수 없어요'));
    }
    await open('role=SALES&item=R-061');
    await p.locator('summary').filter({ hasText: '관련 사례 · AI 추천' }).click();
    await click('이 접수의 처리 방법 찾기');
    await p.locator('#wf-question').waitFor({ state: 'visible' });
    await ask('서명 알림톡이 초대장으로 열려요. 처리 방법을 알려 주세요.');
    await p.locator('summary').filter({ hasText: '현장 안내·확인 요청에 활용' }).click();
    await click('현장 안내 초안 만들기');
    await p.locator('#wf-editor').waitFor({ state: 'visible' });
    check('안내 초안의 조건 보존', (await p.locator('#wf-field-sharedText').inputValue()).includes('같은 조건이면'));
    check('초안의 사람 확인 미선택', !(await p.locator('[name=confirmed]').isChecked()));
    check('초안 생성만으로 공유 안 함', (await p.locator('#ld-body').innerText()).includes('공유 완료 기록 없음'));
    check('초안 입력으로 포커스 이동', await p.evaluate(() => document.activeElement.id === 'wf-field-sharedText'));
    const id = await p.evaluate(async () => (await ApiClient.getLedgerWorkflow()).records['R-061'].sharedText);
    check('검토 전 기존 공유 내용 미변경', !id);
    // 두 번째 초안은 질문·요청 양식으로 가져온다.
    await p.locator('summary').filter({ hasText: '관련 사례 · AI 추천' }).click();
    await click('이 접수의 처리 방법 찾기');
    await p.locator('#wf-question').waitFor({ state: 'visible' });
    await ask('서명 알림톡이 초대장으로 열려요. 처리 방법을 알려 주세요.');
    await p.locator('summary').filter({ hasText: '현장 안내·확인 요청에 활용' }).click();
    await click('확인 요청 내용 정리하기');
    await p.locator('#wf-editor[data-kind=request]').waitFor({ state: 'visible' });
    check('협조 질문 별도 초안', (await p.locator('#wf-field-sharedText').inputValue()).includes('동일 원인인지는 아직 확정하지'));
    check('질문 URL 미기록', !decodeURIComponent(p.url()).includes('초대장으로'));
    const storage = await p.evaluate(() => localStorage.getItem('fc-voc-intake-demo-v1') || '');
    check('초안 영구 저장 없음', !storage.includes('동일 원인인지는 아직 확정하지'));
    for (const width of [1024, 1280, 1920]) {
      await p.setViewportSize({ width, height: 800 });
      await open('role=SALES&ai=1');
      await ask('서명 알림톡이 초대장으로 열려요. 처리 방법을 알려 주세요.');
      await p.addScriptTag({ url: origin + '/js/dev/selftest.js?guide=' + width });
      await p.waitForSelector('#selftest-result', { state: 'attached' });
      const result = JSON.parse(await p.locator('#selftest-result').textContent());
      check('답변 표시 상태 접근성 ' + width, result.ok);
    }
    check('브라우저 오류 없음', errors.length === 0);
    return { passed: checks.length, checks, errors };
  } finally { await ctx.close(); }
}
