/**
 * ADMIN PANEL ENGINE
 * Live session and room monitoring.
 * XSS-safe: uses textContent / DOM methods, never innerHTML for user data.
 */
import { db, ref, set, onValue, get } from './core/firebase.js';

// Elements
const loginOverlay = document.getElementById('admin-login');
const dashboard = document.getElementById('admin-dashboard');
const pwdInput = document.getElementById('admin-pwd');
const btnLogin = document.getElementById('btn-login');
const loginError = document.getElementById('login-error');

const listBody = document.getElementById('session-list');
const lastUpdatedEl = document.getElementById('last-updated');
const newRoomInput = document.getElementById('new-room-id');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnPurgeAll = document.getElementById('btn-purge-all');

const btnForceDisconnectAll = document.getElementById('btn-force-disconnect-all');
const lockdownPwdInput = document.getElementById('lockdown-pwd');
const btnToggleLockdown = document.getElementById('btn-toggle-lockdown');
const lockdownStatusEl = document.getElementById('lockdown-status');

// Simple hardcoded auth (fine for simulation purposes)
const ADMIN_SECRET = 'cyberadmin';

// State
let allRooms = {};
let allSessions = {};
let currentLockdownState = false;

/* ── Authentication ─────────────────────────────────────── */
function tryLogin() {
    if (pwdInput.value === ADMIN_SECRET) {
        loginOverlay.classList.remove('visible');
        dashboard.style.display = 'block';
        initDashboard();
    } else {
        loginError.textContent = '❌ Invalid passphrase. Access denied.';
        pwdInput.value = '';
        setTimeout(() => { loginError.textContent = ''; }, 3000);
    }
}

btnLogin.addEventListener('click', tryLogin);
pwdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryLogin();
});

/* ── Dashboard Init ─────────────────────────────────────── */
function initDashboard() {
    // Listen to /rooms
    onValue(ref(db, 'rooms'), (snap) => {
        allRooms = snap.val() || {};
        renderTable();
    });

    // Listen to /sessions for presence and commands
    onValue(ref(db, 'sessions'), (snap) => {
        allSessions = snap.val() || {};
        renderTable();
    });

    // Listen to global settings for lockdown status
    onValue(ref(db, 'settings/lockdown'), (snap) => {
        const lockdown = snap.val();
        if (lockdown && lockdown.enabled) {
            currentLockdownState = true;
            lockdownStatusEl.textContent = 'STATUS: ACTIVE';
            lockdownStatusEl.style.color = 'var(--red)';
            btnToggleLockdown.textContent = 'DISABLE LOCKDOWN';
            btnToggleLockdown.style.background = 'var(--red)';
            btnToggleLockdown.style.color = 'white';
            lockdownPwdInput.value = lockdown.password || '';
        } else {
            currentLockdownState = false;
            lockdownStatusEl.textContent = 'STATUS: INACTIVE';
            lockdownStatusEl.style.color = 'var(--subtle)';
            btnToggleLockdown.textContent = 'ENABLE LOCKDOWN';
            btnToggleLockdown.style.background = 'var(--darker)';
            btnToggleLockdown.style.color = 'var(--red)';
            lockdownPwdInput.value = '';
        }
    });
}

