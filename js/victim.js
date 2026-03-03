/**
 * VICTIM DASHBOARD ENGINE
 * Listens to Firebase for incoming attacker commands and
 * renders visual effects on the SOC dashboard in real-time.
 */
import { db, ref, set, onValue, onChildAdded, onDisconnect } from './core/firebase.js';
import { globalNetworkData } from './data/network-data.js';
import { createNodeElement, appendToLog, formatIPForFirebase } from './modules/ui-utils.js';
import { updateNodeStatus, spreadWorm, notifyAttacker, triggerTrace, runExfiltrate } from './modules/game-logic.js';

/* ── Setup ─────────────────────────────────────────────── */
const params = new URLSearchParams(window.location.search);
const room = params.get('id');
const roomPath = `sessions/${room}`;
const myId = `vic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Register presence
const presenceRef = ref(db, `${roomPath}/presence/victims/${myId}`);
onDisconnect(presenceRef).remove();
set(presenceRef, { role: 'victim', time: Date.now() });

const el = {
    container: document.getElementById('network-map-container'),
    log: document.getElementById('victim-output'),
    ransomOverlay: document.getElementById('ransom-overlay'),
    intercept: document.getElementById('intercept-text'),
    payBtn: document.getElementById('pay-ransom-btn'),
    threatBadge: document.getElementById('threat-badge'),
};

let gameState = {
    currentTarget: null,
    traceInterval: null,
    infectedKeys: [],
    threatLevel: 'low',
};

/* ── Threat Level ───────────────────────────────────────── */
function setThreat(level) {
    gameState.threatLevel = level;
    const labels = { low: 'THREAT: LOW', elevated: 'THREAT: ELEVATED', critical: 'THREAT: CRITICAL' };
    el.threatBadge.textContent = labels[level] || 'THREAT: UNKNOWN';
    el.threatBadge.className = `${level}`;
}

/* ── SOC Log Helper ─────────────────────────────────────── */
function syslog(msg, cls = 'log-info') {
    const now = new Date().toLocaleTimeString();
    appendToLog(el.log, `[${now}] ${msg}`, cls);
}

/* ── Screen Glitch Effect ───────────────────────────────── */
function triggerGlitch() {
    document.body.classList.add('glitch');
    setTimeout(() => document.body.classList.remove('glitch'), 500);
}

/* ── Data Particle Burst ────────────────────────────────── */
function triggerDataFlight(amount = 8) {
    const allKeys = gameState.infectedKeys.length > 0
        ? gameState.infectedKeys
        : Array.from(document.querySelectorAll('.node')).map(n => n.id.replace('node-', ''));

    allKeys.forEach(key => {
        const node = document.getElementById(`node-${key}`);
        if (!node) return;

        for (let i = 0; i < amount; i++) {
            setTimeout(() => {
                const rect = node.getBoundingClientRect();
                const p = document.createElement('div');
                p.className = 'data-particle';
                p.textContent = Math.random() > 0.5 ? '1' : '0';
                p.style.left = (rect.left + Math.random() * rect.width) + 'px';
                p.style.top = (rect.top + rect.height / 2) + 'px';
                document.body.appendChild(p);
                setTimeout(() => p.remove(), 2000);
            }, i * 80 + Math.random() * 200);
        }
    });
}

/* ── Ghost Interception Typewriter ──────────────────────── */
function ghostType(text) {
    const overlay = el.intercept.parentElement;
    overlay.style.display = 'block';
    el.intercept.textContent = '';
    let i = 0;
    const iv = setInterval(() => {
        el.intercept.textContent += text[i++];
        if (i >= text.length) {
            clearInterval(iv);
            setTimeout(() => { overlay.style.display = 'none'; }, 2000);
        }
    }, 55);
}

/* ── Command Processing Engine ──────────────────────────── */
async function processCommand(fullCmd) {
    const parts = fullCmd.toLowerCase().split(' ');
    const cmd = parts[0];
    const arg = parts[1];

    syslog(`INCOMING COMMAND: ${fullCmd}`, 'log-alert');

    switch (cmd) {

        case 'nmap': {
            setThreat('elevated');
            syslog('⚠ Port scan detected on network interface!', 'log-alert');
            await notifyAttacker(roomPath, '[*] Host discovery initiated...', 'info');

            // If an argument is provided, filter by it. Otherwise, return all hosts.
            let targets = globalNetworkData.flatMap(n => n.hosts);
            if (arg) {
                targets = targets.filter(h => h.ip.startsWith(arg));
            }

            if (targets.length === 0) {
                setTimeout(async () => {
                    await notifyAttacker(roomPath, `[-] No hosts found matching target: ${arg}`, 'error');
                }, 1200);
                break;
            }

            targets.forEach((h, i) => {
                const nodeKey = formatIPForFirebase(h.ip);
                const uiNode = document.getElementById(`node-${nodeKey}`);

                // Apply scanning glow instantly
                if (uiNode) uiNode.classList.add('scanning');

                setTimeout(async () => {
                    if (uiNode) uiNode.classList.remove('scanning');
                    await updateNodeStatus(roomPath, h.ip, 'scanned');
                    const vuln = h.vuln ? '⚠ VULNERABLE' : '✓ SAFE';
                    const typeLabel = `[${h.type.toUpperCase()}]`;
                    await notifyAttacker(roomPath, `  ${h.ip.padEnd(15)} ${typeLabel.padEnd(10)} ${h.hostname.padEnd(18)} ${vuln}`, h.vuln ? 'log-alert' : 'info');
                    syslog(`Port scan hit: ${h.ip} (${h.hostname})`, h.vuln ? 'log-alert' : 'log-info');
                }, 1200 + i * 300); // Faster stagger for large lists
            });
            break;
        }

        case 'exploit': {
            const target = globalNetworkData.flatMap(n => n.hosts).find(h => h.ip === arg);
            if (target?.vuln) {
                setThreat('critical');
                gameState.currentTarget = arg;
                await updateNodeStatus(roomPath, arg, 'infected');
                await notifyAttacker(roomPath, `[+] Meterpreter session opened on ${arg} (${target.hostname})`, 'success');

                // Mark parent subnet as breached
                const parentSection = document.getElementById(`node-${formatIPForFirebase(arg)}`)?.closest('.subnet');
                if (parentSection) parentSection.classList.add('breached');

                // Visual effects
                triggerGlitch();
                syslog(`🚨 BREACH DETECTED: ${arg} (${target.hostname}) is compromised!`, 'log-crit');

                // Start IDS trace countdown
                if (!gameState.traceInterval) {
                    gameState.traceInterval = triggerTrace(
                        roomPath,
                        (p) => syslog(`IDS Trace progress: ${p}%`, p >= 60 ? 'log-crit' : 'log-alert')
                    );
                }
            } else {
                await notifyAttacker(roomPath, `[-] Exploit failed on ${arg || 'unknown'} — target appears patched.`, 'error');
                syslog(`Exploit attempt blocked on ${arg}`, 'log-ok');
            }
            break;
        }

        case 'worm':
            setThreat('critical');
            syslog('🔴 WORM PROPAGATION DETECTED — lateral movement in progress!', 'log-crit');
            await spreadWorm(roomPath, gameState.currentTarget, globalNetworkData);
            break;

        case 'exfiltrate':
            syslog('📤 DATA EXFILTRATION DETECTED — sensitive files being uploaded!', 'log-crit');
            triggerDataFlight(35);
            await runExfiltrate(roomPath);
            break;

        case 'payload':
            syslog('🔒 RANSOMWARE EXECUTING — encrypting all files!', 'log-crit');
            gameState.infectedKeys.forEach(k => {
                const ip = k.replace(/_/g, '.');
                updateNodeStatus(roomPath, ip, 'encrypted');
            });
            // Small stagger for drama
            setTimeout(() => {
                el.ransomOverlay.style.display = 'flex';
                notifyAttacker(roomPath, '[!] PAYLOAD DEPLOYED — all files encrypted.', 'error');
            }, 2500);
            break;


        case 'disconnect':
            // Attacker dropped the connection cleanly — stop the IDS trace
            if (gameState.traceInterval) {
                clearInterval(gameState.traceInterval);
                gameState.traceInterval = null;
            }
            syslog('⚡ Attacker connection dropped. IDS trace halted.', 'log-ok');
            setThreat('elevated');
            break;

        case 'obfuscate':
            // Attacker is scrambling their traffic — penalise the IDS trace
            syslog('🌀 Obfuscated traffic detected — IDS trace efficiency reduced.', 'log-alert');
            // Reset the trace timer so the 40-second countdown restarts
            if (gameState.traceInterval) {
                clearInterval(gameState.traceInterval);
                gameState.traceInterval = null;
                // Restart with a longer interval (8s steps → effectively slower)
                await notifyAttacker(roomPath, '[+] Obfuscation working — trace reset.', 'success');
                gameState.traceInterval = triggerTrace(
                    roomPath,
                    (p) => syslog(`IDS Trace (obfuscated): ${p}%`, p >= 60 ? 'log-crit' : 'log-alert')
                );
            } else {
                syslog('No active trace to disrupt.', 'log-info');
            }
            break;
    }
}

/* ── Firebase Listeners ─────────────────────────────────── */

// Listen for attacker commands
onValue(ref(db, `${roomPath}/commands/current`), (snap) => {
    const data = snap.val();
    if (!data) return;
    if (Math.abs(Date.now() - data.time) > 8000) return; // stale guard
    ghostType(data.cmd);
    processCommand(data.cmd);
    set(ref(db, `${roomPath}/commands/current`), null);
});

/* ── Global Signal Listener ───────────────────────────────── */
onValue(ref(db, `${roomPath}/signal`), (snap) => {
    const data = snap.val();
    if (!data) return;

    if (data.type === 'reset') {
        if (Date.now() - data.time > 3000) return; // Ignore stale signals
        // Hide the interception overlay immediately so it doesn't flash on reload
        const interceptOverlay = document.getElementById('interception-overlay');
        if (interceptOverlay) interceptOverlay.style.display = 'none';
        location.reload();
    } else if (data.type === 'delete') {
        if (Date.now() - data.time > 3000) return;
        alert('Simulation terminated by Administrator. Returning to Lobby.');
        window.location.href = 'index.html';
    }
});

// Sync node states from firestore cloud
onValue(ref(db, `${roomPath}/mapState`), (snap) => {
    const data = snap.val();
    gameState.infectedKeys = [];

    document.querySelectorAll('.node').forEach(n => {
        n.classList.remove('infected', 'scanned', 'encrypted', 'scanning');
    });

    if (!data) return;

    Object.entries(data).forEach(([key, val]) => {
        const node = document.getElementById(`node-${key}`);
        if (node) {
            node.classList.add(val.status);
            if (val.status === 'infected') gameState.infectedKeys.push(key);
        }
    });
});

// Listen for special UI signals (e.g. exfiltrate particles)
onChildAdded(ref(db, `${roomPath}/responses`), (snap) => {
    const val = snap.val();
    if (val?.action === 'exfiltrate_ui' && Math.abs(Date.now() - val.time) < 5000) {
        triggerDataFlight(40);
    }
});

/* ── Build Network Map ──────────────────────────────────── */
globalNetworkData.forEach(net => {
    const section = document.createElement('fieldset');
    section.className = 'subnet';
    section.id = `subnet-${net.id}`;
    section.innerHTML = `<legend>${net.name}</legend>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    net.hosts.forEach(h => grid.appendChild(createNodeElement(h)));
    section.appendChild(grid);
    el.container.appendChild(section);
});

syslog('Security Operations Center ONLINE. Network monitoring active.', 'log-ok');

/* ── Ransom Pay Button ──────────────────────────────────── */
el.payBtn.onclick = async () => {
    el.ransomOverlay.style.display = 'none';
    await set(ref(db, `${roomPath}/mapState`), null);
    await notifyAttacker(roomPath, '[!] Ransom paid. Issuing decryption key...', 'success', 'revive');
    syslog('Ransom paid. Files being decrypted...', 'log-ok');
    setThreat('low');
};