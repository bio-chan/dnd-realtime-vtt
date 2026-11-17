const socket = io();
let currentRoom = '';
let myRole = '';
let myName = 'DM';
let gameState = { entities: [], logs: [], turnIndex: 0 };
let soundEnabled = true;
let diceCloseTimeout = null;

// ========================================================
// 🔊 Web Audio API Sound Effects Synthesizer
// ========================================================
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('sound-btn');
    if (btn) {
        btn.innerText = soundEnabled ? '🔊 เสียง: เปิด' : '🔇 เสียง: ปิด';
    }
}

// เสียงลูกเต๋ากระทบโต๊ะ (Clatter & Roll)
function playDiceSound() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const clackTimes = [0, 0.12, 0.28, 0.48, 0.72, 0.98, 1.25];
        clackTimes.forEach((time, index) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            // ความถี่สุ่มเลียนแบบเนื้อลูกเต๋าและโต๊ะไม้
            const freq = 180 + Math.random() * 220;
            osc.type = index % 2 === 0 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
            osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + time + 0.08);

            const volume = (1 - (index / clackTimes.length) * 0.5) * 0.4;
            gain.gain.setValueAtTime(volume, ctx.currentTime + time);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + 0.08);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + time);
            osc.stop(ctx.currentTime + time + 0.09);
        });
    } catch (e) {
        console.warn('Audio play error:', e);
    }
}

// เสียง Critical Success (Nat 20 Fanfare)
function playNat20Sound() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const startTime = ctx.currentTime + (idx * 0.12);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0.35, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + 0.55);
        });
    } catch (e) {}
}

// เสียง Critical Fail (Nat 1 Thud)
function playNat1Sound() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);

        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
    } catch (e) {}
}


// ========================================================
// 🎲 3D Dice Animation Controller
// ========================================================
function show3DDiceRoll(log) {
    const overlay = document.getElementById('dice-overlay');
    const stage = document.querySelector('.dice-stage');
    const cube = document.getElementById('dice-cube');
    const title = document.getElementById('dice-roller-title');
    const calc = document.getElementById('dice-calc');
    const totalDisplay = document.getElementById('dice-total-display');
    const badge = document.getElementById('dice-special-badge');

    if (diceCloseTimeout) {
        clearTimeout(diceCloseTimeout);
    }

    // เซ็ตชื่อผู้ทอยและประเภทเต๋า
    title.innerText = `🎲 ${log.roller} ทอย ${log.dice}`;
    calc.innerText = `ลูกเต๋า: ${log.raw} | Modifier: ${log.mod >= 0 ? '+' + log.mod : log.mod}`;
    totalDisplay.innerText = log.total;

    // รีเซ็ตคลาสพิเศษ
    stage.classList.remove('nat20', 'nat1');
    badge.className = 'dice-special-badge';
    badge.innerText = '';

    if (log.isNat20) {
        stage.classList.add('nat20');
        badge.className = 'dice-special-badge nat20-text';
        badge.innerText = '✨ CRITICAL SUCCESS! (NATURAL 20) ✨';
    } else if (log.isNat1) {
        stage.classList.add('nat1');
        badge.className = 'dice-special-badge nat1-text';
        badge.innerText = '💀 CRITICAL FAIL! (NATURAL 1) 💀';
    }

    // เซ็ตตัวเลขบนหน้าลูกเต๋า 3D
    document.getElementById('face-front').innerText = log.raw;
    document.getElementById('face-back').innerText = Math.max(1, (log.diceSides || 20) - log.raw);
    document.getElementById('face-right').innerText = Math.floor(Math.random() * (log.diceSides || 20)) + 1;
    document.getElementById('face-left').innerText = Math.floor(Math.random() * (log.diceSides || 20)) + 1;
    document.getElementById('face-top').innerText = Math.floor(Math.random() * (log.diceSides || 20)) + 1;
    document.getElementById('face-bottom').innerText = Math.floor(Math.random() * (log.diceSides || 20)) + 1;

    // แสดง Overlay และเริ่มอนิเมชั่นหมุน 3D
    overlay.classList.remove('hidden');
    cube.classList.remove('rolling');
    // Force Reflow
    void cube.offsetWidth;
    cube.classList.add('rolling');

    // เล่นเสียงลูกเต๋าหมุน
    playDiceSound();

    // เล่นเสียง Fanfare เมื่อลูกเต๋าหยุดหมุน
    setTimeout(() => {
        if (log.isNat20) playNat20Sound();
        if (log.isNat1) playNat1Sound();
    }, 1250);

    // ปิดหน้าต่างอัตโนมัติหลังผ่านไป 4.2 วินาที
    diceCloseTimeout = setTimeout(() => {
        closeDiceOverlay();
    }, 4200);
}

