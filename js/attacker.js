/**
 * ATTACKER TERMINAL ENGINE — v2.7.0
 *
 * ROLE SYSTEM:
 *   MASTER    – First attacker to join this room. Controls the terminal.
 *               Logs are pushed to Firebase so all viewers see them.
 *   SPECTATOR – Any subsequent attacker joining the same room ID.
 *               Input is read-only. All terminal output is mirrored in real-time.
 *
 * All log lines are shared via `sessions/${room}/terminalLog` in Firebase
 * so that both the master and all spectators see an identical, live transcript.
 */
import { db, ref, set, push, onValue, onChildAdded, onDisconnect } from './core/firebase.js';
import { globalNetworkData } from './data/network-data.js';
import { appendToLog } from './modules/ui-utils.js';

/* ── Session Identity ───────────────────────────────────── */
const params = new URLSearchParams(window.location.search);
const room = params.get('id');
const roomPath = `sessions/${room}`;
const myId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const sessionStart = Date.now();   // used to filter old log entries for master

/* ── DOM References ─────────────────────────────────────── */
const output = document.getElementById('output');
const input = document.getElementById('cmd-input');
const connLabel = document.getElementById('conn-label');
const connDot = document.getElementById('conn-dot');
const roomLabel = document.getElementById('room-label');
const roleBadge = document.getElementById('role-badge');
const spectatorBanner = document.getElementById('spectator-banner');
const killedOverlay = document.getElementById('killed-overlay');

roomLabel.textContent = room || 'UNKNOWN';

/* ── State ──────────────────────────────────────────────── */
let isMaster = false;
let isConnected = true;
let connectedNetwork = null;  // Full network object from globalNetworkData, or null
let isObfuscating = false;
let commandHistory = [];
let historyIndex = -1;
let resetTimestamp = 0; // Used to discard log entries from before the last reset

// Commands that require an active network connection — module-level Set for O(1) lookup
const NETWORK_COMMANDS = new Set(['nmap', 'exploit', 'worm', 'exfiltrate', 'payload', 'obfuscate', 'disconnect']);

/* ── Firebase Refs ──────────────────────────────────────── */
const masterRef = ref(db, `${roomPath}/presence/attacker/master`);
const presenceRef = ref(db, `${roomPath}/presence/attackers/${myId}`);
const termLogRef = ref(db, `${roomPath}/terminalLog`);
const responsesRef = ref(db, `${roomPath}/responses`);

/* ──────────────────────────────────────────────────────────
   SHARED TERMINAL LOG
   All output (from master) is pushed here.
   Both master and spectators render via onChildAdded.
   ───────────────────────────────────────────────────────── */

/**
 * Push a log entry to Firebase. Only the master should call this.
 * Spectators automatically see entries via the listener below.
 */
function pushLog(text, style = '') {
    push(termLogRef, { text, style, time: Date.now() });
}

/** Master-only log helper (alias for readability). */
const log = (text, style = '') => { if (isMaster) pushLog(text, style); };

/** Helper for delayed log lines. Also supports callback functions. */
const later = (ms, textOrFn, style = '') => {
    setTimeout(() => {
        if (typeof textOrFn === 'function') textOrFn();
        else log(textOrFn, style);
    }, ms);
};

/** Send a command to the victim's Firebase node (master only). */
function dispatch(cmd) {
    if (!isMaster) return;
    if (!isConnected && cmd !== 'reset') {
        log('[-] LINK SEVERED — cannot reach remote host.', 'error');
        return;
    }
    const baseCmd = cmd.toLowerCase().split(' ')[0];
    if (NETWORK_COMMANDS.has(baseCmd) && !connectedNetwork) {
        return;
    }
    set(ref(db, `${roomPath}/commands/current`), { cmd, time: Date.now() });
}

/* ──────────────────────────────────────────────────────────
   ROLE CLAIMING
   First attacker to load claims MASTER. If the slot is
   already taken, the newcomer becomes a SPECTATOR.
   Master slot is released automatically on disconnect.
   ───────────────────────────────────────────────────────── */

