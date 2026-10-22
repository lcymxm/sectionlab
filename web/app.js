/* SectionLab 界面逻辑：把几何内核接到画布和参数面板上。 */
(function () {
  'use strict';

  var G = window.SectionGeom;

  var FIELDS = {
    rect: [['b', '宽 b'], ['h', '高 h']],
    circle: [['d', '直径 d']],
    tube: [['d', '外径 d'], ['t', '壁厚 t']],
    ibeam: [['h', '高 h'], ['b', '翼缘宽 b'], ['tw', '腹板厚 tw'], ['tf', '翼缘厚 tf']],
    channel: [['h', '高 h'], ['b', '翼缘宽 b'], ['tw', '腹板厚 tw'], ['tf', '翼缘厚 tf']],
    angle: [['b', '肢宽 b'], ['h', '肢高 h'], ['t', '厚 t']],
    tsection: [['h', '高 h'], ['b', '翼缘宽 b'], ['tw', '腹板厚 tw'], ['tf', '翼缘厚 tf']]
  };

  var LABEL = {
    rect: '矩形', circle: '圆', tube: '圆管', ibeam: '工字钢',
    channel: '槽钢', angle: '角钢', tsection: 'T 型', poly: '自定义'
  };

  var state = {
    type: 'rect',
    unit: 'mm',
    params: {
      rect: { b: 120, h: 80 },
      circle: { d: 120 },
      tube: { d: 120, t: 10 },
      ibeam: { h: 220, b: 110, tw: 8, tf: 13 },
      channel: { h: 180, b: 70, tw: 7, tf: 11 },
      angle: { b: 90, h: 90, t: 9 },
      tsection: { h: 160, b: 110, tw: 8, tf: 13 }
    },
    poly: [[0, 0], [90, 0], [90, 90], [60, 90], [60, 30], [0, 30]],
    result: null,
    view: { scale: 1, ox: 0, oy: 0 },
    drag: -1
  };

  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var hintEl = document.getElementById('hint');
  var resEl = document.getElementById('res');
  var noteEl = document.getElementById('note');
  var paramsEl = document.getElementById('params');
  var toastEl = document.getElementById('toast');

  /* ---------------- 形状 ---------------- */

  function currentShape() {
    if (state.type === 'poly') {
      return { outer: state.poly, holes: [] };
    }
    var p = state.params[state.type];
    switch (state.type) {
      case 'rect': return G.presets.rect(p.b, p.h);
      case 'circle': return G.presets.circle(p.d, 160);
      case 'tube': return G.presets.tube(p.d, Math.min(p.t, p.d / 2 - 0.1), 160);
      case 'ibeam': return G.presets.ibeam(p.h, p.b, p.tw, p.tf);
      case 'channel': return G.presets.channel(p.h, p.b, p.tw, p.tf);
      case 'angle': return G.presets.angle(p.b, p.h, p.t);
      case 'tsection': return G.presets.tsection(p.h, p.b, p.tw, p.tf);
      default: return G.presets.rect(100, 100);
    }
  }

  function bboxOf(shape) {
    var xs = [], ys = [];
    shape.outer.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
    return {
      x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
      y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys)
    };
  }

  /* ---------------- 画布 ---------------- */

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function m2s(x, y) {
    return [x * state.view.scale + state.view.ox, state.view.oy - y * state.view.scale];
  }
  function s2m(px, py) {
    return [(px - state.view.ox) / state.view.scale, (state.view.oy - py) / state.view.scale];
  }

  function draw() {
    var r = canvas.getBoundingClientRect();
    var W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);

    var shape;
    try { shape = currentShape(); } catch (e) { return; }

    var bb = bboxOf(shape);
    var bw = Math.max(bb.x1 - bb.x0, 1);
    var bh = Math.max(bb.y1 - bb.y0, 1);
    var pad = 0.16;
    var s = Math.min((W * (1 - 2 * pad)) / bw, (H * (1 - 2 * pad)) / bh);
    state.view.scale = s;
    state.view.ox = W / 2 - ((bb.x0 + bb.x1) / 2) * s;
    state.view.oy = H / 2 + ((bb.y0 + bb.y1) / 2) * s;

    // 网格：每 10 mm 一格，50 mm 一条亮的
    drawGrid(bb, W, H);

    // 截面
    ctx.beginPath();
    tracePath(shape.outer);
    (shape.holes || []).forEach(function (h) { tracePath(h); });
    ctx.fillStyle = 'rgba(240, 180, 41, 0.16)';
    ctx.fill('evenodd');
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f0b429';
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (!state.result) return;
    var res = state.result;
    var [cx, cy] = m2s(res.cx, res.cy);

    // 主轴
    var L = Math.hypot(bw, bh) * s * 0.46;
    var th = res.thetaDeg * Math.PI / 180;
    [[th, '#5eead4'], [th + Math.PI / 2, '#7dd3fc']].forEach(function (pair) {
      var a = pair[0], color = pair[1];
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * L, cy + Math.sin(a) * L);
      ctx.lineTo(cx + Math.cos(a) * L, cy - Math.sin(a) * L);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });

    // 形心
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e9eef4';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9);
    ctx.strokeStyle = '#e9eef4';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 顶点
    if (state.type === 'poly') {
      shape.outer.forEach(function (p) {
        var q = m2s(p[0], p[1]);
        ctx.beginPath();
        ctx.arc(q[0], q[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0b0e12';
        ctx.fill();
        ctx.strokeStyle = '#f0b429';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }

  function tracePath(pts) {
    pts.forEach(function (p, i) {
      var q = m2s(p[0], p[1]);
      if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
    });
    ctx.closePath();
  }

  function drawGrid(bb, W, H) {
    var s = state.view.scale;
    var step = 10;
    while (step * s < 26) step *= 5;        // 缩得太小就放大网格
    var x0 = Math.floor(bb.x0 / step) * step;
    var x1 = Math.ceil(bb.x1 / step) * step;
    var y0 = Math.floor(bb.y0 / step) * step;
    var y1 = Math.ceil(bb.y1 / step) * step;

    ctx.lineWidth = 1;
    for (var x = x0; x <= x1 + 1e-6; x += step) {
      var p = m2s(x, 0);
      if (p[0] < -20 || p[0] > W + 20) continue;
      ctx.beginPath();
      ctx.moveTo(p[0], 0); ctx.lineTo(p[0], H);
      ctx.strokeStyle = Math.abs(x) < 1e-6 ? 'rgba(147,162,179,.30)' : 'rgba(147,162,179,.075)';
      ctx.stroke();
    }
    for (var y = y0; y <= y1 + 1e-6; y += step) {
      var q = m2s(0, y);
      if (q[1] < -20 || q[1] > H + 20) continue;
      ctx.beginPath();
      ctx.moveTo(0, q[1]); ctx.lineTo(W, q[1]);
      ctx.strokeStyle = Math.abs(y) < 1e-6 ? 'rgba(147,162,179,.30)' : 'rgba(147,162,179,.075)';
      ctx.stroke();
    }
  }

  /* ---------------- 结果 ---------------- */

  var UNIT = { mm: 1, cm: 1 / 10, in: 1 / 25.4 };
  var UNIT_LABEL = { mm: 'mm', cm: 'cm', in: 'in' };

  function conv(v, exp) {
    return v * Math.pow(UNIT[state.unit], exp);
  }

  function sup(n) {
    var map = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    return String(n).split('').map(function (c) { return map[c] || c; }).join('');
  }

  function fmt(v) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) {
      var e = Math.floor(Math.log10(a));
      var m = v / Math.pow(10, e);
      return m.toFixed(4) + '×10' + sup(e);
    }
    if (a >= 100) return v.toFixed(2);
    if (a >= 1) return v.toFixed(3);
    return v.toFixed(4);
  }

  function row(k, sym, v, exp, hi) {
    var u = UNIT_LABEL[state.unit] + ['', '', '²', '³', '⁴'][exp];
    return '<tr' + (hi ? ' class="hi"' : '') + '>' +
      '<td class="k">' + k + '<span class="sym">' + sym + '</span></td>' +
      '<td class="v">' + fmt(conv(v, exp)) + '<span class="u">' + u + '</span></td></tr>';
  }

  function renderResults() {
    var shape = currentShape();
    var r;
    try {
      r = G.analyze(shape);
      state.result = r;
    } catch (e) {
      state.result = null;
      resEl.innerHTML = '<tr><td class="k" style="color:#f87171">' + e.message + '</td></tr>';
      noteEl.textContent = '';
      return;
    }

    var deg = state.unit === 'in' ? 'in' : (state.unit === 'cm' ? 'cm' : 'mm');
    resEl.innerHTML = [
      row('面积', 'A', r.area, 2, false),
      row('形心 X', 'cx', r.cx, 1, false),
      row('形心 Y', 'cy', r.cy, 1, false),
      row('惯性矩', 'Ix', r.ix, 4, true),
      row('惯性矩', 'Iy', r.iy, 4, true),
      row('惯性积', 'Ixy', r.ixy, 4, false),
      row('主惯性矩', 'I₁', r.i1, 4, false),
      row('主惯性矩', 'I₂', r.i2, 4, false),
      '<tr><td class="k">主轴角<span class="sym">θ</span></td><td class="v">' +
        r.thetaDeg.toFixed(2) + '<span class="u">°</span></td></tr>',
      row('截面模量', 'Wx', r.wx, 3, false),
      row('截面模量', 'Wy', r.wy, 3, false),
      row('回转半径', 'rx', r.rx, 1, false),
      row('回转半径', 'ry', r.ry, 1, false),
      row('极惯性矩', 'J', r.j, 4, false)
    ].join('');

    noteEl.innerHTML = '全部换算到 <b>' + deg + '</b>。θ 是主轴相对 X 轴的角度，' +
      'I₁ 是较大的主惯性矩。' +
      (r.holeCount ? ' 已扣除 <b>' + r.holeCount + '</b> 个孔洞。' : '') +
      '<br>按纯几何截面计算：不含薄壁效应、不计算扭转常数。';
  }

  /* ---------------- 参数面板 ---------------- */

  function renderParams() {
    if (state.type === 'poly') {
      paramsEl.innerHTML = '<p class="note" style="grid-column:1/-1;margin:0">' +
        '在左侧画布上<b>点击空白处</b>加点，<b>拖动顶点</b>移动，<b>双击顶点</b>删除。' +
        '<br>当前 ' + state.poly.length + ' 个顶点。</p>';
      return;
    }
    var fields = FIELDS[state.type];
    var p = state.params[state.type];
    paramsEl.innerHTML = fields.map(function (f) {
      return '<div class="field"><label>' + f[1] + ' (mm)</label>' +
        '<input type="number" data-key="' + f[0] + '" value="' + p[f[0]] + '" min="0.1" step="1"></div>';
    }).join('');
    paramsEl.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var v = parseFloat(inp.value);
        if (!isFinite(v) || v <= 0) return;
        p[inp.dataset.key] = v;
        refresh();
      });
    });
  }

  function refresh() {
    try { state.result = G.analyze(currentShape()); } catch (e) { state.result = null; }
    draw();
    renderResults();
    if (state.type === 'poly') renderParams();
  }

  /* ---------------- 交互 ---------------- */

  function nearestVertex(px, py, shape) {
    var best = -1, bestD = 12;
    shape.outer.forEach(function (p, i) {
      var q = m2s(p[0], p[1]);
      var d = Math.hypot(q[0] - px, q[1] - py);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  canvas.addEventListener('pointerdown', function (ev) {
    var rect = canvas.getBoundingClientRect();
    var px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    var shape = currentShape();
    var idx = nearestVertex(px, py, shape);

    if (idx >= 0) {
      // 拖动预设的顶点 → 自动转成自定义，保住用户的操作意图
      if (state.type !== 'poly') {
        state.poly = shape.outer.map(function (p) { return [p[0], p[1]]; });
        state.type = 'poly';
        syncTypeButtons();
        renderParams();
      }
      state.drag = idx;
      canvas.setPointerCapture(ev.pointerId);
      return;
    }

    if (state.type === 'poly') {
      var m = s2m(px, py);
      state.poly.push([Math.round(m[0]), Math.round(m[1])]);
      refresh();
    }
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (state.drag < 0) return;
    var rect = canvas.getBoundingClientRect();
    var m = s2m(ev.clientX - rect.left, ev.clientY - rect.top);
    state.poly[state.drag] = [Math.round(m[0]), Math.round(m[1])];
    refresh();
  });

  canvas.addEventListener('pointerup', function (ev) {
    if (state.drag >= 0) {
      state.drag = -1;
      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
  });

  canvas.addEventListener('dblclick', function (ev) {
    if (state.type !== 'poly' || state.poly.length <= 3) return;
    var rect = canvas.getBoundingClientRect();
    var idx = nearestVertex(ev.clientX - rect.left, ev.clientY - rect.top, currentShape());
    if (idx >= 0) {
      state.poly.splice(idx, 1);
      refresh();
    }
  });

  function syncTypeButtons() {
    document.querySelectorAll('.type').forEach(function (b) {
      b.classList.toggle('on', b.dataset.type === state.type);
    });
    hintEl.textContent = state.type === 'poly'
      ? '点击加点 · 拖动移动 · 双击删除'
      : '拖动顶点会自动转成自定义多边形';
  }

  document.querySelectorAll('.type').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.type = btn.dataset.type;
      syncTypeButtons();
      renderParams();
      refresh();
      syncURL();
    });
  });

  document.getElementById('unit').addEventListener('change', function () {
    state.unit = this.value;
    renderResults();
  });

  document.getElementById('reset').addEventListener('click', function () {
    state.type = 'rect';
    state.params.rect = { b: 120, h: 80 };
    state.poly = [[0, 0], [90, 0], [90, 90], [60, 90], [60, 30], [0, 30]];
    syncTypeButtons();
    renderParams();
    refresh();
  });

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('on'); }, 1800);
  }

  document.getElementById('copy').addEventListener('click', function () {
    if (!state.result) return;
    var r = state.result;
    var u = UNIT_LABEL[state.unit];
    var lines = [
      '截面：' + LABEL[state.type],
      'A   = ' + fmt(conv(r.area, 2)) + ' ' + u + '²',
      'cx  = ' + fmt(conv(r.cx, 1)) + ' ' + u,
      'cy  = ' + fmt(conv(r.cy, 1)) + ' ' + u,
      'Ix  = ' + fmt(conv(r.ix, 4)) + ' ' + u + '⁴',
      'Iy  = ' + fmt(conv(r.iy, 4)) + ' ' + u + '⁴',
      'Ixy = ' + fmt(conv(r.ixy, 4)) + ' ' + u + '⁴',
      'I₁  = ' + fmt(conv(r.i1, 4)) + ' ' + u + '⁴',
      'I₂  = ' + fmt(conv(r.i2, 4)) + ' ' + u + '⁴',
      'θ   = ' + r.thetaDeg.toFixed(2) + '°',
      'Wx  = ' + fmt(conv(r.wx, 3)) + ' ' + u + '³',
      'Wy  = ' + fmt(conv(r.wy, 3)) + ' ' + u + '³',
      'rx  = ' + fmt(conv(r.rx, 1)) + ' ' + u,
      'ry  = ' + fmt(conv(r.ry, 1)) + ' ' + u
    ].join('\n');
    copyText(lines).then(function (ok) {
      toast(ok ? '已复制到剪贴板' : '复制失败');
    });
  });

  document.getElementById('png').addEventListener('click', function () {
    canvas.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'section-' + Date.now() + '.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('已保存图片');
    }, 'image/png');
  });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  window.addEventListener('resize', resize);

  // URL 参数：?type=ibeam&unit=cm —— 方便分享某个截面，也方便截图
  (function initFromURL() {
    try {
      var q = new URLSearchParams(location.search);
      var t = q.get('type');
      if (t && (FIELDS[t] || t === 'poly')) state.type = t;
      var u = q.get('unit');
      if (u && UNIT[u]) {
        state.unit = u;
        document.getElementById('unit').value = u;
      }
    } catch (e) { /* 老浏览器没有 URLSearchParams，忽略 */ }
  })();

  function syncURL() {
    try {
      var q = new URLSearchParams(location.search);
      q.set('type', state.type);
      history.replaceState(null, '', location.pathname + '?' + q.toString());
    } catch (e) { /* 忽略 */ }
  }

  syncTypeButtons();
  renderParams();
  resize();
  refresh();
  syncURL();
})();