function closeDiceOverlay() {
    if (diceCloseTimeout) clearTimeout(diceCloseTimeout);
    document.getElementById('dice-overlay').classList.add('hidden');
}


// ========================================================
// 🎮 Room & Socket.IO Logic
// ========================================================
function createRoom() {
    getAudioContext();
    myName = 'Dungeon Master';
    socket.emit('createRoom', { playerName: myName });
}

function joinRoom() {
    getAudioContext();
    const code = document.getElementById('join-code').value.trim();
    const name = document.getElementById('char-name').value.trim() || 'Player';
    const hp = document.getElementById('char-hp').value || 20;
    const mana = document.getElementById('char-mana').value || 10;

    if (!code) return alert('กรุณากรอกรหัสห้อง');
    myName = name;
    socket.emit('joinRoom', { roomCode: code, character: { name, hp, mana } });
}

socket.on('errorMsg', (msg) => alert(msg));

socket.on('roomJoined', ({ roomCode, role, state }) => {
    currentRoom = roomCode;
    myRole = role;
    gameState = state || { entities: [], logs: [], turnIndex: 0 };

    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('display-room-code').innerText = roomCode;
    document.getElementById('display-role').innerText = role;

    if (role === 'DM') {
        document.getElementById('dm-panel').classList.remove('hidden');
        document.getElementById('dm-combat-controls').classList.remove('hidden');
        document.getElementById('dm-save-controls').classList.remove('hidden');
    }
    renderState();
});

socket.on('updateState', (state) => {
    gameState = state || { entities: [], logs: [], turnIndex: 0 };
    renderState();
});

socket.on('diceRolled', (log) => {
    const modText = log.mod >= 0 ? `+${log.mod}` : log.mod;
    const critBonus = log.isNat20 ? ' ✨ <b style="color:#ffd700;">NAT 20!</b>' : (log.isNat1 ? ' 💀 <b style="color:#ff5252;">NAT 1!</b>' : '');
    document.getElementById('latest-roll').innerHTML = 
        `🎲 <strong>${log.roller}</strong> ทอย ${log.dice} (${log.raw} ${modText}) = <span style="color:#ffd600; font-size:24px;">${log.total}</span>${critBonus}`;

    // แสดง 3D Dice Animation และเล่นเสียง
    show3DDiceRoll(log);
});

function roll(diceType) {
    getAudioContext();
    const modifier = document.getElementById('dice-mod').value;
    socket.emit('rollDice', { roomCode: currentRoom, rollerName: myName, diceType, modifier });
}

function dmAction(action, payload = {}) {
    socket.emit('dmAction', { roomCode: currentRoom, action, payload });
}

function addMonster() {
    const name = document.getElementById('mon-name').value.trim();
    const hp = document.getElementById('mon-hp').value;
    const mana = document.getElementById('mon-mana').value;
    const initiative = document.getElementById('mon-init').value;
    const revealHp = document.getElementById('mon-reveal-hp').checked;

    if (!name || !hp) return alert('กรุณากรอกชื่อและ HP มอนสเตอร์');
    dmAction('ADD_MONSTER', { name, hp, mana, initiative, revealHp });

    document.getElementById('mon-name').value = '';
    document.getElementById('mon-hp').value = '';
    document.getElementById('mon-mana').value = '';
    document.getElementById('mon-init').value = '';
    document.getElementById('mon-reveal-hp').checked = false;
}

