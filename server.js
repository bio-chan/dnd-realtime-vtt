// =====================================================================
//  D&D Table Helper — real-time server
//  บัญชีผู้ใช้ / ยศ DM / ห้อง / ลูกเต๋า / มอนสเตอร์ / ร้านค้า / กระเป๋า
// =====================================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_DM_USER = (process.env.DM_USERNAME || 'dm').toLowerCase();
const SEED_DM_PASS = process.env.DM_PASSWORD || 'DungeonMaster2026';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 });
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------- DB
let db = { users: {}, sessions: {}, rooms: {}, images: {} };
function loadDb() {
    try {
        if (fs.existsSync(DB_FILE)) Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
    } catch (e) { console.error('โหลดฐานข้อมูลไม่สำเร็จ:', e.message); }
}
let saveTimer = null;
function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
            fs.renameSync(DB_FILE + '.tmp', DB_FILE);
        } catch (e) { console.error('บันทึกฐานข้อมูลไม่สำเร็จ:', e.message); }
    }, 400);
}

// ---------------------------------------------------------------- helpers
const uid = (p = '') => p + crypto.randomBytes(6).toString('hex');
const rand = (s) => crypto.randomInt(1, s + 1);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const int = (v, min, max, def) => { let n = parseInt(v, 10); if (isNaN(n)) n = def; return Math.max(min, Math.min(max, n)); };
const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const mod = (score) => Math.floor(((score || 10) - 10) / 2);
const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
const levelFromXp = (xp) => { let l = 1; for (let i = 0; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]) l = i + 1; return l; };
const ITEM_TYPES = ['consumable', 'weapon', 'armor', 'shield', 'misc'];

function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
    return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPw(pw, u) {
    try { return crypto.timingSafeEqual(crypto.scryptSync(pw, u.salt, 64), Buffer.from(u.hash, 'hex')); }
    catch { return false; }
}

// ---- dice expressions: "2d6+3", "d20", "1d8-1"
function parseDice(expr) {
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
    return dice > 60 ? null : terms;
}
function rollExpr(expr) {
    const terms = parseDice(expr); if (!terms) return null;
    let total = 0, modSum = 0; const rolls = []; let sides = 0;
    for (const t of terms) {
        if (t.c !== undefined) { total += t.sign * t.c; modSum += t.sign * t.c; continue; }
        sides = sides || t.s;
        for (let i = 0; i < t.n; i++) { const r = rand(t.s); rolls.push({ s: t.s, v: r, neg: t.sign < 0 }); total += t.sign * r; }
    }
    return { total, rolls, mod: modSum, sides };
}
const validExpr = (e) => { const s = str(e, 30).replace(/\s+/g, ''); return s && parseDice(s) ? s : ''; };

// ---- items
function cleanItem(d = {}) {
    return {
        name: str(d.name, 60) || 'ไอเทม',
        icon: str(d.icon, 8) || '📦',
        type: ITEM_TYPES.includes(d.type) ? d.type : 'misc',
        desc: str(d.desc, 300),
        price: int(d.price, 0, 1e7, 0),
        heal: validExpr(d.heal),
        restoreSp: validExpr(d.restoreSp),
        damage: validExpr(d.damage),
        acBonus: int(d.acBonus, 0, 20, 0),
    };
}
function invEntry(item, qty) {
    const c = cleanItem(item);
    return { uid: uid('i'), ...c, value: c.price, qty: Math.max(1, qty | 0) };
}
function addToInv(ch, item, qty = 1) {
    const c = cleanItem(item);
    const same = ch.inventory.find(i => i.name === c.name && i.type === c.type && i.damage === c.damage && i.acBonus === c.acBonus);
    if (same) same.qty += qty;
    else ch.inventory.push(invEntry(c, qty));
}
function removeFromInv(ch, iuid, qty) {
    const it = ch.inventory.find(i => i.uid === iuid); if (!it) return null;
    qty = Math.max(1, Math.min(it.qty, qty | 0 || 1));
    it.qty -= qty;
    if (it.qty <= 0) {
        ch.inventory = ch.inventory.filter(i => i.uid !== iuid);
        for (const k of ['weapon', 'armor', 'shield']) if (ch.equipped[k] === iuid) ch.equipped[k] = null;
    }
    return { ...it, qty };
}
const effectiveAC = (ch) => {
    let ac = ch.ac || 10;
    for (const k of ['armor', 'shield']) { const it = ch.inventory.find(i => i.uid === ch.equipped[k]); if (it) ac += it.acBonus || 0; }
    return ac;
};