/* ── DOM Render (XSS Safe) ──────────────────────────────── */
function renderTable() {
    lastUpdatedEl.textContent = `Last refresh: ${new Date().toLocaleTimeString()}`;
    listBody.innerHTML = '';

    const roomKeys = Object.keys(allRooms);
    if (roomKeys.length === 0) {
        const empty = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.style.cssText = 'text-align:center; opacity:0.4; padding:30px;';
        td.textContent = 'NO ROOMS PROVISIONED';
        empty.appendChild(td);
        listBody.appendChild(empty);
        return;
    }

    roomKeys.forEach(roomId => {
        const session = allSessions[roomId] || {};
        const presence = session.presence || {};

        // Count attackers from presence.attackers (single source of truth)
        let masterCount = 0;
        let spectatorCount = 0;
        if (presence.attackers) {
            Object.values(presence.attackers).forEach(att => {
                if (att.role === 'master') masterCount++;
                else if (att.role === 'spectator') spectatorCount++;
            });
        }

        // Count victims
        const victimCount = presence.victims ? Object.keys(presence.victims).length : 0;

        const lastCmd = session.commands?.current?.cmd || 'IDLE';

        // Build row
        const row = document.createElement('tr');

        // 1. Room ID
        const tdId = document.createElement('td');
        const strong = document.createElement('strong');
        strong.className = 'room-id-cell';
        strong.textContent = roomId;
        tdId.appendChild(strong);

        // 2. Last Command
        const tdCmd = document.createElement('td');
        const cmdSpan = document.createElement('span');
        cmdSpan.className = 'cmd-text';
        cmdSpan.textContent = lastCmd;
        tdCmd.appendChild(cmdSpan);

        // 3. Master
        const tdMaster = document.createElement('td');
        tdMaster.textContent = masterCount > 0 ? `1 ONLINE` : `0`;
        tdMaster.className = masterCount > 0 ? 'status-active' : 'status-empty';

        // 4. Spectators
        const tdSpec = document.createElement('td');
        tdSpec.textContent = spectatorCount;
        tdSpec.style.color = spectatorCount > 0 ? 'var(--amber)' : 'var(--subtle)';

        // 5. Victims
        const tdVic = document.createElement('td');
        tdVic.textContent = victimCount;
        tdVic.style.color = victimCount > 0 ? 'var(--red)' : 'var(--subtle)';

        // 6. Actions
        const tdActions = document.createElement('td');

        const btnClear = document.createElement('button');
        btnClear.className = 'action-btn';
        btnClear.textContent = 'CLEAR GAME';
        btnClear.onclick = () => {
            if (confirm(`Clear all game state for room ${roomId}?`)) {
                // Wipe session data but broadcast reset signal so clients auto-reload
                set(ref(db, `sessions/${roomId}/signal`), { type: 'reset', time: Date.now() });
                setTimeout(() => {
                    set(ref(db, `sessions/${roomId}`), null);
                }, 800);
            }
        };

        const btnDel = document.createElement('button');
        btnDel.className = 'action-btn delete';
        btnDel.textContent = 'DELETE';
        btnDel.onclick = () => {
            if (confirm(`Delete room ${roomId}? This removes it from the lobby.`)) {
                // Send specific 'delete' signal so clients redirect to lobby
                set(ref(db, `sessions/${roomId}/signal`), { type: 'delete', time: Date.now() });
                setTimeout(() => {
                    set(ref(db, `sessions/${roomId}`), null);
                    set(ref(db, `rooms/${roomId}`), null);
                }, 800);
            }
        };

        tdActions.append(btnClear, btnDel);
        row.append(tdId, tdCmd, tdMaster, tdSpec, tdVic, tdActions);
        listBody.appendChild(row);
    });
}

/* ── Room Management Actions ────────────────────────────── */

btnCreateRoom.addEventListener('click', () => {
    const id = newRoomInput.value.trim().toUpperCase();
    if (!id) return;

    // Check if exists
    get(ref(db, `rooms/${id}`)).then(snap => {
        if (snap.exists()) {
            alert('Room already exists!');
        } else {
            set(ref(db, `rooms/${id}`), { created: Date.now() }).then(() => {
                newRoomInput.value = '';
            });
        }
    });
});

newRoomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnCreateRoom.click();
});

btnPurgeAll.addEventListener('click', () => {
    if (!confirm('TERMINATE ALL ROOMS AND SESSIONS?\nThis is a destructive action and will wipe everything.')) return;

    // Send delete signal to all known rooms before wiping
    const promises = Object.keys(allRooms).map(roomId => {
        return set(ref(db, `sessions/${roomId}/signal`), { type: 'delete', time: Date.now() });
    });

    Promise.all(promises).then(() => {
        setTimeout(() => {
            set(ref(db, 'sessions'), null);
            set(ref(db, 'rooms'), null);
        }, 800);
    });
});

/* ── Global Settings Actions ────────────────────────────── */

btnForceDisconnectAll.addEventListener('click', () => {
    if (!confirm('DISCONNECT ALL USERS?\n\nThis will instantly terminate the database connection for every user currently on the site (excluding administrators). They must refresh to reconnect.')) return;

    set(ref(db, 'settings/forceDisconnect'), { time: Date.now() }).then(() => {
        alert("Force disconnect sequence initiated.");
    });
});

btnToggleLockdown.addEventListener('click', () => {
    if (currentLockdownState) {
        // Disable
        if (!confirm("Disable lockdown mode and allow normal access?")) return;
        set(ref(db, 'settings/lockdown'), { enabled: false, password: null });
    } else {
        // Enable
        const pwd = lockdownPwdInput.value.trim();
        if (!pwd) {
            alert("You must enter a Bypass Password to enable Lockdown Mode.");
            return;
        }
        if (!confirm(`Enable lockdown mode with password '${pwd}'?\n\nAll non-admin users will face an immediate ACCESS DENIED screen unless they enter this password.`)) return;

        set(ref(db, 'settings/lockdown'), { enabled: true, password: pwd });
    }
});