/* ADR-021. 두 가상 화면이 공유하는 구조화 접수·처리 이력. */
(function () {
  'use strict';
  var KEY = 'fc-voc-intake-demo-v1', storageUsable = true;
  function empty() { return { nextReport: 1, reports: [], links: {}, cancelled: {}, followups: {}, attachments: {}, history: [], read: {} }; }
  var memory = empty();

  function read() {
    if (!storageUsable) return memory;
    try {
      var saved = window.localStorage.getItem(KEY);
      if (!saved) memory = empty();
      else {
        var state = JSON.parse(saved);
        if (state && Number.isInteger(state.nextReport) && Array.isArray(state.reports) &&
            Array.isArray(state.history) && state.links && state.cancelled && state.followups && state.read) {
          state.attachments = state.attachments || {};
          memory = state;
        }
      }
    } catch (e) { storageUsable = false; }
    return memory;
  }

  window.IntakeDemoStore = {
    read: read,
    update: function (change, requireStorage) {
      function commit() {
        var saved = read();
        if (requireStorage && !storageUsable) return { attachmentError: '브라우저에 이미지를 저장할 수 없어요. 이미지를 빼고 접수할 수 있어요.' };
        var state = requireStorage ? JSON.parse(JSON.stringify(saved)) : saved;
        var result = change(state);
        if (result && result.attachmentError) return result;
        if (storageUsable) {
          try {
            window.localStorage.setItem(KEY, JSON.stringify(state));
          } catch (e) {
            if (requireStorage) return { attachmentError: '첨부를 저장하지 못했어요. 다시 시도하거나 이미지를 빼고 접수해 주세요.' };
            storageUsable = false;
          }
        }
        memory = state;
        return result;
      }
      // file://에서는 저장소만 공유하고 브라우저 락은 사용하지 않는다.
      return location.protocol !== 'file:' && navigator.locks ?
        navigator.locks.request(KEY, commit) : Promise.resolve().then(commit);
    },
    watch: function (fn) {
      window.addEventListener('storage', function (event) { if (event.key === KEY || event.key === null) fn(); });
      window.addEventListener('focus', fn);
    }
  };
})();
