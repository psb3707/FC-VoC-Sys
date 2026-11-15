/* 두 갈래 진행 표시 (ADR-025, docs/06-ui-spec.md 0-3절 "두 갈래 진행 표시").
   대표 결함(공개 키: status, workaround, plannedFixDate, wontFixReasonCode/Text)을
   ① 지금 업무를 이어갈 수 있나요?  ② 근본 오류는 언제 고쳐지나요?  로 나눠 보인다.
   원칙(02번 4-1절): 임시조치 ≠ 근본 해결, 수정 예정 ≠ 수정 완료(예정일이 있을 때만 날짜), 연결 전 ≠ 담당자 확인.
   S2 AI 문의 결과(intake-panel.js), S3 오류 현황·내 접수내역·지점 FC 문의(known-panel.js)가 함께 쓴다. */
(function () {
  'use strict';

  var STAGE = { RECEIVED: '접수', REPRODUCED: '문제 확인', CAUSE_FOUND: '원인 파악', WORKAROUND: '임시조치', FIX_PLANNED: '수정 예정' };
  var TAG = { RECEIVED: '원인 확인 중', REPRODUCED: '원인 확인 중', CAUSE_FOUND: '원인 확인 중', WORKAROUND: '임시 방법 안내',
    FIX_PLANNED: '수정 예정', RESOLVED: '해결', WONT_FIX: '수정하지 않음' };

  function el(tag, cls, kids) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    (kids || []).forEach(function (k) {
      if (k == null || k === false) return;
      e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
    return e;
  }
  function fmtDate(iso) { return parseInt(iso.slice(5, 7), 10) + '월 ' + parseInt(iso.slice(8, 10), 10) + '일'; }
  function fmtWhen(iso) { return fmtDate(iso) + ' ' + iso.slice(11, 16); }

  /* 상태 태그 한 개(쉬운 말). 대표 결함에 연결되기 전이면 "담당자 확인 전" */
  function tag(d) { return d ? TAG[d.status] || '원인 확인 중' : '담당자 확인 전'; }
  /* 내 문의 처리(신고 단위). 연결 = 담당자 확인 (ADR-025 결정 2) */
  function handled(d) { return d ? '담당자가 확인했어요' : '접수됨, 담당자 확인 전'; }

  function now(d, resolution) {
    if (!d) return { answer: '담당자가 확인하면 지금 해볼 방법을 알려 드려요.', sub: null };
    if (d.status === 'RESOLVED') {
      return { answer: resolution ? resolution.action : '고쳤어요. 이제 평소처럼 쓰시면 돼요.', sub: null };
    }
    if (d.workaround) {
      return { answer: d.workaround, sub: '이 방법으로 업무를 이어갈 수 있어요. 오류 자체가 고쳐진 것은 아니에요.' };
    }
    return { answer: '확인된 임시 방법이 아직 없어요.', sub: '방법이 나오면 알려 드려요.' };
  }
  function fix(d, resolution) {
    if (!d) return { answer: '담당자 확인 전이라 정해진 일정이 없어요.', sub: '담당자가 확인하면 알려 드려요.' };
    if (d.status === 'RESOLVED') {
      return { answer: '고쳤어요' + (resolution && resolution.appliedAt ? ' · ' + fmtWhen(resolution.appliedAt) + ' 적용' : ''),
        sub: resolution ? resolution.change : null };
    }
    if (d.status === 'WONT_FIX') {
      var reason = d.wontFixReasonText || '';
      return { answer: '지금 화면은 고치지 않아요.',
        sub: reason + (d.wontFixReasonCode === 'NEW_SFA' ? (reason ? ' · ' : '') + '새 시스템 적용 날짜는 아직 안내되지 않았어요.' : '') || null };
    }
    if (d.status === 'FIX_PLANNED' && d.plannedFixDate) {
      return { answer: fmtDate(d.plannedFixDate) + '에 고칠 예정이에요.', sub: '날짜가 바뀌면 다시 알려 드려요.' };
    }
    return { answer: '수정 일정은 아직 정해지지 않았어요.',
      sub: '지금 단계: ' + (STAGE[d.status] || '접수') + ' · 일정이 정해지면 알려 드려요.' };
  }

  function track(question, part, extra) {
    return el('section', 'nt-track', [
      el('p', 'nt-q', [question]),
      el('p', 'nt-a', [part.answer]),
      part.sub ? el('p', 'nt-sub', [part.sub]) : null,
      extra || null]);
  }
  /* opts.resolution: 해결 안내(적용 시각·바뀐 동작·기존 건 처리), opts.after: ① 아래에 붙일 요소(업무 재개 회신 등) */
  function view(d, opts) {
    opts = opts || {};
    return el('div', 'nt-tracks', [
      track('① 지금 업무를 이어갈 수 있나요?', now(d, opts.resolution), opts.after),
      track('② 근본 오류는 언제 고쳐지나요?', fix(d, opts.resolution))]);
  }

  window.NoticeTracks = { tag: tag, handled: handled, now: now, fix: fix, view: view };
})();
