/* ADR-022. 원본은 편집하는 동안만 브라우저 메모리에 둔다. */
(function () {
  'use strict';
  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_PIXELS = 16 * 1024 * 1024;
  var MAX_EDGE = 1280;
  var MAX_ENCODED = 420000;

  window.createIntakeAttachment = function (ui) {
    var el = ui.el, btn = ui.btn;
    var original, crop, masks, history, candidate, mode, error, loading, revision = 0;
    reset();

    function reset() {
      revision++;
      original = crop = candidate = null;
      masks = [];
      history = [];
      mode = 'mask';
      error = '';
      loading = false;
    }

    function decode(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('이미지를 읽지 못했어요. 다시 선택해 주세요.')); };
        reader.onload = function () {
          var base64 = String(reader.result).split(',')[1] || '';
          var format = base64.startsWith('iVBORw0KGgo') ? 'png' : base64.startsWith('/9j/') ? 'jpeg' : '';
          if (!format) return reject(new Error('PNG 또는 JPEG 이미지만 첨부할 수 있어요.'));
          var image = new Image();
          image.onload = function () { resolve(image); };
          image.onerror = function () { reject(new Error('이미지를 열지 못했어요. 다른 PNG 또는 JPEG 파일을 골라 주세요.')); };
          image.src = 'data:image/' + format + ';base64,' + base64;
        };
        reader.readAsDataURL(file);
      });
    }
    function choose(file, update, redraw) {
      if (!file) return;
      var current = ++revision;
      error = '';
      loading = true;
      redraw();
      return Promise.resolve().then(function () {
        if (file.size > MAX_FILE_BYTES) throw new Error('5MB 이하의 PNG 또는 JPEG 파일을 골라 주세요.');
        return decode(file);
      }).then(function (image) {
        if (revision !== current) return;
        if (!image.width || !image.height || image.width * image.height > MAX_PIXELS) {
          throw new Error('이미지 해상도가 너무 커요. 해상도를 줄여 다시 선택해 주세요.');
        }
        original = image;
        crop = { x: 0, y: 0, w: image.width, h: image.height };
        masks = [];
        history = [];
        candidate = null;
        mode = 'mask';
        update('');
      }).catch(function (failure) {
        if (revision === current) error = failure.message || '이미지를 열지 못했어요. 다시 선택해 주세요.';
      }).finally(function () {
        if (revision === current) { loading = false; redraw(); }
      });
    }
    function draw(canvas) {
      var scale = Math.min(1, MAX_EDGE / Math.max(crop.w, crop.h));
      canvas.width = Math.max(1, Math.round(crop.w * scale));
      canvas.height = Math.max(1, Math.round(crop.h * scale));
      var ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(original, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      var sx = canvas.width / crop.w, sy = canvas.height / crop.h;
      ctx.fillStyle = '#000';
      masks.forEach(function (rect) {
        var x = Math.floor((rect.x - crop.x) * sx) - 1, y = Math.floor((rect.y - crop.y) * sy) - 1;
        var right = Math.ceil((rect.x + rect.w - crop.x) * sx) + 1;
        var bottom = Math.ceil((rect.y + rect.h - crop.y) * sy) + 1;
        ctx.fillRect(x, y, right - x, bottom - y);
      });
    }
    function apply(x, y, w, h, redraw) {
      if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) {
        error = '시작 위치와 너비·높이를 이미지 안에 맞춰 주세요.';
        return redraw();
      }
      var left = Math.floor(crop.x + x * crop.w), top = Math.floor(crop.y + y * crop.h);
      var right = Math.min(crop.x + crop.w, Math.ceil(crop.x + (x + w) * crop.w));
      var bottom = Math.min(crop.y + crop.h, Math.ceil(crop.y + (y + h) * crop.h));
      history.push({ crop: crop, masks: masks });
      var area = { x: left, y: top, w: right - left, h: bottom - top };
      if (mode === 'crop') crop = area;
      else masks = masks.concat(area);
      error = '';
      redraw();
    }
    function editingCanvas(redraw) {
      var canvas = el('canvas', { cls: 'pq-image-editor', 'aria-label': '이미지 편집 영역' });
      var start, overlay = el('span', { cls: 'pq-image-selection', hidden: true, 'aria-hidden': 'true' });
      draw(canvas);
      function point(event) {
        var box = canvas.getBoundingClientRect();
        function clamp(n) { return Math.max(0, Math.min(1, n)); }
        return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
      }
      function area(event) {
        var p = point(event);
        return [Math.min(start.x, p.x), Math.min(start.y, p.y), Math.abs(start.x - p.x), Math.abs(start.y - p.y)];
      }
      canvas.addEventListener('pointerdown', function (event) {
        if (!event.isPrimary || event.button !== 0) return;
        start = point(event);
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener('pointermove', function (event) {
        if (!start) return;
        var rect = area(event).map(function (value) { return value * 100 + '%'; });
        overlay.style.left = rect[0]; overlay.style.top = rect[1];
        overlay.style.width = rect[2]; overlay.style.height = rect[3]; overlay.hidden = false;
      });
      canvas.addEventListener('pointercancel', function () { start = null; overlay.hidden = true; });
      canvas.addEventListener('pointerup', function (event) {
        if (!start) return;
        var rect = area(event);
        start = null;
        overlay.hidden = true;
        if (rect[2] >= .01 && rect[3] >= .01) apply(rect[0], rect[1], rect[2], rect[3], redraw);
      });
      return el('div', { cls: 'pq-image-stage' }, [canvas, overlay]);
    }
    function coordinates(redraw) {
      var inputs = ['왼쪽', '위쪽', '너비', '높이'].map(function (name, index) {
        return el('input', { type: 'number', cls: 'pn-input', min: '0', max: '100', value: index < 2 ? '0' : '50',
          'aria-label': name + ' 비율' });
      });
      var applyButton = btn('pn-btn-2', '입력한 영역 적용');
      applyButton.addEventListener('click', function () {
        var v = inputs.map(function (input) { return input.value === '' ? NaN : Number(input.value) / 100; });
        apply(v[0], v[1], v[2], v[3], redraw);
      });
      return el('details', { cls: 'pn-details pq-details' }, [
        el('summary', null, ['키보드로 영역 지정']),
        el('div', { cls: 'pq-details-body' }, [
          el('p', null, ['보이는 이미지에서 시작 위치와 너비·높이를 0~100%로 입력하세요.']),
          el('div', { cls: 'pq-grid' }, inputs.map(function (input, index) {
            return el('label', null, [['왼쪽', '위쪽', '너비', '높이'][index], input]);
          })), applyButton])]);
    }
    function view(confirmed, update, redraw) {
      function button(label, action, attrs) {
        var b = btn('pn-btn-2', label, null, Object.assign({ 'data-fk': 'attachment:' + label }, attrs));
        b.addEventListener('click', action);
        return b;
      }
      var picker = el('input', { id: 'quick-image-file', cls: 'pn-input', type: 'file', accept: 'image/png,image/jpeg', disabled: loading });
      picker.addEventListener('change', function () { choose(picker.files[0], update, redraw); });
      var out = [
        el('p', { cls: 'pn-lead' }, ['PNG 또는 JPEG 한 장, 최대 5MB. 고객 정보가 보이는 부분을 가린 뒤 최종 이미지를 확인해 주세요.']),
        el('label', { for: picker.id, cls: 'pn-label' }, [confirmed || original ? '이미지 교체' : '이미지 선택']), picker,
        error ? el('p', { cls: 'pn-err', role: 'alert' }, [error]) : null,
        loading ? el('p', { role: 'status' }, ['이미지를 열고 있어요.']) : null
      ];
      if (candidate || confirmed) {
        out.push(el('p', { cls: 'pn-card-title' }, [candidate ? '최종 첨부 미리보기' : '첨부할 이미지']),
          el('img', { cls: 'pq-image-preview', src: candidate || confirmed, alt: '최종 첨부 이미지' }));
        if (candidate) out.push(button('이 이미지 첨부', function () { update(candidate); reset(); redraw(); }),
          button('다시 편집', function () { candidate = null; redraw(); }));
      } else if (original) {
        out.push(el('p', null, ['버튼으로 작업을 고른 다음 이미지에서 사각형을 드래그하세요.']),
          el('div', { cls: 'pq-image-tools' }, [
            button('자르기', function () { mode = 'crop'; redraw(); }, { 'aria-pressed': String(mode === 'crop') }),
            button('가림', function () { mode = 'mask'; redraw(); }, { 'aria-pressed': String(mode === 'mask') }),
            button('되돌리기', function () {
              var before = history.pop();
              if (before) { crop = before.crop; masks = before.masks; redraw(); }
            }, { disabled: !history.length })]),
          editingCanvas(redraw),
          masks.length ? el('p', { role: 'status' }, ['가린 영역 ', masks.length, '개']) : null,
          coordinates(redraw),
          button('최종 이미지 확인', function () {
            var canvas = document.createElement('canvas');
            draw(canvas);
            var encoded = canvas.toDataURL('image/png');
            if (encoded.length > MAX_ENCODED) encoded = canvas.toDataURL('image/jpeg', .8);
            if (encoded.length > MAX_ENCODED) error = '첨부할 이미지가 너무 커요. 영역을 더 작게 잘라 주세요.';
            else { candidate = encoded; error = ''; }
            redraw();
          }));
      }
      if (original || confirmed || loading) out.push(button('이미지 삭제', function () { reset(); update(''); redraw(); }));
      return out;
    }
    return { view: view, reset: reset, pending: function () { return !!original || loading; } };
  };
})();
