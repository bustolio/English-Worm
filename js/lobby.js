/**
 * LOBBY ENGINE
 * Fetches available rooms from Firebase and handles role selection.
 */
import { db, ref, onValue } from './core/firebase.js';

const roomListEl = document.getElementById('room-list');
const roleModal = document.getElementById('role-modal');
const modalRoom = document.getElementById('modal-room-name');
const btnCancel = document.getElementById('btn-modal-cancel');
const btnAttacker = document.getElementById('btn-join-attacker');
const btnVictim = document.getElementById('btn-join-victim');

let selectedRoom = null;

/* ── Fetch Rooms ────────────────────────────────────────── */
onValue(ref(db, 'rooms'), (snap) => {
    roomListEl.innerHTML = '';
    const data = snap.val();

    if (!data) {
        const empty = document.createElement('div');
        empty.className = 'room-empty-state';
        empty.textContent = 'NO ACTIVE SIMULATIONS FOUND';
        roomListEl.appendChild(empty);
        return;
    }

    const roomIds = Object.keys(data);
    roomIds.forEach(id => {
        const card = document.createElement('div');
        card.className = 'room-card';

        const h3 = document.createElement('h3');
        h3.textContent = id;

        const stats = document.createElement('div');
        stats.className = 'room-stats';
        stats.innerHTML = '<span style="color:var(--green)">WAITING FOR DEPLOYMENT</span>';

        card.append(h3, stats);

        // Open modal on click
        card.addEventListener('click', () => {
            selectedRoom = id;
            modalRoom.textContent = id;
            roleModal.classList.add('visible');
        });

        roomListEl.appendChild(card);
    });
});

/* ── Modal Actions ──────────────────────────────────────── */
btnCancel.addEventListener('click', () => {
    roleModal.classList.remove('visible');
    selectedRoom = null;
});

btnAttacker.addEventListener('click', () => {
    if (selectedRoom) window.location.href = `attacker.html?id=${encodeURIComponent(selectedRoom)}`;
});

btnVictim.addEventListener('click', () => {
    if (selectedRoom) window.location.href = `victim.html?id=${encodeURIComponent(selectedRoom)}`;
});
