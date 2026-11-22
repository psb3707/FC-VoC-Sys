/* 두 갈래 진행 표시 (ADR-025·029, docs/06-ui-spec.md 0-3절 "두 갈래 진행 표시").
   대표 결함(공개 키: status, workaround, plannedFixDate, wontFixReasonCode/Text)을
   "지금 가능한 대응"과 "오류 수정 진행상황"으로 나눠 보인다. "수정 완료"는 검증 기록이 있을 때만(ADR-029).
   원칙(02번 4-1절): 임시조치 ≠ 근본 해결, 수정 예정 ≠ 수정 완료(예정일이 있을 때만 날짜), 연결 전 ≠ 담당자 확인.
   S2 AI 문의 결과(intake-panel.js), S3 오류 현황·내 접수내역·지점 FC 문의(known-panel.js)가 함께 쓴다. */
(function () {
  'use strict';

  var STAGE = { RECEIVED: '접수', REPRODUCED: '문제 확인', CAUSE_FOUND: '원인 파악', WORKAROUND: '임시조치', FIX_PLANNED: '수정 예정' };
  var TAG = { RECEIVED: '확인 중', REPRODUCED: '확인 중', CAUSE_FOUND: '확인 중', WORKAROUND: '임시 방법 안내',
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
  function tag(d) {
    if (!d) return '담당자 확인 전';
    return d.status === 'RESOLVED' && d.verification ? '수정 완료' : TAG[d.status] || '확인 중';
  }
  /* 내 문의 처리(신고 단위). 담당자의 연결 = 담당자 확인 (ADR-025 결정 2). 같은 오류 참여는 FC가 고른 것(ADR-029 결정 10) */
  function handled(d, kind) {
    return !d ? '접수됨, 담당자 확인 전' : kind === 'ME_TOO' ? '같은 오류 참여로 연결됐어요' : '담당자가 확인했어요';
  }

  function now(d, resolution) {
    if (!d) return { answer: '담당자가 확인하면 지금 해볼 방법을 알려 드려요.', sub: null };
    if (d.status === 'RESOLVED') {
      var v = d.verification;
      if (v) {
        var ended = v.workaroundEnded ? '이전 임시 방법은 이제 쓰지 않아도 돼요. '
          : v.workaround ? '임시 방법(「' + v.workaround + '」) 종료 여부는 확인 전이에요. ' : '';
        return { answer: v.usageGuide, sub: ended + '문제가 계속되면 이 접수에서 알려 주세요.' };
      }
      return { answer: resolution ? resolution.action : '해결로 처리됐어요.', sub: '문제가 계속되면 이 접수에서 알려 주세요.' };
    }
    if (d.workaround) {
      return { answer: d.workaround, sub: '이 방법으로 업무를 이어갈 수 있어요. 오류 자체가 고쳐진 것은 아니에요.' };
    }
    return { answer: '현재 확인된 임시조치가 없어요.', sub: '방법이 나오면 알려 드려요.' };   // ADR-027 결정 4 문구
  }
  function fix(d, resolution) {
    if (!d) return { answer: '담당자 확인 전이라 정해진 일정이 없어요.', sub: '담당자가 확인하면 알려 드려요.' };
    if (d.status === 'RESOLVED') {
      var change = resolution ? resolution.change : '';
      if (d.verification) {
        return { answer: '수정·배포 검증 완료(가상) · ' + fmtWhen(d.verification.verifiedAt), sub: change || null };
      }
      return { answer: '해결로 처리됐어요' + (resolution && resolution.appliedAt ? ' · ' + fmtWhen(resolution.appliedAt) + ' 적용' : ''),
        sub: (change ? change + ' · ' : '') + '수정·배포 검증 기록은 없어요.' };
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
  /* ADR-029 결정 4: 실제로 기록된 단계만. 되돌리면 그 뒤 단계는 지금 경로에서 뺀다(전체는 상세 이력) */
  var ORDER = ['RECEIVED', 'REPRODUCED', 'CAUSE_FOUND', 'WORKAROUND', 'FIX_PLANNED', 'RESOLVED', 'WONT_FIX'];
  function recorded(history) {
    var path = [];
    (history || []).forEach(function (h) {
      var to = ORDER.indexOf(h.to);
      var back = h.from === 'WONT_FIX' || (h.from && to < ORDER.indexOf(h.from));
      if (back) path = path.filter(function (p) { return ORDER.indexOf(p.to) < to; });
      path = path.filter(function (p) { return p.to !== h.to; });
      path.push(h);
    });
    return path;
  }
  /* steps: [{name, at}]. 마지막이 지금 단계. 색이 아니라 글자로 */
  function steps(list) {
    var last = list.length - 1;
    var ol = el('ol', 'kn-stages is-recorded', list.map(function (s, i) {
      var li = el('li', i === last ? 'is-now' : '', [el('span', '', [s.name + (i === last ? ' · 지금' : '')]),
        s.at ? el('span', 'kn-stage-at', [fmtWhen(s.at)]) : null]);
      if (i === last) li.setAttribute('aria-current', 'step');
      return li;
    }));
    ol.setAttribute('aria-label', '기록된 처리 단계');
    // 상태 태그·목록이 이미 말하므로 지금 단계 문장은 화면 읽기용으로만
    return el('div', 'kn-progress', [el('p', 'kn-now pn-sr-only', ['지금 단계 · ', el('b', '', [last < 0 ? '접수' : list[last].name])]), ol]);
  }
  /* opts.resolution: 해결 안내, opts.after: 대응 아래에 붙일 요소(업무 재개·현장 확인), opts.progress: 진행상황 아래 기록된 단계 */
  function view(d, opts) {
    opts = opts || {};
    var plan = fix(d, opts.resolution);
    // 단계 목록을 붙이면 같은 단계를 글로 되풀이하지 않는다
    if (opts.progress && d && ['RESOLVED', 'WONT_FIX', 'FIX_PLANNED'].indexOf(d.status) < 0) plan.sub = '일정이 정해지면 알려 드려요.';
    return el('div', 'nt-tracks', [
      track('지금 가능한 대응', now(d, opts.resolution), opts.after),
      track('오류 수정 진행상황', plan, opts.progress)]);
  }

  window.NoticeTracks = { tag: tag, handled: handled, now: now, fix: fix, view: view, recorded: recorded, steps: steps };
})();
