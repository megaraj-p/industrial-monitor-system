/**
 * websocket.js
 * Manages the WebSocket connection to the FastAPI backend.
 *
 * Usage
 * -----
 * const ws = createWebSocketClient({ onMessage, onOpen, onClose })
 * ws.connect()
 * // later:
 * ws.disconnect()
 */

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'

/**
 * @param {object} handlers
 * @param {(data: object) => void} handlers.onMessage   – called with parsed JSON
 * @param {() => void}             handlers.onOpen      – called on connection open
 * @param {() => void}             handlers.onClose     – called on disconnect
 * @param {(err: Event) => void}   handlers.onError     – called on error
 * @param {number}                 [reconnectDelay=3000] – ms before reconnect
 */
export function createWebSocketClient({
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectDelay = 3000,
}) {
    let socket = null
    let shouldReconnect = true
    let reconnectTimer = null

    function connect() {
        if (socket && socket.readyState === WebSocket.OPEN) return

        socket = new WebSocket(WS_URL)

        socket.onopen = () => {
            console.info('[WS] Connected to backend')
            onOpen?.()
        }

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                onMessage?.(data)
            } catch {
                console.warn('[WS] Failed to parse message:', event.data)
            }
        }

        socket.onclose = () => {
            console.warn('[WS] Disconnected')
            onClose?.()
            if (shouldReconnect) {
                reconnectTimer = setTimeout(connect, reconnectDelay)
            }
        }

        socket.onerror = (err) => {
            console.error('[WS] Error', err)
            onError?.(err)
        }
    }

    function disconnect() {
        shouldReconnect = false
        clearTimeout(reconnectTimer)
        socket?.close()
    }

    function isConnected() {
        return socket?.readyState === WebSocket.OPEN
    }

    return { connect, disconnect, isConnected }
}
