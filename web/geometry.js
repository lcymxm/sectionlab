/* 截面几何性质计算内核。
 *
 * 输入是一个「带孔洞的多边形」：
 *   { outer: [[x,y], ...], holes: [ [[x,y], ...], ... ] }
 * 顶点方向随便写，内部会自动纠正（外轮廓逆时针为正，孔洞顺时针为负）。
 *
 * 所有公式都基于带符号面积，所以孔洞天然是「负面积」，不需要特殊处理。
 * 单位由调用方决定，这里只做无量纲数学。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SectionGeom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;

  function signedArea(pts) {
    var s = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }

  function ensureOrientation(pts, wantPositive) {
    var a = signedArea(pts);
    if (Math.abs(a) < EPS) return pts.slice();
    if ((a > 0) === wantPositive) return pts.slice();
    return pts.slice().reverse();
  }

  /* 关于原点的面积矩与惯性矩，全部带符号累加。
   * 公式出自任意多边形的 Green 定理展开，是最常见的那一套：
   *   A   = 1/2  Σ (xi·yj − xj·yi)
   *   Ix  = 1/12 Σ (yi² + yi·yj + yj²)(xi·yj − xj·yi)
   *   Iy  = 1/12 Σ (xi² + xi·xj + xj²)(xi·yj − xj·yi)
   *   Ixy = 1/24 Σ (xi·yj − xj·yi)(xi·yj + 2xi·yi + 2xj·yj + xj·yi)
   */
  function contourProps(pts) {
    var A = 0, Sx = 0, Sy = 0, Ix = 0, Iy = 0, Ixy = 0;
    for (var i = 0; i < pts.length; i++) {
      var x1 = pts[i][0], y1 = pts[i][1];
      var x2 = pts[(i + 1) % pts.length][0], y2 = pts[(i + 1) % pts.length][1];
      var cross = x1 * y2 - x2 * y1;
      A += cross;
      Sx += (y1 + y2) * cross;
      Sy += (x1 + x2) * cross;
      Ix += (y1 * y1 + y1 * y2 + y2 * y2) * cross;
      Iy += (x1 * x1 + x1 * x2 + x2 * x2) * cross;
      Ixy += cross * (x1 * y2 + 2 * x1 * y1 + 2 * x2 * y2 + x2 * y1);
    }
    A /= 2;
    Sx /= 6;      // 一阶矩 ∫y dA
    Sy /= 6;      // 一阶矩 ∫x dA
    Ix /= 12;     // ∫y² dA
    Iy /= 12;     // ∫x² dA
    Ixy /= 24;    // ∫xy dA
    return { area: A, sx: Sx, sy: Sy, ix: Ix, iy: Iy, ixy: Ixy };
  }

  function analyze(shape) {
    if (!shape || !shape.outer || shape.outer.length < 3) {
      throw new Error('至少需要 3 个顶点');
    }
    var outer = ensureOrientation(shape.outer, true);
    var holes = (shape.holes || []).map(function (h) {
      return ensureOrientation(h, false);
    });

    var parts = [contourProps(outer)].concat(holes.map(contourProps));
    var total = { area: 0, sx: 0, sy: 0, ix: 0, iy: 0, ixy: 0 };
    parts.forEach(function (p) {
      total.area += p.area;
      total.sx += p.sx;
      total.sy += p.sy;
      total.ix += p.ix;
      total.iy += p.iy;
      total.ixy += p.ixy;
    });

    if (total.area <= EPS) {
      throw new Error('截面面积为零或孔洞比外轮廓还大');
    }

    var cx = total.sy / total.area;
    var cy = total.sx / total.area;

    // 平行轴定理：从原点移到形心
    var ix = total.ix - total.area * cy * cy;
    var iy = total.iy - total.area * cx * cx;
    var ixy = total.ixy - total.area * cx * cy;

    // 主轴方向：让 I1 是较大的那个主惯性矩
    var theta = 0.5 * Math.atan2(-2 * ixy, ix - iy);
    var thetaDeg = theta * 180 / Math.PI;
    // 归一化到 (-90, 90]：−90° 和 +90° 是同一根轴，显示成正的更符合习惯
    if (thetaDeg <= -90) thetaDeg += 180;
    if (thetaDeg > 90) thetaDeg -= 180;
    var mid = (ix + iy) / 2;
    var rad = Math.sqrt(Math.pow((ix - iy) / 2, 2) + ixy * ixy);
    var i1 = mid + rad;
    var i2 = mid - rad;

    // 截面模量要用最远纤维
    var ys = outer.map(function (p) { return Math.abs(p[1] - cy); });
    var xs = outer.map(function (p) { return Math.abs(p[0] - cx); });
    var ymax = Math.max.apply(null, ys);
    var xmax = Math.max.apply(null, xs);

    var xsAll = outer.map(function (p) { return p[0]; });
    var ysAll = outer.map(function (p) { return p[1]; });

    return {
      area: total.area,
      cx: cx,
      cy: cy,
      ix: ix,
      iy: iy,
      ixy: ixy,
      i1: i1,
      i2: i2,
      thetaDeg: thetaDeg,
      wx: ymax > EPS ? ix / ymax : 0,   // 绕 x 轴的截面模量（纤维沿 y 方向）
      wy: xmax > EPS ? iy / xmax : 0,
      rx: Math.sqrt(Math.max(ix, 0) / total.area),
      ry: Math.sqrt(Math.max(iy, 0) / total.area),
      j: ix + iy,                       // 极惯性矩（关于形心）
      bbox: {
        x0: Math.min.apply(null, xsAll), x1: Math.max.apply(null, xsAll),
        y0: Math.min.apply(null, ysAll), y1: Math.max.apply(null, ysAll)
      },
      holeCount: holes.length
    };
  }

  // 内置型材：返回顶点坐标（单位任意，界面里再乘比例）
  var presets = {
    rect: function (b, h) {
      return { outer: [[0, 0], [b, 0], [b, h], [0, h]], holes: [] };
    },
    circle: function (d, seg) {
      var n = seg || 96, r = d / 2, pts = [];
      for (var i = 0; i < n; i++) {
        var a = 2 * Math.PI * i / n;
        pts.push([r + r * Math.cos(a), r + r * Math.sin(a)]);
      }
      return { outer: pts, holes: [] };
    },
    tube: function (d, t, seg) {
      var n = seg || 96, ro = d / 2, ri = ro - t, outer = [], hole = [];
      for (var i = 0; i < n; i++) {
        var a = 2 * Math.PI * i / n;
        outer.push([ro + ro * Math.cos(a), ro + ro * Math.sin(a)]);
        hole.push([ro + ri * Math.cos(a), ro + ri * Math.sin(a)]);
      }
      return { outer: outer, holes: [hole] };
    },
    ibeam: function (h, b, tw, tf) {
      var hw = (b - tw) / 2;
      return {
        outer: [
          [0, 0], [b, 0], [b, tf], [hw + tw, tf], [hw + tw, h - tf],
          [b, h - tf], [b, h], [0, h], [0, h - tf], [hw, h - tf],
          [hw, tf], [0, tf]
        ],
        holes: []
      };
    },
    channel: function (h, b, tw, tf) {
      return {
        outer: [
          [0, 0], [b, 0], [b, tf], [tw, tf], [tw, h - tf],
          [b, h - tf], [b, h], [0, h]
        ],
        holes: []
      };
    },
    angle: function (b, h, t) {
      return {
        outer: [
          [0, 0], [b, 0], [b, t], [t, t], [t, h], [0, h]
        ],
        holes: []
      };
    },
    tsection: function (h, b, tw, tf) {
      var hw = (b - tw) / 2;
      return {
        outer: [
          [hw, 0], [hw + tw, 0], [hw + tw, h - tf], [b, h - tf],
          [b, h], [0, h], [0, h - tf], [hw, h - tf]
        ],
        holes: []
      };
    }
  };

  return {
    analyze: analyze,
    presets: presets,
    signedArea: signedArea,
    ensureOrientation: ensureOrientation
  };
});