// ---- defaults
function defaultShop() {
    return [
        { name: 'ยาฟื้นพลังชีวิต', icon: '🧪', type: 'consumable', desc: 'ฟื้นฟู HP 2d4+2', price: 50, heal: '2d4+2' },
        { name: 'ยาฟื้นพลังชีวิตขั้นสูง', icon: '❤️‍🔥', type: 'consumable', desc: 'ฟื้นฟู HP 4d4+4', price: 150, heal: '4d4+4' },
        { name: 'ยาฟื้นมานา', icon: '🔷', type: 'consumable', desc: 'ฟื้นฟู SP 1d6+2', price: 40, restoreSp: '1d6+2' },
        { name: 'มีดสั้น', icon: '🗡️', type: 'weapon', desc: 'เบา ขว้างได้', price: 2, damage: '1d4' },
        { name: 'ดาบยาว', icon: '⚔️', type: 'weapon', desc: 'อาวุธมาตรฐานของนักรบ', price: 15, damage: '1d8' },
        { name: 'ขวานศึก', icon: '🪓', type: 'weapon', desc: 'หนักและรุนแรง', price: 10, damage: '1d8' },
        { name: 'ธนูสั้น', icon: '🏹', type: 'weapon', desc: 'ระยะไกล', price: 25, damage: '1d6' },
        { name: 'ไม้เท้าเวท', icon: '🪄', type: 'weapon', desc: 'สื่อนำเวทมนตร์', price: 20, damage: '1d6' },
        { name: 'เกราะหนัง', icon: '🦺', type: 'armor', desc: 'AC +1', price: 10, acBonus: 1 },
        { name: 'เกราะโซ่', icon: '🛡️', type: 'armor', desc: 'AC +4', price: 75, acBonus: 4 },
        { name: 'โล่', icon: '🔰', type: 'shield', desc: 'AC +2', price: 10, acBonus: 2 },
        { name: 'คบเพลิง', icon: '🔥', type: 'misc', desc: 'ส่องสว่าง 1 ชั่วโมง', price: 1 },
        { name: 'เชือก 50 ฟุต', icon: '🪢', type: 'misc', desc: '', price: 1 },
        { name: 'เสบียง (1 วัน)', icon: '🍖', type: 'misc', desc: '', price: 1 },
    ].map(i => ({ id: uid('s'), ...cleanItem(i), stock: -1 }));
}
function defaultBestiary(shop) {
    const dagger = shop.find(i => i.name === 'มีดสั้น');
    const potion = shop.find(i => i.name === 'ยาฟื้นพลังชีวิต');
    const loot = (it, qty = 1) => ({ ...cleanItem(it), qty });
    return [
        { name: 'ก็อบลิน', icon: '👺', hp: 7, ac: 15, atk: 4, dmg: '1d6+2', initMod: 2, xp: 50, gold: 5, loot: [loot(dagger)] },
        { name: 'หมาป่า', icon: '🐺', hp: 11, ac: 13, atk: 4, dmg: '2d4+2', initMod: 2, xp: 50, gold: 0, loot: [] },
        { name: 'โครงกระดูก', icon: '💀', hp: 13, ac: 13, atk: 4, dmg: '1d6+2', initMod: 2, xp: 50, gold: 3, loot: [] },
        { name: 'โจรป่า', icon: '🥷', hp: 11, ac: 12, atk: 3, dmg: '1d6+1', initMod: 1, xp: 25, gold: 15, loot: [loot(potion)] },
        { name: 'ออร์ค', icon: '👹', hp: 15, ac: 13, atk: 5, dmg: '1d12+3', initMod: 1, xp: 100, gold: 10, loot: [] },
        { name: 'โอเกอร์', icon: '🧌', hp: 59, ac: 11, atk: 6, dmg: '2d8+4', initMod: -1, xp: 450, gold: 50, loot: [loot(potion, 2)] },
        { name: 'มังกรหนุ่มสีแดง', icon: '🐉', hp: 178, ac: 18, atk: 10, dmg: '2d10+6', initMod: 0, xp: 5900, gold: 1000, loot: [] },
    ].map(m => ({ id: uid('b'), img: null, notes: '', ...m }));
}
function newCharacter() {
    const s = {}; STATS.forEach(k => s[k] = 10);
    return {
        name: '', race: '', raceKey: 'custom', charClass: '', classKey: 'custom', height: '', alignment: '',
        portrait: null, skills: '', ultimate: '', background: '', pros: '', cons: '',
        stats: { ...s }, statsBase: { ...s }, ac: 10, speed: '30ft',
        hp: 10, maxHp: 10, sp: 10, maxSp: 10, xp: 0, gold: 0,
        inventory: [], equipped: { weapon: null, armor: null, shield: null },
        statuses: [], deathSaves: { s: 0, f: 0 },
    };
}
function makeUser(username, password, role) {
    const key = username.toLowerCase();
    const u = { username, key, role, createdAt: Date.now(), character: null, recentRooms: [], ...hashPw(password) };
    if (role === 'dm') ensureDmData(u);
    return u;
}
function ensureDmData(u) {
    if (!u.shop) u.shop = defaultShop();
    if (!u.bestiary) u.bestiary = defaultBestiary(u.shop);
    if (u.sellRate === undefined) u.sellRate = 0.5;
}

function seed() {
    if (!db.users[SEED_DM_USER]) {
        db.users[SEED_DM_USER] = makeUser(SEED_DM_USER, SEED_DM_PASS, 'dm');
        console.log(`สร้างบัญชี DM เริ่มต้น: ${SEED_DM_USER} / ${SEED_DM_PASS}`);
    }
    db.users[SEED_DM_USER].role = 'dm';
    db.users[SEED_DM_USER].isSeed = true;
    ensureDmData(db.users[SEED_DM_USER]);
    for (const r of Object.values(db.rooms)) r.logs = (r.logs || []).slice(-150);
    save();
}

const U = (key) => db.users[String(key || '').toLowerCase()];
const displayName = (key) => { const u = U(key); return u?.character?.name || u?.username || key; };
const pubMe = (u) => ({ username: u.username, key: u.key, role: u.role, isSeed: !!u.isSeed, character: u.character ? charView(u.character, true) : null, hasCharacter: !!u.character });

function charView(c, full) {
    const lvl = levelFromXp(c.xp || 0);
    const find = (k) => { const it = c.inventory.find(i => i.uid === c.equipped[k]); return it ? { uid: it.uid, name: it.name, icon: it.icon, damage: it.damage, acBonus: it.acBonus } : null; };
    const v = {
        name: c.name, race: c.race, raceKey: c.raceKey, charClass: c.charClass, classKey: c.classKey,
        height: c.height, alignment: c.alignment, portrait: c.portrait,
        skills: c.skills, ultimate: c.ultimate, background: c.background, pros: c.pros, cons: c.cons,
        stats: c.stats, statsBase: c.statsBase, baseAc: c.ac, ac: effectiveAC(c), speed: c.speed,
        hp: c.hp, maxHp: c.maxHp, sp: c.sp, maxSp: c.maxSp,
        xp: c.xp || 0, level: lvl, nextXp: XP_TABLE[lvl] ?? null, prof: 2 + Math.floor((lvl - 1) / 4),
        statuses: c.statuses, deathSaves: c.deathSaves,
        weapon: find('weapon'), armor: find('armor'), shield: find('shield'),
    };
    if (full) { v.gold = c.gold; v.inventory = c.inventory; v.equipped = c.equipped; }
    return v;
}

function applyCharEdit(c, d, creating) {
    for (const f of ['name', 'race', 'charClass', 'height', 'alignment']) if (d[f] !== undefined) c[f] = str(d[f], 60);
    for (const f of ['raceKey', 'classKey']) if (d[f] !== undefined) c[f] = str(d[f], 20);
    for (const f of ['skills', 'ultimate', 'background', 'pros', 'cons']) if (d[f] !== undefined) c[f] = str(d[f], 1500);
    if (d.speed !== undefined) c.speed = str(d.speed, 20) || '30ft';
    if (d.portrait !== undefined) {
        const p = d.portrait && db.images[d.portrait] ? d.portrait : null;
        if (c.portrait && c.portrait !== p) delete db.images[c.portrait];
        c.portrait = p;
    }
    if (d.stats) for (const s of STATS) c.stats[s] = int(d.stats[s], 1, 30, c.stats[s]);
    if (d.statsBase) for (const s of STATS) c.statsBase[s] = int(d.statsBase[s], 1, 30, c.statsBase[s]);
    if (d.ac !== undefined) c.ac = int(d.ac, 0, 40, 10);
    if (d.maxHp !== undefined) { c.maxHp = int(d.maxHp, 1, 9999, 10); if (creating || c.hp > c.maxHp) c.hp = c.maxHp; }
    if (d.maxSp !== undefined) { c.maxSp = int(d.maxSp, 0, 9999, 10); if (creating || c.sp > c.maxSp) c.sp = c.maxSp; }
    if (creating) {
        c.gold = int(d.startGold, 0, 1000, 100);
        if (d.startWeapon?.name) {
            addToInv(c, { name: d.startWeapon.name, icon: '⚔️', type: 'weapon', damage: d.startWeapon.damage || '1d6', price: 10 });
            c.equipped.weapon = c.inventory[c.inventory.length - 1].uid;
        }
        if (d.startArmor?.name) {
            addToInv(c, { name: d.startArmor.name, icon: '🛡️', type: 'armor', acBonus: d.startArmor.acBonus, price: 10 });
            c.equipped.armor = c.inventory[c.inventory.length - 1].uid;
        }
        addToInv(c, { name: 'เสบียง (1 วัน)', icon: '🍖', type: 'misc', price: 1 }, 5);
        addToInv(c, { name: 'ยาฟื้นพลังชีวิต', icon: '🧪', type: 'consumable', heal: '2d4+2', desc: 'ฟื้นฟู HP 2d4+2', price: 50 }, 1);
    }
}

