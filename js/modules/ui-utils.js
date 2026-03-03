/**
 * UI UTILITY MODULE
 * Shared helper functions for rendering and logging.
 */

// Device type → emoji icon
export const getIcon = (type) => {
    const icons = {
        server: '🗄️',
        db: '🛢️',
        printer: '🖨️',
        mobile: '📱',
        laptop: '💻',
        cam: '📷',
        pump: '⚙️',
        thermo: '🌡️',
        hmi: '🖥️',
    };
    return icons[type] || '💻';
};

// IP ↔ Firebase key helpers (dots are illegal in Firebase keys)
export const formatIPForFirebase = (ip) => ip.replace(/\./g, '_');
export const formatIPFromFirebase = (key) => key.replace(/_/g, '.');

/**
 * Appends a new line to a terminal-style log element.
 * @param {HTMLElement} container - The scrollable log div.
 * @param {string} text - The text to append.
 * @param {string} [className=''] - CSS class for colouring (e.g. 'success', 'error').
 * @returns {HTMLElement} The created div.
 */
export const appendToLog = (container, text, className = '') => {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    container.appendChild(div);
    // Keep scroll pinned to the bottom
    container.scrollTop = container.scrollHeight;
    return div;
};

/**
 * Generates the DOM element for a single network node card.
 * Shows icon, hostname, and IP address.
 * @param {Object} host - A host entry from network-data.js.
 * @returns {HTMLElement}
 */
export const createNodeElement = (host) => {
    const node = document.createElement('div');
    node.className = 'node';
    node.id = `node-${formatIPForFirebase(host.ip)}`;

    const icon = document.createElement('i');
    icon.textContent = getIcon(host.type);

    const name = document.createElement('span');
    name.className = 'node-host';
    name.textContent = host.hostname || host.ip;

    const ip = document.createElement('span');
    ip.className = 'node-ip';
    ip.textContent = host.ip;

    node.append(icon, name, ip);
    return node;
};