function becomeMaster() {
    isMaster = true;

    // Update badge
    roleBadge.className = 'role-master';
    roleBadge.textContent = '⚡ MASTER';

    // Enable input
    input.disabled = false;
    input.focus();

    // Register automatic release when this tab closes
    onDisconnect(masterRef).remove();
    onDisconnect(presenceRef).remove();

    // Register our presence as Master
    set(presenceRef, { role: 'master', time: Date.now() });

    // Push the boot messages to the shared log
    log('');
    log('Kali Linux Rolling [Version 2026.1] (GNU/Linux 6.11.0-amd64)', 'info');
    log('Copyright (C) 2013-2026 Kali Linux & Offensive Security', 'info');
    log('────────────────────────────────────────────────────────', 'info');
    log('C2 link established. Remote session ready.', 'success');
    log('Type help for available commands.', 'info');
    log('You are the MASTER — spectators see this terminal live.', 'success');
    log('');
}

function becomeSpectator() {
    isMaster = false;

    // Update badge
    roleBadge.className = 'role-spectator';
    roleBadge.textContent = '👁 SPECTATOR';

    // Disable input
    input.disabled = true;
    input.placeholder = 'Spectator — read only';
    input.style.opacity = '0.35';
    input.style.cursor = 'not-allowed';

    // Show banner
    spectatorBanner.classList.add('visible');

    // Register our presence as Spectator
    onDisconnect(presenceRef).remove();
    set(presenceRef, { role: 'spectator', time: Date.now() });
}

// Attempt to claim the master slot (check-then-set, single read)
onValue(masterRef, (snap) => {
    if (!snap.exists()) {
        // Slot is free — claim it
        set(masterRef, { id: myId, time: Date.now() });
        becomeMaster();
    } else {
        becomeSpectator();
    }
}, { onlyOnce: true });

function localMasterReset() {
    isConnected = true;
    isObfuscating = false;
    connectedNetwork = null;
    commandHistory = [];
    historyIndex = -1;
    document.body.classList.remove('killed');
    killedOverlay.classList.remove('visible');
    connDot.classList.remove('dead');
    connLabel.textContent = 'LINK ACTIVE';
    input.value = '';

    // Clear terminal screen locally
    output.innerHTML = '';

    if (isMaster) {
        input.focus();
        log('');
        log('Kali Linux Rolling [Version 2026.1] (GNU/Linux 6.11.0-amd64)', 'info');
        log('Copyright (C) 2013-2026 Kali Linux & Offensive Security', 'info');
        log('────────────────────────────────────────────────────────', 'info');
        log('C2 link established. Remote session ready.', 'success');
        log('Type help for available commands.', 'info');
        log('You are the MASTER — spectators see this terminal live.', 'success');
        log('');
    }
}

/* ──────────────────────────────────────────────────────────
   GLOBAL SIGNAL LISTENER
   Listens for coordination signals broadcast by the master.
   All clients (master + every spectator) react here.
   ───────────────────────────────────────────────────────── */
onValue(ref(db, `${roomPath}/signal`), (snap) => {
    const data = snap.val();
    if (!data) return;

    if (data.type === 'reset') {
        // Prevent stale reloads: ignore signals older than 10 seconds
        if (Date.now() - data.time > 10000) return;

        if (isMaster) {
            // The master just wiped the DB. Do NOT reload to avoid race conditions.
            // The localMasterReset() function already ran synchronously.
        } else {
            // Spectators strictly reload to sync the fresh slate
            location.reload();
        }
    } else if (data.type === 'delete') {
        if (Date.now() - data.time > 10000) return;
        alert('Simulation terminated by Administrator. Returning to Lobby.');
        window.location.href = 'index.html';
    }
});

/* ──────────────────────────────────────────────────────────
   SHARED LOG RENDERER
   Both master and spectator render terminal lines from here.
   ───────────────────────────────────────────────────────── */
onChildAdded(termLogRef, (snap) => {
    const d = snap.val();
    if (!d) return;

    // Skip entries that pre-date the last reset (prevents ghost log lines for spectators)
    if (d.time < resetTimestamp) return;

    // Master: skip entries older than 30 s before page load (stale from prev session).
    // Spectator: show everything including recent history (≤30 min old).
    const ageLimit = isMaster ? sessionStart - 30_000 : Date.now() - 30 * 60_000;
    if (d.time < ageLimit) return;

    appendToLog(output, d.text, d.style);
});

