# NET-WORM: Tactical Cyber Simulation

NET-WORM is an immersive, multi-player educational simulation designed to demonstrate the lifecycle of a cyber attack. It provides a split-screen experience where one player assumes the role of an **Attacker** operating a Command & Control (C2) terminal, while another player (or players) watches the attack unfold in real-time as a **Victim** monitoring a corporate Security Operations Center (SOC) dashboard.

The project uses Firebase Realtime Database to keep all clients perfectly in sync in real-time, allowing for a dynamic, highly-visual demonstration of network infiltration.

---

## 📖 The Story of a Cyber Worm

A **cyber worm** is a type of malicious software program whose primary function is to infect other computers while remaining active on infected systems. Unlike a standard computer virus, a worm does not need to attach itself to an existing program or require a user to execute it; it is self-replicating and self-propagating.

### The Attack Lifecycle in NET-WORM

In this simulation, the attacker follows a realistic kill-chain to compromise a target network:

1. **Reconnaissance (`iwlist`, `nmap`)**: The attacker scans for vulnerable networks and maps the internal topology to find critical infrastructure like Database servers, Domain Controllers, and ICS/SCADA systems.
2. **Initial Access (`exploit`)**: The attacker identifies a vulnerable host and fires an exploit (e.g., a buffer overflow delivering a Meterpreter reverse shell) to establish a foothold inside the network.
3. **Lateral Movement (`worm`)**: Once inside, the worm analyzes the local subnet and begins spreading autonomously. It extracts credentials (like NTLM hashes) from the first infected machine and uses them to hop from server to server, establishing persistence across the entire organization.
4. **Data Exfiltration (`exfiltrate`)**: Before the victim realizes what is happening, the worm locates sensitive data (financial records, source code, employee databases) and silently streams it out of the network back to the attacker's C2 server.
5. **Impact / Ransomware (`payload`)**: With the data safely stolen, the attacker detonates a cryptographic payload. The worm encrypts the file systems of every compromised machine, locking operations and displaying a global ransom demand, completing the attack cycle.

---

## 🚀 How to Play

### 🏠 Lobby — `index.html`

The Lobby is the starting point for all players.

1. Open `http://localhost:8000` in your browser.
2. You will see a list of **active simulation rooms** created by the admin.  
   *(If the list is empty, ask your admin to create a room first.)*
3. **Click a room card** — a deployment modal appears.
4. Choose your role:
   - **💻 ATTACKER TERMINAL** — you control the hack.
   - **🛡 VICTIM DASHBOARD** — you monitor and defend.
5. You will be taken directly to your role's page with the room pre-loaded.

> **Tip:** Multiple people can pick Attacker for the same room. The first one in becomes the **Master** (keyboard active). Everyone else becomes a **Spectator** — they watch the terminal live but cannot type.

---

### 💻 Attacker Terminal — `attacker.html`

The Attacker operates a simulated Kali Linux C2 terminal. Your goal is to infiltrate the network before the IDS traces your connection.

#### Step 1 — Scan for Networks
```
iwlist
```
Scans the radio spectrum and lists nearby Wi-Fi networks with their SSID, encryption type, and signal strength.

#### Step 2 — Connect to a Network
```
connect GUEST_OPEN
```
Authenticate with the target network. Replace `GUEST_OPEN` with any SSID from the `iwlist` output.  
Once connected, you receive a DHCP lease and gain access to that subnet's hosts.

> ⚠️ **Network commands (`nmap`, `exploit`, `worm`, etc.) are locked until you are connected to a network.**

#### Step 3 — Discover Hosts
```
nmap
```
Runs a stealth SYN scan on your connected subnet. Results appear on **both** your terminal and the Victim's SOC dashboard. Vulnerable hosts are flagged with `⚠ VULNERABLE`.

> You can also target a specific subnet: `nmap 10.0.0`

#### Step 4 — Exploit a Vulnerable Host
```
exploit 172.16.0.20
```
Fires an EternalBlue-style exploit at the target IP. If it's vulnerable, you open a Meterpreter session and the victim's node turns red. This also starts the **IDS Trace countdown** — you have 80 seconds before your connection is severed.

#### Step 5 — Spread the Worm
```
worm
```
Deploys the self-replicating module. It hops across every vulnerable host in the subnet one by one, infecting each and logging the result.

#### Step 6 — Steal Data
```
exfiltrate
```
Opens a covert HTTPS tunnel and silently uploads sensitive files to the C2 server. On the Victim's screen, data particles visually fly off the infected nodes.

#### Step 7 — Deploy Ransomware
```
payload
```
Detonates the final cryptographic payload. Every infected node is encrypted and the Victim's screen shows a **ransom demand** for 5.00 BTC.

---

#### 🛡 Evasion Commands

| Command | Effect |
|---|---|
| `obfuscate` | Resets the IDS trace timer — buys extra time before detection |
| `disconnect` | Drops your network connection cleanly. The terminal stays active — re-run `iwlist` + `connect` to get back on a network |
| `reset` | Wipes all game state and reloads all connected clients for a fresh round |
| `clear` | Clears only your local terminal screen |

---

#### ⛔ If You Get Caught

The IDS trace reaching 100% severs your connection and shows a termination screen.  
You have two options:
- **🔄 RECONNECT** — Restores the terminal session *without* resetting the game. You must `connect` to a network again before issuing commands.
- **💣 RESET SIMULATION** — Wipes all game state and starts fresh for everyone.

---

### 🛡 Victim Dashboard — `victim.html`

The Victim monitors a corporate **Security Operations Center (SOC)** in real-time. You cannot stop the attack — but you can watch it unfold and respond strategically.

#### What you see

- **Network Map** — a visual grid of all subnets and hosts. Node colours change as the attacker acts:
  - 🔵 `scanned` — the attacker ran `nmap` against this host
  - 🔴 `infected` — the host has been exploited or wormed
  - 🔒 `encrypted` — ransomware has been deployed

- **Threat Badge** — top-right corner. Escalates from `THREAT: LOW` → `ELEVATED` → `CRITICAL` as the attack progresses.

- **System Log** — real-time feed of all IDS alerts. Every attacker command generates a corresponding alert here.

- **Interception Widget** — a floating overlay that typewriters the attacker's raw commands as they are issued, simulating the Blue Team intercepting the C2 stream.

#### When Ransomware Hits

If the attacker runs `payload`, a **ransom overlay** covers the screen.  
Click **� PAY RANSOM** to simulate paying — this clears all encrypted nodes, notifies the attacker, and restores the network map to a clean state.
