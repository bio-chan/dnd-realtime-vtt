// Dice math shared by server (Node) and browser.
// - parse/roll dice expressions like "2d6+3", "d20", "1d8-1"
// - exact probability distributions (no simulation) for odds shown in the UI
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiceMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_DICE = 60;

  function parse(expr) {
    expr = String(expr || '').replace(/\s+/g, '').toLowerCase();
    if (!expr || expr.length > 60) return null;
    if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(expr)) return null;
    const terms = []; const re = /([+-]?)(\d*d\d+|\d+)/g; let m, dice = 0;
    while ((m = re.exec(expr))) {
      const sign = m[1] === '-' ? -1 : 1;
      if (m[2].includes('d')) {
        let [n, s] = m[2].split('d'); n = parseInt(n || '1', 10); s = parseInt(s, 10);
        if (n < 1 || n > 50 || s < 2 || s > 1000) return null;
        dice += n; terms.push({ sign, n, s });
      } else terms.push({ sign, c: parseInt(m[2], 10) });
    }
    return dice > MAX_DICE ? null : terms;
  }

  // rng(sides) must return a uniform integer in [1, sides]
  function roll(expr, rng) {
    const terms = parse(expr); if (!terms) return null;
    let total = 0, mod = 0, sides = 0; const rolls = [];
    for (const t of terms) {
      if (t.c !== undefined) { total += t.sign * t.c; mod += t.sign * t.c; continue; }
      sides = sides || t.s;
      for (let i = 0; i < t.n; i++) { const v = rng(t.s); rolls.push({ s: t.s, v, neg: t.sign < 0 }); total += t.sign * v; }
    }
    return { total, rolls, mod, sides };
  }

  // Exact distribution of the expression total: Map<total, probability>
  function distribution(expr) {
    const terms = parse(expr); if (!terms) return null;
    let dist = new Map([[0, 1]]);
    for (const t of terms) {
      if (t.c !== undefined) { const nd = new Map(); for (const [k, p] of dist) nd.set(k + t.sign * t.c, p); dist = nd; continue; }
      for (let i = 0; i < t.n; i++) {
        const nd = new Map();
        for (const [k, p] of dist) for (let f = 1; f <= t.s; f++) {
          const key = k + t.sign * f; nd.set(key, (nd.get(key) || 0) + p / t.s);
        }
        dist = nd;
      }
    }
    return dist;
  }

  function stats(expr) {
    const terms = parse(expr); if (!terms) return null;
    let min = 0, max = 0, mean = 0;
    for (const t of terms) {
      if (t.c !== undefined) { min += t.sign * t.c; max += t.sign * t.c; mean += t.sign * t.c; continue; }
      const lo = t.n, hi = t.n * t.s, mu = t.n * (t.s + 1) / 2;
      if (t.sign > 0) { min += lo; max += hi; } else { min -= hi; max -= lo; }
      mean += t.sign * mu;
    }
    return { min, max, mean };
  }

  // P(total >= target) for an expression
  function atLeast(expr, target) {
    const d = distribution(expr); if (!d) return null;
    let p = 0; for (const [k, q] of d) if (k >= target) p += q; return p;
  }

  // d20 attack: natural 20 always hits, natural 1 always misses.
  // mode: 'NORMAL' | 'ADV' (roll 2 keep high) | 'DIS' (roll 2 keep low)
  function hitChance(dc, bonus = 0, mode = 'NORMAL') {
    let single = 0;
    for (let f = 1; f <= 20; f++) if (f === 20 || (f !== 1 && f + bonus >= dc)) single++;
    const p = single / 20;
    if (mode === 'ADV') return 1 - (1 - p) * (1 - p);
    if (mode === 'DIS') return p * p;
    return p;
  }

  const pct = (p) => (p >= 0.995 ? Math.round(p * 100) : p <= 0.005 ? Math.round(p * 100) : Math.round(p * 1000) / 10) + '%';

  return { parse, roll, distribution, stats, atLeast, hitChance, pct, MAX_DICE };
});
