const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// เก็บข้อมูลห้องทั้งหมดใน Memory (สามารถ Export เป็น JSON เพื่อ Save ได้)
const rooms = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on('connection', (socket) => {
    // 1. สร้างห้อง (ผู้สร้างจะเป็น DM)
    socket.on('createRoom', ({ playerName }) => {
        let roomCode = generateRoomCode();
        while (rooms[roomCode]) {
            roomCode = generateRoomCode();
        }
        rooms[roomCode] = {
            dmId: socket.id,
            entities: [], // เก็บทั้ง Player และ Monster
            turnIndex: 0,
            logs: []
        };
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, role: 'DM', state: rooms[roomCode] });
    });

    // 2. เข้าร่วมห้อง (ผู้เข้าตามรหัสจะเป็น Player)
    socket.on('joinRoom', ({ roomCode, character }) => {
        if (!roomCode) {
            return socket.emit('errorMsg', 'กรุณากรอกรหัสห้อง');
        }
        roomCode = roomCode.toUpperCase().trim();
        const room = rooms[roomCode];
        if (!room) {
            return socket.emit('errorMsg', 'ไม่พบห้องหมายเลขนี้ (Room not found)');
        }
        socket.join(roomCode);

        // เพิ่มตัวละครผู้เล่นเข้าสู่ระบบห้อง
        const charData = character || {};
        const hp = parseInt(charData.hp, 10) || 20;
        const mana = parseInt(charData.mana, 10) || 10;
        const newPlayer = {
            id: socket.id,
            type: 'PLAYER',
            name: charData.name || 'Adventurer',
            hp: hp,
            maxHp: hp,
            mana: mana,
            maxMana: mana,
            initiative: 0,
            statuses: [],
            inventory: []
        };
        room.entities.push(newPlayer);

        socket.emit('roomJoined', { roomCode, role: 'PLAYER', state: room });
        io.to(roomCode).emit('updateState', room);
    });

    // 3. ระบบทอยลูกเต๋า (ทุกคนเห็นพร้อมกัน)
    socket.on('rollDice', ({ roomCode, rollerName, diceType, modifier }) => {
        if (!roomCode) return;
        const room = rooms[roomCode.toUpperCase().trim()];
        if (!room) return;

        const diceSides = parseInt(diceType, 10) || 20;
        const rawRoll = Math.floor(Math.random() * diceSides) + 1;
        const mod = parseInt(modifier, 10) || 0;
        const total = rawRoll + mod;

        const logEntry = {
            time: new Date().toLocaleTimeString(),
            roller: rollerName || 'Anonymous',
            dice: `d${diceSides}`,
            raw: rawRoll,
            mod: mod,
            total: total
        };

        room.logs.unshift(logEntry);
        if (room.logs.length > 50) room.logs.pop();

        io.to(roomCode.toUpperCase().trim()).emit('diceRolled', logEntry);
        io.to(roomCode.toUpperCase().trim()).emit('updateState', room);
    });

    // 4. คำสั่งเฉพาะ DM (แก้ไขค่า, เพิ่มมอนสเตอร์, จัดลำดับ, โหลดเซฟ)
    socket.on('dmAction', ({ roomCode, action, payload = {} }) => {
        if (!roomCode) return;
        const code = roomCode.toUpperCase().trim();
        const room = rooms[code];
        if (!room || room.dmId !== socket.id) return; // ป้องกัน Player แอบส่งคำสั่ง DM

        switch (action) {
            case 'ADD_MONSTER': {
                const hp = parseInt(payload.hp, 10) || 10;
                const mana = parseInt(payload.mana, 10) || 0;
                const init = parseInt(payload.initiative, 10) || 0;
                room.entities.push({
                    id: 'mon_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                    type: 'MONSTER',
                    name: payload.name || 'Monster',
                    hp: hp,
                    maxHp: hp,
                    mana: mana,
                    maxMana: mana,
                    initiative: init,
                    statuses: [],
                    inventory: []
                });
                break;
            }

            case 'UPDATE_ENTITY': {
                const target = room.entities.find(e => e.id === payload.id);
                if (target) {
                    if (payload.hp !== undefined) target.hp = Math.max(0, Math.min(target.maxHp, parseInt(payload.hp, 10)));
                    if (payload.mana !== undefined) target.mana = Math.max(0, Math.min(target.maxMana, parseInt(payload.mana, 10)));
                    if (payload.initiative !== undefined) target.initiative = parseInt(payload.initiative, 10) || 0;
                    if (payload.addStatus) target.statuses.push(payload.addStatus);
                    if (payload.removeStatus !== undefined && target.statuses[payload.removeStatus] !== undefined) {
                        target.statuses.splice(payload.removeStatus, 1);
                    }
                    if (payload.addItem) target.inventory.push(payload.addItem);
                    if (payload.removeItem !== undefined && target.inventory[payload.removeItem] !== undefined) {
                        target.inventory.splice(payload.removeItem, 1);
                    }
                }
                break;
            }

            case 'REMOVE_ENTITY':
                room.entities = room.entities.filter(e => e.id !== payload.id);
                if (room.turnIndex >= room.entities.length && room.entities.length > 0) {
                    room.turnIndex = 0;
                }
                break;

            case 'SORT_INITIATIVE':
                room.entities.sort((a, b) => b.initiative - a.initiative);
                room.turnIndex = 0;
                break;

            case 'NEXT_TURN':
                if (room.entities.length > 0) {
                    room.turnIndex = (room.turnIndex + 1) % room.entities.length;
                }
                break;

            case 'LOAD_SAVE':
                room.entities = Array.isArray(payload.entities) ? payload.entities : [];
                room.turnIndex = typeof payload.turnIndex === 'number' ? payload.turnIndex : 0;
                room.logs = Array.isArray(payload.logs) ? payload.logs : [];
                break;
        }

        io.to(code).emit('updateState', room);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`D&D Server running on port ${PORT}`));