/* ──────────────────────────────────────────────────────────
   LOCAL COMMAND HANDLERS
   These only run for the MASTER (input disabled for spectators).
   ───────────────────────────────────────────────────────── */
const localCommands = {

    help: () => {
        log(`
NET-WORM PENETRATION TOOLKIT  [v2.7.0]
────────────────────────────────────────────────────────────────
 COMMAND            DESCRIPTION
 ───────            ───────────
 iwlist             Scan for nearby Wi-Fi networks (SSIDs)
 connect [SSID]     Authenticate with a wireless network
 nmap [IP-prefix]   Host discovery & vulnerability scan
 exploit [IP]       Deploy shellcode against a vulnerable host
 worm               Start self-replicating lateral movement
 exfiltrate         Extract sensitive data from infected nodes
 payload            Execute ransomware encryption phase
──────────────────────────────────── EVASION ────────────────────
 obfuscate          Scramble traffic — resets IDS trace timer
 disconnect         Drop your connection to the remote host
──────────────────────────────────── OTHER ──────────────────────
 clear              Clear terminal output
 reset              Reset the entire simulation
────────────────────────────────────────────────────────────────
 Tip: use obfuscate if the IDS trace is getting close!
`, 'info');
    },

    clear: () => {
        output.innerHTML = '';
    },

    reset: () => {
        resetTimestamp = Date.now();

        // Wipe specific game state nodes without touching the master presence slot!
        set(ref(db, `${roomPath}/terminalLog`), null);
        set(ref(db, `${roomPath}/commands`), null);
        set(ref(db, `${roomPath}/mapState`), null);
        set(ref(db, `${roomPath}/responses`), null);

        // Broadcast reset signal so spectators and the victim reload
        set(ref(db, `${roomPath}/signal`), { type: 'reset', time: Date.now() });

        // Reset our own DOM artificially to avoid dropping the connection
        localMasterReset();
    },

    disconnect: () => {
        if (!connectedNetwork) { log('[-] Not connected to any network.', 'error'); return; }
        const prevSsid = connectedNetwork.wifi.ssid;
        connectedNetwork = null;  // Drop network access — must re-run iwlist + connect
        isObfuscating = false;

        log('');
        log(`[*] Dropping connection from "${prevSsid}"...`, 'info');
        later(400, '[*] Sending RST packet to remote host...', 'info');
        later(900, '[*] TCP stream terminated. Session dropped.', 'info');
        later(1400, '[+] Disconnected. Run iwlist to scan for networks.', 'success');
        later(1600, '');
        dispatch('disconnect');
    },

    obfuscate: () => {
        if (!isConnected) { log('[-] No active link to obfuscate.', 'error'); return; }
        if (isObfuscating) { log('[*] Traffic obfuscation already running.', 'warn'); return; }
        isObfuscating = true;
        log('[*] Activating polymorphic traffic shaper...', 'info');
        later(500, '[*] Injecting dummy packets to confuse IDS signatures...', 'info');
        later(1100, '[*] Rotating source ports every 8 seconds...', 'info');
        later(1700, '[!] Sending OBFUSCATE signal to remote proxy...', 'log-alert');
        later(2300, '[+] Traffic obfuscation ACTIVE — IDS trace reset.', 'success');
        dispatch('obfuscate');
    },

    iwlist: () => {
        log('[*] wlan0: Scanning for broadcast SSIDs...', 'info');
        later(600, '');
        later(700, 'wlan0  Scan completed:', 'info');

        // Generate scan results dynamically from real network data
        const wifiNets = globalNetworkData.filter(n => n.wifi);
        const bssids = ['1A:2B:3C:4D:5E:6F', 'AA:BB:CC:DD:EE:FF', 'DE:AD:BE:EF:12:34', 'C0:FF:EE:BA:BE:00'];
        const channels = [6, 11, 36, 1];
        wifiNets.forEach((net, i) => {
            const enc = net.wifi.type;
            const sig = net.wifi.signal || '??%';
            // Convert signal percentage to dBm-style
            const pct = parseInt(sig);
            const dbm = -Math.round(20 + (100 - pct) * 0.7);
            const style = enc === 'OPEN' ? 'success' : 'info';
            const pad = (s, n) => s.padEnd(n);
            later(800 + i * 200,
                `  Cell ${String(i + 1).padStart(2, '0')} – BSSID: ${bssids[i]}  ESSID: ${pad('"' + net.wifi.ssid + '"', 16)}  CH: ${String(channels[i]).padEnd(3)}  ENC: ${pad(enc, 18)}  Sig: ${dbm} dBm`,
                style);
        });
        later(800 + wifiNets.length * 200, '');
        const openNets = wifiNets.filter(n => n.wifi.type === 'OPEN');
        if (openNets.length > 0) {
            later(800 + wifiNets.length * 200 + 100,
                `[+] Scan complete. Open network detected: ${openNets[0].wifi.ssid} — no credentials required.`, 'success');
        } else {
            later(800 + wifiNets.length * 200 + 100, '[+] Scan complete. No open networks found.', 'warn');
        }
    },

    connect: (full) => {
        const ssid = full.split(' ').slice(1).join(' ').trim();
        if (!ssid) { log('Usage: connect [SSID]', 'error'); return; }

        // Find the matching network from real data (case-insensitive)
        const target = globalNetworkData.find(n => n.wifi && n.wifi.ssid.toLowerCase() === ssid.toLowerCase());
        if (!target) {
            log(`[-] SSID "${ssid}" not found in range. Run iwlist to see available networks.`, 'error');
            return;
        }

        const assignedIp = `${target.cidr}.99`;
        const gw = `${target.cidr}.1`;

        log(`[*] Associating to "${target.wifi.ssid}"...`, 'info');
        later(400, '[*] Sending probe request...', 'info');
        later(900, '[*] Received probe response. Sending association request...', 'info');
        if (target.wifi.type !== 'OPEN') {
            later(1200, `[*] Performing ${target.wifi.type} handshake...`, 'info');
        }
        later(1500, '[+] Association successful.', 'success');
        later(1800, `[+] DHCP lease obtained: ${assignedIp}  GW: ${gw}`, 'success');
        later(2100, () => {
            connectedNetwork = target;
            log(`[+] Connected to "${target.wifi.ssid}" (${target.cidr}.x). You are now inside the target network.`, 'success');
        });
    },
};

