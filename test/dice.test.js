// Dice fairness + probability-math tests.  Run: npm test
// 1) Fairness: roll each die many times with the same RNG the server uses (crypto.randomInt)
//    and run a chi-square goodness-of-fit test against a perfectly uniform die.
// 2) Math: check the exact odds shown in the UI against brute-force enumeration.
const assert = require('assert');
const crypto = require('crypto');
const D = require('../public/dice-math.js');

const rand = (s) => crypto.randomInt(1, s + 1); // identical to server.js
let failures = 0;
const ok = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!cond) failures++; };

// Chi-square critical values at p = 0.001 (a fair die fails this only 1 time in 1000)
const CRIT = { 3: 16.27, 4: 18.47, 5: 20.52, 7: 24.32, 9: 27.88, 11: 31.26, 19: 43.82, 99: 148.23 };

console.log('--- Fairness (chi-square, p = 0.001) ---');
for (const s of [4, 5, 6, 8, 10, 12, 20, 100]) {
  const N = s * 30000;
  const counts = new Array(s + 1).fill(0);
  for (let i = 0; i < N; i++) counts[rand(s)]++;
  const exp = N / s;
  let chi = 0, minF = 1, maxF = 0;
  for (let f = 1; f <= s; f++) {
    chi += (counts[f] - exp) ** 2 / exp;
    minF = Math.min(minF, counts[f] / N); maxF = Math.max(maxF, counts[f] / N);
  }
  ok(`d${s} is uniform`, chi < CRIT[s - 1] && counts[0] === 0,
    `${N.toLocaleString()} rolls · chi²=${chi.toFixed(1)} (limit ${CRIT[s - 1]}) · each face ${(minF * 100).toFixed(2)}–${(maxF * 100).toFixed(2)}% (ideal ${(100 / s).toFixed(2)}%)`);
}

console.log('\n--- Exact probability math ---');
// single die: every face exactly 1/s
for (const s of [4, 5, 6, 20]) {
  const d = D.distribution('1d' + s);
  ok(`d${s} faces are each exactly 1/${s}`, [...d.values()].every(p => Math.abs(p - 1 / s) < 1e-12) && d.size === s);
}
// 2d6 classic triangle: P(7) = 6/36
{
  const d = D.distribution('2d6');
  ok('2d6: P(7) = 6/36, P(2) = 1/36, P(12) = 1/36', Math.abs(d.get(7) - 6 / 36) < 1e-12 && Math.abs(d.get(2) - 1 / 36) < 1e-12 && Math.abs(d.get(12) - 1 / 36) < 1e-12);
  const total = [...d.values()].reduce((a, b) => a + b, 0);
  ok('2d6: probabilities sum to 1', Math.abs(total - 1) < 1e-12);
}
// stats
{
  const s = D.stats('1d4'); ok('1d4: average 2.5, range 1-4', s.mean === 2.5 && s.min === 1 && s.max === 4);
  const t = D.stats('2d6+3'); ok('2d6+3: average 10, range 5-15', t.mean === 10 && t.min === 5 && t.max === 15);
  const u = D.stats('1d20-2'); ok('1d20-2: average 8.5, range -1-18', u.mean === 8.5 && u.min === -1 && u.max === 18);
}
// hit chance vs brute force enumeration, all DCs and bonuses, normal / advantage / disadvantage
{
  let bad = 0;
  for (let dc = 1; dc <= 30; dc++) for (let b = -5; b <= 12; b++) {
    const hits = (f) => f === 20 || (f !== 1 && f + b >= dc);
    let n = 0, adv = 0, dis = 0;
    for (let a = 1; a <= 20; a++) { if (hits(a)) n++; for (let c = 1; c <= 20; c++) { if (hits(Math.max(a, c))) adv++; if (hits(Math.min(a, c))) dis++; } }
    if (Math.abs(D.hitChance(dc, b) - n / 20) > 1e-12) bad++;
    if (Math.abs(D.hitChance(dc, b, 'ADV') - adv / 400) > 1e-12) bad++;
    if (Math.abs(D.hitChance(dc, b, 'DIS') - dis / 400) > 1e-12) bad++;
  }
  ok('hit chance matches enumeration (1,620 cases incl. advantage/disadvantage)', bad === 0, bad ? `${bad} mismatches` : '');
  ok('need 11+ with +0: 50%', D.hitChance(11, 0) === 0.5);
  ok('natural 20 always hits (DC 40): 5%', D.hitChance(40, 0) === 0.05);
  ok('natural 1 always misses (DC 1, +10): 95%', D.hitChance(1, 10) === 0.95);
}
// simulated hit rate agrees with the formula (sanity check of the whole pipeline)
{
  const N = 400000; let hits = 0;
  for (let i = 0; i < N; i++) { const r = D.roll('1d20+5', rand); const f = r.rolls[0].v; if (f === 20 || (f !== 1 && r.total >= 15)) hits++; }
  const p = D.hitChance(15, 5), sim = hits / N, se = Math.sqrt(p * (1 - p) / N);
  ok('simulated d20+5 vs 15 matches formula (within 4 standard errors)', Math.abs(sim - p) < 4 * se, `formula ${(p * 100).toFixed(1)}% · simulated ${(sim * 100).toFixed(2)}%`);
}
// parser
ok('parser rejects junk', D.parse('2d') === null && D.parse('abc') === null && D.parse('100d6') === null);
ok('parser accepts 1d5, d20, 2d6+3-1', !!D.parse('1d5') && !!D.parse('d20') && !!D.parse('2d6+3-1'));

console.log(failures ? `\n${failures} FAILED` : '\nAll dice tests passed');
process.exit(failures ? 1 : 0);
