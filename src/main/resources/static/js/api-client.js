/* 화면이 쓰는 유일한 데이터 창구 (docs/05-data-api-spec.md, CLAUDE.md 프론트 단계 규칙).
   프론트 단계: 서버 통신 없이 js/fixtures/ 의 고정값만 돌려준다.
   백엔드 연결 때는 이 파일의 데이터 출처만 바꾸고, 함수 이름과 응답 키는 그대로 둔다. */
(function () {
  'use strict';
  var F = window.FIXTURES || {};

  function copy(v) { return JSON.parse(JSON.stringify(v)); }

  window.ApiClient = {
    /* GET /api/users  -> AppUser[] (역할 전환·대리 접수 대상) */
    getUsers: function () {
      return Promise.resolve(copy(F.users || []));
    },
    /* GET /api/notifications?userId=  -> NotificationLog[] (알림 미리보기 내역, 최신 순) */
    getNotifications: function (userId) {
      var list = (F.notifications || []).filter(function (n) { return n.recipientId === userId; });
      list.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      return Promise.resolve(copy(list));
    }
  };
})();