/* ──────────────────────────────────────────────────────────
   REMOTE COMMAND VERBOSE OUTPUT
   Simulates realistic multi-step attacker feedback before
   the command is dispatched to the victim.
   ───────────────────────────────────────────────────────── */
function remoteVerbose(baseCmd, arg) {
    switch (baseCmd) {
        case 'nmap': {
            const subnet = connectedNetwork ? `${connectedNetwork.cidr}.x` : (arg || 'target subnet');
            log('[*] Initialising Nmap 7.94 — stealth SYN scan (-sS)...', 'info');
            later(600, `[*] Sending TCP SYN packets to ${subnet}...`, 'info');
            break;
        }

        case 'exploit':
            log(`[*] Selecting payload: windows/x64/meterpreter/reverse_tcp`, 'info');
            later(500, `[*] Targeting ${arg}:445 — MS17-010 (EternalBlue)...`, 'info');
            later(1000, '[*] Sending 512-byte NOP sled + shellcode...', 'info');
            later(1500, '[!] Overwriting EIP register at 0x41414141...', 'log-alert');
            later(2200, '[!] Heap spray in progress...', 'log-alert');
            later(3000, '[+] Shell spawned! Opening Meterpreter session...', 'success');
            break;

        case 'worm':
            log('[*] Copying worm binary to ADMIN$ share...', 'info');
            later(700, '[*] Extracting cached NTLM hashes via Mimikatz...', 'info');
            later(1400, '[!] Pass-the-hash attack against adjacent hosts...', 'log-alert');
            later(2100, '[!] Using IPC$ pipe to schedule remote execution...', 'log-alert');
            break;

        case 'exfiltrate':
            log('[*] Opening covert HTTPS tunnel (port 443) to C2...', 'info');
            later(800, '    >> Compressing target data with zlib...', 'info');
            later(1600, '    >> AES-256 encrypting archive for exfil...', 'info');
            later(2400, '    >> Uploading encrypted archive in 512 KB chunks...', 'info');
            break;

        case 'payload':
            log('[!] RANSOMWARE PHASE INITIATED', 'error');
            later(400, '[*] Dropping encryptor binary to all infected nodes...', 'info');
            later(900, '[*] Generating unique RSA-2048 key pair...', 'warn');
            later(1400, '[!] Starting mass file encryption...', 'log-alert');
            later(1800, '[!] .docx .xlsx .pdf .sql .bak ➜ .locked', 'error');
            later(2300, '[✓] Encryption complete. Ransom note deployed.', 'error');
            break;
    }
}

