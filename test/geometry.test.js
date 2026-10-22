/* 几何内核的解析解验证。
 *
 * 每一条都对着教科书公式算，不是"跑通了就算对"。
 *   node test/geometry.test.js
 */
'use strict';

const Geom = require('../web/geometry.js');

let pass = 0;
let fail = 0;

function close(name, actual, expected, relTol) {
  relTol = relTol === undefined ? 1e-6 : relTol;
  const denom = Math.abs(expected) > 1e-12 ? Math.abs(expected) : 1;
  const err = Math.abs(actual - expected) / denom;
  if (err <= relTol) {
    pass++;
    console.log(`  ✓ ${name}  ${actual.toPrecision(8)}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}  得到 ${actual}, 期望 ${expected}（相对误差 ${(err * 100).toFixed(3)}%）`);
  }
}

function throws(name, fn) {
  try {
    fn();
    fail++;
    console.log(`  ✗ ${name}  本该报错但没有`);
  } catch (e) {
    pass++;
    console.log(`  ✓ ${name}  正确报错：${e.message}`);
  }
}

console.log('\n[1] 矩形 100×50（原点在左下角）');
{
  const r = Geom.analyze(Geom.presets.rect(100, 50));
  const b = 100, h = 50;
  close('面积 A = b·h', r.area, b * h);
  close('形心 cx = b/2', r.cx, b / 2);
  close('形心 cy = h/2', r.cy, h / 2);
  close('Ix = b·h³/12', r.ix, b * h ** 3 / 12);
  close('Iy = h·b³/12', r.iy, h * b ** 3 / 12);
  close('Ixy = 0', r.ixy, 0, 1e-9);
  close('Wx = Ix / (h/2)', r.wx, (b * h ** 3 / 12) / (h / 2));
  close('回转半径 rx = √(Ix/A)', r.rx, Math.sqrt((b * h ** 3 / 12) / (b * h)));
  close('极惯性矩 J = Ix + Iy', r.j, (b * h ** 3 + h * b ** 3) / 12);
}

console.log('\n[2] 平移到 (1000, 2000) 后，形心惯性矩必须不变');
{
  const a = Geom.analyze(Geom.presets.rect(100, 50));
  const shifted = Geom.presets.rect(100, 50);
  shifted.outer = shifted.outer.map(([x, y]) => [x + 1000, y + 2000]);
  const b = Geom.analyze(shifted);
  close('Ix 不变', b.ix, a.ix);
  close('Iy 不变', b.iy, a.iy);
  close('形心跟着平移', b.cx, a.cx + 1000);
}

console.log('\n[3] 圆 d=200（512 边形近似）');
{
  const r = Geom.analyze(Geom.presets.circle(200, 512));
  const R = 100;
  close('面积 A = πR²', r.area, Math.PI * R * R, 1e-4);
  close('Ix = πR⁴/4', r.ix, Math.PI * R ** 4 / 4, 1e-3);
  close('Iy = Ix（圆对称）', r.iy, r.ix, 1e-9);
  close('主轴角 θ = 0（任意方向都对称）', r.ixy, 0, 1e-6);
}

console.log('\n[4] 圆管 d=200, t=20（内外圆各 512 边形）');
{
  const r = Geom.analyze(Geom.presets.tube(200, 20, 512));
  const Ro = 100, Ri = 80;
  close('面积 A = π(Ro²−Ri²)', r.area, Math.PI * (Ro ** 2 - Ri ** 2), 1e-4);
  const I = Math.PI * (Ro ** 4 - Ri ** 4) / 4;
  close('Ix = π(Ro⁴−Ri⁴)/4', r.ix, I, 1e-3);
  close('Iy = Ix', r.iy, r.ix, 1e-9);
}

console.log('\n[5] 工字钢 h=200 b=100 tw=8 tf=12');
{
  const r = Geom.analyze(Geom.presets.ibeam(200, 100, 8, 12));
  const h = 200, b = 100, tw = 8, tf = 12;
  const A = 2 * b * tf + (h - 2 * tf) * tw;
  const Ix = (b * h ** 3 - (b - tw) * (h - 2 * tf) ** 3) / 12;
  close('面积 A = 2btf + (h−2tf)tw', r.area, A);
  close('Ix = [b·h³ − (b−tw)(h−2tf)³]/12', r.ix, Ix);
  close('形心 cy = h/2', r.cy, h / 2);
}

console.log('\n[6] 100×100 方板开 40×40 方孔（居中）');
{
  const shape = Geom.presets.rect(100, 100);
  shape.holes = [[[30, 30], [30, 70], [70, 70], [70, 30]]];
  const r = Geom.analyze(shape);
  close('面积 = 100² − 40²', r.area, 10000 - 1600);
  close('Ix = 100·100³/12 − 40·40³/12', r.ix, (100 * 100 ** 3 - 40 * 40 ** 3) / 12);
  close('形心仍在正中', r.cy, 50);
  close('识别出 1 个孔洞', r.holeCount, 1);
}

console.log('\n[7] 顶点方向反过来，结果必须一致');
{
  const a = Geom.analyze(Geom.presets.ibeam(200, 100, 8, 12));
  const s = Geom.presets.ibeam(200, 100, 8, 12);
  s.outer = s.outer.slice().reverse();
  const b = Geom.analyze(s);
  close('面积相同', b.area, a.area);
  close('Ix 相同', b.ix, a.ix);
  close('Ixy 相同', b.ixy, a.ixy);
}

console.log('\n[8] 退化输入必须报错，不能返回 NaN');
{
  throws('共线三点', () => Geom.analyze({ outer: [[0, 0], [10, 10], [20, 20]] }));
  throws('顶点不足', () => Geom.analyze({ outer: [[0, 0], [1, 1]] }));
  throws('孔洞比外轮廓大', () => {
    const s = Geom.presets.rect(10, 10);
    s.holes = [Geom.presets.rect(100, 100).outer];
    return Geom.analyze(s);
  });
}

console.log('\n[9] 主轴：把矩形转 30° 再验证');
{
  const deg = 30 * Math.PI / 180;
  const cos = Math.cos(deg), sin = Math.sin(deg);
  const base = Geom.presets.rect(120, 40);
  // 先移到中心再旋转，避免平移影响
  const rotated = base.outer.map(([x, y]) => {
    const dx = x - 60, dy = y - 20;
    return [dx * cos - dy * sin + 500, dx * sin + dy * cos + 500];
  });
  const r = Geom.analyze({ outer: rotated, holes: [] });
  close('旋转后面积不变', r.area, 120 * 40);
  close('I1 是较大的主惯性矩', r.i1, Math.max(120 * 40 ** 3 / 12, 40 * 120 ** 3 / 12), 1e-6);
  close('I2 是较小的主惯性矩', r.i2, Math.min(120 * 40 ** 3 / 12, 40 * 120 ** 3 / 12), 1e-6);
  close('I1 + I2 = Ix + Iy（不变量）', r.i1 + r.i2, r.ix + r.iy, 1e-9);
}

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
