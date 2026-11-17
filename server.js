const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 });

app.use(express.static(path.join(__dirname, 'public')));

const accounts = {};
const rooms = {};

function genCode() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let r = ''; for (let i = 0; i < 5; i++) r += c[Math.floor(Math.random() * c.length)];
    return r;
}

function defaultChar(name) {
    return {
        name: name || 'Adventurer', race: '', charClass: '', height: '',
        portrait: '', skills: '', ultimate: '', background: '', pros: '', cons: '',
        stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: 20, maxHp: 20, sp: 10, maxSp: 10,
        weapon: '', armor: '',
        inventory: []
    };
}

io.on('connection', (socket) => {
    let currentUser = null;

    // ---- AUTH ----
    socket.on('register', ({ username, password }, cb) => {
        const u = (username || '').trim(), p = (password || '').trim();
        if (!u || !p) return cb({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        if (u.length < 2) return cb({ error: 'ชื่อผู้ใช้ต้องมีอย่างน้อย 2 ตัวอักษร' });
        if (p.length < 3) return cb({ error: 'รหัสผ่านต้องมีอย่างน้อย 3 ตัวอักษร' });
        if (accounts[u]) return cb({ error: 'ชื่อนี้ถูกใช้แล้ว' });
        accounts[u] = { password: p, character: defaultChar(u) };
        currentUser = u;
        cb({ success: true, character: accounts[u].character, username: u });
    });

    socket.on('login', ({ username, password }, cb) => {
        const u = (username || '').trim(), p = (password || '').trim();
        if (!u || !p) return cb({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        const acc = accounts[u];
        if (!acc || acc.password !== p) return cb({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        currentUser = u;
        cb({ success: true, character: acc.character, username: u });
    });

    socket.on('saveCharacter', (data, cb) => {
        if (!currentUser || !accounts[currentUser]) return cb?.({ error: 'ไม่ได้ล็อกอิน' });
        const c = accounts[currentUser].character;
        const fields = ['name','race','charClass','height','portrait','skills','ultimate','background','pros','cons','weapon','armor'];
        fields.forEach(f => { if (data[f] !== undefined) c[f] = data[f]; });
        if (data.stats) {
            for (const s of ['STR','DEX','CON','INT','WIS','CHA']) {
                if (data.stats[s] !== undefined) c.stats[s] = Math.max(1, Math.min(30, parseInt(data.stats[s]) || 10));
            }
        }
        if (data.hp !== undefined) { c.hp = parseInt(data.hp) || 1; c.maxHp = c.hp; }
        if (data.sp !== undefined) { c.sp = parseInt(data.sp) || 0; c.maxSp = c.sp; }
        if (data.inventory !== undefined) c.inventory = data.inventory;

        // Sync with any room the user is currently in
        for (const code in rooms) {
            const ent = rooms[code].entities.find(e => e.username === currentUser);
            if (ent) {
                if (data.name) ent.name = data.name;
                if (data.hp !== undefined) { ent.hp = c.hp; ent.maxHp = c.maxHp; }
                if (data.sp !== undefined) { ent.sp = c.sp; ent.maxSp = c.maxSp; }
                io.to(code).emit('updateState', rooms[code]);
            }
        }

        cb?.({ success: true, character: c });
    });

    // ---- ROOMS ----
    socket.on('createRoom', () => {
        if (!currentUser) return socket.emit('errorMsg', 'กรุณาล็อกอินก่อน');
        let code = genCode(); while (rooms[code]) code = genCode();
        rooms[code] = {
            dmUsername: currentUser, dmSocketId: socket.id,
            entities: [], turnIndex: 0, combatStarted: false,
            logs: [], events: []
        };
        socket.join(code);
        socket.emit('roomJoined', { roomCode: code, role: 'DM', state: rooms[code], username: currentUser });
    });

    socket.on('joinRoom', ({ roomCode }) => {
        if (!currentUser) return socket.emit('errorMsg', 'กรุณาล็อกอินก่อน');
        const code = (roomCode || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room) return socket.emit('errorMsg', 'ไม่พบห้องนี้');

        const existing = room.entities.find(e => e.username === currentUser);
        if (existing) {
            existing.id = socket.id;
            socket.join(code);
            socket.emit('roomJoined', { roomCode: code, role: 'PLAYER', state: room, username: currentUser });
            io.to(code).emit('updateState', room);
            return;
        }

        socket.join(code);
        const ch = accounts[currentUser].character;
        room.entities.push({
            id: socket.id, username: currentUser, type: 'PLAYER',
            name: ch.name || currentUser,
            hp: ch.hp || 20, maxHp: ch.maxHp || 20,
            sp: ch.sp || 10, maxSp: ch.maxSp || 10,
            initiative: 0, statuses: [], revealHp: true
        });
        socket.emit('roomJoined', { roomCode: code, role: 'PLAYER', state: room, username: currentUser });
        io.to(code).emit('updateState', room);
    });

    // ---- DICE (turn-based + event bypass) ----
    socket.on('rollDice', ({ roomCode, diceType, modifier }) => {
        if (!currentUser) return;
        const code = (roomCode || '').toUpperCase().trim();
        const room = rooms[code]; if (!room) return;
        const isDM = room.dmUsername === currentUser;

        if (!isDM) {
            const hasEvent = room.events.some(e => e.active);
            if (room.combatStarted && !hasEvent) {
                const cur = room.entities[room.turnIndex];
                if (!cur || cur.username !== currentUser)
                    return socket.emit('errorMsg', 'ยังไม่ถึงตาของคุณ');
            }
        }

        const sides = parseInt(diceType) || 20;
        const raw = Math.floor(Math.random() * sides) + 1;
        const mod = parseInt(modifier) || 0;
        const total = raw + mod;
        const activeEvt = room.events.find(e => e.active);

        const log = {
            id: 'r' + Date.now(), time: new Date().toLocaleTimeString(),
            roller: isDM ? 'DM' : (accounts[currentUser]?.character?.name || currentUser),
            dice: `d${sides}`, diceSides: sides, raw, mod, total,
            isNat20: sides === 20 && raw === 20, isNat1: sides === 20 && raw === 1,
            eventName: activeEvt ? activeEvt.name : null
        };
        room.logs.unshift(log);
        if (room.logs.length > 50) room.logs.pop();
        io.to(code).emit('diceRolled', log);
        io.to(code).emit('updateState', room);
    });

    // ---- EVENTS ----
    socket.on('createEvent', ({ roomCode, name, description }) => {
        const code = (roomCode || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room || room.dmUsername !== currentUser) return;
        const evt = { id: 'e' + Date.now(), name: name || 'Event', description: description || '', active: true };
        room.events.push(evt);
        io.to(code).emit('updateState', room);
        io.to(code).emit('eventCreated', evt);
    });

    socket.on('closeEvent', ({ roomCode, eventId }) => {
        const code = (roomCode || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room || room.dmUsername !== currentUser) return;
        const e = room.events.find(x => x.id === eventId);
        if (e) e.active = false;
        io.to(code).emit('updateState', room);
    });

    // ---- DM ACTIONS ----
    socket.on('dmAction', ({ roomCode, action, payload = {} }) => {
        const code = (roomCode || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room || room.dmUsername !== currentUser) return;

        switch (action) {
            case 'ADD_MONSTER': {
                const hp = parseInt(payload.hp) || 10, sp = parseInt(payload.sp) || 0;
                room.entities.push({
                    id: 'mon_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                    username: null, type: 'MONSTER', name: payload.name || 'Monster',
                    hp, maxHp: hp, sp, maxSp: sp,
                    initiative: parseInt(payload.initiative) || 0, statuses: [], revealHp: false
                });
                break;
            }
            case 'TOGGLE_REVEAL_HP': {
                const t = room.entities.find(e => e.id === payload.id);
                if (t && t.type === 'MONSTER') t.revealHp = !t.revealHp;
                break;
            }
            case 'UPDATE_ENTITY': {
                const t = room.entities.find(e => e.id === payload.id);
                if (t) {
                    if (payload.hp !== undefined) t.hp = Math.max(0, Math.min(t.maxHp, parseInt(payload.hp)));
                    if (payload.sp !== undefined) t.sp = Math.max(0, Math.min(t.maxSp, parseInt(payload.sp)));
                    if (payload.initiative !== undefined) t.initiative = parseInt(payload.initiative) || 0;
                    if (payload.addStatus) t.statuses.push(payload.addStatus);
                    if (payload.removeStatus !== undefined) t.statuses.splice(payload.removeStatus, 1);
                }
                break;
            }
            case 'REMOVE_ENTITY':
                room.entities = room.entities.filter(e => e.id !== payload.id);
                if (room.turnIndex >= room.entities.length && room.entities.length > 0) room.turnIndex = 0;
                break;
            case 'SORT_INITIATIVE':
                room.entities.sort((a, b) => b.initiative - a.initiative);
                room.turnIndex = 0; room.combatStarted = true;
                break;
            case 'NEXT_TURN':
                if (room.entities.length > 0) room.turnIndex = (room.turnIndex + 1) % room.entities.length;
                break;
            case 'END_COMBAT':
                room.combatStarted = false; room.turnIndex = 0;
                break;
            case 'LOAD_SAVE':
                room.entities = Array.isArray(payload.entities) ? payload.entities : [];
                room.turnIndex = payload.turnIndex || 0;
                room.logs = Array.isArray(payload.logs) ? payload.logs : [];
                room.events = Array.isArray(payload.events) ? payload.events : [];
                room.combatStarted = !!payload.combatStarted;
                break;
        }
        io.to(code).emit('updateState', room);
    });

    // ---- CHARACTER SHEET VIEW / DM EDIT ----
    socket.on('getCharacterSheet', ({ username }, cb) => {
        if (!accounts[username]) return cb?.({ error: 'ไม่พบผู้ใช้' });
        cb?.({ character: accounts[username].character });
    });

    socket.on('dmEditCharacter', ({ roomCode, targetUsername, changes }) => {
        const code = (roomCode || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room || room.dmUsername !== currentUser) return;
        if (!accounts[targetUsername]) return;
        const ch = accounts[targetUsername].character;
        const fields = ['name','race','charClass','height','skills','ultimate','background','pros','cons','weapon','armor'];
        fields.forEach(f => { if (changes[f] !== undefined) ch[f] = changes[f]; });
        if (changes.stats) {
            for (const s of ['STR','DEX','CON','INT','WIS','CHA']) {
                if (changes.stats[s] !== undefined) ch.stats[s] = Math.max(1, Math.min(30, parseInt(changes.stats[s]) || 10));
            }
        }
        if (changes.hp !== undefined) { ch.hp = parseInt(changes.hp) || 1; ch.maxHp = ch.hp; }
        if (changes.sp !== undefined) { ch.sp = parseInt(changes.sp) || 0; ch.maxSp = ch.sp; }
        if (changes.inventory) ch.inventory = changes.inventory;
        const ent = room.entities.find(e => e.username === targetUsername);
        if (ent) {
            if (changes.name) ent.name = changes.name;
            if (changes.hp !== undefined) { ent.hp = parseInt(changes.hp); ent.maxHp = ent.hp; }
            if (changes.sp !== undefined) { ent.sp = parseInt(changes.sp); ent.maxSp = ent.sp; }
        }
        io.to(code).emit('updateState', room);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`D&D Server running on port ${PORT}`));