// ========================================================
// 🖥️ UI State Rendering (รวมระบบซ่อนเลือดมอนสเตอร์)
// ========================================================
function renderState() {
    // 1. อัปเดต Log ลูกเต๋า
    const logList = document.getElementById('dice-logs');
    const logs = gameState.logs || [];
    logList.innerHTML = logs.map(l => {
        const special = l.isNat20 ? ' <span style="color:#ffd700;">[NAT 20]</span>' : (l.isNat1 ? ' <span style="color:#ff5252;">[NAT 1]</span>' : '');
        return `<li><span>[${l.time}] <b>${l.roller}</b> ทอย ${l.dice}${special}</span> <b>= ${l.total}</b></li>`;
    }).join('');

    // 2. อัปเดตการ์ดตัวละครและมอนสเตอร์ในสนามรบ
    const container = document.getElementById('entities-list');
    const entities = gameState.entities || [];

    if (entities.length === 0) {
        container.innerHTML = '<div style="color: #777; text-align: center; padding: 25px;">ยังไม่มีตัวละครหรือมอนสเตอร์ในสนามรบ</div>';
        return;
    }

    container.innerHTML = entities.map((ent, idx) => {
        const isTurn = idx === gameState.turnIndex;
        const isMonster = ent.type === 'MONSTER';
        const hpPct = ent.maxHp > 0 ? Math.max(0, Math.min(100, (ent.hp / ent.maxHp) * 100)) : 0;
        const manaPct = ent.maxMana > 0 ? Math.max(0, Math.min(100, (ent.mana / ent.maxMana) * 100)) : 0;

        // ตรวจสอบสิทธิ์การมองเห็นเลือดของมอนสเตอร์:
        // ถ้าเป็น Monster และไม่ใช่ DM และ DM ยังไม่อนุญาต (revealHp = false) -> ซ่อนเลือด!
        const canSeeHp = (myRole === 'DM') || !isMonster || (isMonster && ent.revealHp);

        let hpDisplay = '';
        let hpBarHtml = '';

        if (canSeeHp) {
            hpDisplay = `HP: ${ent.hp} / ${ent.maxHp}`;
            hpBarHtml = `<div class="bar-bg"><div class="hp-fill" style="width:${hpPct}%"></div></div>`;
        } else {
            // โหมดซ่อนเลือดสำหรับผู้เล่นทั่วไป
            hpDisplay = `HP: ??? / ??? <span class="tag-hp-locked">🔒 เลือดถูกซ่อนโดย DM</span>`;
            hpBarHtml = `<div class="bar-bg"><div class="hp-hidden" title="DM ซ่อนเลือดมอนสเตอร์ตัวนี้"></div></div>`;
        }

        // แผงเครื่องมือสำหรับ DM
        let dmTools = '';
        if (myRole === 'DM') {
            const revealBtnText = ent.revealHp ? '🔒 ซ่อนเลือดจากผู้เล่น' : '👁️ อนุญาตให้ผู้เล่นเห็นเลือด';
            const revealBtnClass = ent.revealHp ? 'revealed' : '';
            const monsterRevealControl = isMonster ? `
                <button onclick="dmAction('TOGGLE_REVEAL_HP', {id:'${ent.id}'})" class="btn-toggle-reveal ${revealBtnClass}">${revealBtnText}</button>
            ` : '';

            dmTools = `
                <div style="margin-top:10px; border-top:1px solid #333346; padding-top:8px; display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
                    <span>HP:</span>
                    <button onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', hp:${ent.hp - 1}})">-1</button>
                    <button onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', hp:${ent.hp + 1}})">+1</button>
                    <button onclick="promptCustomHp('${ent.id}', ${ent.hp})">ตั้ง HP</button>
                    <span>Mana:</span>
                    <button onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', mana:${ent.mana - 1}})">-1</button>
                    <button onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', mana:${ent.mana + 1}})">+1</button>
                    <button onclick="promptStatus('${ent.id}')">+สถานะ</button>
                    <button onclick="promptItem('${ent.id}')">+ไอเทม</button>
                    <button onclick="promptInit('${ent.id}', ${ent.initiative})">แก้ Init</button>
                    ${monsterRevealControl}
                    <button onclick="dmAction('REMOVE_ENTITY', {id:'${ent.id}'})" style="background:#b71c1c; color:white;">ลบ</button>
                </div>
            `;
        }

        // ป้ายสถานะการเปิดเผยเลือด (สำหรับ DM ดู)
        let dmStatusBadge = '';
        if (myRole === 'DM' && isMonster) {
            dmStatusBadge = ent.revealHp 
                ? '<span class="tag-hp-revealed" title="ผู้เล่นมองเห็นเลือดมอนตัวนี้">👁️ ผู้เล่นมองเห็นเลือด</span>' 
                : '<span class="tag-hp-locked" title="ผู้เล่นไม่เห็นเลือดมอนตัวนี้">🔒 ผู้เล่นไม่เห็นเลือด</span>';
        }

        const statusesHtml = (ent.statuses && ent.statuses.length > 0)
            ? ent.statuses.map((s, sIdx) => myRole === 'DM' 
                ? `<span class="tag removable" title="คลิกเพื่อลบ" onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', removeStatus:${sIdx}})">${s} ×</span>` 
                : `<span class="tag">${s}</span>`).join('')
            : '-';

        const itemsHtml = (ent.inventory && ent.inventory.length > 0)
            ? ent.inventory.map((i, iIdx) => myRole === 'DM' 
                ? `<span class="tag removable" title="คลิกเพื่อลบ" onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', removeItem:${iIdx}})">🎒 ${i} ×</span>` 
                : `<span class="tag">🎒 ${i}</span>`).join('')
            : '-';

        return `
            <div class="entity-card ${isMonster ? 'monster' : ''} ${isTurn ? 'active-turn' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${isTurn ? '▶️ ' : ''}${ent.name}</strong> 
                        <span style="font-size:12px; color:#aaa;">(${ent.type})</span>
                        ${dmStatusBadge}
                    </div>
                    <span>Init: <b>${ent.initiative}</b></span>
                </div>
                <div style="margin-top:6px;">${hpDisplay}</div>
                ${hpBarHtml}
                <div>Mana: ${ent.mana} / ${ent.maxMana}</div>
                <div class="bar-bg"><div class="mana-fill" style="width:${manaPct}%"></div></div>
                <div style="font-size:13px; margin-top:4px;">สถานะ: ${statusesHtml}</div>
                <div style="font-size:13px;">กระเป๋า: ${itemsHtml}</div>
                ${dmTools}
            </div>
        `;
    }).join('');
}

