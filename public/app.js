/* =====================================================================
   D&D Table Helper — client
   ===================================================================== */
const socket = io();
const G = window.GAME;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = (ev, data = {}) => new Promise(res => socket.emit(ev, data, r => res(r || {})));
const mod = (s) => Math.floor(((s || 10) - 10) / 2);
const fmt = (n) => (n >= 0 ? '+' : '') + n;
const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0;
const img = (id) => id ? `/img/${encodeURIComponent(id)}` : '';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};

let ME = null;           // my profile
let ROOM = null;         // current room view
let currentRoomCode = null;
let leftTab = null;
const dice = { count: 1, mod: 0, mode: 'NORMAL' };
const prefs = { sound: store.get('dnd.sound', true), anim: store.get('dnd.anim', true) };

// ------------------------------------------------------------------ UI helpers
function show(id) { $$('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id)); window.scrollTo(0, 0); }
function toast(msg, tone = '') {
  const t = document.createElement('div'); t.className = 'toast ' + tone; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 2800); setTimeout(() => t.remove(), 3300);
}
async function call(ev, data, okMsg) {
  const r = await api(ev, data);
  if (r.error) { toast(r.error, 'bad'); return null; }
  if (okMsg) toast(okMsg, 'good');
  return r;
}
const act = (type, data = {}, okMsg) => call('act', { type, ...data }, okMsg);

let modalLive = null;
function openModal(html, live) {
  $('#modal-body').innerHTML = html;
  $('#modal').classList.remove('hidden');
  modalLive = live || null;
  if (modalLive) modalLive();
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-body').innerHTML = ''; modalLive = null; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function avatar(c, cls = '') {
  if (c?.portrait) return `<img class="${cls}" src="${img(c.portrait)}" alt="">`;
  const nm = (c?.name || '?').trim();
  const ch = (/^[เแโใไ]/.test(nm) ? nm.slice(0, 2) : nm.charAt(0)).toUpperCase();
  return `<div class="${cls} ava-ph">${h(ch)}</div>`;
}
function bar(kind, cur, max, hidden) {
  if (hidden) return `<div class="bar ${kind}"><div class="bar-fill unknown" style="width:100%"></div><span>${h(hidden)}</span></div>`;
  return `<div class="bar ${kind}"><div class="bar-fill" style="width:${pct(cur, max)}%"></div><span>${kind.toUpperCase()} ${cur}/${max}</span></div>`;
}

// ------------------------------------------------------------------ audio
let actx = null;
function audio() { if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); } if (actx?.state === 'suspended') actx.resume(); return actx; }
function sfxDice() {
  if (!prefs.sound) return; const c = audio(); if (!c) return;
  [0, .1, .22, .38, .58, .8].forEach((t, i) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = i % 2 ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(180 + Math.random() * 240, c.currentTime + t); o.frequency.exponentialRampToValueAtTime(60, c.currentTime + t + .08);
    g.gain.setValueAtTime((1 - i / 7) * .3, c.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t + .08);
    o.connect(g); g.connect(c.destination); o.start(c.currentTime + t); o.stop(c.currentTime + t + .1);
  });
}
function sfxCrit(good) {
  if (!prefs.sound) return; const c = audio(); if (!c) return;
  const notes = good ? [523.25, 659.25, 783.99, 1046.5] : [220, 160, 110];
  notes.forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * .12;
    o.type = good ? 'triangle' : 'sawtooth'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(.25, t); g.gain.exponentialRampToValueAtTime(.001, t + .45);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + .5);
  });
}

// ------------------------------------------------------------------ AUTH
$$('[data-auth]').forEach(b => b.onclick = () => {
  $$('[data-auth]').forEach(x => x.classList.toggle('active', x === b));
  $('#form-login').classList.toggle('hidden', b.dataset.auth !== 'login');
  $('#form-register').classList.toggle('hidden', b.dataset.auth !== 'register');
  $('#auth-err').classList.add('hidden');
});
function authErr(m) { const e = $('#auth-err'); e.textContent = m; e.classList.remove('hidden'); }
$('#form-login').onsubmit = async e => {
  e.preventDefault(); const f = e.target;
  const r = await api('login', { username: f.username.value, password: f.password.value });
  if (r.error) return authErr(r.error);
  store.set('dnd.token', r.token); ME = r.me; route();
};
$('#form-register').onsubmit = async e => {
  e.preventDefault(); const f = e.target;
  if (f.password.value !== f.password2.value) return authErr('รหัสผ่านไม่ตรงกัน');
  const r = await api('register', { username: f.username.value, password: f.password.value });
  if (r.error) return authErr(r.error);
  store.set('dnd.token', r.token); ME = r.me; route();
};
$$('[data-logout]').forEach(b => b.onclick = async () => {
  await api('logout', { token: store.get('dnd.token') });
  store.del('dnd.token'); store.del('dnd.room'); ME = null; ROOM = null; currentRoomCode = null; show('scr-auth');
});
socket.on('me', m => { ME = m; if (!$('#scr-home').classList.contains('hidden')) renderHome(); toast('ยศของคุณเปลี่ยนเป็น ' + (m.role === 'dm' ? 'DM' : 'ผู้เล่น'), 'gold'); });

function route() {
  if (!ME) return show('scr-auth');
  if (!ME.hasCharacter && ME.role !== 'dm') return openCreator(true);
  const last = store.get('dnd.room', null);
  if (last) return joinRoom(last, true);
  goHome();
}

socket.on('connect', async () => {
  const token = store.get('dnd.token');
  if (!token) return show('scr-auth');
  const r = await api('resume', { token });
  if (r.error) { store.del('dnd.token'); return show('scr-auth'); }
  const wasIn = currentRoomCode;
  ME = r.me;
  if (wasIn) joinRoom(wasIn, true); else if (!ROOM) route();
});

// ------------------------------------------------------------------ ID CARD
function idCard(c, o = {}) {
  if (!c) return `<div class="idc idc-empty"><div>ยังไม่มีตัวละคร</div></div>`;
  const stats = G.STATS.map(s => `<div class="st" ${o.rollable ? `data-check="${s}"` : ''} title="${G.STAT_TH[s]}"><i>${s}</i><b>${c.stats[s]}</b><em>${fmt(mod(c.stats[s]))}</em></div>`).join('');
  const statuses = (c.statuses || []).map(s => `<span class="tag ${s === 'หมดสติ' ? 'tag-bad' : ''}">${h(s)}</span>`).join('');
  const dead = c.hp <= 0 ? `<div class="ds">หมดสติ · Death Save สำเร็จ ${c.deathSaves?.s || 0}/3 · ล้มเหลว ${c.deathSaves?.f || 0}/3</div>` : '';
  const xpBar = o.large ? `<div class="xpbar" title="XP ${c.xp}${c.nextXp ? ' / ' + c.nextXp : ''}"><div style="width:${c.nextXp ? pct(c.xp, c.nextXp) : 100}%"></div><span>XP ${c.xp}${c.nextXp ? ' / ' + c.nextXp : ' (MAX)'}</span></div>` : '';
  const extra = o.large ? `
    <div class="idc-extra">
      ${c.skills ? `<div><b>สกิล:</b> ${h(c.skills)}</div>` : ''}
      ${c.ultimate ? `<div class="ult"><b>อัลติ:</b> ${h(c.ultimate)}</div>` : ''}
    </div>` : '';
  return `
  <div class="idc ${o.large ? 'idc-lg' : ''} ${o.turn ? 'is-turn' : ''} ${c.hp <= 0 ? 'is-down' : ''} ${o.self ? 'is-self' : ''}" ${o.key ? `data-key="${h(o.key)}"` : ''} ${o.drag ? 'draggable="true"' : ''}>
    <div class="idc-side">
      <div class="idc-portrait">${avatar(c)}<span class="idc-lv">Lv.${c.level}</span></div>
      <div class="idc-ac" title="Armor Class"><span>AC</span><b>${c.ac}</b></div>
    </div>
    <div class="idc-body">
      <div class="idc-top">
        <div class="idc-name">${o.online !== undefined ? `<i class="dot ${o.online ? 'on' : ''}" title="${o.online ? 'ออนไลน์' : 'ออฟไลน์'}"></i>` : ''}${h(c.name)}${o.turn ? '<span class="turn-tag">ตาของเขา</span>' : ''}</div>
        <div class="idc-sub">${h(c.race || '-')} · ${h(c.charClass || '-')}${o.username ? ` · <span class="muted">@${h(o.username)}</span>` : ''}</div>
      </div>
      ${bar('hp', c.hp, c.maxHp)}
      ${bar('sp', c.sp, c.maxSp)}
      ${dead}
      <div class="idc-stats">${stats}</div>
      <div class="idc-foot">
        <span title="ความเร็ว"><i class="k">SPD</i>${h(c.speed)}</span>
        ${c.weapon ? `<span title="อาวุธ"><i class="k">WPN</i>${h(c.weapon.name)} <small>${h(c.weapon.damage)}</small></span>` : ''}
        ${c.gold !== undefined ? `<span class="gold" title="เงิน"><i class="k">GOLD</i><b>${c.gold}</b></span>` : ''}
        ${statuses}
      </div>
      ${xpBar}${extra}
    </div>
    ${o.tools || ''}
  </div>`;
}

