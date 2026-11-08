/* Symmetric Figma corner smoothing, adapted from figma-squircle:
 * https://github.com/phamfoo/figma-squircle/blob/main/src/draw.ts
 * https://github.com/phamfoo/figma-squircle/blob/main/src/index.ts
 *
 * MIT License — Copyright (c) 2021 Tien Pham
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(() => {
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const number = value => Number(value.toFixed(4));
  const command = (type, ...values) => `${type} ${values.map(number).join(' ')}`;

  function createPath(width, height, radius, smoothing = 1) {
    const w = Math.max(0, finite(width));
    const h = Math.max(0, finite(height));
    const budget = Math.min(w, h) / 2;
    const r = Math.min(Math.max(0, finite(radius)), budget);
    if (r < 0.0001) return `M 0 0 H ${number(w)} V ${number(h)} H 0 Z`;

    // Figma limits smoothing when neighbouring corners consume the same edge.
    const s = Math.min(Math.max(0, finite(smoothing, 1)), 1, budget / r - 1);
    const p = Math.min((1 + s) * r, budget);
    const arcAngle = (Math.PI / 2) * (1 - s);
    const arc = Math.sin(arcAngle / 2) * r * Math.SQRT2;
    const beta = (Math.PI / 4) * s;
    const junction = r * Math.tan(beta / 2);
    const c = junction * Math.cos(beta);
    const d = c * Math.tan(beta);
    const b = (p - arc - c - d) / 3;
    const a = 2 * b;
    const ab = a + b;
    const abc = ab + c;
    const result = [command('M', w - p, 0)];

    result.push(command('c', a, 0, ab, 0, abc, d));
    if (arc > 0.00001) result.push(command('a', r, r, 0, 0, 1, arc, arc));
    result.push(command('c', d, c, d, b + c, d, abc));
    result.push(command('L', w, h - p));
    result.push(command('c', 0, a, 0, ab, -d, abc));
    if (arc > 0.00001) result.push(command('a', r, r, 0, 0, 1, -arc, arc));
    result.push(command('c', -c, d, -(b + c), d, -abc, d));
    result.push(command('L', p, h));
    result.push(command('c', -a, 0, -ab, 0, -abc, -d));
    if (arc > 0.00001) result.push(command('a', r, r, 0, 0, 1, -arc, -arc));
    result.push(command('c', -d, -c, -d, -(b + c), -d, -abc));
    result.push(command('L', 0, p));
    result.push(command('c', 0, -a, 0, -ab, d, -abc));
    if (arc > 0.00001) result.push(command('a', r, r, 0, 0, 1, arc, -arc));
    result.push(command('c', c, -d, b + c, -d, abc, -d));
    result.push('Z');
    return result.join(' ');
  }

  // Settled cards reuse identical geometry across the scroll/hover owners.
  // Bound the cache so continuously changing transition sizes cannot grow it.
  const paths = new Map();
  function path(width, height, radius, smoothing = 1) {
    const key = `${finite(width)}|${finite(height)}|${finite(radius)}|${finite(smoothing, 1)}`;
    if (paths.has(key)) return paths.get(key);
    const result = createPath(width, height, radius, smoothing);
    if (paths.size >= 64) paths.delete(paths.keys().next().value);
    paths.set(key, result);
    return result;
  }
  window.HeroSquircle = Object.freeze({ path });
})();