function promptStatus(id) {
    const st = prompt('ใส่ชื่อสถานะ (เช่น ติดพิษ, มึนงง, บัฟโจมตี):');
    if (st && st.trim()) dmAction('UPDATE_ENTITY', { id, addStatus: st.trim() });
}

function promptItem(id) {
    const item = prompt('ใส่ชื่อไอเทมที่ต้องการเพิ่ม:');
    if (item && item.trim()) dmAction('UPDATE_ENTITY', { id, addItem: item.trim() });
}

function promptInit(id, current) {
    const init = prompt('ระบุค่า Initiative ใหม่:', current);
    if (init !== null && init !== '') {
        const parsed = parseInt(init, 10);
        if (!isNaN(parsed)) {
            dmAction('UPDATE_ENTITY', { id, initiative: parsed });
        }
    }
}

function promptCustomHp(id, current) {
    const hp = prompt('ระบุค่า HP ใหม่:', current);
    if (hp !== null && hp !== '') {
        const parsed = parseInt(hp, 10);
        if (!isNaN(parsed)) {
            dmAction('UPDATE_ENTITY', { id, hp: parsed });
        }
    }
}

// ระบบ Save & Load ไฟล์ JSON
function exportSave() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `dnd-save-${currentRoom || 'session'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importSave(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loadedState = JSON.parse(e.target.result);
            dmAction('LOAD_SAVE', loadedState);
        } catch (err) {
            alert('รูปแบบไฟล์ JSON ไม่ถูกต้อง');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