function sheetHtml(c, username) {
  const inv = c.inventory ? `<h4>กระเป๋า · ${c.gold} G</h4><div class="inv-mini">${c.inventory.map(i => `<span class="tag">${h(i.icon)} ${h(i.name)} x${i.qty}</span>`).join('') || '<span class="muted">ว่างเปล่า</span>'}</div>` : '';
  const row = (k, v, cls = '') => v ? `<div class="sh-row ${cls}"><b>${k}</b><span>${h(v)}</span></div>` : '';
  return `
  <div class="sheet">
    ${idCard(c, { large: true, username })}
    <div class="sheet-grid">
      <div>
        <h4>ข้อมูลตัวละคร</h4>
        ${row('ส่วนสูง', c.height)}${row('แนวทาง', c.alignment)}${row('Proficiency', '+' + c.prof)}
        ${row('Passive Perception', String(10 + mod(c.stats.WIS)))}
        ${row('อาวุธ', c.weapon ? `${c.weapon.name} (${c.weapon.damage || '-'})` : '')}
        ${row('ชุดเกราะ', c.armor ? `${c.armor.name} (+${c.armor.acBonus} AC)` : '')}
        ${row('โล่', c.shield ? `${c.shield.name} (+${c.shield.acBonus} AC)` : '')}
        ${inv}
      </div>
      <div>
        <h4>สกิลและเรื่องราว</h4>
        ${row('สกิล', c.skills)}${row('อัลติ', c.ultimate, 'ult')}${row('ภูมิหลัง', c.background)}
        ${row('ข้อดี', c.pros, 'pro')}${row('ข้อเสีย', c.cons, 'con')}
      </div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ CHARACTER CREATOR
const cr = { base: {}, portrait: null, creating: true };
function fillSelect(sel, items, val) { sel.innerHTML = items.map(i => `<option value="${h(i.k)}">${h(i.n)}</option>`).join(''); if (val) sel.value = val; }
fillSelect($('#cr-race'), G.RACES);
fillSelect($('#cr-class'), G.CLASSES);
$('#cr-align').innerHTML = G.ALIGN.map(a => `<option value="${h(a)}">${h(a || '— ไม่ระบุ —')}</option>`).join('');

const raceOf = () => G.RACES.find(r => r.k === $('#cr-race').value) || G.RACES.at(-1);
const classOf = () => G.CLASSES.find(r => r.k === $('#cr-class').value) || G.CLASSES.at(-1);
const finalStat = (s) => Math.min(30, (cr.base[s] || 10) + (raceOf().b[s] || 0));

function openCreator(creating) {
  cr.creating = creating;
  const c = ME.character;
  $('#cr-title').textContent = creating ? 'สร้างตัวละครใหม่' : 'แก้ไขตัวละคร';
  $('#cr-cancel').classList.toggle('hidden', creating && ME.role !== 'dm');
  $('#cr-gear-sec').classList.toggle('hidden', !creating);
  $('#cr-err').classList.add('hidden');
  if (c && !creating) {
    $('#cr-name').value = c.name; $('#cr-race').value = c.raceKey || 'custom'; $('#cr-race-name').value = c.race;
    $('#cr-class').value = c.classKey || 'custom'; $('#cr-class-name').value = c.charClass;
    $('#cr-height').value = c.height || ''; $('#cr-align').value = c.alignment || '';
    cr.base = { ...(c.statsBase || c.stats) };
    $('#cr-hp').value = c.maxHp; $('#cr-sp').value = c.maxSp; $('#cr-ac').value = c.baseAc; $('#cr-speed').value = c.speed;
    $('#cr-skills').value = c.skills; $('#cr-ult').value = c.ultimate; $('#cr-bg').value = c.background; $('#cr-pros').value = c.pros; $('#cr-cons').value = c.cons;
    setPortrait(c.portrait);
  } else {
    $$('#scr-create input, #scr-create textarea').forEach(i => { if (i.type !== 'file') i.value = ''; });
    $('#cr-race').value = 'human'; $('#cr-class').value = 'fighter'; $('#cr-align').value = '';
    $('#cr-race-name').value = raceOf().n; $('#cr-class-name').value = classOf().n;
    $('#cr-arm-ac').value = 1;
    cr.base = {}; G.STATS.forEach(s => cr.base[s] = 10);
    setPortrait(null);
    applyClassGear(); suggest();
  }
  renderStatEditor(); crPreview();
  show('scr-create');
}
function setPortrait(id) {
  cr.portrait = id;
  $('#cr-portrait-img').classList.toggle('hidden', !id); $('#cr-portrait-ph').classList.toggle('hidden', !!id);
  if (id) $('#cr-portrait-img').src = img(id);
}
function renderStatEditor() {
  const r = raceOf();
  $('#cr-stats').innerHTML = `<div class="se-head"><span>ค่าพลัง</span><span>พื้นฐาน</span><span>เผ่า</span><span>สุดท้าย</span><span>โบนัส</span></div>` +
    G.STATS.map(s => `<div class="se-row">
      <span class="se-name"><b>${s}</b><small>${G.STAT_TH[s]}</small></span>
      <span class="se-base"><button data-se="${s}:-1">−</button><input type="number" min="1" max="30" value="${cr.base[s]}" data-sei="${s}"><button data-se="${s}:1">+</button></span>
      <span class="se-race">${r.b[s] ? '+' + r.b[s] : '—'}</span>
      <span class="se-final">${finalStat(s)}</span>
      <span class="se-mod ${mod(finalStat(s)) >= 0 ? 'pos' : 'neg'}">${fmt(mod(finalStat(s)))}</span>
    </div>`).join('');
  const vals = G.STATS.map(s => cr.base[s]);
  const inRange = vals.every(v => v >= 8 && v <= 15);
  const used = inRange ? vals.reduce((a, v) => a + G.POINT_COST[v], 0) : null;
  const pb = $('#cr-points');
  pb.textContent = used === null ? 'Point Buy: ค่าอยู่นอกช่วง 8-15' : `Point Buy: ใช้ ${used}/27 แต้ม`;
  pb.className = 'pill ' + (used === null ? '' : used > 27 ? 'pill-bad' : used === 27 ? 'pill-good' : '');
}
$('#cr-stats').addEventListener('click', e => {
  const b = e.target.closest('[data-se]'); if (!b) return;
  const [s, d] = b.dataset.se.split(':'); cr.base[s] = Math.max(1, Math.min(30, cr.base[s] + +d));
  renderStatEditor(); crPreview();
});
$('#cr-stats').addEventListener('change', e => {
  const i = e.target.closest('[data-sei]'); if (!i) return;
  cr.base[i.dataset.sei] = Math.max(1, Math.min(30, parseInt(i.value) || 10));
  renderStatEditor(); crPreview();
});
$('#cr-roll4d6').onclick = () => {
  G.STATS.forEach(s => { const r = [1, 2, 3, 4].map(() => 1 + Math.floor(Math.random() * 6)).sort((a, b) => a - b); cr.base[s] = r[1] + r[2] + r[3]; });
  sfxDice(); renderStatEditor(); crPreview();
};
$('#cr-std').onclick = () => {
  // จัดค่ามาตรฐานตามค่าหลักของอาชีพ
  const arr = [15, 14, 13, 12, 10, 8], main = classOf().main, cast = classOf().cast;
  const order = [main, ...(cast && cast !== main ? [cast] : []), 'CON', 'DEX', 'WIS', 'STR', 'INT', 'CHA'].filter((v, i, a) => a.indexOf(v) === i);
  order.slice(0, 6).forEach((s, i) => cr.base[s] = arr[i]);
  renderStatEditor(); crPreview();
};
$('#cr-reset').onclick = () => { G.STATS.forEach(s => cr.base[s] = 10); renderStatEditor(); crPreview(); };
$('#cr-race').onchange = () => { $('#cr-race-name').value = raceOf().k === 'custom' ? '' : raceOf().n; $('#cr-speed').value = raceOf().spd; renderStatEditor(); crPreview(); };
$('#cr-class').onchange = () => { $('#cr-class-name').value = classOf().k === 'custom' ? '' : classOf().n; if (cr.creating) applyClassGear(); crPreview(); };
function applyClassGear() {
  const c = classOf();
  $('#cr-wpn').value = c.wpn[0]; $('#cr-wpn-dmg').value = c.wpn[1]; $('#cr-arm').value = c.arm[0]; $('#cr-arm-ac').value = c.arm[1] || 0; $('#cr-gold').value = c.gold;
}
function suggest() {
  const c = classOf();
  const hp = Math.max(1, c.hd + mod(finalStat('CON')));
  const sp = c.cast ? Math.max(4, 10 + mod(finalStat(c.cast)) * 2) : 5;
  const ac = 10 + mod(finalStat('DEX'));
  $('#cr-hp').value = hp; $('#cr-sp').value = sp; $('#cr-ac').value = ac; $('#cr-speed').value = raceOf().spd;
  $('#cr-suggest-hint').textContent = ` HP = ลูกเต๋าชีวิต d${c.hd} + CON · SP ${c.cast ? '= 10 + ' + c.cast + '×2' : '(ไม่ใช่สายเวท)'} · AC = 10 + DEX`;
  crPreview();
}
$('#cr-suggest').onclick = suggest;
$('#scr-create').addEventListener('input', e => { if (!e.target.closest('#cr-stats')) crPreview(); });

function crData() {
  const stats = {}; G.STATS.forEach(s => stats[s] = finalStat(s));
  return {
    name: $('#cr-name').value.trim(), raceKey: raceOf().k, race: $('#cr-race-name').value.trim() || raceOf().n,
    classKey: classOf().k, charClass: $('#cr-class-name').value.trim() || classOf().n,
    height: $('#cr-height').value, alignment: $('#cr-align').value, portrait: cr.portrait,
    stats, statsBase: { ...cr.base },
    maxHp: +$('#cr-hp').value || 10, maxSp: +$('#cr-sp').value || 0, ac: +$('#cr-ac').value || 10, speed: $('#cr-speed').value || '30ft',
    skills: $('#cr-skills').value, ultimate: $('#cr-ult').value, background: $('#cr-bg').value, pros: $('#cr-pros').value, cons: $('#cr-cons').value,
    startGold: +$('#cr-gold').value || 0,
    startWeapon: { name: $('#cr-wpn').value.trim(), damage: $('#cr-wpn-dmg').value.trim() },
    startArmor: { name: $('#cr-arm').value.trim(), acBonus: +$('#cr-arm-ac').value || 0 },
  };
}
function crPreview() {
  const d = crData();
  const old = ME?.character;
  const c = {
    ...d, name: d.name || 'ชื่อตัวละคร', level: cr.creating ? 1 : old?.level || 1, xp: cr.creating ? 0 : old?.xp || 0, nextXp: cr.creating ? 300 : old?.nextXp,
    hp: d.maxHp, sp: d.maxSp, ac: d.ac + (cr.creating ? (d.startArmor.name ? d.startArmor.acBonus : 0) : (old ? old.ac - old.baseAc : 0)),
    weapon: cr.creating ? (d.startWeapon.name ? { icon: '⚔️', name: d.startWeapon.name, damage: d.startWeapon.damage } : null) : old?.weapon,
    gold: cr.creating ? d.startGold : old?.gold, statuses: [], deathSaves: { s: 0, f: 0 },
  };
  $('#cr-preview').innerHTML = idCard(c, { large: true });
}
$('#cr-portrait').onclick = () => $('#cr-portrait-file').click();
$('#cr-portrait-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const id = await uploadImage(f, 360); if (id) { setPortrait(id); crPreview(); }
};
async function uploadImage(file, max) {
  const dataUrl = await new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onload = () => { const im = new Image(); im.onload = () => {
      let w = im.width, hh = im.height; const sc = Math.min(1, max / Math.max(w, hh)); w = Math.round(w * sc); hh = Math.round(hh * sc);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; cv.getContext('2d').drawImage(im, 0, 0, w, hh);
      res(cv.toDataURL('image/jpeg', 0.85)); }; im.onerror = rej; im.src = rd.result; };
    rd.onerror = rej; rd.readAsDataURL(file);
  }).catch(() => null);
  if (!dataUrl) { toast('อ่านไฟล์รูปไม่ได้', 'bad'); return null; }
  const r = await call('uploadImage', { dataUrl });
  return r?.id || null;
}
$('#cr-save').onclick = async () => {
  const d = crData();
  if (!d.name) { const e = $('#cr-err'); e.textContent = 'กรุณาตั้งชื่อตัวละคร'; e.classList.remove('hidden'); return; }
  const r = await call('saveCharacter', d, cr.creating ? 'สร้างตัวละครแล้ว' : 'บันทึกแล้ว');
  if (!r) return;
  ME = r.me;
  if (currentRoomCode) show('scr-room'); else goHome();
};
$('#cr-cancel').onclick = () => { if (currentRoomCode) show('scr-room'); else goHome(); };

// ------------------------------------------------------------------ HOME
function goHome() { currentRoomCode = null; ROOM = null; store.del('dnd.room'); renderHome(); show('scr-home'); loadRooms(); if (ME.role === 'dm') loadUsers(); }
function renderHome() {
  const isDM = ME.role === 'dm';
  $('#home-who').innerHTML = `${h(ME.username)} <span class="pill ${isDM ? 'pill-gold' : ''}">${isDM ? 'DM' : 'ผู้เล่น'}</span>`;
  $('#home-hello').textContent = `ยินดีต้อนรับ, ${ME.character?.name || ME.username}`;
  $('#home-card').innerHTML = ME.character ? idCard(ME.character, { large: true, username: ME.username }) :
    `<div class="idc idc-empty"><div>บัญชี DM นี้ยังไม่มีตัวละคร<br><small class="muted">สร้างได้ถ้าต้องการไปเล่นเป็นผู้เล่นในห้องของ DM คนอื่น</small></div></div>`;
  $('#btn-edit-char').textContent = ME.character ? 'แก้ไขตัวละคร' : 'สร้างตัวละคร';
  $('#btn-view-char').classList.toggle('hidden', !ME.character);
  $('#card-create').classList.toggle('locked', !isDM);
  $('#create-note').innerHTML = isDM ? 'สร้างห้องแล้วส่งรหัสให้เพื่อนเข้าร่วม' : 'เฉพาะผู้ที่มียศ <b>DM</b> ขอให้ DM มอบยศให้คุณก่อน';
  $('#btn-create').disabled = !isDM; $('#create-name').disabled = !isDM;
  $('#dm-users-panel').classList.toggle('hidden', !isDM);
}
$('#btn-edit-char').onclick = () => openCreator(!ME.character);
$('#btn-view-char').onclick = () => openModal(sheetHtml(ME.character, ME.username));
$('#form-join').onsubmit = e => { e.preventDefault(); const c = $('#join-code').value.trim().toUpperCase(); if (c.length < 5) return toast('กรอกรหัสห้อง 5 ตัวอักษร', 'bad'); joinRoom(c); };
$('#join-code').oninput = e => e.target.value = e.target.value.toUpperCase();
$('#form-create').onsubmit = async e => {
  e.preventDefault(); audio();
  const r = await call('createRoom', { name: $('#create-name').value });
  if (r) enterRoom(r.code);
};
async function loadRooms() {
  const r = await api('myRooms'); const el = $('#my-rooms');
  if (!r.rooms?.length) { el.innerHTML = '<p class="muted">ยังไม่มีห้อง เข้าร่วมด้วยรหัสหรือสร้างห้องใหม่</p>'; return; }
  el.innerHTML = r.rooms.map(x => `<div class="room-item">
    <div><b>${h(x.name)}</b> <span class="code">${h(x.code)}</span>${x.isDM ? ' <span class="pill pill-gold">DM</span>' : ''}
    <div class="muted small">DM: ${h(x.dm)} · ผู้เล่น ${x.players} คน · ออนไลน์ ${x.online}</div></div>
    <button class="btn btn-sm btn-gold" data-join="${h(x.code)}">เข้า</button></div>`).join('');
}
$('#my-rooms').onclick = e => { const b = e.target.closest('[data-join]'); if (b) joinRoom(b.dataset.join); };
$('#btn-refresh-rooms').onclick = loadRooms;
let USERS = [];
async function loadUsers() { const r = await api('listUsers'); USERS = r.users || []; renderUsers(); }
function renderUsers() {
  const q = $('#user-filter').value.trim().toLowerCase();
  $('#user-list').innerHTML = USERS.filter(u => !q || u.username.toLowerCase().includes(q) || u.charName.toLowerCase().includes(q)).map(u => `
    <div class="user-item">
      <div><b>${h(u.username)}</b> ${u.charName ? `<span class="muted">(${h(u.charName)})</span>` : ''}</div>
      <div class="row gap6">
        <span class="pill ${u.role === 'dm' ? 'pill-gold' : ''}">${u.role === 'dm' ? 'DM' : 'ผู้เล่น'}</span>
        ${u.isSeed ? '<span class="muted small">DM หลัก</span>' : u.key === ME.key ? '<span class="muted small">คุณ</span>' :
          u.role === 'dm' ? `<button class="btn btn-sm" data-role="${h(u.key)}:player">ถอดยศ</button>` : `<button class="btn btn-sm btn-gold" data-role="${h(u.key)}:dm">ให้ยศ DM</button>`}
      </div>
    </div>`).join('') || '<p class="muted">ไม่พบผู้ใช้</p>';
}
$('#user-filter').oninput = renderUsers;
$('#btn-refresh-users').onclick = loadUsers;
$('#user-list').onclick = async e => {
  const b = e.target.closest('[data-role]'); if (!b) return;
  const [key, role] = b.dataset.role.split(':');
  if (role === 'dm' && !confirm(`มอบยศ DM ให้ ${key}?\nผู้ใช้นี้จะสร้างห้องและมอบยศ DM ให้ผู้อื่นได้`)) return;
  if (await call('setRole', { key, role }, role === 'dm' ? 'มอบยศ DM แล้ว' : 'ถอดยศแล้ว')) loadUsers();
};

// ------------------------------------------------------------------ ROOM
async function joinRoom(code, silent) {
  audio();
  const r = await api('joinRoom', { code });
  if (r.error) { if (!silent) toast(r.error, 'bad'); store.del('dnd.room'); currentRoomCode = null; if (silent) goHome(); return; }
  enterRoom(r.code);
}
function enterRoom(code) {
  currentRoomCode = code; store.set('dnd.room', code); leftTab = null;
  show('scr-room');
}
socket.on('room', v => {
  if (v.code !== currentRoomCode) return;
  const first = !ROOM || ROOM.code !== v.code;
  ROOM = v;
  if (first) setupRoomChrome();
  renderRoom();
  if (modalLive) modalLive();
});
socket.on('rolled', e => { if (e && ROOM) showRoll(e); });
socket.on('kicked', () => { toast('คุณถูกเชิญออกจากห้อง', 'bad'); goHome(); });
socket.on('roomClosed', () => { toast('DM ปิดห้องแล้ว', 'bad'); goHome(); });
$('#btn-leave').onclick = async () => { await api('leaveRoom'); goHome(); };
$('#room-code-box').onclick = () => { navigator.clipboard?.writeText(ROOM.code).then(() => toast('คัดลอกรหัสห้อง ' + ROOM.code + ' แล้ว', 'good'), () => toast('รหัสห้อง: ' + ROOM.code)); };
$('#btn-sound').onclick = () => { prefs.sound = !prefs.sound; store.set('dnd.sound', prefs.sound); syncPrefs(); };
$('#btn-dice-anim').onclick = () => { prefs.anim = !prefs.anim; store.set('dnd.anim', prefs.anim); syncPrefs(); };
function syncPrefs() { $('#btn-sound').textContent = prefs.sound ? 'เสียง: เปิด' : 'เสียง: ปิด'; $('#btn-dice-anim').classList.toggle('off', !prefs.anim); }
syncPrefs();

const myChar = () => ROOM?.party.find(p => p.key === ME.key)?.char;

function setupRoomChrome() {
  const isDM = ROOM.isDM;
  $('#room-code').textContent = ROOM.code;
  $('#room-role').textContent = isDM ? 'DM' : 'ผู้เล่น';
  $('#room-role').className = 'pill pill-role ' + (isDM ? 'pill-gold' : '');
  $('#secret-wrap').classList.toggle('hidden', !isDM);
  $('#mon-dm-tools').classList.toggle('hidden', !isDM);
  const tabs = isDM ? [['scene', 'ฉาก'], ['shop', 'ร้านค้า'], ['beast', 'มอนสเตอร์']] : [['bag', 'กระเป๋า'], ['shop', 'ร้านค้า'], ['me', 'ตัวละคร']];
  leftTab = leftTab || tabs[0][0];
  $('#left-tabs').innerHTML = tabs.map(([k, n]) => `<button class="tab ${k === leftTab ? 'active' : ''}" data-lt="${k}">${n}</button>`).join('');
  $('#party-hint').textContent = isDM ? 'ลากหรือกด ▲▼ เพื่อจัดลำดับ' : 'คลิกการ์ดเพื่อดูข้อมูล';
  $('#feed').innerHTML = ''; feedIds.clear();
}
$('#left-tabs').onclick = e => {
  const b = e.target.closest('[data-lt]'); if (!b) return;
  leftTab = b.dataset.lt; $$('#left-tabs .tab').forEach(x => x.classList.toggle('active', x === b)); renderLeft();
};

function renderRoom() {
  $('#room-name').textContent = ROOM.name;
  $('#pill-shop').classList.toggle('hidden', !ROOM.shopOpen);
  renderTurnInfo(); renderParty(); renderMonsters(); renderFeed(); renderDiceDock();
  // อย่า re-render ฟอร์มที่กำลังพิมพ์อยู่
  if (!$('#left-body').contains(document.activeElement) || document.activeElement.tagName === 'BUTTON') renderLeft();
}

function currentActor() {
  const c = ROOM.combat; if (!c.active) return null; return c.order[c.turn] || null;
}
function renderTurnInfo() {
  const c = ROOM.combat, cur = currentActor();
  $('#turn-banner').innerHTML = c.active
    ? `<span class="tb-round">รอบ ${c.round}</span> ตาของ <b>${h(cur?.name || '-')}</b>${cur?.type === 'player' && cur.id === ME.key ? ' <span class="pill pill-gold">ตาคุณ!</span>' : ''}`
    : `<span class="muted">ช่วงสำรวจ · ยังไม่มีการต่อสู้</span>`;
  // event
  const ev = $('#event-banner');
  ev.classList.toggle('hidden', !ROOM.event);
  if (ROOM.event) ev.innerHTML = `<div><b>${h(ROOM.event.name)}</b>${ROOM.event.desc ? `<p>${h(ROOM.event.desc)}</p>` : ''}<small>ระหว่างเหตุการณ์ ทุกคนทอยได้โดยไม่ต้องรอเทิร์น</small></div>${ROOM.isDM ? '<button class="btn btn-sm" data-a="CLEAR_EVENT">จบเหตุการณ์</button>' : ''}`;
  // combat strip
  const strip = $('#combat-strip');
  if (!c.active) {
    strip.innerHTML = ROOM.isDM ? `<button class="btn btn-primary btn-sm" data-a="COMBAT_START">เริ่มการต่อสู้ · ทอย Initiative ทุกคน</button>` : '';
    strip.classList.toggle('empty', !ROOM.isDM);
    return;
  }
  strip.classList.remove('empty');
  strip.innerHTML = `<div class="order">${c.order.map((o, i) => `
      <div class="chip ${i === c.turn ? 'cur' : ''} ${o.type} ${o.down ? 'down' : ''}" ${ROOM.isDM ? `data-init="${o.type}:${h(o.id)}:${o.init}" title="คลิกเพื่อแก้ค่า Initiative"` : ''}>
        <b>${o.init}</b><span>${o.type === 'monster' ? h(o.icon || '') + ' ' : ''}${h(o.name)}</span></div>`).join('')}</div>
    ${ROOM.isDM ? `<div class="row gap6"><button class="btn btn-sm" data-a="COMBAT_PREV">◀</button><button class="btn btn-sm btn-gold" data-a="COMBAT_NEXT">เทิร์นถัดไป ▶</button><button class="btn btn-sm btn-ghost" data-a="COMBAT_END">จบการต่อสู้</button></div>` : ''}`;
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]'); if (!a || !ROOM) return;
  if (a.dataset.a === 'COMBAT_END' && !confirm('จบการต่อสู้?')) return;
  act(a.dataset.a);
});
$('#combat-strip').addEventListener('click', e => {
  const c = e.target.closest('[data-init]'); if (!c) return;
  const [kind, id, cur] = c.dataset.init.split(':');
  const v = prompt('ค่า Initiative ใหม่:', cur); if (v === null || v === '' || isNaN(+v)) return;
  act('SET_INIT', { kind, id, value: +v });
});

// ---------- party
function renderParty() {
  const cur = currentActor();
  $('#party-count').textContent = ROOM.party.length;
  $('#party').innerHTML = ROOM.party.map((p, i) => {
    const tools = ROOM.isDM ? `<div class="idc-tools">
        <button data-mv="${h(p.key)}:-1" ${i === 0 ? 'disabled' : ''} title="เลื่อนขึ้น">▲</button>
        <span class="ord">${i + 1}</span>
        <button data-mv="${h(p.key)}:1" ${i === ROOM.party.length - 1 ? 'disabled' : ''} title="เลื่อนลง">▼</button>
        <button data-manage="${h(p.key)}" title="จัดการผู้เล่น" class="gear">⚙</button></div>` : '';
    return idCard(p.char, { key: p.key, online: p.online, self: p.key === ME.key, username: p.username,
      turn: cur && cur.type === 'player' && cur.id === p.key, drag: ROOM.isDM, tools });
  }).join('') || `<div class="empty-note">ยังไม่มีผู้เล่นในห้อง<br><small>ส่งรหัส <b>${h(ROOM.code)}</b> ให้เพื่อนเพื่อเข้าร่วม</small></div>`;
}
$('#party').addEventListener('click', e => {
  const mv = e.target.closest('[data-mv]');
  if (mv) {
    const [k, d] = mv.dataset.mv.split(':'); const ord = ROOM.party.map(p => p.key); const i = ord.indexOf(k), j = i + +d;
    if (j < 0 || j >= ord.length) return; [ord[i], ord[j]] = [ord[j], ord[i]]; act('REORDER', { order: ord }); return;
  }
  const mg = e.target.closest('[data-manage]'); if (mg) return manageModal(mg.dataset.manage);
  const card = e.target.closest('.idc[data-key]'); if (!card) return;
  const k = card.dataset.key;
  if (k === ME.key) return manageModal(k);
  if (ROOM.isDM) return manageModal(k);
  const p = ROOM.party.find(x => x.key === k); if (p) openModal(sheetHtml(p.char, p.username));
});
let dragKey = null;
$('#party').addEventListener('dragstart', e => { const c = e.target.closest('.idc[data-key]'); if (!c) return; dragKey = c.dataset.key; c.classList.add('dragging'); });
$('#party').addEventListener('dragend', e => { $$('.idc.dragging, .idc.drop-to').forEach(x => x.classList.remove('dragging', 'drop-to')); });
$('#party').addEventListener('dragover', e => { if (!dragKey) return; e.preventDefault(); $$('.idc.drop-to').forEach(x => x.classList.remove('drop-to')); e.target.closest('.idc[data-key]')?.classList.add('drop-to'); });
$('#party').addEventListener('drop', e => {
  e.preventDefault(); const t = e.target.closest('.idc[data-key]'); const from = dragKey; dragKey = null;
  if (!t || !from || t.dataset.key === from) return;
  const ord = ROOM.party.map(p => p.key).filter(k => k !== from);
  ord.splice(ord.indexOf(t.dataset.key) + (ROOM.party.findIndex(p => p.key === from) < ROOM.party.findIndex(p => p.key === t.dataset.key) ? 1 : 0), 0, from);
  act('REORDER', { order: ord });
});

const condOptions = () => G.CONDITIONS.map(c => `<option>${h(c)}</option>`).join('');
function manageModal(key) {
  const isDM = ROOM.isDM;
  const shopOpts = () => ROOM.shop.map(i => `<option value="${h(i.id)}">${h(i.icon)} ${h(i.name)} (${i.price} G)</option>`).join('');
  openModal(`
    <div id="mg-live"></div>
    <div class="mg-grid">
      <div class="mg-box">
        <h4>พลังชีวิต / SP</h4>
        <div class="row gap6"><input type="number" id="mg-amt" value="5" min="1" class="w80">
          <button class="btn btn-sm btn-danger" data-mg="hp:-1">ดาเมจ</button><button class="btn btn-sm btn-good" data-mg="hp:1">ฮีล</button>
          <button class="btn btn-sm" data-mg="sp:-1">SP −</button><button class="btn btn-sm" data-mg="sp:1">SP +</button></div>
      </div>
      <div class="mg-box">
        <h4>สถานะ</h4>
        <div class="row gap6"><select id="mg-cond"><option value="">— เลือกสถานะ —</option>${condOptions()}</select><input id="mg-cond-c" placeholder="หรือพิมพ์เอง" class="w120"><button class="btn btn-sm" data-mg="cond">เพิ่ม</button></div>
        <div id="mg-conds" class="row wrap gap6 mt8"></div>
      </div>
      ${isDM ? `
      <div class="mg-box">
        <h4>เงิน / XP</h4>
        <div class="row gap6"><input type="number" id="mg-gold" value="10" class="w80"><button class="btn btn-sm btn-gold" data-mg="gold:1">ให้เงิน</button><button class="btn btn-sm" data-mg="gold:-1">หักเงิน</button></div>
        <div class="row gap6 mt8"><input type="number" id="mg-xp" value="50" class="w80"><button class="btn btn-sm btn-gold" data-mg="xp">ให้ XP</button></div>
      </div>
      <div class="mg-box">
        <h4>มอบไอเทม</h4>
        <div class="row gap6"><select id="mg-item">${shopOpts()}</select><input type="number" id="mg-iq" value="1" min="1" class="w60"><button class="btn btn-sm btn-gold" data-mg="item">มอบ</button></div>
        <div class="row gap6 mt8"><input id="mg-ci-icon" value="📦" class="w50"><input id="mg-ci-name" placeholder="ไอเทมกำหนดเอง"><button class="btn btn-sm" data-mg="citem">มอบ</button></div>
      </div>` : ''}
    </div>
    <div class="mg-box mt8"><h4>กระเป๋า</h4><div id="mg-inv" class="inv-mini"></div></div>
    <div class="row gap8 mt12 end">
      ${isDM ? `<button class="btn btn-sm" data-mg="death">รีเซ็ต Death Save</button><button class="btn btn-sm btn-danger" data-mg="kick">เชิญออกจากห้อง</button>` : ''}
      <button class="btn btn-sm" data-mg="sheet">ดูข้อมูลเต็ม</button>
      ${key === ME.key ? '<button class="btn btn-sm" data-mg="edit">แก้ไขตัวละคร</button>' : ''}
    </div>`, () => {
    const p = ROOM.party.find(x => x.key === key); if (!p) return closeModal();
    $('#mg-live').innerHTML = idCard(p.char, { username: p.username, online: p.online });
    $('#mg-conds').innerHTML = p.char.statuses.map(s => `<span class="tag tag-x" data-rmcond="${h(s)}">${h(s)} ✕</span>`).join('') || '<span class="muted small">ไม่มีสถานะ</span>';
    $('#mg-inv').innerHTML = (p.char.inventory || []).map(i => `<span class="tag">${h(i.icon)} ${h(i.name)} x${i.qty}${isDM ? ` <button class="x" data-take="${h(i.uid)}" title="นำออก 1 ชิ้น">✕</button>` : ''}</span>`).join('') || '<span class="muted small">ว่างเปล่า</span>';
  });
  const body = $('#modal-body');
  body.onclick = async e => {
    const rc = e.target.closest('[data-rmcond]'); if (rc) return act('PLAYER', { key, removeStatus: rc.dataset.rmcond });
    const tk = e.target.closest('[data-take]'); if (tk) return act('TAKE_ITEM', { key, uid: tk.dataset.take, qty: 1 });
    const b = e.target.closest('[data-mg]'); if (!b) return;
    const [k, d] = b.dataset.mg.split(':'); const amt = Math.abs(+$('#mg-amt')?.value || 0);
    if (k === 'hp') act('PLAYER', { key, hpDelta: amt * +d });
    if (k === 'sp') act('PLAYER', { key, spDelta: amt * +d });
    if (k === 'cond') { const s = $('#mg-cond-c').value.trim() || $('#mg-cond').value; if (s) act('PLAYER', { key, addStatus: s }); $('#mg-cond-c').value = ''; }
    if (k === 'gold') act('GIVE_GOLD', { key, amount: Math.abs(+$('#mg-gold').value || 0) * +d });
    if (k === 'xp') act('GIVE_XP', { key, amount: +$('#mg-xp').value || 0 });
    if (k === 'item') act('GIVE_ITEM', { key, shopId: $('#mg-item').value, qty: +$('#mg-iq').value || 1 });
    if (k === 'citem') { const n = $('#mg-ci-name').value.trim(); if (n) act('GIVE_ITEM', { key, item: { name: n, icon: $('#mg-ci-icon').value, type: 'misc' } }); $('#mg-ci-name').value = ''; }
    if (k === 'death') act('PLAYER', { key, resetDeath: true });
    if (k === 'kick') { if (confirm('เชิญผู้เล่นนี้ออกจากห้อง?')) { await act('KICK', { key }); closeModal(); } }
    if (k === 'sheet') { const p = ROOM.party.find(x => x.key === key); openModal(sheetHtml(p.char, p.username)); }
    if (k === 'edit') { closeModal(); openCreator(false); }
  };
}

// ---------- monsters
function renderMonsters() {
  const list = ROOM.monsters, isDM = ROOM.isDM, cur = currentActor();
  $('#mon-count').textContent = list.filter(m => !m.down).length;
  $('#monsters').innerHTML = list.map(m => {
    const hpHtml = (isDM || m.revealHp) ? bar('hp', m.hp, m.maxHp) : bar('hp', 0, 0, m.cond);
    const pic = m.img ? `<img src="${img(m.img)}" alt="">` : `<span>${h(m.icon)}</span>`;
    const conds = m.statuses.map(s => `<span class="tag ${isDM ? 'tag-x' : ''}" ${isDM ? `data-mrm="${h(m.id)}" data-cond="${h(s)}"` : ''}>${h(s)}${isDM ? ' ✕' : ''}</span>`).join('');
    const isTurn = cur && cur.type === 'monster' && cur.id === m.id;
    return `<div class="mon ${m.down ? 'down' : ''} ${isTurn ? 'is-turn' : ''}" data-mid="${h(m.id)}">
      <div class="mon-pic">${pic}</div>
      <div class="mon-body">
        <div class="mon-top"><b>${h(m.name)}</b>${isTurn ? '<span class="turn-tag">ตานี้</span>' : ''}${isDM && !m.revealHp ? '<span class="pill" title="ผู้เล่นมองไม่เห็น HP">HP ซ่อน</span>' : ''}<span class="mon-ac" title="Armor Class"><i class="k">AC</i>${m.ac}</span></div>
        ${hpHtml}
        ${conds ? `<div class="row wrap gap4">${conds}</div>` : ''}
        ${isDM ? `<div class="mon-tools">
          <button data-m="dmg" title="ลด HP ตามจำนวนที่ตั้งไว้">−</button><button data-m="heal" title="เพิ่ม HP">+</button>
          <button data-m="atk" title="ทอยโจมตี d20${fmt(m.atk)}">โจมตี ${fmt(m.atk)}</button>
          <button data-m="hit" title="ทอยดาเมจ">ดาเมจ ${h(m.dmg)}</button>
          <button data-m="reveal" title="${m.revealHp ? 'ซ่อน HP จากผู้เล่น' : 'เปิดเผย HP ให้ผู้เล่น'}">${m.revealHp ? 'ซ่อน HP' : 'เปิด HP'}</button>
          <select data-m="cond"><option value="">สถานะ</option>${condOptions()}</select>
          ${m.down ? '<button class="gold" data-m="reward" title="แจกรางวัล">แจกรางวัล</button>' : ''}
          <button class="bad" data-m="rm" title="ลบออกจากฉาก">ลบ</button></div>` : ''}
      </div></div>`;
  }).join('') || `<div class="empty-note">${isDM ? 'ยังไม่มีศัตรูในฉาก กดปุ่มซัมมอนเพื่อเรียกมอนสเตอร์' : 'ยังไม่มีศัตรูในฉาก'}</div>`;
}
$('#monsters').addEventListener('click', e => {
  if (!ROOM.isDM) return;
  const rmc = e.target.closest('[data-mrm]'); if (rmc) return act('MONSTER', { id: rmc.dataset.mrm, removeStatus: rmc.dataset.cond });
  const b = e.target.closest('button[data-m]'); if (!b) return;
  const id = b.closest('[data-mid]').dataset.mid; const m = ROOM.monsters.find(x => x.id === id); if (!m) return;
  const amt = Math.abs(+$('#mon-amt').value || 1);
  switch (b.dataset.m) {
    case 'dmg': act('MONSTER', { id, hpDelta: -amt }); break;
    case 'heal': act('MONSTER', { id, hpDelta: amt }); break;
    case 'atk': rollDice({ sides: 20, count: 1, mod: m.atk, reason: 'โจมตี', monsterId: id }); break;
    case 'hit': rollDice({ expr: m.dmg, reason: 'ดาเมจ', monsterId: id }); break;
    case 'reveal': act('MONSTER', { id, reveal: !m.revealHp }); break;
    case 'reward': rewardModal(id); break;
    case 'rm': if (confirm(`ลบ ${m.name} ออกจากฉาก?`)) act('MONSTER_REMOVE', { id }); break;
  }
});
$('#monsters').addEventListener('change', e => {
  const s = e.target.closest('select[data-m="cond"]'); if (!s || !s.value) return;
  act('MONSTER', { id: s.closest('[data-mid]').dataset.mid, addStatus: s.value });
});
$('#btn-summon').onclick = summonModal;

function summonModal() {
  openModal(`
    <h2 class="m-title">ซัมมอนมอนสเตอร์</h2>
    <div class="beast-grid" id="sm-grid"></div>
    <details class="mt12"><summary>ซัมมอนแบบกำหนดเอง (ไม่บันทึกลงสมุด)</summary>
      ${beastForm({ name: '', icon: '👾', hp: 10, ac: 12, atk: 3, dmg: '1d6+1', initMod: 0, xp: 25, gold: 5 }, false)}
      <div class="row gap8 mt8 end"><label class="row gap6">จำนวน<input type="number" id="sm-cn" value="1" min="1" max="12" class="w60"></label><button class="btn btn-primary" id="sm-custom">ซัมมอน</button></div>
    </details>`, () => {
    $('#sm-grid').innerHTML = (ROOM.bestiary || []).map(b => `
      <div class="beast" data-bid="${h(b.id)}">
        <div class="beast-pic">${b.img ? `<img src="${img(b.img)}" alt="">` : h(b.icon)}</div>
        <b>${h(b.name)}</b>
        <div class="stat-line">HP <b>${b.hp}</b> · AC <b>${b.ac}</b> · โจมตี <b>${fmt(b.atk)}</b> · <b>${h(b.dmg)}</b></div>
        <div class="stat-line">รางวัล <b>${b.gold} G</b> · <b>${b.xp} XP</b>${b.loot?.length ? ` · ของ <b>${b.loot.length}</b>` : ''}</div>
        <div class="row gap4"><input type="number" value="1" min="1" max="12" class="w50" data-cnt><button class="btn btn-sm btn-primary" data-sum>ซัมมอน</button></div>
      </div>`).join('') || '<p class="muted">สมุดมอนสเตอร์ว่าง เพิ่มได้ที่แท็บมอนสเตอร์</p>';
  });
  $('#modal-body').onclick = async e => {
    const b = e.target.closest('[data-sum]');
    if (b) { const card = b.closest('[data-bid]'); if (await act('SUMMON', { beastId: card.dataset.bid, count: +card.querySelector('[data-cnt]').value || 1 })) toast('ซัมมอนแล้ว', 'good'); }
    if (e.target.id === 'sm-custom') { const d = readBeastForm(); if (!d.name) return toast('ใส่ชื่อมอนสเตอร์', 'bad'); if (await act('SUMMON', { custom: d, count: +$('#sm-cn').value || 1 })) closeModal(); }
  };
}

function rewardModal(id) {
  const m = ROOM.monsters.find(x => x.id === id); if (!m) return;
  const party = ROOM.party;
  openModal(`
    <h2 class="m-title">รางวัลจากการปราบ ${h(m.name)}</h2>
    <h4>ผู้ได้รับ (เงินและ XP หารเท่ากัน)</h4>
    <div class="row wrap gap8">${party.map(p => `<label class="check"><input type="checkbox" value="${h(p.key)}" data-rc checked> ${h(p.char.name)}</label>`).join('')}</div>
    <div class="grid2 mt8"><label>เงินรวม (G)<input type="number" id="rw-gold" value="${m.gold}" min="0"></label><label>XP รวม<input type="number" id="rw-xp" value="${m.xp}" min="0"></label></div>
    <h4 class="mt12">ของดรอป</h4>
    ${m.loot.length ? m.loot.map((l, i) => `<div class="row gap8 loot-row"><span>${h(l.icon)} ${h(l.name)} x${l.qty}</span>
      <select data-loot="${i}"><option value="">— ไม่แจก —</option>${party.map((p, j) => `<option value="${h(p.key)}" ${j === i % Math.max(1, party.length) ? 'selected' : ''}>${h(p.char.name)}</option>`).join('')}</select></div>`).join('') : '<p class="muted">มอนสเตอร์ตัวนี้ไม่มีของดรอป</p>'}
    <div class="row gap8 end mt12"><button class="btn" data-close>ยกเลิก</button><button class="btn btn-gold" id="rw-go">แจกรางวัล</button></div>`);
  $('#rw-go').onclick = async () => {
    const recipients = $$('[data-rc]:checked').map(c => c.value);
    const loot = $$('[data-loot]').filter(s => s.value).map(s => ({ index: +s.dataset.loot, to: s.value }));
    if (await act('REWARD', { id, recipients, gold: +$('#rw-gold').value || 0, xp: +$('#rw-xp').value || 0, loot }, 'แจกรางวัลแล้ว')) closeModal();
  };
}

// ---------- left panel
function renderLeft() {
  const el = $('#left-body'); if (!ROOM) return;
  if (leftTab === 'bag') el.innerHTML = bagHtml();
  else if (leftTab === 'shop') el.innerHTML = ROOM.isDM ? shopDmHtml() : shopHtml();
  else if (leftTab === 'scene') el.innerHTML = sceneHtml();
  else if (leftTab === 'beast') el.innerHTML = beastListHtml();
  else if (leftTab === 'me') { const c = myChar(); el.innerHTML = c ? sheetHtml(c, ME.username) + '<button class="btn w100 mt8" id="lt-edit">แก้ไขตัวละคร</button>' : ''; }
}
function itemMeta(i) {
  return [i.type && G.ITEM_TYPES[i.type], i.damage && `ดาเมจ ${i.damage}`, i.acBonus && `AC +${i.acBonus}`, i.heal && `ฟื้น HP ${i.heal}`, i.restoreSp && `ฟื้น SP ${i.restoreSp}`].filter(Boolean).join(' · ');
}
function bagHtml() {
  const c = myChar(); if (!c) return '';
  const eq = c.equipped || {};
  return `
    <div class="gold-box"><span><b>${c.gold}</b><i class="unit">GOLD</i></span><button class="btn btn-sm" data-bag="givegold">ให้เงินเพื่อน</button></div>
    ${ROOM.shopOpen ? `<p class="hint">ร้านค้าเปิดอยู่ ขายของได้ ${Math.round(ROOM.sellRate * 100)}% ของราคา</p>` : ''}
    <div class="items">${c.inventory.map(i => {
      const equipped = Object.values(eq).includes(i.uid);
      return `<div class="item ${equipped ? 'equipped' : ''}" data-uid="${h(i.uid)}">
        <div class="item-ic">${h(i.icon)}</div>
        <div class="item-b"><div><b>${h(i.name)}</b> <span class="qty">x${i.qty}</span>${equipped ? ' <span class="pill pill-good">สวมใส่</span>' : ''}</div>
          <small class="muted">${h(itemMeta(i))}</small>${i.desc ? `<small>${h(i.desc)}</small>` : ''}
          <div class="item-act">
            ${i.type === 'consumable' ? '<button data-bag="use">ใช้</button>' : ''}
            ${['weapon', 'armor', 'shield'].includes(i.type) ? `<button data-bag="equip">${equipped ? 'ถอด' : 'สวมใส่'}</button>` : ''}
            ${ROOM.shopOpen ? `<button data-bag="sell">ขาย ${Math.floor(i.value * ROOM.sellRate)} G</button>` : ''}
            <button data-bag="give">ให้</button><button data-bag="drop" class="bad">ทิ้ง</button>
          </div></div></div>`;
    }).join('') || '<p class="muted center">กระเป๋าว่างเปล่า</p>'}</div>`;
}
function shopHtml() {
  if (!ROOM.shopOpen) return `<div class="empty-note">ร้านค้าปิดอยู่<br><small>DM ต้องเปิดร้านก่อนถึงจะซื้อขายได้</small></div>`;
  const c = myChar();
  return `<div class="gold-box"><span><b>${c?.gold ?? 0}</b><i class="unit">GOLD</i></span><span class="muted small">ขายคืนได้ ${Math.round(ROOM.sellRate * 100)}%</span></div>
    <div class="items">${ROOM.shop.map(i => `<div class="item" data-sid="${h(i.id)}">
      <div class="item-ic">${h(i.icon)}</div>
      <div class="item-b"><div><b>${h(i.name)}</b> <span class="price">${i.price} G</span></div>
        <small class="muted">${h(itemMeta(i))}${i.stock >= 0 ? ` · เหลือ ${i.stock}` : ''}</small>${i.desc ? `<small>${h(i.desc)}</small>` : ''}
        <div class="item-act"><input type="number" value="1" min="1" max="99" class="w50" data-q><button class="gold" data-buy ${(c?.gold ?? 0) < i.price || i.stock === 0 ? 'disabled' : ''}>ซื้อ</button></div>
      </div></div>`).join('') || '<p class="muted">ร้านยังไม่มีสินค้า</p>'}</div>`;
}
function shopDmHtml() {
  return `<div class="gold-box"><span>ร้านค้า: <b class="${ROOM.shopOpen ? 'good' : 'muted'}">${ROOM.shopOpen ? 'เปิดอยู่' : 'ปิดอยู่'}</b></span><button class="btn btn-sm ${ROOM.shopOpen ? '' : 'btn-gold'}" data-a="TOGGLE_SHOP">${ROOM.shopOpen ? 'ปิดร้าน' : 'เปิดร้าน'}</button></div>
    <div class="row gap6 mb8"><label class="row gap6 small">ราคารับซื้อคืน<input type="number" id="sell-rate" value="${Math.round(ROOM.sellRate * 100)}" min="0" max="100" class="w60">%</label><button class="btn btn-sm" data-shop="rate">บันทึก</button><button class="btn btn-sm btn-primary" data-shop="new">เพิ่มสินค้า</button></div>
    <div class="items">${ROOM.shop.map(i => `<div class="item" data-sid="${h(i.id)}">
      <div class="item-ic">${h(i.icon)}</div>
      <div class="item-b"><div><b>${h(i.name)}</b> <span class="price">${i.price} G</span></div>
        <small class="muted">${h(itemMeta(i))} · ${i.stock < 0 ? 'ไม่จำกัด' : 'คงเหลือ ' + i.stock}</small>
        <div class="item-act"><button data-shop="edit">แก้ไข</button><button data-shop="del" class="bad">ลบ</button></div>
      </div></div>`).join('') || '<p class="muted">ยังไม่มีสินค้า</p>'}</div>`;
}
function sceneHtml() {
  return `
    <div class="sec"><h4>ประกาศเหตุการณ์</h4>
      <input id="ev-name" placeholder="ชื่อเหตุการณ์ เช่น กับดักหินถล่ม" maxlength="80">
      <textarea id="ev-desc" rows="2" placeholder="รายละเอียด / ค่า DC ที่ต้องทอยผ่าน" maxlength="600"></textarea>
      <div class="row gap6"><button class="btn btn-sm btn-gold" data-sc="event">ประกาศ</button>${ROOM.event ? '<button class="btn btn-sm" data-a="CLEAR_EVENT">จบเหตุการณ์</button>' : ''}</div>
      <p class="hint">ระหว่างมีเหตุการณ์ ผู้เล่นทุกคนทอยได้โดยไม่ต้องรอเทิร์น</p></div>
    <div class="sec"><h4>การต่อสู้</h4>
      <div class="row wrap gap6">${ROOM.combat.active ? '<button class="btn btn-sm btn-gold" data-a="COMBAT_NEXT">เทิร์นถัดไป ▶</button><button class="btn btn-sm" data-a="COMBAT_END">จบการต่อสู้</button>' : '<button class="btn btn-sm btn-primary" data-a="COMBAT_START">เริ่มการต่อสู้</button>'}
      <button class="btn btn-sm" data-a="TOGGLE_LOCK">${ROOM.lockTurns ? 'ล็อกทอยตามเทิร์น: เปิด' : 'ล็อกทอยตามเทิร์น: ปิด'}</button></div></div>
    <div class="sec"><h4>การพักผ่อน</h4><div class="row gap6"><button class="btn btn-sm" data-sc="short">พักสั้น · ฟื้น 30%</button><button class="btn btn-sm" data-sc="long">พักยาว · ฟื้นเต็ม</button></div></div>
    <div class="sec"><h4>แจก XP ทั้งปาร์ตี้</h4><div class="row gap6"><input type="number" id="xp-all" value="100" class="w80"><button class="btn btn-sm btn-gold" data-sc="xp">ให้ทุกคน</button></div></div>
    <div class="sec"><h4>ห้อง</h4>
      <div class="row gap6"><input id="room-rename" value="${h(ROOM.name)}" maxlength="50"><button class="btn btn-sm" data-sc="rename">เปลี่ยนชื่อ</button></div>
      <button class="btn btn-sm btn-danger mt8" data-sc="close">ปิดห้องถาวร</button></div>`;
}
function beastListHtml() {
  return `<button class="btn btn-sm btn-primary w100 mb8" data-bst="new">เพิ่มมอนสเตอร์ลงสมุด</button>
    <div class="items">${(ROOM.bestiary || []).map(b => `<div class="item" data-bid="${h(b.id)}">
      <div class="item-ic">${b.img ? `<img src="${img(b.img)}" alt="">` : h(b.icon)}</div>
      <div class="item-b"><div><b>${h(b.name)}</b></div>
        <div class="stat-line">HP <b>${b.hp}</b> · AC <b>${b.ac}</b> · โจมตี <b>${fmt(b.atk)}</b> · <b>${h(b.dmg)}</b> · Init <b>${fmt(b.initMod)}</b></div>
        <div class="stat-line">รางวัล <b>${b.gold} G</b> · <b>${b.xp} XP</b>${b.loot?.length ? ' · ' + b.loot.map(l => h(l.name) + ' x' + l.qty).join(', ') : ''}</div>
        <div class="item-act"><button data-bst="sum" class="gold">ซัมมอน</button><button data-bst="edit">แก้ไข</button><button data-bst="del" class="bad">ลบ</button></div>
      </div></div>`).join('')}</div>`;
}

$('#left-body').addEventListener('click', async e => {
  const t = e.target;
  if (t.id === 'lt-edit') return openCreator(false);
  const bag = t.closest('[data-bag]');
  if (bag) {
    const uid = bag.closest('[data-uid]')?.dataset.uid; const c = myChar(); const it = c?.inventory.find(i => i.uid === uid);
    switch (bag.dataset.bag) {
      case 'use': act('USE', { uid }); break;
      case 'equip': act('EQUIP', { uid }); break;
      case 'sell': { const q = it.qty > 1 ? +prompt(`ขาย ${it.name} กี่ชิ้น? (มี ${it.qty})`, '1') : 1; if (q > 0) act('SELL', { uid, qty: q }); break; }
      case 'drop': if (confirm(`ทิ้ง ${it.name} 1 ชิ้น?`)) act('DROP', { uid, qty: 1 }); break;
      case 'give': giveModal(it); break;
      case 'givegold': giveModal(null); break;
    }
    return;
  }
  if (t.closest('[data-buy]')) { const card = t.closest('[data-sid]'); act('BUY', { id: card.dataset.sid, qty: +card.querySelector('[data-q]').value || 1 }); return; }
  const sh = t.closest('[data-shop]');
  if (sh) {
    const id = sh.closest('[data-sid]')?.dataset.sid;
    if (sh.dataset.shop === 'rate') call('catalog', { op: 'sellRate', item: { rate: (+$('#sell-rate').value || 0) / 100 } }, 'บันทึกแล้ว');
    if (sh.dataset.shop === 'new') itemEditor({ icon: '📦', type: 'misc', price: 10, stock: -1 });
    if (sh.dataset.shop === 'edit') itemEditor(ROOM.shop.find(i => i.id === id));
    if (sh.dataset.shop === 'del' && confirm('ลบสินค้านี้?')) call('catalog', { op: 'shopDelete', item: { id } });
    return;
  }
  const sc = t.closest('[data-sc]');
  if (sc) {
    const k = sc.dataset.sc;
    if (k === 'event') { const n = $('#ev-name').value.trim(); if (!n) return toast('ใส่ชื่อเหตุการณ์', 'bad'); await act('SET_EVENT', { name: n, desc: $('#ev-desc').value }); }
    if (k === 'short') act('REST', { kind: 'short' });
    if (k === 'long') act('REST', { kind: 'long' });
    if (k === 'xp') act('GIVE_XP', { key: '*', amount: +$('#xp-all').value || 0 });
    if (k === 'rename') act('RENAME', { name: $('#room-rename').value }, 'เปลี่ยนชื่อแล้ว');
    if (k === 'close' && confirm('ปิดห้องถาวร? ข้อมูลห้องจะหายไป (ตัวละครของผู้เล่นยังอยู่)')) { if (await call('closeRoom')) goHome(); }
    return;
  }
  const bs = t.closest('[data-bst]');
  if (bs) {
    const id = bs.closest('[data-bid]')?.dataset.bid; const b = ROOM.bestiary.find(x => x.id === id);
    if (bs.dataset.bst === 'new') beastEditor({ icon: '👾', hp: 10, ac: 12, atk: 3, dmg: '1d6', initMod: 0, xp: 25, gold: 5, loot: [] });
    if (bs.dataset.bst === 'edit') beastEditor(b);
    if (bs.dataset.bst === 'sum') act('SUMMON', { beastId: id, count: 1 }, `ซัมมอน ${b.name}!`);
    if (bs.dataset.bst === 'del' && confirm(`ลบ ${b.name} ออกจากสมุด?`)) call('catalog', { op: 'beastDelete', item: { id } });
  }
});

function giveModal(item) {
  const others = ROOM.party.filter(p => p.key !== ME.key);
  if (!others.length) return toast('ไม่มีเพื่อนในปาร์ตี้ให้ส่ง', 'bad');
  openModal(`<h2 class="m-title">${item ? `ส่ง ${h(item.name)} ให้เพื่อน` : 'ให้เงินเพื่อน'}</h2>
    <label>ให้กับ<select id="gv-to">${others.map(p => `<option value="${h(p.key)}">${h(p.char.name)}</option>`).join('')}</select></label>
    <label>${item ? `จำนวน (มี ${item.qty})` : 'จำนวนเงิน (G)'}<input type="number" id="gv-n" value="1" min="1" ${item ? `max="${item.qty}"` : ''}></label>
    <div class="row gap8 end mt12"><button class="btn" data-close>ยกเลิก</button><button class="btn btn-gold" id="gv-go">ส่ง</button></div>`);
  $('#gv-go').onclick = async () => {
    const n = +$('#gv-n').value || 1;
    if (await act('GIVE_TO', item ? { to: $('#gv-to').value, uid: item.uid, qty: n } : { to: $('#gv-to').value, gold: n })) closeModal();
  };
}

function itemEditor(it) {
  openModal(`<h2 class="m-title">${it.id ? 'แก้ไขสินค้า' : 'สินค้าใหม่'}</h2>
    <div class="grid4">
      <label>ไอคอน<input id="ie-icon" value="${h(it.icon)}" maxlength="8"></label>
      <label class="span2">ชื่อสินค้า<input id="ie-name" value="${h(it.name || '')}" maxlength="60"></label>
      <label>ประเภท<select id="ie-type">${Object.entries(G.ITEM_TYPES).map(([k, v]) => `<option value="${k}" ${it.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>ราคา (G)<input id="ie-price" type="number" min="0" value="${it.price ?? 0}"></label>
      <label>สต็อก (-1 = ไม่จำกัด)<input id="ie-stock" type="number" min="-1" value="${it.stock ?? -1}"></label>
      <label>ดาเมจ (อาวุธ)<input id="ie-dmg" value="${h(it.damage || '')}" placeholder="1d8"></label>
      <label>AC โบนัส (เกราะ/โล่)<input id="ie-ac" type="number" min="0" max="20" value="${it.acBonus || 0}"></label>
      <label>ฟื้น HP (ใช้แล้วหมด)<input id="ie-heal" value="${h(it.heal || '')}" placeholder="2d4+2"></label>
      <label>ฟื้น SP (ใช้แล้วหมด)<input id="ie-sp" value="${h(it.restoreSp || '')}" placeholder="1d6"></label>
      <label class="span2">คำอธิบาย<input id="ie-desc" value="${h(it.desc || '')}" maxlength="300"></label>
    </div>
    <p class="hint">สูตรลูกเต๋าใช้รูปแบบ เช่น 1d8, 2d6+3</p>
    <div class="row gap8 end mt12"><button class="btn" data-close>ยกเลิก</button><button class="btn btn-gold" id="ie-save">บันทึก</button></div>`);
  $('#ie-save').onclick = async () => {
    const item = { id: it.id, icon: $('#ie-icon').value, name: $('#ie-name').value, type: $('#ie-type').value, price: +$('#ie-price').value, stock: +$('#ie-stock').value,
      damage: $('#ie-dmg').value, acBonus: +$('#ie-ac').value, heal: $('#ie-heal').value, restoreSp: $('#ie-sp').value, desc: $('#ie-desc').value };
    if (!item.name.trim()) return toast('ใส่ชื่อสินค้า', 'bad');
    if (await call('catalog', { op: 'shopSave', item }, 'บันทึกสินค้าแล้ว')) closeModal();
  };
}

function beastForm(b, withImg = true) {
  return `<div class="grid4 mt8">
    <label>ไอคอน<input id="bf-icon" value="${h(b.icon)}" maxlength="8"></label>
    <label class="span2">ชื่อ<input id="bf-name" value="${h(b.name || '')}" maxlength="60"></label>
    ${withImg ? `<label>รูปภาพ<div class="row gap4"><button type="button" class="btn btn-sm" id="bf-img-btn">${b.img ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}</button>${b.img ? '<button type="button" class="btn btn-sm" id="bf-img-rm">✕</button>' : ''}</div><input type="file" id="bf-img" accept="image/*" hidden></label>` : '<span></span>'}
    <label class="c-hp">HP<input id="bf-hp" type="number" min="1" value="${b.hp}"></label>
    <label class="c-ac">AC<input id="bf-ac" type="number" min="0" value="${b.ac}"></label>
    <label>โบนัสโจมตี<input id="bf-atk" type="number" value="${b.atk}"></label>
    <label>ดาเมจ<input id="bf-dmg" value="${h(b.dmg)}"></label>
    <label>Initiative โบนัส<input id="bf-init" type="number" value="${b.initMod}"></label>
    <label>XP<input id="bf-xp" type="number" min="0" value="${b.xp}"></label>
    <label>เงินดรอป (G)<input id="bf-gold" type="number" min="0" value="${b.gold}"></label>
  </div>`;
}
function readBeastForm() {
  return { icon: $('#bf-icon').value, name: $('#bf-name').value.trim(), hp: +$('#bf-hp').value, ac: +$('#bf-ac').value, atk: +$('#bf-atk').value,
    dmg: $('#bf-dmg').value, initMod: +$('#bf-init').value, xp: +$('#bf-xp').value, gold: +$('#bf-gold').value };
}
function beastEditor(b) {
  const st = { img: b.img || null, loot: (b.loot || []).map(l => ({ ...l })) };
  const draw = () => {
    $('#be-loot').innerHTML = st.loot.map((l, i) => `<span class="tag">${h(l.icon)} ${h(l.name)} x${l.qty} <button class="x" data-lrm="${i}">✕</button></span>`).join('') || '<span class="muted small">ไม่มีของดรอป</span>';
  };
  openModal(`<h2 class="m-title">${b.id ? 'แก้ไขมอนสเตอร์' : 'มอนสเตอร์ใหม่'}</h2>
    ${beastForm(b)}
    <label class="mt8">โน้ต (DM เห็นคนเดียว)<input id="bf-notes" value="${h(b.notes || '')}" maxlength="500"></label>
    <h4 class="mt12">ของดรอปเมื่อชนะ</h4>
    <div id="be-loot" class="row wrap gap6"></div>
    <div class="row gap6 mt8"><select id="be-shop">${ROOM.shop.map(i => `<option value="${h(i.id)}">${h(i.icon)} ${h(i.name)}</option>`).join('')}</select><input type="number" id="be-q" value="1" min="1" class="w50"><button class="btn btn-sm" id="be-add">เพิ่มจากร้านค้า</button></div>
    <div class="row gap6 mt8"><input id="be-ci" value="💎" class="w50"><input id="be-cn" placeholder="ของดรอปกำหนดเอง เช่น เขี้ยวหมาป่า"><input type="number" id="be-cv" placeholder="มูลค่า" class="w80"><button class="btn btn-sm" id="be-addc">เพิ่ม</button></div>
    <div class="row gap8 end mt12"><button class="btn" data-close>ยกเลิก</button><button class="btn btn-gold" id="be-save">บันทึก</button></div>`);
  draw();
  $('#bf-img-btn').onclick = () => $('#bf-img').click();
  $('#bf-img').onchange = async e => { const f = e.target.files[0]; if (!f) return; const id = await uploadImage(f, 240); if (id) { st.img = id; $('#bf-img-btn').textContent = 'อัปโหลดแล้ว'; } };
  if ($('#bf-img-rm')) $('#bf-img-rm').onclick = () => { st.img = null; $('#bf-img-btn').textContent = 'อัปโหลดรูป'; };
  $('#be-add').onclick = () => { const it = ROOM.shop.find(i => i.id === $('#be-shop').value); if (it) { st.loot.push({ ...it, qty: +$('#be-q').value || 1 }); draw(); } };
  $('#be-addc').onclick = () => { const n = $('#be-cn').value.trim(); if (!n) return; st.loot.push({ name: n, icon: $('#be-ci').value || '💎', type: 'misc', price: +$('#be-cv').value || 0, qty: 1 }); $('#be-cn').value = ''; draw(); };
  $('#be-loot').onclick = e => { const x = e.target.closest('[data-lrm]'); if (x) { st.loot.splice(+x.dataset.lrm, 1); draw(); } };
  $('#be-save').onclick = async () => {
    const d = { id: b.id, ...readBeastForm(), img: st.img, loot: st.loot, notes: $('#bf-notes').value };
    if (!d.name) return toast('ใส่ชื่อมอนสเตอร์', 'bad');
    if (await call('catalog', { op: 'beastSave', item: d }, 'บันทึกลงสมุดแล้ว')) closeModal();
  };
}

// ---------- feed
const feedIds = new Set();
const strip = (s) => String(s || '').replace(/^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+/u, '');
function feedEntry(l) {
  const time = new Date(l.t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  if (l.kind === 'roll') {
    const dice = l.rolls.map(r => `<span class="die d${r.s} ${r.dropped ? 'dropped' : ''} ${r.neg ? 'neg' : ''}">${r.v}</span>`).join('');
    const tag = l.nat20 ? '<span class="crit good">NAT 20!</span>' : l.nat1 ? '<span class="crit bad">NAT 1</span>' : '';
    const mode = l.mode === 'ADV' ? '<span class="pill pill-good">ได้เปรียบ</span>' : l.mode === 'DIS' ? '<span class="pill pill-bad">เสียเปรียบ</span>' : '';
    return `<div class="fe roll ${l.by === ME.key ? 'mine' : ''} ${l.nat20 ? 'n20' : ''} ${l.nat1 ? 'n1' : ''} ${l.secret ? 'secret' : ''}">
      <div class="fe-head"><b>${h(l.icon || '')} ${h(l.name)}</b>${l.secret ? ' <span class="pill">ทอยลับ</span>' : ''} ${mode}<time>${time}</time></div>
      <div class="fe-roll"><div class="fe-dice">${dice}${l.mod ? `<span class="mod">${fmt(l.mod)}</span>` : ''}</div><div class="fe-total">${l.total}</div></div>
      <div class="fe-meta"><span class="code">${h(l.label)}</span>${l.reason ? ` · ${h(l.reason)}` : ''} ${tag}${l.note ? `<div class="note">${h(l.note)}</div>` : ''}</div></div>`;
  }
  if (l.kind === 'chat') return `<div class="fe chat ${l.isDM ? 'dm' : ''}"><b>${h(l.name)}:</b> ${h(l.text)} <time>${time}</time></div>`;
  if (l.kind === 'event') return `<div class="fe event"><b>เหตุการณ์: ${h(l.text)}</b>${l.desc ? `<p>${h(l.desc)}</p>` : ''}</div>`;
  if (l.kind === 'loot') return `<div class="fe loot"><b>${h(strip(l.text))}</b>${(l.lines || []).map(x => `<div>${h(x)}</div>`).join('')}</div>`;
  if (l.kind === 'shop') return `<div class="fe sys shop">${h(strip(l.text))} <time>${time}</time></div>`;
  return `<div class="fe sys ${l.tone || ''}">${h(strip(l.text))} <time>${time}</time></div>`;
}
function renderFeed() {
  const el = $('#feed');
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  const ids = new Set(ROOM.logs.map(l => l.id));
  // full rebuild if the window shifted, else append new
  const stale = [...feedIds].some(id => !ids.has(id));
  if (stale) { el.innerHTML = ''; feedIds.clear(); }
  const add = ROOM.logs.filter(l => !feedIds.has(l.id));
  if (add.length) {
    el.insertAdjacentHTML('beforeend', add.map(feedEntry).join(''));
    add.forEach(l => feedIds.add(l.id));
    if (nearBottom || add.some(l => l.by === ME.key) || stale) requestAnimationFrame(() => el.scrollTop = el.scrollHeight);
  }
}
$('#form-chat').onsubmit = e => {
  e.preventDefault(); const i = $('#chat-input'); const t = i.value.trim(); if (!t) return;
  const m = /^\/r(?:oll)?\s+(.+)$/i.exec(t);
  if (m) rollDice({ expr: m[1] }); else call('chat', { text: t });
  i.value = '';
};

// ---------- dice dock
const SIDES = [4, 6, 8, 10, 12, 20, 100];
$('#dice-buttons').innerHTML = SIDES.map(s => `<button class="die-btn d${s}" data-roll="${s}" title="ทอย d${s}"><i>d</i><b>${s}</b></button>`).join('');
$('#dice-buttons').onclick = e => { const b = e.target.closest('[data-roll]'); if (b) rollDice({ sides: +b.dataset.roll }); };
$('#roll-mode').onclick = e => { const b = e.target.closest('[data-mode]'); if (!b) return; dice.mode = b.dataset.mode; $$('#roll-mode button').forEach(x => x.classList.toggle('active', x === b)); };
$$('[data-step]').forEach(b => b.onclick = () => {
  const [k, d] = b.dataset.step.split(':');
  if (k === 'count') dice.count = Math.max(1, Math.min(20, dice.count + +d));
  else dice.mod = Math.max(-99, Math.min(99, dice.mod + +d));
  $('#dice-count').textContent = dice.count; $('#dice-mod').textContent = fmt(dice.mod);
});
function rollDice(o = {}) {
  audio();
  const p = {
    sides: o.sides, count: o.count ?? dice.count, mod: o.mod ?? dice.mod, mode: o.mode ?? dice.mode,
    reason: o.reason ?? $('#dice-reason').value.trim(), expr: o.expr, purpose: o.purpose, monsterId: o.monsterId,
    secret: ROOM?.isDM && $('#dice-secret').checked,
  };
  call('roll', p);
}
function renderDiceDock() {
  const isDM = ROOM.isDM, c = myChar(), cur = currentActor();
  const locked = !isDM && ROOM.lockTurns && ROOM.combat.active && !ROOM.event && !(cur && cur.type === 'player' && cur.id === ME.key);
  $('#dice-lock').classList.toggle('hidden', !locked);
  $('#dice-lock').textContent = locked ? `ยังไม่ถึงตาของคุณ · ตอนนี้ตาของ ${cur?.name || '-'}` : '';
  $('#dice-dock').classList.toggle('locked', locked);
  const q = [];
  if (!isDM && c) {
    if (c.hp <= 0) q.push(`<button class="qbtn bad" data-q="death">ทอย Death Save</button>`);
    q.push(...G.STATS.map(s => `<button class="qbtn" data-q="check:${s}" title="${G.STAT_TH[s]} Check">${s} <small>${fmt(mod(c.stats[s]))}</small></button>`));
    q.push(`<button class="qbtn" data-q="init">Initiative <small>${fmt(mod(c.stats.DEX))}</small></button>`);
    const atk = Math.max(mod(c.stats.STR), mod(c.stats.DEX)) + c.prof;
    q.push(`<button class="qbtn gold" data-q="atk">โจมตี <small>${fmt(atk)}</small></button>`);
    if (c.weapon?.damage) q.push(`<button class="qbtn gold" data-q="dmg">ดาเมจ ${h(c.weapon.damage)}${fmt(Math.max(mod(c.stats.STR), mod(c.stats.DEX)))}</button>`);
  } else if (isDM) {
    q.push('<span class="muted small">ทอยในนามมอนสเตอร์ได้จากปุ่มโจมตี/ดาเมจบนการ์ดมอนสเตอร์ ติ๊ก "ทอยลับ" เพื่อซ่อนผลจากผู้เล่น</span>');
  }
  $('#quick-row').innerHTML = q.join('');
}
$('#quick-row').onclick = e => {
  const b = e.target.closest('[data-q]'); if (!b) return; const c = myChar(); if (!c) return;
  const [k, s] = b.dataset.q.split(':');
  const best = Math.max(mod(c.stats.STR), mod(c.stats.DEX));
  if (k === 'check') rollDice({ sides: 20, count: 1, mod: mod(c.stats[s]), reason: `${s} Check (${G.STAT_TH[s]})` });
  if (k === 'init') rollDice({ sides: 20, count: 1, mod: mod(c.stats.DEX), reason: 'Initiative', purpose: 'init' });
  if (k === 'atk') rollDice({ sides: 20, count: 1, mod: best + c.prof, reason: `โจมตี${c.weapon ? 'ด้วย ' + c.weapon.name : ''}` });
  if (k === 'dmg') rollDice({ expr: `${c.weapon.damage}${best ? fmt(best) : ''}`, reason: `ดาเมจ ${c.weapon.name}` });
  if (k === 'death') rollDice({ sides: 20, count: 1, mod: 0, mode: 'NORMAL', reason: 'Death Save', purpose: 'death' });
};

function showRoll(e) {
  const mine = e.by === ME.key;
  if (!mine && !prefs.anim) return;
  sfxDice();
  const ok = window.Dice3D && Dice3D.roll(e.rolls, { nat20: e.nat20, nat1: e.nat1 });
  const cap = $('#dice-caption');
  cap.className = 'dice-caption ' + (e.nat20 ? 'n20' : e.nat1 ? 'n1' : '') + (ok ? '' : ' flat');
  cap.innerHTML = `<div class="dc-who">${h(e.name)}${e.reason ? ` · ${h(e.reason)}` : ''}${e.secret ? ' · ทอยลับ' : ''}</div>
    <div class="dc-total">${e.total}</div><div class="dc-sub">${h(e.label)}${e.nat20 ? ' · Natural 20' : e.nat1 ? ' · Natural 1' : ''}${e.note ? ' · ' + h(e.note) : ''}</div>`;
  clearTimeout(showRoll.t1); clearTimeout(showRoll.t2);
  cap.classList.add('hidden');
  showRoll.t1 = setTimeout(() => { cap.classList.remove('hidden'); if (e.nat20) sfxCrit(true); if (e.nat1) sfxCrit(false); }, ok ? 1050 : 0);
  showRoll.t2 = setTimeout(() => cap.classList.add('hidden'), 3600);
}
