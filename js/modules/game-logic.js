import { db, ref, set, push } from '../core/firebase.js';

/**
 * GAME LOGIC MODULE
 * Shared server-side Firebase operations for the simulation.
 * The victim executes these; the attacker receives responses.
 */

/** Updates a node's status in the cloud. */
export const updateNodeStatus = (roomPath, ip, status) => {
    const key = ip.replace(/\./g, '_');
    return set(ref(db, `${roomPath}/mapState/${key}`), {
        status,
        time: Date.now()
    });
};

/** Pushes a message into the attacker's response queue. */
export const notifyAttacker = (roomPath, text, style, action = null) =>
    push(ref(db, `${roomPath}/responses`), { text, style, action, time: Date.now() });


/**
 * WORM MODULE
 * Self-replicating propagation across a subnet.
 * Infects all vulnerable hosts in the attacker's current subnet, one by one.
 */
export const spreadWorm = async (roomPath, originIP, networkData) => {
    if (!originIP) {
        await notifyAttacker(roomPath, "[-] Error: No initial foothold. Run exploit first.", "error");
        return;
    }

    await notifyAttacker(roomPath, "[!] WORM PROPAGATION INITIATED — analysing segment...", "log-alert");

    const subnet = networkData.find(net => net.hosts.some(h => h.ip === originIP));
    if (!subnet) {
        await notifyAttacker(roomPath, "[-] Error: Network segment unreachable.", "error");
        return;
    }

    for (const host of subnet.hosts) {
        if (host.ip === originIP) continue;

        await new Promise(r => setTimeout(r, 1400));

        if (host.vuln) {
            await updateNodeStatus(roomPath, host.ip, 'infected');
            await notifyAttacker(roomPath, `[+] ${host.ip} (${host.hostname}) — COMPROMISED via CVE-2026-WORM`, "success");
        } else {
            await notifyAttacker(roomPath, `[*] ${host.ip} (${host.hostname}) — Patched, skipping.`, "info");
        }
    }

    await notifyAttacker(roomPath, "[✓] Worm propagation complete. Subnet owned.", "success");
};


/**
 * IDS / TRACE MODULE
 * Simulates a Blue Team actively tracing back the attacker.
 * Fires a "kill" action on the attacker when the trace completes.
 */
export const triggerTrace = (roomPath, onProgressUpdate) => {
    let progress = 0;
    const interval = setInterval(async () => {
        progress += 10;
        onProgressUpdate(progress);

        if (progress % 20 === 0) {
            await notifyAttacker(roomPath, `[!] IDS ALERT: Trace at ${progress}% — obfuscate your traffic!`, "error");
        }

        if (progress >= 100) {
            clearInterval(interval);
            await notifyAttacker(roomPath, "⚠  ACCESS DENIED — IDS Trace complete. Connection severed.", "error", "kill");
        }
    }, 8000); // 80second countdown

    return interval;
};


/**
 * EXFILTRATION MODULE
 * Simulates stealing sensitive files from infected nodes.
 */
export const runExfiltrate = async (roomPath) => {
    await notifyAttacker(roomPath, "[*] Opening covert HTTPS tunnel to C2...", "info");

    // Trigger the visual data particle burst on the victim's UI
    await notifyAttacker(roomPath, "SIG_EXFIL", "hidden", "exfiltrate_ui");

    const files = [
        { name: "/etc/shadow", size: "2.1 KB" },
        { name: "db_backup_2025.sql", size: "4.8 MB" },
        { name: "private_keys.bak", size: "12 KB" },
        { name: "finance_Q4_2025.xlsx", size: "1.3 MB" },
        { name: "ad_users_export.csv", size: "340 KB" },
    ];

    for (const file of files) {
        await new Promise(r => setTimeout(r, 900));
        await notifyAttacker(roomPath, `[+] ${file.name}  (${file.size})  ▶  C2 Server`, "success");
    }

    await notifyAttacker(roomPath, "[✓] Exfiltration complete. Wiping tunnel logs.", "success");
};