// ---------------------------------------------------------------- images
app.get('/img/:id', (req, res) => {
    const d = db.images[req.params.id];
    const m = d && /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(d);
    if (!m) return res.status(404).end();
    res.set('Content-Type', m[1]);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(m[2], 'base64'));
});

// ---------------------------------------------------------------- rooms
function genCode() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r;
    do { r = ''; for (let i = 0; i < 5; i++) r += c[crypto.randomInt(c.length)]; } while (db.rooms[r]);
    return r;
}
const socketsIn = (code) => {
    const set = io.sockets.adapter.rooms.get('room:' + code);
    return set ? [...set].map(id => io.sockets.sockets.get(id)).filter(Boolean) : [];
};
function addLog(room, e) {
    e.id = uid('l'); e.t = Date.now();
    room.logs.push(e); if (room.logs.length > 150) room.logs.shift();
    return e;
}
const sys = (room, text, tone = 'info') => addLog(room, { kind: 'sys', text, tone });

function monsterCond(m) {
    if (m.down || m.hp <= 0) return 'ล้มลงแล้ว';
    const p = m.hp / m.maxHp;
    return p > 0.75 ? 'สมบูรณ์ดี' : p > 0.5 ? 'บาดเจ็บเล็กน้อย' : p > 0.25 ? 'บาดเจ็บหนัก' : 'ใกล้ตาย';
}

function roomView(room, me) {
    const isDM = room.dm === me;
    const dmU = U(room.dm);
    const online = new Set(socketsIn(room.code).map(s => s.data.user));
    const party = room.members.filter(k => U(k)?.character).map(k => ({
        key: k, username: U(k).username, online: online.has(k),
        char: charView(U(k).character, isDM || k === me),
    }));
    const monsters = room.monsters.map(m => {
        if (isDM) return m;
        const show = m.revealHp;
        return { id: m.id, name: m.name, icon: m.icon, img: m.img, ac: m.ac, statuses: m.statuses, down: m.down,
            revealHp: show, hp: show ? m.hp : null, maxHp: show ? m.maxHp : null, cond: monsterCond(m) };
    });
    const order = room.combat.order.map(o => {
        if (o.type === 'player') return { ...o, name: displayName(o.id), init: room.init[o.id] ?? 0 };
        const m = room.monsters.find(x => x.id === o.id);
        return { ...o, name: m ? m.name : '???', icon: m?.icon, down: m?.down, init: m?.initiative ?? 0 };
    });
    return {
        code: room.code, name: room.name, isDM, me,
        dm: { key: room.dm, name: dmU?.username || room.dm, online: online.has(room.dm) },
        party, monsters,
        combat: { ...room.combat, order },
        event: room.event, shopOpen: room.shopOpen, lockTurns: room.lockTurns,
        shop: (isDM || room.shopOpen) ? (dmU?.shop || []) : [], sellRate: dmU?.sellRate ?? 0.5,
        bestiary: isDM ? (dmU?.bestiary || []) : undefined,
        logs: room.logs.filter(l => !l.secret || isDM || l.by === me).slice(-120),
    };
}
function broadcast(room) {
    save();
    for (const s of socketsIn(room.code)) s.emit('room', roomView(room, s.data.user));
}
function broadcastRoomsOfDm(dmKey) { for (const r of Object.values(db.rooms)) if (r.dm === dmKey) broadcast(r); }
function broadcastRoomsWith(key) { for (const r of Object.values(db.rooms)) if (r.dm === key || r.members.includes(key)) broadcast(r); }
function emitRoll(room, entry) {
    for (const s of socketsIn(room.code)) {
        const k = s.data.user;
        if (!entry.secret || k === room.dm || k === entry.by) s.emit('rolled', entry);
    }
}
function pushMe(key) { const u = U(key); if (!u) return; for (const [, s] of io.sockets.sockets) if (s.data.user === key) s.emit('me', pubMe(u)); }

// ---- combat helpers
function initFor(room, o) {
    if (o.type === 'player') return room.init[o.id] ?? 0;
    return room.monsters.find(m => m.id === o.id)?.initiative ?? 0;
}
function sortOrderKeepCurrent(room) {
    const c = room.combat; const cur = c.order[c.turn];
    c.order.sort((a, b) => initFor(room, b) - initFor(room, a));
    if (cur) c.turn = Math.max(0, c.order.findIndex(o => o.type === cur.type && o.id === cur.id));
}
function addToCombat(room, type, id) {
    if (!room.combat.active || room.combat.order.some(o => o.type === type && o.id === id)) return;
    room.combat.order.push({ type, id });
    sortOrderKeepCurrent(room);
}
function removeFromCombat(room, type, id) {
    const c = room.combat; const idx = c.order.findIndex(o => o.type === type && o.id === id);
    if (idx < 0) return;
    c.order.splice(idx, 1);
    if (idx < c.turn) c.turn--;
    if (c.turn >= c.order.length) c.turn = 0;
}
function rollInitPlayer(room, k) {
    const ch = U(k)?.character; const r = rand(20); const v = r + mod(ch?.stats?.DEX);
    room.init[k] = v; return { r, v };
}
function rollInitMonster(m) { const r = rand(20); m.initiative = r + (m.initMod || 0); return { r, v: m.initiative }; }

function setPlayerHp(room, k, hp) {
    const ch = U(k).character; const before = ch.hp;
    ch.hp = Math.max(0, Math.min(ch.maxHp, hp));
    if (before > 0 && ch.hp === 0) {
        ch.deathSaves = { s: 0, f: 0 };
        if (!ch.statuses.includes('หมดสติ')) ch.statuses.push('หมดสติ');
        sys(room, `💀 ${ch.name} หมดสติ! ต้องทอย Death Save`, 'bad');
    }
    if (before === 0 && ch.hp > 0) {
        ch.deathSaves = { s: 0, f: 0 };
        ch.statuses = ch.statuses.filter(s => s !== 'หมดสติ' && s !== 'Unconscious');
        sys(room, `✨ ${ch.name} ฟื้นคืนสติ`, 'good');
    }
}

