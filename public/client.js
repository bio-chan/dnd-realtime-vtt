const socket = io();
let currentRoom = '';
let myRole = '';
let myName = 'DM';
let gameState = { entities: [], logs: [], turnIndex: 0 };

function createRoom() {
    myName = 'Dungeon Master';
    socket.emit('createRoom', { playerName: myName });
}

function joinRoom() {
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
    document.getElementById('latest-roll').innerHTML = 
        `🎲 <strong>${log.roller}</strong> ทอย ${log.dice} (${log.raw} ${modText}) = <span style="color:#ffd600; font-size:24px;">${log.total}</span>`;
});

function roll(diceType) {
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
    if (!name || !hp) return alert('กรุณากรอกชื่อและ HP');
    dmAction('ADD_MONSTER', { name, hp, mana, initiative });

    document.getElementById('mon-name').value = '';
    document.getElementById('mon-hp').value = '';
    document.getElementById('mon-mana').value = '';
    document.getElementById('mon-init').value = '';
}

function renderState() {
    // อัปเดต Log ลูกเต๋า
    const logList = document.getElementById('dice-logs');
    const logs = gameState.logs || [];
    logList.innerHTML = logs.map(l => 
        `<li>[${l.time}] <b>${l.roller}</b> ทอย ${l.dice}: ได้ <b>${l.total}</b> (ลูกเต๋า: ${l.raw}, Mod: ${l.mod})</li>`
    ).join('');

    // อัปเดตการ์ดตัวละครและมอนสเตอร์
    const container = document.getElementById('entities-list');
    const entities = gameState.entities || [];

    if (entities.length === 0) {
        container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">ยังไม่มีตัวละครหรือมอนสเตอร์ในสนาม</div>';
        return;
    }

    container.innerHTML = entities.map((ent, idx) => {
        const isTurn = idx === gameState.turnIndex;
        const hpPct = ent.maxHp > 0 ? Math.max(0, Math.min(100, (ent.hp / ent.maxHp) * 100)) : 0;
        const manaPct = ent.maxMana > 0 ? Math.max(0, Math.min(100, (ent.mana / ent.maxMana) * 100)) : 0;

        let dmTools = '';
        if (myRole === 'DM') {
            dmTools = `
                <div style="margin-top:8px; border-top:1px solid #444; padding-top:6px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                    <span>HP:</span>
                    <button onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', hp:${ent.hp - 1}})">-1</button>
                    <button onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', hp:${ent.hp + 1}})">+1</button>
                    <span>Mana:</span>
                    <button onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', mana:${ent.mana - 1}})">-1</button>
                    <button onclick="dmAction('UPDATE_ENTITY', {id:'${ent.id}', mana:${ent.mana + 1}})">+1</button>
                    <button onclick="promptStatus('${ent.id}')">+สถานะ</button>
                    <button onclick="promptItem('${ent.id}')">+ไอเทม</button>
                    <button onclick="promptInit('${ent.id}', ${ent.initiative})">แก้ Init</button>
                    <button onclick="dmAction('REMOVE_ENTITY', {id:'${ent.id}'})" style="background:#b71c1c;color:white;">ลบ</button>
                </div>
            `;
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
            <div class="entity-card ${isTurn ? 'active-turn' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>${isTurn ? '▶️ ' : ''}${ent.name} (${ent.type})</strong>
                    <span>Init: <b>${ent.initiative}</b></span>
                </div>
                <div>HP: ${ent.hp} / ${ent.maxHp}</div>
                <div class="bar-bg"><div class="hp-fill" style="width:${hpPct}%"></div></div>
                <div>Mana: ${ent.mana} / ${ent.maxMana}</div>
                <div class="bar-bg"><div class="mana-fill" style="width:${manaPct}%"></div></div>
                <div>สถานะ: ${statusesHtml}</div>
                <div>กระเป๋า: ${itemsHtml}</div>
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
    // Reset file input so the same file can be reloaded if needed
    event.target.value = '';
}