/* ──────────────────────────────────────────────────────────
   KEYBOARD INPUT — MASTER ONLY
   (Spectators have input.disabled = true, so this never fires.)
   ───────────────────────────────────────────────────────── */
input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            input.value = commandHistory[commandHistory.length - 1 - historyIndex];
        }
        e.preventDefault();
        return;
    }
    if (e.key === 'ArrowDown') {
        if (historyIndex > 0) {
            historyIndex--;
            input.value = commandHistory[commandHistory.length - 1 - historyIndex];
        } else {
            historyIndex = -1;
            input.value = '';
        }
        return;
    }

    if (e.key !== 'Enter') return;

    const fullCmd = input.value.trim();
    if (!fullCmd) return;

    const parts = fullCmd.toLowerCase().split(' ');
    const baseCmd = parts[0];

    // Check for network connectivity for specific commands BEFORE anything else
    if (NETWORK_COMMANDS.has(baseCmd) && !connectedNetwork) {
        log(`root@kali:~# ${fullCmd}`, 'user-cmd');
        log(`[-] Error: Not connected to any network. Use "iwlist" then "connect [SSID]" first.`, 'error');
        input.value = '';
        return;
    }

    commandHistory.push(fullCmd);
    historyIndex = -1;
    input.value = '';

    // Echo the command to the shared log
    log(`root@kali:~# ${fullCmd}`, 'user-cmd');

    if (localCommands[baseCmd]) {
        localCommands[baseCmd](fullCmd);
    } else {
        // For nmap with no arg, auto-prefix with the connected subnet's CIDR
        let effectiveCmd = fullCmd;
        if (baseCmd === 'nmap' && !parts[1] && connectedNetwork) {
            effectiveCmd = `nmap ${connectedNetwork.cidr}`;
        }
        remoteVerbose(baseCmd, parts[1] || (baseCmd === 'nmap' && connectedNetwork ? connectedNetwork.cidr : undefined));
        dispatch(effectiveCmd);
    }
});

/* ──────────────────────────────────────────────────────────
   VICTIM RESPONSE LISTENER
   Responses from the victim (e.g. nmap results, kill signal)
   are pushed to `responses` by game-logic.js.
   Both master and spectator render these via the shared log.
   ───────────────────────────────────────────────────────── */
onChildAdded(responsesRef, (snap) => {
    const data = snap.val();
    if (!data || data.style === 'hidden') return;
    if (Math.abs(Date.now() - data.time) > 20_000) return; // ignore stale

    // Push victims responses into the shared log so spectators see them too
    if (isMaster) pushLog(data.text, data.style);

    if (data.action === 'kill') {
        isConnected = false;
        document.body.classList.add('killed');
        connDot.classList.add('dead');
        connLabel.textContent = 'CONNECTION SEVERED';
        input.blur();
        if (isMaster) {
            log('');
            log('[!] ALERT: IDS TRACE COMPLETE — CONNECTION TERMINATED.', 'error');
            setTimeout(() => killedOverlay.classList.add('visible'), 1200);
        }
    }

    if (data.action === 'revive') {
        isConnected = true;
        isObfuscating = false;
        document.body.classList.remove('killed');
        killedOverlay.classList.remove('visible');
        connDot.classList.remove('dead');
        connLabel.textContent = 'LINK ACTIVE';
        if (isMaster) {
            input.focus();
            log('');
            log('[+] Session re-established. Access restored.', 'success');
        }
    }
});

/* ── Overlay Button Wiring ───────────────────────────────── */
document.getElementById('btn-reconnect').addEventListener('click', () => {
    // Reconnect just resets the terminal to active state so the attacker can continue,
    // without wiping the network or dropping the master Firebase lock.
    localMasterReset();
});

document.getElementById('btn-full-reset').addEventListener('click', () => {
    // Trigger the exact same full wipe + broadcast as typing `reset`
    if (localCommands.reset) localCommands.reset();
});