// ---------------------------------------------------------------- sockets
io.on('connection', (socket) => {
    const me = () => U(socket.data.user);
    const ok = (cb, data = {}) => typeof cb === 'function' && cb({ ok: true, ...data });
    const fail = (cb, error) => typeof cb === 'function' && cb({ error });

    function startSession(u, cb) {
        const token = crypto.randomBytes(24).toString('hex');
        db.sessions[token] = { user: u.key, at: Date.now() };
        socket.data.user = u.key; save();
        ok(cb, { token, me: pubMe(u) });
    }

    // ===== AUTH =====
    socket.on('register', ({ username, password } = {}, cb) => {
        const name = str(username, 24), pw = String(password || '');
        if (!/^[A-Za-z0-9_฀-๿]{3,24}$/.test(name)) return fail(cb, 'ชื่อผู้ใช้ 3-24 ตัว (ไทย/อังกฤษ/ตัวเลข/_ เท่านั้น)');
        if (pw.length < 4) return fail(cb, 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
        if (U(name)) return fail(cb, 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');
        const u = makeUser(name, pw, 'player');
        db.users[u.key] = u;
        startSession(u, cb);
    });
    socket.on('login', ({ username, password } = {}, cb) => {
        const u = U(str(username, 24));
        if (!u || !checkPw(String(password || ''), u)) return fail(cb, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        startSession(u, cb);
    });
    socket.on('resume', ({ token } = {}, cb) => {
        const s = db.sessions[token]; const u = s && U(s.user);
        if (!u) return fail(cb, 'session หมดอายุ');
        socket.data.user = u.key; ok(cb, { me: pubMe(u) });
    });
    socket.on('logout', ({ token } = {}, cb) => {
        delete db.sessions[token]; save();
        leaveCurrent(); socket.data.user = null; ok(cb);
    });

    // ===== IMAGES =====
    socket.on('uploadImage', ({ dataUrl } = {}, cb) => {
        if (!me()) return fail(cb, 'กรุณาล็อกอิน');
        if (typeof dataUrl !== 'string' || dataUrl.length > 600000 || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(dataUrl))
            return fail(cb, 'ไฟล์รูปไม่ถูกต้องหรือใหญ่เกินไป');
        const id = uid('img'); db.images[id] = dataUrl; save();
        ok(cb, { id });
    });

    // ===== CHARACTER =====
    socket.on('saveCharacter', (d = {}, cb) => {
        const u = me(); if (!u) return fail(cb, 'กรุณาล็อกอิน');
        const creating = !u.character;
        if (creating) u.character = newCharacter();
        applyCharEdit(u.character, d, creating);
        if (!u.character.name) u.character.name = u.username;
        save(); ok(cb, { me: pubMe(u) });
        broadcastRoomsWith(u.key);
    });

    // ===== DM: users & roles =====
    socket.on('listUsers', (_, cb) => {
        const u = me(); if (u?.role !== 'dm') return fail(cb, 'เฉพาะ DM');
        ok(cb, { users: Object.values(db.users).map(x => ({ key: x.key, username: x.username, role: x.role, isSeed: !!x.isSeed, charName: x.character?.name || '' })).sort((a, b) => a.username.localeCompare(b.username)) });
    });
    socket.on('setRole', ({ key, role } = {}, cb) => {
        const u = me(); if (u?.role !== 'dm') return fail(cb, 'เฉพาะ DM เท่านั้นที่ให้ยศได้');
        const t = U(key); if (!t) return fail(cb, 'ไม่พบผู้ใช้');
        if (t.isSeed) return fail(cb, 'ไม่สามารถเปลี่ยนยศบัญชี DM หลักได้');
        if (t.key === u.key) return fail(cb, 'เปลี่ยนยศตัวเองไม่ได้');
        t.role = role === 'dm' ? 'dm' : 'player';
        if (t.role === 'dm') ensureDmData(t);
        save(); pushMe(t.key); ok(cb);
    });

    // ===== ROOMS =====
    function leaveCurrent() {
        const code = socket.data.room; if (!code) return;
        socket.leave('room:' + code); socket.data.room = null;
        if (db.rooms[code]) broadcast(db.rooms[code]);
    }
    function enter(room, cb) {
        leaveCurrent();
        socket.join('room:' + room.code); socket.data.room = room.code;
        const u = me();
        u.recentRooms = [room.code, ...(u.recentRooms || []).filter(c => c !== room.code)].slice(0, 8);
        ok(cb, { code: room.code });
        broadcast(room);
    }
    socket.on('createRoom', ({ name } = {}, cb) => {
        const u = me(); if (!u) return fail(cb, 'กรุณาล็อกอิน');
        if (u.role !== 'dm') return fail(cb, 'ต้องมียศ DM ก่อนถึงจะสร้างห้องได้');
        ensureDmData(u);
        const code = genCode();
        const room = db.rooms[code] = {
            code, name: str(name, 50) || `ห้องของ ${u.username}`, dm: u.key, createdAt: Date.now(),
            members: [], init: {}, monsters: [],
            combat: { active: false, round: 1, turn: 0, order: [] },
            event: null, shopOpen: false, lockTurns: true, logs: [],
        };
        sys(room, `🏰 ${u.username} (DM) สร้างห้อง "${room.name}"`);
        enter(room, cb);
    });
    socket.on('joinRoom', ({ code } = {}, cb) => {
        const u = me(); if (!u) return fail(cb, 'กรุณาล็อกอิน');
        const room = db.rooms[str(code, 8).toUpperCase()];
        if (!room) return fail(cb, 'ไม่พบห้องนี้ ตรวจสอบรหัสอีกครั้ง');
        if (room.dm !== u.key && !room.members.includes(u.key)) {
            if (!u.character) return fail(cb, 'กรุณาสร้างตัวละครก่อนเข้าห้อง');
            room.members.push(u.key);
            sys(room, `🛡️ ${u.character.name} เข้าร่วมปาร์ตี้`, 'good');
            if (room.combat.active) { rollInitPlayer(room, u.key); addToCombat(room, 'player', u.key); }
        }
        enter(room, cb);
    });
    socket.on('leaveRoom', (_, cb) => { leaveCurrent(); ok(cb); });
    socket.on('myRooms', (_, cb) => {
        const u = me(); if (!u) return fail(cb, 'กรุณาล็อกอิน');
        const list = Object.values(db.rooms).filter(r => r.dm === u.key || r.members.includes(u.key))
            .sort((a, b) => (u.recentRooms || []).indexOf(a.code) - (u.recentRooms || []).indexOf(b.code))
            .map(r => ({ code: r.code, name: r.name, dm: U(r.dm)?.username, isDM: r.dm === u.key, players: r.members.length, online: socketsIn(r.code).length }));
        ok(cb, { rooms: list });
    });
    socket.on('closeRoom', (_, cb) => {
        const room = db.rooms[socket.data.room];
        if (!room || room.dm !== socket.data.user) return fail(cb, 'เฉพาะ DM ของห้อง');
        for (const s of socketsIn(room.code)) { s.emit('roomClosed'); s.leave('room:' + room.code); s.data.room = null; }
        delete db.rooms[room.code]; save(); ok(cb);
    });

    // ===== DICE =====
    socket.on('roll', (p = {}, cb) => {
        const u = me(); const room = db.rooms[socket.data.room];
        if (!u || !room) return fail(cb, 'ไม่ได้อยู่ในห้อง');
        const isDM = room.dm === u.key;
        if (!isDM && !room.members.includes(u.key)) return fail(cb, 'คุณไม่ได้อยู่ในห้องนี้');

        if (!isDM && room.lockTurns && room.combat.active && !room.event) {
            const cur = room.combat.order[room.combat.turn];
            if (!cur || cur.type !== 'player' || cur.id !== u.key)
                return fail(cb, `ยังไม่ถึงตาของคุณ (ตาของ ${cur ? (cur.type === 'player' ? displayName(cur.id) : room.monsters.find(m => m.id === cur.id)?.name) : '-'})`);
        }

        let res;
        const reason = str(p.reason, 80);
        const mode = ['ADV', 'DIS'].includes(p.mode) ? p.mode : 'NORMAL';
        let monster = null;
        if (isDM && p.monsterId) monster = room.monsters.find(m => m.id === p.monsterId);

        if (p.expr) {
            res = rollExpr(p.expr); if (!res) return fail(cb, 'รูปแบบลูกเต๋าไม่ถูกต้อง เช่น 2d6+3');
            res.label = String(p.expr).replace(/\s+/g, '').toLowerCase();
        } else {
            const sides = [2, 3, 4, 6, 8, 10, 12, 20, 100].includes(+p.sides) ? +p.sides : 20;
            const count = int(p.count, 1, 20, 1);
            const m = int(p.mod, -99, 99, 0);
            const rolls = [];
            if (count === 1 && mode !== 'NORMAL') {
                const a = rand(sides), b = rand(sides);
                const keep = mode === 'ADV' ? Math.max(a, b) : Math.min(a, b);
                rolls.push({ s: sides, v: keep }, { s: sides, v: keep === a ? b : a, dropped: true });
            } else for (let i = 0; i < count; i++) rolls.push({ s: sides, v: rand(sides) });
            const sum = rolls.filter(r => !r.dropped).reduce((a, r) => a + r.v, 0);
            res = { total: sum + m, rolls, mod: m, sides, label: `${count}d${sides}${m ? (m > 0 ? '+' + m : m) : ''}` };
        }
        const kept = res.rolls.filter(r => !r.dropped);
        const single20 = kept.length === 1 && kept[0].s === 20;
        const entry = {
            kind: 'roll', by: u.key, name: monster ? monster.name : (isDM ? `DM ${u.username}` : (u.character?.name || u.username)),
            icon: monster?.icon, isDM, label: res.label, rolls: res.rolls, mod: res.mod, total: res.total, sides: res.sides,
            mode: kept.length === 1 && res.rolls.length === 2 ? mode : 'NORMAL', reason,
            secret: isDM && !!p.secret, nat20: single20 && kept[0].v === 20, nat1: single20 && kept[0].v === 1,
        };

        // death save
        if (p.purpose === 'death' && !isDM && u.character && u.character.hp <= 0 && single20) {
            const ch = u.character; const v = kept[0].v;
            if (v === 20) { setPlayerHp(room, u.key, 1); entry.note = 'NAT 20! ฟื้นขึ้นมาพร้อม 1 HP'; }
            else if (v === 1) { ch.deathSaves.f = Math.min(3, ch.deathSaves.f + 2); entry.note = 'NAT 1! ล้มเหลว 2 ครั้ง'; }
            else if (v >= 10) { ch.deathSaves.s = Math.min(3, ch.deathSaves.s + 1); entry.note = 'สำเร็จ'; }
            else { ch.deathSaves.f = Math.min(3, ch.deathSaves.f + 1); entry.note = 'ล้มเหลว'; }
            if (ch.deathSaves.s >= 3) { entry.note += ' — อาการคงที่แล้ว (Stable)'; }
            if (ch.deathSaves.f >= 3) { entry.note += ' — เสียชีวิต ☠️'; }
            entry.reason = 'Death Save';
        }
        // initiative
        if (p.purpose === 'init') {
            if (monster) { monster.initiative = res.total; }
            else if (!isDM) room.init[u.key] = res.total;
            if (room.combat.active) sortOrderKeepCurrent(room);
            entry.reason = entry.reason || 'Initiative';
        }
        addLog(room, entry);
        emitRoll(room, entry);
        broadcast(room);
        ok(cb);
    });

    socket.on('chat', ({ text } = {}, cb) => {
        const u = me(); const room = db.rooms[socket.data.room];
        if (!u || !room) return fail(cb, 'ไม่ได้อยู่ในห้อง');
        const t = str(text, 500); if (!t) return ok(cb);
        addLog(room, { kind: 'chat', by: u.key, name: room.dm === u.key ? `DM ${u.username}` : (u.character?.name || u.username), isDM: room.dm === u.key, text: t });
        broadcast(room); ok(cb);
    });

    // ===== DM catalog (shop & bestiary) =====
    socket.on('catalog', ({ op, item } = {}, cb) => {
        const u = me(); if (u?.role !== 'dm') return fail(cb, 'เฉพาะ DM');
        ensureDmData(u);
        switch (op) {
            case 'shopSave': {
                const clean = { ...cleanItem(item), stock: int(item?.stock, -1, 1e6, -1) };
                const ex = u.shop.find(i => i.id === item?.id);
                if (ex) Object.assign(ex, clean); else u.shop.push({ id: uid('s'), ...clean });
                break;
            }
            case 'shopDelete': u.shop = u.shop.filter(i => i.id !== item?.id); break;
            case 'sellRate': u.sellRate = Math.max(0, Math.min(1, Number(item?.rate) || 0)); break;
            case 'beastSave': {
                const b = {
                    name: str(item?.name, 60) || 'มอนสเตอร์', icon: str(item?.icon, 8) || '👾',
                    img: item?.img && db.images[item.img] ? item.img : null,
                    hp: int(item?.hp, 1, 99999, 10), ac: int(item?.ac, 0, 40, 10), atk: int(item?.atk, -10, 30, 0),
                    dmg: validExpr(item?.dmg) || '1d6', initMod: int(item?.initMod, -10, 20, 0),
                    xp: int(item?.xp, 0, 1e7, 0), gold: int(item?.gold, 0, 1e7, 0), notes: str(item?.notes, 500),
                    loot: Array.isArray(item?.loot) ? item.loot.slice(0, 20).map(l => ({ ...cleanItem(l), qty: int(l.qty, 1, 999, 1) })) : [],
                };
                const ex = u.bestiary.find(i => i.id === item?.id);
                if (ex) Object.assign(ex, b); else u.bestiary.push({ id: uid('b'), ...b });
                break;
            }
            case 'beastDelete': u.bestiary = u.bestiary.filter(i => i.id !== item?.id); break;
            default: return fail(cb, 'คำสั่งไม่ถูกต้อง');
        }
        save(); broadcastRoomsOfDm(u.key); ok(cb);
    });

    // ===== ROOM ACTIONS =====
    socket.on('act', (p = {}, cb) => {
        const u = me(); const room = db.rooms[socket.data.room];
        if (!u || !room) return fail(cb, 'ไม่ได้อยู่ในห้อง');
        const isDM = room.dm === u.key;
        const isMember = room.members.includes(u.key);
        const dmU = U(room.dm);
        const need = (cond, msg) => { if (!cond) { fail(cb, msg); return false; } return true; };
        const mon = () => room.monsters.find(m => m.id === p.id);
        const member = (k) => room.members.includes(k) && U(k)?.character ? U(k) : null;
        const myCh = u.character;
        const t = p.type;

        const DM_ONLY = ['REORDER', 'KICK', 'SUMMON', 'MONSTER', 'MONSTER_REMOVE', 'REWARD', 'GIVE_GOLD', 'GIVE_ITEM', 'TAKE_ITEM', 'GIVE_XP',
            'COMBAT_START', 'COMBAT_NEXT', 'COMBAT_PREV', 'COMBAT_END', 'SET_INIT', 'SET_EVENT', 'CLEAR_EVENT', 'TOGGLE_SHOP', 'TOGGLE_LOCK', 'REST', 'RENAME'];
        if (DM_ONLY.includes(t) && !need(isDM, 'คำสั่งนี้สำหรับ DM เท่านั้น')) return;
        if (!isDM && !need(isMember && myCh, 'คุณไม่ได้อยู่ในปาร์ตี้')) return;

        switch (t) {
            // ---------- party management
            case 'REORDER': {
                const ord = Array.isArray(p.order) ? p.order.filter(k => room.members.includes(k)) : [];
                room.members = [...new Set([...ord, ...room.members])];
                break;
            }
            case 'KICK': {
                const k = p.key; if (!room.members.includes(k)) return fail(cb, 'ไม่พบผู้เล่น');
                room.members = room.members.filter(x => x !== k);
                removeFromCombat(room, 'player', k); delete room.init[k];
                for (const s of socketsIn(room.code)) if (s.data.user === k) { s.emit('kicked'); s.leave('room:' + room.code); s.data.room = null; }
                sys(room, `🚪 ${displayName(k)} ถูกเชิญออกจากห้อง`, 'bad');
                break;
            }
            case 'PLAYER': { // hp/sp/status — DM any player, player self
                const k = isDM ? p.key : u.key; const tu = member(k);
                if (!need(tu, 'ไม่พบผู้เล่น')) return;
                const ch = tu.character;
                if (p.hpDelta !== undefined) {
                    const d = int(p.hpDelta, -9999, 9999, 0);
                    setPlayerHp(room, k, ch.hp + d);
                    if (d) sys(room, `${d < 0 ? '🩸' : '💚'} ${ch.name} ${d < 0 ? 'ได้รับดาเมจ ' + (-d) : 'ฟื้นฟู ' + d} HP (${ch.hp}/${ch.maxHp})`, d < 0 ? 'bad' : 'good');
                }
                if (p.spDelta !== undefined) ch.sp = Math.max(0, Math.min(ch.maxSp, ch.sp + int(p.spDelta, -9999, 9999, 0)));
                if (p.addStatus) { const s = str(p.addStatus, 30); if (s && !ch.statuses.includes(s)) ch.statuses.push(s); }
                if (p.removeStatus) ch.statuses = ch.statuses.filter(s => s !== p.removeStatus);
                if (p.resetDeath) ch.deathSaves = { s: 0, f: 0 };
                break;
            }
            case 'GIVE_GOLD': {
                const tu = member(p.key); if (!need(tu, 'ไม่พบผู้เล่น')) return;
                const a = int(p.amount, -1e7, 1e7, 0);
                tu.character.gold = Math.max(0, tu.character.gold + a);
                sys(room, `💰 DM ${a >= 0 ? 'มอบ' : 'หัก'} ${Math.abs(a)} G ${a >= 0 ? 'ให้' : 'จาก'} ${tu.character.name}`, a >= 0 ? 'good' : 'bad');
                break;
            }
            case 'GIVE_XP': {
                const a = int(p.amount, -1e7, 1e7, 0);
                const keys = p.key === '*' ? room.members.filter(k => member(k)) : [p.key].filter(k => member(k));
                for (const k of keys) {
                    const ch = U(k).character; const before = levelFromXp(ch.xp);
                    ch.xp = Math.max(0, ch.xp + a);
                    const after = levelFromXp(ch.xp);
                    if (after > before) sys(room, `🌟 ${ch.name} เลเวลอัป! เป็น Lv.${after}`, 'gold');
                }
                sys(room, `⭐ DM มอบ ${a} XP ให้ ${p.key === '*' ? 'ทุกคนในปาร์ตี้' : displayName(p.key)}`, 'good');
                break;
            }
            case 'GIVE_ITEM': {
                const tu = member(p.key); if (!need(tu, 'ไม่พบผู้เล่น')) return;
                const qty = int(p.qty, 1, 999, 1);
                const src = p.shopId ? dmU.shop.find(i => i.id === p.shopId) : p.item;
                if (!need(src, 'ไม่พบไอเทม')) return;
                addToInv(tu.character, src, qty);
                sys(room, `🎁 ${tu.character.name} ได้รับ ${cleanItem(src).icon} ${cleanItem(src).name} x${qty}`, 'good');
                break;
            }
            case 'TAKE_ITEM': {
                const tu = member(p.key); if (!need(tu, 'ไม่พบผู้เล่น')) return;
                const it = removeFromInv(tu.character, p.uid, p.qty || 1);
                if (it) sys(room, `🗑️ DM นำ ${it.name} x${it.qty} ออกจากกระเป๋าของ ${tu.character.name}`);
                break;
            }
            // ---------- monsters
            case 'SUMMON': {
                const n = int(p.count, 1, 12, 1);
                let tpl = p.beastId ? dmU.bestiary.find(b => b.id === p.beastId) : p.custom;
                if (!need(tpl, 'ไม่พบข้อมูลมอนสเตอร์')) return;
                const base = {
                    name: str(tpl.name, 60) || 'มอนสเตอร์', icon: str(tpl.icon, 8) || '👾', img: tpl.img && db.images[tpl.img] ? tpl.img : null,
                    maxHp: int(tpl.hp, 1, 99999, 10), ac: int(tpl.ac, 0, 40, 10), atk: int(tpl.atk, -10, 30, 0),
                    dmg: validExpr(tpl.dmg) || '1d6', initMod: int(tpl.initMod, -10, 20, 0),
                    xp: int(tpl.xp, 0, 1e7, 0), gold: int(tpl.gold, 0, 1e7, 0),
                    loot: Array.isArray(tpl.loot) ? tpl.loot.map(l => ({ ...cleanItem(l), qty: int(l.qty, 1, 999, 1) })) : [],
                };
                const sameCount = room.monsters.filter(m => m.baseName === base.name).length;
                for (let i = 0; i < n; i++) {
                    const m = { id: uid('m'), baseName: base.name, ...base, name: (n > 1 || sameCount) ? `${base.name} ${sameCount + i + 1}` : base.name,
                        hp: base.maxHp, statuses: [], revealHp: false, down: false, initiative: 0 };
                    rollInitMonster(m);
                    room.monsters.push(m);
                    addToCombat(room, 'monster', m.id);
                }
                sys(room, `${base.icon} DM ซัมมอน ${base.name}${n > 1 ? ' x' + n : ''} ลงสนาม!`, 'bad');
                break;
            }
            case 'MONSTER': {
                const m = mon(); if (!need(m, 'ไม่พบมอนสเตอร์')) return;
                if (p.hpDelta !== undefined) {
                    const d = int(p.hpDelta, -99999, 99999, 0);
                    m.hp = Math.max(0, Math.min(m.maxHp, m.hp + d));
                    if (m.hp === 0 && !m.down) { m.down = true; sys(room, `⚔️ ${m.name} ถูกปราบแล้ว!`, 'gold'); }
                    else if (m.hp > 0) m.down = false;
                    if (d && m.hp > 0) sys(room, `${d < 0 ? '💥' : '💚'} ${m.name} ${d < 0 ? 'ได้รับดาเมจ ' + (-d) : 'ฟื้นฟู ' + d}`, d < 0 ? 'info' : 'bad');
                }
                if (p.reveal !== undefined) m.revealHp = !!p.reveal;
                if (p.addStatus) { const s = str(p.addStatus, 30); if (s && !m.statuses.includes(s)) m.statuses.push(s); }
                if (p.removeStatus) m.statuses = m.statuses.filter(s => s !== p.removeStatus);
                if (p.ac !== undefined) m.ac = int(p.ac, 0, 40, m.ac);
                break;
            }
            case 'MONSTER_REMOVE': {
                room.monsters = room.monsters.filter(m => m.id !== p.id);
                removeFromCombat(room, 'monster', p.id);
                break;
            }
            case 'REWARD': {
                const m = mon(); if (!need(m, 'ไม่พบมอนสเตอร์')) return;
                const recips = (Array.isArray(p.recipients) ? p.recipients : []).filter(k => member(k));
                if (!need(recips.length, 'เลือกผู้เล่นที่จะได้รับรางวัลอย่างน้อย 1 คน')) return;
                const gold = int(p.gold, 0, 1e7, m.gold), xp = int(p.xp, 0, 1e7, m.xp);
                const gEach = Math.floor(gold / recips.length), gRest = gold - gEach * recips.length;
                const xEach = Math.floor(xp / recips.length);
                recips.forEach((k, i) => {
                    const ch = U(k).character; const before = levelFromXp(ch.xp);
                    ch.gold += gEach + (i === 0 ? gRest : 0); ch.xp += xEach;
                    if (levelFromXp(ch.xp) > before) sys(room, `🌟 ${ch.name} เลเวลอัป! เป็น Lv.${levelFromXp(ch.xp)}`, 'gold');
                });
                const lootLines = [];
                (Array.isArray(p.loot) ? p.loot : []).forEach(l => {
                    const it = m.loot[l.index]; const tu = member(l.to);
                    if (it && tu) { addToInv(tu.character, it, it.qty); lootLines.push(`${it.icon} ${it.name} x${it.qty} → ${tu.character.name}`); }
                });
                addLog(room, { kind: 'loot', text: `🏆 ชนะ ${m.name}!`, lines: [
                    gold ? `💰 ${gold} G (คนละ ${gEach})` : null, xp ? `⭐ ${xp} XP (คนละ ${xEach})` : null, ...lootLines].filter(Boolean) });
                room.monsters = room.monsters.filter(x => x.id !== m.id);
                removeFromCombat(room, 'monster', m.id);
                break;
            }
            // ---------- combat
            case 'COMBAT_START': {
                const lines = [];
                room.combat.order = [];
                for (const k of room.members.filter(k => member(k))) {
                    const r = rollInitPlayer(room, k); room.combat.order.push({ type: 'player', id: k }); lines.push(`${displayName(k)}: ${r.v}`);
                }
                for (const m of room.monsters.filter(m => !m.down)) {
                    const r = rollInitMonster(m); room.combat.order.push({ type: 'monster', id: m.id }); lines.push(`${m.icon} ${m.name}: ${r.v}`);
                }
                room.combat.active = true; room.combat.round = 1; room.combat.turn = 0;
                room.combat.order.sort((a, b) => initFor(room, b) - initFor(room, a));
                addLog(room, { kind: 'loot', text: '⚔️ เริ่มการต่อสู้! ทอย Initiative', lines });
                break;
            }
            case 'COMBAT_NEXT': case 'COMBAT_PREV': {
                const c = room.combat; if (!c.active || !c.order.length) break;
                const dir = t === 'COMBAT_NEXT' ? 1 : -1;
                for (let i = 0; i < c.order.length; i++) {
                    c.turn += dir;
                    if (c.turn >= c.order.length) { c.turn = 0; c.round++; }
                    if (c.turn < 0) { c.turn = c.order.length - 1; c.round = Math.max(1, c.round - 1); }
                    const o = c.order[c.turn];
                    if (o.type === 'monster' && room.monsters.find(m => m.id === o.id)?.down) continue;
                    break;
                }
                const o = c.order[c.turn];
                sys(room, `▶ รอบที่ ${c.round} — ตาของ ${o.type === 'player' ? displayName(o.id) : room.monsters.find(m => m.id === o.id)?.name}`, 'turn');
                break;
            }
            case 'COMBAT_END': room.combat = { active: false, round: 1, turn: 0, order: [] }; sys(room, '🕊️ การต่อสู้สิ้นสุดลง'); break;
            case 'SET_INIT': {
                const v = int(p.value, -20, 99, 0);
                if (p.kind === 'player') room.init[p.id] = v; else { const m = mon(); if (m) m.initiative = v; }
                sortOrderKeepCurrent(room);
                break;
            }
            // ---------- scene
            case 'SET_EVENT': room.event = { name: str(p.name, 80) || 'เหตุการณ์', desc: str(p.desc, 600) }; addLog(room, { kind: 'event', text: room.event.name, desc: room.event.desc }); break;
            case 'CLEAR_EVENT': room.event = null; sys(room, '📜 เหตุการณ์จบลง'); break;
            case 'TOGGLE_SHOP': room.shopOpen = !room.shopOpen; sys(room, room.shopOpen ? '🏪 ร้านค้าเปิดแล้ว! เข้าไปซื้อของได้ที่แท็บร้านค้า' : '🏪 ร้านค้าปิดแล้ว', 'gold'); break;
            case 'TOGGLE_LOCK': room.lockTurns = !room.lockTurns; sys(room, room.lockTurns ? '🔒 ล็อกการทอยตามเทิร์นระหว่างต่อสู้' : '🔓 ทุกคนทอยได้อิสระ'); break;
            case 'RENAME': room.name = str(p.name, 50) || room.name; break;
            case 'REST': {
                const long = p.kind === 'long';
                for (const k of room.members) {
                    const ch = U(k)?.character; if (!ch) continue;
                    if (long) { ch.hp = ch.maxHp; ch.sp = ch.maxSp; ch.statuses = ch.statuses.filter(s => !['หมดสติ', 'Unconscious', 'Exhaustion'].includes(s)); }
                    else { ch.hp = Math.min(ch.maxHp, ch.hp + Math.max(1, Math.floor(ch.maxHp * 0.3))); ch.sp = Math.min(ch.maxSp, ch.sp + Math.max(1, Math.floor(ch.maxSp * 0.3))); if (ch.hp > 0) ch.statuses = ch.statuses.filter(s => s !== 'หมดสติ'); }
                    ch.deathSaves = { s: 0, f: 0 };
                }
                sys(room, long ? '🌙 พักยาว (Long Rest) — ฟื้นฟู HP/SP เต็ม' : '🔥 พักสั้น (Short Rest) — ฟื้นฟู 30% HP/SP', 'good');
                break;
            }
            // ---------- player economy & inventory
            case 'BUY': {
                if (!need(!isDM, 'DM ซื้อของไม่ได้')) return;
                if (!need(room.shopOpen, 'ร้านค้ายังไม่เปิด')) return;
                const it = dmU.shop.find(i => i.id === p.id); if (!need(it, 'ไม่พบสินค้า')) return;
                const qty = int(p.qty, 1, 99, 1);
                if (!need(it.stock === -1 || it.stock >= qty, 'สินค้าไม่พอ')) return;
                const cost = it.price * qty;
                if (!need(myCh.gold >= cost, `เงินไม่พอ (ต้องใช้ ${cost} G)`)) return;
                myCh.gold -= cost; if (it.stock !== -1) it.stock -= qty;
                addToInv(myCh, it, qty);
                addLog(room, { kind: 'shop', text: `🛒 ${myCh.name} ซื้อ ${it.icon} ${it.name} x${qty} (-${cost} G)` });
                break;
            }
            case 'SELL': {
                if (!need(room.shopOpen, 'ร้านค้ายังไม่เปิด จึงขายไม่ได้')) return;
                const it = removeFromInv(myCh, p.uid, p.qty || 1); if (!need(it, 'ไม่พบไอเทม')) return;
                const gain = Math.floor((it.value || 0) * (dmU.sellRate ?? 0.5)) * it.qty;
                myCh.gold += gain;
                addLog(room, { kind: 'shop', text: `💱 ${myCh.name} ขาย ${it.icon} ${it.name} x${it.qty} (+${gain} G)` });
                break;
            }
            case 'USE': {
                const it = myCh.inventory.find(i => i.uid === p.uid); if (!need(it, 'ไม่พบไอเทม')) return;
                const parts = [];
                if (it.heal) { const r = rollExpr(it.heal); if (r) { const before = myCh.hp; setPlayerHp(room, u.key, myCh.hp + r.total); parts.push(`ฟื้นฟู HP +${myCh.hp - before} (ทอย ${it.heal} = ${r.total})`); } }
                if (it.restoreSp) { const r = rollExpr(it.restoreSp); if (r) { const before = myCh.sp; myCh.sp = Math.min(myCh.maxSp, myCh.sp + r.total); parts.push(`ฟื้นฟู SP +${myCh.sp - before}`); } }
                removeFromInv(myCh, it.uid, 1);
                sys(room, `${it.icon} ${myCh.name} ใช้ ${it.name}${parts.length ? ' — ' + parts.join(', ') : ''}`, 'good');
                break;
            }
            case 'EQUIP': {
                const it = myCh.inventory.find(i => i.uid === p.uid); if (!need(it, 'ไม่พบไอเทม')) return;
                if (!need(['weapon', 'armor', 'shield'].includes(it.type), 'ไอเทมนี้สวมใส่ไม่ได้')) return;
                myCh.equipped[it.type] = myCh.equipped[it.type] === it.uid ? null : it.uid;
                break;
            }
            case 'DROP': {
                const it = removeFromInv(myCh, p.uid, p.qty || 1);
                if (it) sys(room, `🗑️ ${myCh.name} ทิ้ง ${it.name} x${it.qty}`);
                break;
            }
            case 'GIVE_TO': {
                const tu = member(p.to); if (!need(tu && tu.key !== u.key, 'ไม่พบผู้รับ')) return;
                if (p.gold) {
                    const a = int(p.gold, 1, 1e7, 0); if (!need(myCh.gold >= a, 'เงินไม่พอ')) return;
                    myCh.gold -= a; tu.character.gold += a;
                    sys(room, `🤝 ${myCh.name} ให้เงิน ${a} G แก่ ${tu.character.name}`, 'good');
                } else {
                    const it = removeFromInv(myCh, p.uid, p.qty || 1); if (!need(it, 'ไม่พบไอเทม')) return;
                    addToInv(tu.character, it, it.qty);
                    sys(room, `🤝 ${myCh.name} ส่ง ${it.icon} ${it.name} x${it.qty} ให้ ${tu.character.name}`, 'good');
                }
                break;
            }
            default: return fail(cb, 'คำสั่งไม่ถูกต้อง');
        }
        broadcast(room);
        ok(cb);
    });

    socket.on('disconnect', () => {
        const code = socket.data.room;
        if (code && db.rooms[code]) setTimeout(() => db.rooms[code] && broadcast(db.rooms[code]), 50);
    });
});

loadDb();
seed();
server.listen(PORT, () => console.log(`D&D Table Helper พร้อมใช้งานที่ http://localhost:${PORT}`));
