/**
 * api.js
 * REST API client for the Industrial Monitor backend.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`API ${res.status}: ${text}`)
    }
    return res.json()
}

/** Fetch all discovered machine nodes */
export function fetchNodes() {
    return request('/nodes')
}

/** Fetch telemetry history for a specific node */
export function fetchTelemetry(nodeId, limit = 100) {
    return request(`/telemetry/${nodeId}?limit=${limit}`)
}

/** Fetch alerts (optionally filtered by node) */
export function fetchAlerts(nodeId = null, limit = 100) {
    const query = nodeId ? `?node_id=${nodeId}&limit=${limit}` : `?limit=${limit}`
    return request(`/alerts${query}`)
}

/** Backend health check */
export function fetchHealth() {
    return request('/health')
}

/** List available serial ports */
export function fetchPorts() {
    return request('/ports')
}

/** Get current serial connection status */
export function fetchSerialStatus() {
    return request('/serial/status')
}

/**
 * Connect to a serial port or switch to simulator.
 * @param {{ port?: string, baud?: number, simulate?: boolean }} config
 */
export function connectSerial(config) {
    return request('/serial/connect', {
        method: 'POST',
        body: JSON.stringify(config),
    })
}

/** Get min/max/avg stats for a node */
export function fetchNodeStats(nodeId) {
    return request(`/stats/${nodeId}`)
}

/** Clear all stored alerts */
export function clearAlerts() {
    return request('/alerts', { method: 'DELETE' })
}
