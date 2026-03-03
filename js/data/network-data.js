/**
 * NETWORK TOPOLOGY DATA
 * Defines the simulated target network for the Cyber Worm Simulation.
 * Each subnet has a name, CIDR prefix, optional Wi-Fi info, and a list of hosts.
 * Each host has an IP, hostname, device type, and vulnerability flag.
 */
export const globalNetworkData = [
    {
        id: "office",
        name: "🏢 Corporate Office – 192.168.1.x",
        cidr: "192.168.1",
        wifi: { ssid: "CORP_SECURE", type: "WPA2-Enterprise", signal: "88%" },
        hosts: [
            { ip: "192.168.1.10", hostname: "ceo-laptop", type: "laptop", vuln: false },
            { ip: "192.168.1.11", hostname: "hr-pc", type: "laptop", vuln: false },
            { ip: "192.168.1.55", hostname: "shared-print", type: "printer", vuln: true },
            { ip: "192.168.1.80", hostname: "fileserver01", type: "server", vuln: true }
        ]
    },
    {
        id: "guest",
        name: "📶 Guest Wi-Fi – 172.16.0.x",
        cidr: "172.16.0",
        wifi: { ssid: "GUEST_OPEN", type: "OPEN", signal: "100%" },
        hosts: [
            { ip: "172.16.0.20", hostname: "visitor-phone", type: "mobile", vuln: true },
            { ip: "172.16.0.22", hostname: "loaner-laptop", type: "laptop", vuln: true },
            { ip: "172.16.0.30", hostname: "lobby-cam", type: "cam", vuln: true }
        ]
    },
    {
        id: "datacenter",
        name: "🗄️  Data Center – 10.0.0.x",
        cidr: "10.0.0",
        hosts: [
            { ip: "10.0.0.5", hostname: "web-srv-01", type: "server", vuln: true },
            { ip: "10.0.0.6", hostname: "db-master", type: "db", vuln: true },
            { ip: "10.0.0.7", hostname: "db-replica", type: "db", vuln: false },
            { ip: "10.0.0.10", hostname: "backup-srv", type: "server", vuln: false }
        ]
    },
    {
        id: "iot",
        name: "⚙️  ICS / OT Network – 10.10.0.x",
        cidr: "10.10.0",
        hosts: [
            { ip: "10.10.0.1", hostname: "plc-ctrl-01", type: "hmi", vuln: true },
            { ip: "10.10.0.2", hostname: "scada-hmi", type: "hmi", vuln: true },
            { ip: "10.10.0.10", hostname: "thermo-ctrl", type: "thermo", vuln: true },
            { ip: "10.10.0.11", hostname: "pump-ctrl", type: "pump", vuln: false }
        ]
    }
];