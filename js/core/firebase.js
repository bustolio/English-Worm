import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, onChildAdded, onDisconnect, remove, get, goOffline } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    databaseURL: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// === Inactivity Timeout Logic ===
const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
let inactivityTimer;
let isDisconnected = false;

function resetInactivityTimer() {
    if (isDisconnected) return; // Do not reconnect automatically

    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(disconnectDueToInactivity, INACTIVITY_TIMEOUT_MS);
}

function disconnectDueToInactivity() {
    if (isDisconnected) return;

    console.warn("User has been inactive for 5 minutes. Disconnecting from Firebase...");
    goOffline(db);
    isDisconnected = true;

    // Dispatch an event in case other modules want to react to this
    window.dispatchEvent(new CustomEvent('firebase-disconnected', {
        detail: { reason: 'inactivity' }
    }));

    alert("You have been disconnected from the database due to 5 minutes of inactivity. Please refresh the page to reconnect.");
}

// Listen for common user interactions to reset the timer
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(eventType => {
    window.addEventListener(eventType, resetInactivityTimer, { passive: true });
});

// Initialize the timer
resetInactivityTimer();

// === Disconnect on Tab Close ===
window.addEventListener('beforeunload', () => {
    if (!isDisconnected) {
        goOffline(db);
    }
});

// === Global Admin Controls (Lockdown & Force Disconnect) ===
const isAdminPage = window.location.pathname.includes('admin.html');
let passwordVerified = false;

onValue(ref(db, 'settings'), (snap) => {
    const settings = snap.val();
    if (!settings) return;

    // Admin pages bypass these restrictions to prevent locking themselves out
    if (isAdminPage) return;

    // 1. Force Disconnect All
    if (settings.forceDisconnect && !isDisconnected) {
        // Only trigger if the timestamp is recent (within 5 seconds) to avoid immediate
        // disconnect for users joining after an old force disconnect command
        if (Date.now() - settings.forceDisconnect.time < 10000) {
            console.warn("Global purge command received from admin.");
            goOffline(db);
            isDisconnected = true;
            alert("A network administrator has forcibly closed all connections.");
        }
    }

    // 2. Site Lockdown
    if (settings.lockdown && settings.lockdown.enabled) {
        if (!passwordVerified) {
            const pwd = prompt("🛑 SYSTEM LOCKDOWN ACTIVE 🛑\n\nEnter the administrator bypass password to proceed:");
            if (pwd === settings.lockdown.password) {
                passwordVerified = true;
                alert("Bypass accepted. Welcome.");
            } else {
                goOffline(db);
                isDisconnected = true;
                document.body.innerHTML = `
                    <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; background-color:#050505; color:red; font-family:monospace;">
                        <h1 style="font-size:3rem;">ACCESS DENIED</h1>
                        <p>The simulation is currently in lockdown mode by administrators.</p>
                        <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; background:red; color:white; border:none; cursor:pointer;">RETRY LOGIN</button>
                    </div>
                `;
            }
        }
    }
});

export { ref, set, push, onValue, onChildAdded, onDisconnect, remove, get, goOffline };