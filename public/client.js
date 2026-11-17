const socket = io();
let currentRoom = '', myRole = '', myUsername = '', gameState = { entities: [], logs: [], turnIndex: 0, events: [], combatStarted: false };
let soundEnabled = true, diceCloseTimer = null, charInventory = [];
let audioCtx = null;

// ========== AUDIO ==========
function getAudio() { if (!audioCtx) { const C = window.AudioContext || window.webkitAudioContext; if (C) audioCtx = new C(); } if (audioCtx?.state === 'suspended') audioCtx.resume(); return audioCtx; }
function toggleSound() { soundEnabled = !soundEnabled; document.getElementById('sound-btn').innerText = soundEnabled ? 'Sound: ON' : 'Sound: OFF'; }
function playDiceSound() { if (!soundEnabled) return; try { const c = getAudio(); if (!c) return; [0,.12,.28,.48,.72,.98].forEach((t,i) => { const o = c.createOscillator(), g = c.createGain(); o.type = i%2?'sine':'triangle'; o.frequency.setValueAtTime(180+Math.random()*220, c.currentTime+t); o.frequency.exponentialRampToValueAtTime(60, c.currentTime+t+.08); g.gain.setValueAtTime((1-i/6*.5)*.4, c.currentTime+t); g.gain.exponentialRampToValueAtTime(.001, c.currentTime+t+.08); o.connect(g); g.connect(c.destination); o.start(c.currentTime+t); o.stop(c.currentTime+t+.09); }); } catch(e){} }
function playNat20() { if (!soundEnabled) return; try { const c = getAudio(); if (!c) return; [523.25,659.25,783.99,1046.5].forEach((f,i) => { const o = c.createOscillator(), g = c.createGain(), t = c.currentTime+i*.12; o.type='triangle'; o.frequency.setValueAtTime(f,t); g.gain.setValueAtTime(.35,t); g.gain.exponentialRampToValueAtTime(.001,t+.5); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+.55); }); } catch(e){} }
function playNat1() { if (!soundEnabled) return; try { const c = getAudio(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(110,c.currentTime); o.frequency.exponentialRampToValueAtTime(40,c.currentTime+.4); g.gain.setValueAtTime(.5,c.currentTime); g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.4); o.connect(g); g.connect(c.destination); o.start(c.currentTime); o.stop(c.currentTime+.45); } catch(e){} }

// ========== AUTH ==========
function switchAuthTab(tab) {
    document.getElementById('auth-login').classList.toggle('hidden', tab !== 'login');
    document.getElementById('auth-register').classList.toggle('hidden', tab !== 'register');
    document.querySelectorAll('.auth-tab').forEach((el, i) => el.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register')));
    document.getElementById('auth-error').classList.add('hidden');
}
function showError(msg) { const e = document.getElementById('auth-error'); e.textContent = msg; e.classList.remove('hidden'); }
function doLogin() {
    const u = document.getElementById('login-user').value.trim(), p = document.getElementById('login-pass').value.trim();
    if (!u || !p) return showError('กรุณากรอกชื่อและรหัสผ่าน');
    socket.emit('login', { username: u, password: p }, (res) => {
        if (res.error) return showError(res.error);
        myUsername = res.username;
        loadCharToEditor(res.character);
        gotoScreen('charsheet-screen');
    });
}
function doRegister() {
    const u = document.getElementById('reg-user').value.trim(), p = document.getElementById('reg-pass').value.trim();
    if (!u || !p) return showError('กรุณากรอกชื่อและรหัสผ่าน');
    socket.emit('register', { username: u, password: p }, (res) => {
        if (res.error) return showError(res.error);
        myUsername = res.username;
        loadCharToEditor(res.character);
        gotoScreen('charsheet-screen');
    });
}

// ========== SCREENS ==========
function gotoScreen(id) {
    ['auth-screen','charsheet-screen','lobby-screen','game-screen'].forEach(s => document.getElementById(s).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    if (id === 'lobby-screen') document.getElementById('lobby-username').textContent = myUsername;
}

// ========== CHARACTER SHEET EDITOR ==========
function calcMod(score) { return Math.floor((score - 10) / 2); }
function fmtMod(v) { return v >= 0 ? '+' + v : '' + v; }
function updateMod(el) {
    const stat = el.id.replace('cs-', '').toUpperCase();
    const v = parseInt(el.value) || 10;
    document.getElementById('mod-' + stat.toLowerCase()).textContent = fmtMod(calcMod(v));
}
function loadCharToEditor(c) {
    document.getElementById('cs-name').value = c.name || '';
    document.getElementById('cs-race').value = c.race || '';
    document.getElementById('cs-class').value = c.charClass || '';
    document.getElementById('cs-height').value = c.height || '';
    document.getElementById('cs-skills').value = c.skills || '';
    document.getElementById('cs-ultimate').value = c.ultimate || '';
    document.getElementById('cs-background').value = c.background || '';
    document.getElementById('cs-pros').value = c.pros || '';
    document.getElementById('cs-cons').value = c.cons || '';
    document.getElementById('cs-weapon').value = c.weapon || '';
    document.getElementById('cs-armor').value = c.armor || '';
    document.getElementById('cs-hp').value = c.hp || 20;
    document.getElementById('cs-sp').value = c.sp || 10;
    if (document.getElementById('cs-ac')) document.getElementById('cs-ac').value = c.ac || 10;
    if (document.getElementById('cs-speed')) document.getElementById('cs-speed').value = c.speed || '30ft';
    if (c.stats) {
        ['str','dex','con','int','wis','cha'].forEach(s => {
            const el = document.getElementById('cs-' + s);
            el.value = c.stats[s.toUpperCase()] || 10;
            updateMod(el);
        });
    }
    const img = document.getElementById('portrait-preview');
    const ph = document.getElementById('portrait-placeholder');
    if (c.portrait) {
        img.src = c.portrait;
        img.classList.remove('hidden');
        ph.classList.add('hidden');
    } else {
        img.src = '';
        img.classList.add('hidden');
        ph.classList.remove('hidden');
    }
    charInventory = c.inventory ? [...c.inventory] : [];
    renderInvEditor();
}
function getCharFromEditor() {
    const pImg = document.getElementById('portrait-preview');
    const portrait = (!pImg.classList.contains('hidden') && pImg.getAttribute('src')) ? pImg.src : '';
    return {
        name: document.getElementById('cs-name').value.trim(),
        race: document.getElementById('cs-race').value.trim(),
        charClass: document.getElementById('cs-class').value.trim(),
        height: document.getElementById('cs-height').value.trim(),
        portrait,
        skills: document.getElementById('cs-skills').value.trim(),
        ultimate: document.getElementById('cs-ultimate').value.trim(),
        background: document.getElementById('cs-background').value.trim(),
        pros: document.getElementById('cs-pros').value.trim(),
        cons: document.getElementById('cs-cons').value.trim(),
        weapon: document.getElementById('cs-weapon').value.trim(),
        armor: document.getElementById('cs-armor').value.trim(),
        hp: parseInt(document.getElementById('cs-hp').value) || 20,
        sp: parseInt(document.getElementById('cs-sp').value) || 10,
        ac: parseInt(document.getElementById('cs-ac')?.value) || 10,
        speed: document.getElementById('cs-speed')?.value.trim() || '30ft',
        stats: {
            STR: parseInt(document.getElementById('cs-str').value) || 10,
            DEX: parseInt(document.getElementById('cs-dex').value) || 10,
            CON: parseInt(document.getElementById('cs-con').value) || 10,
            INT: parseInt(document.getElementById('cs-int').value) || 10,
            WIS: parseInt(document.getElementById('cs-wis').value) || 10,
            CHA: parseInt(document.getElementById('cs-cha').value) || 10
        },
        inventory: charInventory
    };
}
function handlePortrait(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const max = 200; let w = img.width, h = img.height;
            if (w > h) { if (w > max) { h *= max / w; w = max; } } else { if (h > max) { w *= max / h; h = max; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
            const preview = document.getElementById('portrait-preview');
            preview.src = dataUrl; preview.classList.remove('hidden');
            document.getElementById('portrait-placeholder').classList.add('hidden');
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}
function renderInvEditor() {
    const el = document.getElementById('cs-inventory-list');
    el.innerHTML = charInventory.map((it, i) => `<div class="inv-item"><span>${it.name} x${it.qty}</span><button class="btn-metal btn-small" onclick="removeInvItem(${i})">X</button></div>`).join('');
}
function addInvItem() {
    const name = document.getElementById('inv-add-name').value.trim();
    const qty = parseInt(document.getElementById('inv-add-qty').value) || 1;
    if (!name) return;
    charInventory.push({ name, qty });
    document.getElementById('inv-add-name').value = '';
    document.getElementById('inv-add-qty').value = '1';
    renderInvEditor();
}
function removeInvItem(i) { charInventory.splice(i, 1); renderInvEditor(); }
function saveCharAndGoLobby() {
    const data = getCharFromEditor();
    socket.emit('saveCharacter', data, (res) => {
        if (res?.error) return alert(res.error);
        gotoScreen('lobby-screen');
    });
}
function showCharSheet() { gotoScreen('charsheet-screen'); }

// ========== ROOM ==========
function createRoom() { getAudio(); socket.emit('createRoom'); }
function joinRoom() { getAudio(); const code = document.getElementById('join-code').value.trim(); if (!code) return alert('กรุณากรอกรหัสห้อง'); socket.emit('joinRoom', { roomCode: code }); }
socket.on('errorMsg', msg => alert(msg));
socket.on('roomJoined', ({ roomCode, role, state, username }) => {
    currentRoom = roomCode; myRole = role; myUsername = username;
    gameState = state || { entities: [], logs: [], turnIndex: 0, events: [], combatStarted: false };
    gotoScreen('game-screen');
    document.getElementById('display-room-code').innerText = roomCode;
    document.getElementById('display-role').innerText = role;
    if (role === 'DM') {
        document.getElementById('dm-panel').classList.remove('hidden');
        document.getElementById('dm-combat-controls').classList.remove('hidden');
        document.getElementById('dm-save-controls').classList.remove('hidden');
        document.getElementById('dm-screen-btn').classList.remove('hidden');
    }
    renderState();
});
socket.on('updateState', state => { gameState = state; renderState(); });

// ========== DICE & D&D MECHANICS ==========
let currentRollMode = 'NORMAL';
function setRollMode(mode) {
    currentRollMode = mode;
    ['mode-normal','mode-adv','mode-disadv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    if (mode === 'NORMAL') document.getElementById('mode-normal')?.classList.add('active');
    if (mode === 'ADVANTAGE') document.getElementById('mode-adv')?.classList.add('active');
    if (mode === 'DISADVANTAGE') document.getElementById('mode-disadv')?.classList.add('active');
}

function quickCheck(reason, mod = 0) {
    document.getElementById('dice-reason').value = reason;
    document.getElementById('dice-mod').value = mod;
    roll(20);
}

function quickStatCheck(stat) {
    const el = document.getElementById('cs-' + stat.toLowerCase());
    const score = el ? (parseInt(el.value) || 10) : 10;
    const mod = calcMod(score);
    quickCheck(stat + ' Check (' + fmtMod(mod) + ')', mod);
}

function roll(diceType) {
    getAudio();
    const modifier = document.getElementById('dice-mod').value;
    const rollReason = document.getElementById('dice-reason')?.value.trim() || '';
    socket.emit('rollDice', {
        roomCode: currentRoom,
        diceType,
        modifier,
        rollMode: currentRollMode,
        rollReason
    });
}

socket.on('diceRolled', log => {
    const modText = log.mod >= 0 ? '+' + log.mod : log.mod;
    const evtTag = log.eventName ? `<div style="font-size:11px;color:var(--mana-b);font-family:var(--fh);margin-top:2px;">[${log.eventName}]</div>` : '';
    const critTag = log.isNat20 ? ' <b style="color:var(--gold-b);">[NATURAL 20]</b>' : (log.isNat1 ? ' <b style="color:#ff5252;">[NATURAL 1]</b>' : '');
    const reasonTag = log.rollReason ? `<div style="font-size:12px;color:var(--gold-l);font-family:var(--fh);">${log.rollReason}</div>` : '';
    const modeTag = log.rollMode === 'ADVANTAGE' ? ' <span style="color:#a5d6a7;font-size:11px;">(Advantage)</span>' : (log.rollMode === 'DISADVANTAGE' ? ' <span style="color:#ff8a80;font-size:11px;">(Disadvantage)</span>' : '');

    document.getElementById('latest-roll').innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;width:100%;">
            <div style="font-family:var(--fh);color:var(--gold);font-size:13px;letter-spacing:1px;">${log.roller} -- ${log.dice}${modeTag}</div>
            ${reasonTag}
            <div style="font-family:var(--fm);font-size:30px;font-weight:900;color:var(--gold-b);text-shadow:0 0 15px rgba(255,215,0,.6);">${log.total}</div>
            <div style="font-size:12px;color:#aaa;font-family:var(--fm);">(${log.raw} ${modText})${critTag}</div>
            ${evtTag}
        </div>`;
    show3DDice(log);
});

function show3DDice(log) {
    const overlay = document.getElementById('dice-overlay'), stage = document.querySelector('.dice-stage'), cube = document.getElementById('dice-cube');
    if (diceCloseTimer) clearTimeout(diceCloseTimer);
    const modeDesc = log.rollMode === 'ADVANTAGE' ? ` [Adv: ${log.r1}, ${log.r2}]` : (log.rollMode === 'DISADVANTAGE' ? ` [Disadv: ${log.r1}, ${log.r2}]` : '');
    document.getElementById('dice-roller-title').innerText = `${log.roller} -- ${log.dice}${modeDesc}`;
    document.getElementById('dice-calc').innerText = `${log.rollReason ? log.rollReason + ' | ' : ''}Roll: ${log.raw} | Mod: ${log.mod >= 0 ? '+' + log.mod : log.mod}`;
    document.getElementById('dice-total-display').innerText = log.total;
    stage.classList.remove('nat20', 'nat1');
    const badge = document.getElementById('dice-special-badge'); badge.className = 'dice-special-badge'; badge.innerText = '';
    if (log.isNat20) { stage.classList.add('nat20'); badge.className = 'dice-special-badge nat20-text'; badge.innerText = 'CRITICAL SUCCESS! (NATURAL 20)'; }
    else if (log.isNat1) { stage.classList.add('nat1'); badge.className = 'dice-special-badge nat1-text'; badge.innerText = 'CRITICAL FAIL! (NATURAL 1)'; }
    const s = log.diceSides || 20;
    document.getElementById('face-front').innerText = log.raw;
    ['face-back','face-right','face-left','face-top','face-bottom'].forEach(id => document.getElementById(id).innerText = Math.floor(Math.random() * s) + 1);
    overlay.classList.remove('hidden'); cube.classList.remove('rolling'); void cube.offsetWidth; cube.classList.add('rolling');
    playDiceSound();
    setTimeout(() => { if (log.isNat20) playNat20(); if (log.isNat1) playNat1(); }, 1250);
    diceCloseTimer = setTimeout(closeDiceOverlay, 4200);
}
function closeDiceOverlay() { if (diceCloseTimer) clearTimeout(diceCloseTimer); document.getElementById('dice-overlay').classList.add('hidden'); }

// ========== EVENTS ==========
function createEvent() {
    const name = document.getElementById('evt-name').value.trim(), desc = document.getElementById('evt-desc').value.trim();
    if (!name) return alert('กรุณากรอกชื่อ Event');
    socket.emit('createEvent', { roomCode: currentRoom, name, description: desc });
    document.getElementById('evt-name').value = ''; document.getElementById('evt-desc').value = '';
}
socket.on('eventCreated', evt => {});

// ========== DM ACTIONS ==========
function dmAction(action, payload = {}) { socket.emit('dmAction', { roomCode: currentRoom, action, payload }); }
function addMonster() {
    const name = document.getElementById('mon-name').value.trim();
    const hp = document.getElementById('mon-hp').value;
    const sp = document.getElementById('mon-sp').value;
    const ac = document.getElementById('mon-ac')?.value || 10;
    const init = document.getElementById('mon-init').value;
    if (!name || !hp) return alert('กรุณากรอกชื่อและ HP');
    dmAction('ADD_MONSTER', { name, hp, sp, ac, initiative: init });
    document.getElementById('mon-name').value = '';
    document.getElementById('mon-hp').value = '';
    document.getElementById('mon-sp').value = '';
    document.getElementById('mon-ac').value = '12';
    document.getElementById('mon-init').value = '';
}

// ========== RENDER ==========
function renderState() {
    const logs = gameState.logs || [], entities = gameState.entities || [], events = gameState.events || [];
    const isDM = myRole === 'DM';
    const hasActiveEvent = events.some(e => e.active);
    const isMyTurn = gameState.combatStarted && entities[gameState.turnIndex]?.username === myUsername;

    // Combat indicator
    document.getElementById('combat-indicator').classList.toggle('hidden', !gameState.combatStarted);

    // Dice lock banner
    const lockBanner = document.getElementById('dice-lock-banner');
    const diceButtons = document.querySelectorAll('.die-btn');
    let locked = false;
    if (!isDM && gameState.combatStarted && !hasActiveEvent && !isMyTurn) {
        locked = true;
        lockBanner.classList.remove('hidden');
        lockBanner.textContent = `ยังไม่ถึงตาของคุณ (ตาปัจจุบัน: ${entities[gameState.turnIndex]?.name || '---'})`;
    } else { lockBanner.classList.add('hidden'); }
    diceButtons.forEach(b => b.disabled = locked);

    // Event banner
    const evtBanner = document.getElementById('event-banner');
    const activeEvt = events.find(e => e.active);
    if (activeEvt) {
        evtBanner.classList.remove('hidden');
        let closeBtn = isDM ? `<div class="evt-close"><button class="btn-metal btn-small" onclick="closeActiveEvent('${activeEvt.id}')">Close Event</button></div>` : '';
        evtBanner.innerHTML = `<div class="evt-name">[EVENT] ${activeEvt.name}</div><div class="evt-desc">${activeEvt.description}</div>${closeBtn}`;
    } else { evtBanner.classList.add('hidden'); }

    // Logs
    document.getElementById('dice-logs').innerHTML = logs.map(l => {
        const special = l.isNat20 ? ' <span style="color:var(--gold-b);">[20]</span>' : (l.isNat1 ? ' <span style="color:#ff5252;">[1]</span>' : '');
        const evtTag = l.eventName ? ` <span style="color:var(--mana-b);font-size:10px;">[${l.eventName}]</span>` : '';
        return `<li><span>[${l.time}] <b>${l.roller}</b> ${l.dice}${special}${evtTag}</span><b>= ${l.total}</b></li>`;
    }).join('');

    // Entities
    const container = document.getElementById('entities-list');
    if (entities.length === 0) { container.innerHTML = '<div style="color:#666;text-align:center;padding:30px;font-style:italic;">สนามรบว่างเปล่า</div>'; return; }

    container.innerHTML = entities.map((ent, idx) => {
        const isTurn = idx === gameState.turnIndex && gameState.combatStarted;
        const isMonster = ent.type === 'MONSTER';
        const hpPct = ent.maxHp > 0 ? Math.max(0, Math.min(100, (ent.hp / ent.maxHp) * 100)) : 0;
        const spPct = ent.maxSp > 0 ? Math.max(0, Math.min(100, (ent.sp / ent.maxSp) * 100)) : 0;
        const canSeeHp = isDM || !isMonster || (isMonster && ent.revealHp);

        let hpHtml = canSeeHp
            ? `<div class="bar-label"><span style="color:#ff8a80;">HP</span><span>${ent.hp}/${ent.maxHp}</span></div><div class="bar-bg"><div class="hp-fill" style="width:${hpPct}%"></div></div>`
            : `<div class="bar-label"><span style="color:#ff8a80;">HP</span><span>???/???</span></div><div class="bar-bg"><div class="hp-hidden"></div></div>`;

        let spHtml = `<div class="bar-label"><span style="color:#90caf9;">SP</span><span>${canSeeHp ? ent.sp+'/'+ent.maxSp : '???/???'}</span></div><div class="bar-bg"><div class="${canSeeHp?'sp-fill':'hp-hidden'}" style="width:${canSeeHp?spPct:100}%"></div></div>`;

        const acVal = ent.ac || 10;
        const acBadge = `<span class="ac-badge" title="Armor Class">AC ${acVal}</span>`;

        let deathSavesHtml = '';
        if (ent.hp <= 0 && ent.type === 'PLAYER') {
            const ds = ent.deathSaves || { successes: 0, failures: 0 };
            const dsControls = (isDM || ent.username === myUsername) ? `
                <div style="margin-top:4px;display:flex;gap:4px;">
                    <button class="btn-metal btn-small" onclick="event.stopPropagation();updateDeathSave('${ent.id}', true)">+Succ</button>
                    <button class="btn-danger btn-small" onclick="event.stopPropagation();updateDeathSave('${ent.id}', false)">+Fail</button>
                    <button class="btn-metal btn-small" onclick="event.stopPropagation();resetDeathSave('${ent.id}')">Reset</button>
                </div>
            ` : '';
            deathSavesHtml = `
                <div class="death-saves-box" onclick="event.stopPropagation()">
                    <span style="font-size:11px;color:#ff8a80;font-weight:700;">Death Saves:</span>
                    <span style="color:#a5d6a7;font-weight:700;">Success: ${ds.successes||0}/3</span> |
                    <span style="color:#ff5252;font-weight:700;">Fail: ${ds.failures||0}/3</span>
                    ${dsControls}
                </div>
            `;
        }

        let dmTools = '';
        if (isDM) {
            const revealBtn = isMonster ? `<button onclick="event.stopPropagation();dmAction('TOGGLE_REVEAL_HP',{id:'${ent.id}'})" class="btn-toggle-reveal ${ent.revealHp?'revealed':''}">${ent.revealHp?'Hide HP':'Reveal HP'}</button>` : '';
            const statusBadge = isMonster ? (ent.revealHp ? '<span class="tag-revealed">Visible</span>' : '<span class="tag-locked">Hidden</span>') : '';
            dmTools = `
                <div class="dm-card-tools" onclick="event.stopPropagation()">
                    <span>HP:</span>
                    <button onclick="dmAction('UPDATE_ENTITY',{id:'${ent.id}',hp:${ent.hp-1}})">-1</button>
                    <button onclick="dmAction('UPDATE_ENTITY',{id:'${ent.id}',hp:${ent.hp+1}})">+1</button>
                    <span style="margin-left:4px;">SP:</span>
                    <button onclick="dmAction('UPDATE_ENTITY',{id:'${ent.id}',sp:${ent.sp-1}})">-1</button>
                    <button onclick="dmAction('UPDATE_ENTITY',{id:'${ent.id}',sp:${ent.sp+1}})">+1</button>
                    <button onclick="promptInit('${ent.id}',${ent.initiative})">Init</button>
                    <select class="btn-metal btn-small" onchange="event.stopPropagation();if(this.value){dmAction('UPDATE_ENTITY',{id:'${ent.id}',addStatus:this.value});this.value='';}">
                        <option value="">+Condition</option>
                        <option value="Blinded">Blinded</option>
                        <option value="Charmed">Charmed</option>
                        <option value="Deafened">Deafened</option>
                        <option value="Frightened">Frightened</option>
                        <option value="Grappled">Grappled</option>
                        <option value="Incapacitated">Incapacitated</option>
                        <option value="Invisible">Invisible</option>
                        <option value="Paralyzed">Paralyzed</option>
                        <option value="Petrified">Petrified</option>
                        <option value="Poisoned">Poisoned</option>
                        <option value="Prone">Prone</option>
                        <option value="Restrained">Restrained</option>
                        <option value="Stunned">Stunned</option>
                        <option value="Unconscious">Unconscious</option>
                        <option value="Exhaustion">Exhaustion</option>
                    </select>
                    <button onclick="promptStatus('${ent.id}')">+Custom</button>
                    ${revealBtn}
                    <button class="btn-danger btn-small" onclick="dmAction('REMOVE_ENTITY',{id:'${ent.id}'})">Remove</button>
                    ${statusBadge}
                </div>`;
        }

        const statusTags = (ent.statuses?.length > 0)
            ? ent.statuses.map((s, si) => isDM ? `<span class="tag removable" onclick="event.stopPropagation();dmAction('UPDATE_ENTITY',{id:'${ent.id}',removeStatus:${si}})">${s} x</span>` : `<span class="tag">${s}</span>`).join('')
            : '<span style="color:#555;">-</span>';

        const clickView = ent.username ? `onclick="viewCharSheet('${ent.username}')"` : '';

        return `
            <div class="entity-card ${isMonster?'monster':''} ${isTurn?'active-turn':''}" ${clickView}>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <div>${isTurn?'<span class="turn-badge">TURN</span>':''}<strong style="font-family:var(--fh);font-size:15px;color:#fff;">${ent.name}</strong> <span style="font-size:11px;color:var(--gold);font-family:var(--fh);">${ent.type}</span></div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        ${acBadge}
                        <span class="init-badge" title="Initiative">${ent.initiative}</span>
                    </div>
                </div>
                ${hpHtml}${spHtml}
                ${deathSavesHtml}
                <div style="font-size:12px;margin-top:4px;color:#bbb;">Status: ${statusTags}</div>
                ${dmTools}
            </div>`;
    }).join('');
}

function updateDeathSave(id, isSuccess) {
    const ent = gameState.entities.find(e => e.id === id);
    if (!ent) return;
    const ds = ent.deathSaves || { successes: 0, failures: 0 };
    if (isSuccess) ds.successes = Math.min(3, (ds.successes || 0) + 1);
    else ds.failures = Math.min(3, (ds.failures || 0) + 1);
    dmAction('UPDATE_ENTITY', { id, deathSaves: ds });
}
function resetDeathSave(id) {
    dmAction('UPDATE_ENTITY', { id, deathSaves: { successes: 0, failures: 0 } });
}

function promptStatus(id) { const s = prompt('ชื่อสถานะ:'); if (s?.trim()) dmAction('UPDATE_ENTITY', { id, addStatus: s.trim() }); }
function promptInit(id, cur) { const v = prompt('Initiative:', cur); if (v !== null && v !== '') { const n = parseInt(v); if (!isNaN(n)) dmAction('UPDATE_ENTITY', { id, initiative: n }); } }
function closeActiveEvent(eventId) { socket.emit('closeEvent', { roomCode: currentRoom, eventId }); }

// ========== DM SCREEN OVERVIEW ==========
function openDmScreen() {
    socket.emit('getPartyOverview', { roomCode: currentRoom }, res => {
        if (res.error) return alert(res.error);
        renderDmScreen(res.party, res.entities);
    });
}

function closeDmScreen() {
    document.getElementById('dmscreen-modal').classList.add('hidden');
}

function renderDmScreen(party, entities) {
    const body = document.getElementById('dmscreen-body');
    const playerEntities = entities.filter(e => e.type === 'PLAYER');
    const monsterEntities = entities.filter(e => e.type === 'MONSTER');

    let html = `
        <div class="dmscreen-section-title">PARTY MEMBERS (${playerEntities.length})</div>
        <div class="dmscreen-table-wrap">
            <table class="dmscreen-table">
                <thead>
                    <tr>
                        <th>ตัวละคร</th>
                        <th>ผู้เล่น</th>
                        <th>HP</th>
                        <th>SP</th>
                        <th>AC</th>
                        <th>Passive Perc.</th>
                        <th>STR</th>
                        <th>DEX</th>
                        <th>CON</th>
                        <th>INT</th>
                        <th>WIS</th>
                        <th>CHA</th>
                        <th>อาวุธ / เกราะ</th>
                        <th>จัดการ</th>
                    </tr>
                </thead>
                <tbody>
    `;

    playerEntities.forEach(ent => {
        const ch = party[ent.username] || {};
        const st = ch.stats || {};
        const wis = st.WIS || 10;
        const passPerc = 10 + calcMod(wis);
        const hpColor = (ent.hp <= 0) ? '#ff5252' : ((ent.hp <= ent.maxHp * 0.5) ? '#ffa726' : '#a5d6a7');

        html += `
            <tr>
                <td><strong>${ent.name}</strong><br><span style="font-size:11px;color:var(--txt2);">${ch.race||'-'} ${ch.charClass||'-'}</span></td>
                <td><span class="tag">${ent.username}</span></td>
                <td><b style="color:${hpColor}">${ent.hp}/${ent.maxHp}</b></td>
                <td><b style="color:var(--mana-b)">${ent.sp}/${ent.maxSp}</b></td>
                <td><span class="ac-badge">${ent.ac || ch.ac || 10}</span></td>
                <td style="text-align:center;"><b>${passPerc}</b></td>
                <td>${st.STR||10} (${fmtMod(calcMod(st.STR||10))})</td>
                <td>${st.DEX||10} (${fmtMod(calcMod(st.DEX||10))})</td>
                <td>${st.CON||10} (${fmtMod(calcMod(st.CON||10))})</td>
                <td>${st.INT||10} (${fmtMod(calcMod(st.INT||10))})</td>
                <td>${st.WIS||10} (${fmtMod(calcMod(st.WIS||10))})</td>
                <td>${st.CHA||10} (${fmtMod(calcMod(st.CHA||10))})</td>
                <td style="font-size:11px;">${ch.weapon||'-'} / ${ch.armor||'-'}</td>
                <td>
                    <button class="btn-metal btn-small" onclick="viewCharSheet('${ent.username}')">ดู/แก้ไข</button>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    if (monsterEntities.length > 0) {
        html += `
            <div class="dmscreen-section-title" style="margin-top:16px;">MONSTERS & NPCS (${monsterEntities.length})</div>
            <div class="dmscreen-table-wrap">
                <table class="dmscreen-table">
                    <thead>
                        <tr>
                            <th>ชื่อมอนสเตอร์</th>
                            <th>HP จริง (DM View)</th>
                            <th>SP</th>
                            <th>AC</th>
                            <th>Initiative</th>
                            <th>สถานะการเปิดเผย HP</th>
                            <th>จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        monsterEntities.forEach(m => {
            html += `
                <tr>
                    <td><strong>${m.name}</strong></td>
                    <td><b style="color:#ff8a80;">${m.hp}/${m.maxHp}</b></td>
                    <td><b style="color:#90caf9;">${m.sp}/${m.maxSp}</b></td>
                    <td><span class="ac-badge">${m.ac || 10}</span></td>
                    <td>${m.initiative}</td>
                    <td>${m.revealHp ? '<span class="tag-revealed">ผู้เล่นมองเห็น</span>' : '<span class="tag-locked">ผู้เล่นมองไม่เห็น (???)</span>'}</td>
                    <td>
                        <button class="btn-metal btn-small" onclick="dmAction('TOGGLE_REVEAL_HP',{id:'${m.id}'})">${m.revealHp?'ซ่อน HP':'เปิดเผย HP'}</button>
                    </td>
                </tr>
            `;
        });
        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    body.innerHTML = html;
    document.getElementById('dmscreen-modal').classList.remove('hidden');
}

// ========== CHARACTER VIEW & EDIT MODAL ==========
let viewingCharData = null;

function viewCharSheet(username) {
    if (!username) return;
    socket.emit('getCharacterSheet', { username }, res => {
        if (res.error) return alert(res.error);
        viewingCharData = { character: JSON.parse(JSON.stringify(res.character)), username };
        renderCharModalView();
    });
}

function renderCharModalView() {
    if (!viewingCharData) return;
    const { character: c, username } = viewingCharData;
    const isOwner = username === myUsername;
    const canEdit = myRole === 'DM' || isOwner;
    const portraitHtml = c.portrait ? `<img src="${c.portrait}" class="cv-portrait">` : `<div class="cv-portrait-ph">No Portrait</div>`;
    const mod = s => { const v = calcMod(s); return fmtMod(v); };
    const st = c.stats || {};
    const invHtml = (c.inventory || []).map(it => `<div class="cv-inv-item"><span>${it.name}</span><span>x${it.qty}</span></div>`).join('') || '<span style="color:#555;">Empty</span>';

    const editBtn = canEdit ? `<button class="btn-primary" onclick="renderCharModalEdit()">แก้ไขข้อมูลตัวละคร</button>` : '';

    document.getElementById('charview-body').innerHTML = `
        <div class="cv-top">
            ${portraitHtml}
            <div class="cv-info">
                <div class="cv-name">${c.name || username}</div>
                <div class="cv-field"><b>ผู้ใช้ (User):</b> ${username}</div>
                <div class="cv-field"><b>Race:</b> ${c.race || '-'}</div>
                <div class="cv-field"><b>Class:</b> ${c.charClass || '-'}</div>
                <div class="cv-field"><b>Height:</b> ${c.height || '-'}</div>
                <div class="cv-field"><b>Skills:</b> ${c.skills || '-'}</div>
                <div class="cv-field"><b>Ultimate:</b> ${c.ultimate || '-'}</div>
                <div class="cv-field"><b>Weapon:</b> ${c.weapon || '-'} &nbsp; <b>Armor:</b> ${c.armor || '-'}</div>
            </div>
        </div>
        <div class="cv-grid">
            <div class="cv-section">
                <div class="cv-section-title">ABILITY SCORES</div>
                <table class="cv-stats-table">
                    <thead><tr><th>Stat</th><th>Score</th><th>Mod</th></tr></thead>
                    <tbody>
                        ${['STR','DEX','CON','INT','WIS','CHA'].map(s => `<tr><td>${s}</td><td style="text-align:center;">${st[s]||10}</td><td class="mod">${mod(st[s]||10)}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="cv-section">
                <div class="cv-section-title">VITALS & EQUIPMENT</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;margin-bottom:12px;">
                    <div><span style="font-family:var(--fh);color:var(--ruby-b);font-size:16px;">HP ${c.hp||0}</span></div>
                    <div><span style="font-family:var(--fh);color:var(--mana-b);font-size:16px;">SP ${c.sp||0}</span></div>
                </div>
                <div class="cv-section-title" style="margin-top:8px;">INVENTORY</div>
                ${invHtml}
            </div>
        </div>
        ${c.background || c.pros || c.cons ? `
        <div class="cv-section" style="margin-top:14px;">
            <div class="cv-section-title">BACKGROUND & TRAITS</div>
            <div style="font-size:13px;color:var(--txt2);line-height:1.6;">${c.background||'-'}</div>
            <div style="margin-top:6px;font-size:13px;"><b style="color:#a5d6a7;">ข้อดี:</b> ${c.pros||'-'}</div>
            <div style="font-size:13px;"><b style="color:#ff8a80;">ข้อเสีย:</b> ${c.cons||'-'}</div>
        </div>` : ''}
        <div style="display:flex;justify-content:center;gap:10px;margin-top:18px;">
            ${editBtn}
            <button class="btn-metal" onclick="closeCharModal()">ปิด</button>
        </div>
    `;
    document.getElementById('charview-modal').classList.remove('hidden');
}

function renderCharModalEdit() {
    if (!viewingCharData) return;
    const { character: c, username } = viewingCharData;
    const st = c.stats || {};
    let modalInv = c.inventory ? [...c.inventory] : [];

    const statsRows = ['STR','DEX','CON','INT','WIS','CHA'].map(s => `
        <tr>
            <td>${s}</td>
            <td><input type="number" id="m-stat-${s}" value="${st[s]||10}" class="stat-input" style="width:55px;padding:4px;" oninput="updateModalMod('${s}')"></td>
            <td class="mod" id="m-mod-${s}">${fmtMod(calcMod(st[s]||10))}</td>
        </tr>
    `).join('');

    document.getElementById('charview-body').innerHTML = `
        <div class="cs-panel-title" style="font-size:16px;margin-bottom:14px;">แก้ไขข้อมูล: ${c.name || username} (${username})</div>
        <div class="cv-grid">
            <div class="cv-section">
                <div class="cv-section-title">BIO & ABILITY SCORES</div>
                <label>ชื่อตัวละคร:</label>
                <input type="text" id="m-name" value="${c.name||''}">
                <label>เผ่า (Race):</label>
                <input type="text" id="m-race" value="${c.race||''}">
                <label>อาชีพ (Class):</label>
                <input type="text" id="m-class" value="${c.charClass||''}">
                <label>ส่วนสูง:</label>
                <input type="text" id="m-height" value="${c.height||''}">
                <table class="cv-stats-table" style="margin-top:10px;">
                    <thead><tr><th>Stat</th><th>Score</th><th>Mod</th></tr></thead>
                    <tbody>${statsRows}</tbody>
                </table>
            </div>
            <div class="cv-section">
                <div class="cv-section-title">VITALS & GEAR</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                    <div><label style="color:var(--ruby-b);font-weight:700;">HP:</label><input type="number" id="m-hp" value="${c.hp||20}"></div>
                    <div><label style="color:var(--mana-b);font-weight:700;">SP:</label><input type="number" id="m-sp" value="${c.sp||10}"></div>
                </div>
                <label>อาวุธ (Weapon):</label>
                <input type="text" id="m-weapon" value="${c.weapon||''}">
                <label>เกราะ (Armor):</label>
                <input type="text" id="m-armor" value="${c.armor||''}">
                <label>สกิล (Skills):</label>
                <input type="text" id="m-skills" value="${c.skills||''}">
                <label>อัลตี้ (Ultimate):</label>
                <textarea id="m-ultimate" rows="2">${c.ultimate||''}</textarea>
            </div>
        </div>
        <div class="cv-section" style="margin-top:10px;">
            <div class="cv-section-title">STORY & TRAITS</div>
            <label>ภูมิหลัง:</label>
            <textarea id="m-background" rows="2">${c.background||''}</textarea>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div><label>ข้อดี:</label><input type="text" id="m-pros" value="${c.pros||''}"></div>
                <div><label>ข้อเสีย:</label><input type="text" id="m-cons" value="${c.cons||''}"></div>
            </div>
        </div>
        <div class="cv-section" style="margin-top:10px;">
            <div class="cv-section-title">INVENTORY</div>
            <div id="m-inv-list" class="inv-list" style="max-height:120px;">
                ${modalInv.map((it, idx) => `<div class="inv-item"><span>${it.name} x${it.qty}</span><button class="btn-metal btn-small" onclick="removeModalInv(${idx})">X</button></div>`).join('')}
            </div>
            <div class="inv-add-row" style="margin-top:6px;">
                <input type="text" id="m-inv-name" placeholder="ชื่อของ">
                <input type="number" id="m-inv-qty" placeholder="จำนวน" value="1" min="1">
                <button onclick="addModalInv()" class="btn-secondary btn-small">+ เพิ่ม</button>
            </div>
        </div>
        <div style="display:flex;justify-content:center;gap:10px;margin-top:18px;">
            <button class="btn-primary" onclick="saveModalChar()">บันทึกการแก้ไข</button>
            <button class="btn-metal" onclick="renderCharModalView()">ยกเลิก</button>
        </div>
    `;
}

function updateModalMod(stat) {
    const el = document.getElementById('m-stat-' + stat);
    const v = parseInt(el?.value) || 10;
    const modEl = document.getElementById('m-mod-' + stat);
    if (modEl) modEl.textContent = fmtMod(calcMod(v));
}

function addModalInv() {
    if (!viewingCharData) return;
    const name = document.getElementById('m-inv-name').value.trim();
    const qty = parseInt(document.getElementById('m-inv-qty').value) || 1;
    if (!name) return;
    if (!viewingCharData.character.inventory) viewingCharData.character.inventory = [];
    viewingCharData.character.inventory.push({ name, qty });
    renderCharModalEdit();
}

function removeModalInv(i) {
    if (!viewingCharData || !viewingCharData.character.inventory) return;
    viewingCharData.character.inventory.splice(i, 1);
    renderCharModalEdit();
}

function saveModalChar() {
    if (!viewingCharData) return;
    const { username } = viewingCharData;
    const updated = {
        name: document.getElementById('m-name').value.trim(),
        race: document.getElementById('m-race').value.trim(),
        charClass: document.getElementById('m-class').value.trim(),
        height: document.getElementById('m-height').value.trim(),
        weapon: document.getElementById('m-weapon').value.trim(),
        armor: document.getElementById('m-armor').value.trim(),
        skills: document.getElementById('m-skills').value.trim(),
        ultimate: document.getElementById('m-ultimate').value.trim(),
        background: document.getElementById('m-background').value.trim(),
        pros: document.getElementById('m-pros').value.trim(),
        cons: document.getElementById('m-cons').value.trim(),
        hp: parseInt(document.getElementById('m-hp').value) || 20,
        sp: parseInt(document.getElementById('m-sp').value) || 10,
        stats: {
            STR: parseInt(document.getElementById('m-stat-STR').value) || 10,
            DEX: parseInt(document.getElementById('m-stat-DEX').value) || 10,
            CON: parseInt(document.getElementById('m-stat-CON').value) || 10,
            INT: parseInt(document.getElementById('m-stat-INT').value) || 10,
            WIS: parseInt(document.getElementById('m-stat-WIS').value) || 10,
            CHA: parseInt(document.getElementById('m-stat-CHA').value) || 10
        },
        inventory: viewingCharData.character.inventory || []
    };

    if (myRole === 'DM') {
        socket.emit('dmEditCharacter', { roomCode: currentRoom, targetUsername: username, changes: updated });
        Object.assign(viewingCharData.character, updated);
        renderCharModalView();
    } else if (username === myUsername) {
        socket.emit('saveCharacter', updated, res => {
            if (res?.error) return alert(res.error);
            Object.assign(viewingCharData.character, updated);
            renderCharModalView();
        });
    }
}

function closeCharModal() { document.getElementById('charview-modal').classList.add('hidden'); }

// ========== SAVE / LOAD ==========
function exportSave() {
    const d = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameState, null, 2));
    const a = document.createElement('a'); a.href = d; a.download = `dnd-save-${currentRoom}.json`; document.body.appendChild(a); a.click(); a.remove();
}
function importSave(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { try { dmAction('LOAD_SAVE', JSON.parse(ev.target.result)); } catch(err) { alert('Invalid JSON'); } };
    r.readAsText(f); e.target.value = '';
}
