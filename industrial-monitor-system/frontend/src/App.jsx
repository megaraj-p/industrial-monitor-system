/**
 * App.jsx
 * Root application component.
 * Owns ALL shared state and the single WebSocket connection.
 * Passes data down to pages as props so the WS survives page navigation.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/Sidebar'
import NodeSelector from './components/NodeSelector'
import Dashboard from './pages/Dashboard'
import { fireAlertToast } from './components/NotificationPanel'
import { createWebSocketClient } from './services/websocket'
import {
    fetchNodes, fetchAlerts, fetchTelemetry,
    fetchPorts, fetchSerialStatus, connectSerial, clearAlerts,
} from './services/api'

const MAX_HISTORY = 200
const MAX_NOTIFICATIONS = 60

export default function App() {
    // ── Navigation ────────────────────────────────────────────────────────────
    const [activePage, setActivePage] = useState('dashboard')
    const [selectedNodeId, setSelectedNodeId] = useState(null)

    // ── Shared data state ─────────────────────────────────────────────────────
    const [nodes, setNodes] = useState([])
    const [alerts, setAlerts] = useState([])
    const [notifications, setNotifications] = useState([])
    const [telemetryMap, setTelemetryMap] = useState({})   // { node_id: [packets] }
    const [healthScores, setHealthScores] = useState({})   // { node_id: number }
    const [wsConnected, setWsConnected] = useState(false)
    const [faultCount, setFaultCount] = useState(0)
    const [serialStatus, setSerialStatus] = useState({
        mode: 'simulator', connected: false, port: '', baud: 115200, error: null,
    })

    // ── WebSocket message handler ref (always current, never stale) ───────────
    const handleMessageRef = useRef(null)

    // ── Load initial REST data once ───────────────────────────────────────────
    useEffect(() => {
        fetchNodes()
            .then((d) => {
                const loaded = d.nodes ?? []
                setNodes(loaded)
                setSelectedNodeId((prev) =>
                    prev == null && loaded.length > 0 ? loaded[0].node_id : prev
                )
                loaded.forEach((n) => {
                    fetchTelemetry(n.node_id, MAX_HISTORY)
                        .then((r) => {
                            setTelemetryMap((prev) => ({ ...prev, [n.node_id]: r.telemetry ?? [] }))
                        })
                        .catch(() => { })
                })
            })
            .catch(console.error)

        fetchAlerts()
            .then((d) => {
                setAlerts(d.alerts ?? [])
                setFaultCount(d.fault_count ?? 0)
            })
            .catch(console.error)

        fetchSerialStatus()
            .then((d) => setSerialStatus(d))
            .catch(console.error)
    }, [])

    // ── WebSocket message handler ─────────────────────────────────────────────
    const handleMessage = useCallback((msg) => {
        switch (msg.type) {
            case 'init': {
                const initNodes = msg.nodes ?? []
                setNodes(initNodes)
                setSelectedNodeId((prev) =>
                    prev == null && initNodes.length > 0 ? initNodes[0].node_id : prev
                )
                setAlerts(msg.alerts ?? [])
                setFaultCount(msg.fault_count ?? 0)
                break
            }
            case 'telemetry': {
                const packet = msg.data
                const nodeId = packet.node_id
                const health = msg.health_score

                setTelemetryMap((prev) => {
                    const existing = prev[nodeId] ?? []
                    const updated = [...existing, packet]
                    return { ...prev, [nodeId]: updated.slice(-MAX_HISTORY) }
                })

                if (health != null) {
                    setHealthScores((prev) => ({ ...prev, [nodeId]: health }))
                }

                const ruleAlerts = msg.alerts ?? []
                if (ruleAlerts.length > 0) {
                    setAlerts((prev) => [...ruleAlerts, ...prev].slice(0, 500))
                    setNotifications((prev) => [...ruleAlerts, ...prev].slice(0, MAX_NOTIFICATIONS))
                    ruleAlerts.forEach((a) => fireAlertToast(a))
                }

                setNodes((prev) => {
                    const idx = prev.findIndex((n) => n.node_id === nodeId)
                    if (idx === -1) return prev
                    const updated = [...prev]
                    updated[idx] = {
                        ...updated[idx],
                        temperature: packet.temperature,
                        current: packet.current,
                        vibration: packet.vibration,
                        state: packet.state,
                        online: true,
                        lastSeen: Date.now(),
                    }
                    return updated
                })
                break
            }
            case 'hardware_alert': {
                const alert = msg.alert
                setAlerts((prev) => [alert, ...prev].slice(0, 500))
                setNotifications((prev) => [alert, ...prev].slice(0, MAX_NOTIFICATIONS))
                setFaultCount((c) => c + 1)
                fireAlertToast(alert)
                break
            }
            case 'node_discovery': {
                const alert = msg.alert
                const nodeId = alert.node_id
                // Use the full node object sent by the backend if available
                const nodeData = msg.node
                setNodes((prev) => {
                    if (prev.some((n) => n.node_id === nodeId)) return prev
                    const newNode = nodeData ?? {
                        node_id: nodeId,
                        label: `Node ${String(nodeId).padStart(2, '0')}`,
                        online: true,
                        state: 'unknown',
                    }
                    const updated = [...prev, newNode]
                    setSelectedNodeId((sel) => sel == null ? nodeId : sel)
                    return updated
                })
                setNotifications((prev) => [alert, ...prev].slice(0, MAX_NOTIFICATIONS))
                fireAlertToast(alert)
                break
            }
            case 'node_online': {
                // A previously-offline hardware node has resumed sending data
                const nodeId = msg.node_id
                const nodeData = msg.node
                setNodes((prev) =>
                    prev.map((n) =>
                        n.node_id === nodeId
                            ? { ...n, ...(nodeData ?? {}), online: true }
                            : n
                    )
                )
                break
            }
            case 'node_offline': {
                const alert = msg.alert
                const nodeId = alert.node_id
                setNodes((prev) =>
                    prev.map((n) =>
                        n.node_id === nodeId ? { ...n, online: false, state: 'offline' } : n
                    )
                )
                setAlerts((prev) => [alert, ...prev].slice(0, 500))
                setNotifications((prev) => [alert, ...prev].slice(0, MAX_NOTIFICATIONS))
                fireAlertToast(alert)
                break
            }
            case 'serial_status': {
                setSerialStatus(msg.status ?? msg)
                break
            }
            default:
                break
        }
    }, [])

    handleMessageRef.current = handleMessage

    // ── WebSocket lifecycle — connect ONCE, survive page navigation ───────────
    useEffect(() => {
        const ws = createWebSocketClient({
            onMessage: (msg) => handleMessageRef.current(msg),
            onOpen: () => setWsConnected(true),
            onClose: () => setWsConnected(false),
        })
        ws.connect()
        return () => ws.disconnect()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Shared props bundle passed to every page ──────────────────────────────
    const sharedProps = {
        nodes, alerts, notifications, telemetryMap, healthScores,
        wsConnected, faultCount, selectedNodeId, serialStatus,
        onClearAlerts: () => {
            clearAlerts().then(() => {
                setAlerts([])
                setFaultCount(0)
            }).catch(console.error)
        },
        onDismissNotification: (idOrIdx) => {
            setNotifications((prev) =>
                prev.filter((n, idx) => (n.id != null ? n.id !== idOrIdx : idx !== idOrIdx))
            )
        },
    }

    return (
        <div className="flex h-screen overflow-hidden bg-surface text-white">
            <Toaster position="top-right" />

            {/* Left sidebar — receives serialStatus to show LIVE/SIM badge */}
            <Sidebar activePage={activePage} onNavigate={setActivePage} serialStatus={serialStatus} />

            {/* Main content area */}
            <main className="flex-1 overflow-y-auto">

                {/* ── Dashboard ─────────────────────────────────────────── */}
                {activePage === 'dashboard' && (
                    <Dashboard {...sharedProps} />
                )}

                {/* ── Alerts ────────────────────────────────────────────── */}
                {activePage === 'alerts' && (
                    <AlertsPage alerts={alerts} faultCount={faultCount} onClearAlerts={sharedProps.onClearAlerts} />
                )}

                {/* ── Diagnostics ───────────────────────────────────────── */}
                {activePage === 'diagnostics' && (
                    <DiagnosticsPage nodes={nodes} healthScores={healthScores} />
                )}

                {/* ── AI Analysis ───────────────────────────────────────── */}
                {activePage === 'ai' && (
                    <AIPage nodes={nodes} healthScores={healthScores} />
                )}

                {/* ── Settings ──────────────────────────────────────────── */}
                {activePage === 'settings' && (
                    <SettingsPage serialStatus={serialStatus} onStatusUpdate={setSerialStatus} />
                )}
            </main>

            {/* Right panel: node selector */}
            <NodeSelector
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                onSelect={setSelectedNodeId}
            />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-page components (defined in same file for simplicity)
// ─────────────────────────────────────────────────────────────────────────────

function AlertsPage({ alerts, faultCount, onClearAlerts }) {
    const SEVERITY_COLOR = {
        critical: 'text-accent-red',
        warning: 'text-accent-yellow',
        info: 'text-accent-blue',
    }
    const formatTs = (ts) => {
        try { return new Date(ts * 1000).toLocaleTimeString() } catch { return '—' }
    }
    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-lg font-bold text-white">All Alerts</h1>
                    <p className="text-xs text-gray-500 mt-0.5">{faultCount} active fault{faultCount !== 1 ? 's' : ''}</p>
                </div>
                {alerts.length > 0 && (
                    <button
                        onClick={onClearAlerts}
                        className="text-xs px-3 py-1.5 rounded bg-surface-elevated text-gray-400 hover:text-white hover:bg-surface-border transition-colors"
                    >
                        Clear All
                    </button>
                )}
            </div>
            <div className="card overflow-auto max-h-[calc(100vh-120px)]">
                {alerts.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">No alerts recorded.</p>
                ) : (
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-surface-border text-gray-500 text-left">
                                <th className="pb-2 pr-4">Time</th>
                                <th className="pb-2 pr-4">Severity</th>
                                <th className="pb-2 pr-4">Node</th>
                                <th className="pb-2">Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            {alerts.map((a, i) => (
                                <tr key={i} className="border-b border-surface-border/30">
                                    <td className="py-1.5 pr-4 font-mono text-gray-500 whitespace-nowrap">{formatTs(a.timestamp)}</td>
                                    <td className={`py-1.5 pr-4 font-semibold uppercase tracking-wide ${SEVERITY_COLOR[a.severity] ?? 'text-gray-400'}`}>{a.severity}</td>
                                    <td className="py-1.5 pr-4 font-mono text-accent-blue">{a.node_id != null ? `Node ${String(a.node_id).padStart(2, '0')}` : '—'}</td>
                                    <td className="py-1.5 text-gray-300">{a.message}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

function DiagnosticsPage({ nodes, healthScores }) {
    return (
        <div className="p-4">
            <h1 className="text-lg font-bold text-white mb-4">Diagnostics</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card">
                    <h3 className="text-sm font-semibold text-white mb-3">Connected Nodes</h3>
                    {nodes.length === 0 ? (
                        <p className="text-sm text-gray-500">No nodes discovered yet.</p>
                    ) : (
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-surface-border text-gray-500">
                                    <th className="text-left pb-2">Node</th>
                                    <th className="text-left pb-2">Status</th>
                                    <th className="text-left pb-2">Temp</th>
                                    <th className="text-left pb-2">Current</th>
                                    <th className="text-left pb-2">Health</th>
                                </tr>
                            </thead>
                            <tbody>
                                {nodes.map((n) => {
                                    const h = healthScores[n.node_id]
                                    return (
                                        <tr key={n.node_id} className="border-b border-surface-border/40">
                                            <td className="py-1.5 font-mono text-accent-blue">{n.label}</td>
                                            <td className="py-1.5">
                                                <span className={n.online ? 'badge-ok' : 'badge-critical'}>
                                                    {n.online ? 'Online' : 'Offline'}
                                                </span>
                                            </td>
                                            <td className="py-1.5 font-mono">{n.temperature?.toFixed(1) ?? '—'}°C</td>
                                            <td className="py-1.5 font-mono">{n.current?.toFixed(1) ?? '—'}A</td>
                                            <td className={`py-1.5 font-mono font-semibold ${h == null ? 'text-gray-500' : h >= 80 ? 'text-accent-green' : h >= 50 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                                                {h != null ? `${h.toFixed(0)}%` : '—'}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="card">
                    <h3 className="text-sm font-semibold text-white mb-3">System Info</h3>
                    <dl className="space-y-2 text-xs">
                        {[
                            ['Protocol', 'CAN Bus 2.0B'],
                            ['Serial Interface', 'STM32 USB-CDC'],
                            ['WiFi Nodes', 'ESP32 + MCP2515'],
                            ['Backend', 'FastAPI / WebSocket'],
                            ['Frontend', 'React + Vite + Tailwind'],
                        ].map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                                <dt className="text-gray-500">{k}</dt>
                                <dd className="text-white font-mono">{v}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </div>
    )
}

function AIPage({ nodes, healthScores }) {
    const HEALTH_LABEL = { running: 'Nominal', warning: 'Elevated risk', fault: 'Fault detected', offline: 'Offline' }
    return (
        <div className="p-4">
            <h1 className="text-lg font-bold text-white mb-2">AI Analysis</h1>
            <p className="text-xs text-gray-500 mb-4">Rule-based anomaly detection engine results for all active nodes.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {nodes.map((n) => {
                    const h = healthScores[n.node_id]
                    return (
                        <div className="card" key={n.node_id}>
                            <div className="text-xs text-gray-400 mb-1">{n.label}</div>
                            <div className="text-sm font-semibold text-white">{HEALTH_LABEL[n.state] ?? 'Unknown'}</div>
                            {h != null && (
                                <div className={`text-lg font-bold font-mono mt-1 ${h >= 80 ? 'text-accent-green' : h >= 50 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                                    {h.toFixed(0)}%
                                </div>
                            )}
                            <div className="mt-2 text-[11px] text-gray-500">
                                {n.temperature?.toFixed(1) ?? '—'}°C · {n.current?.toFixed(1) ?? '—'}A · {n.vibration?.toFixed(3) ?? '—'}g
                            </div>
                        </div>
                    )
                })}
                {nodes.length === 0 && (
                    <div className="col-span-4 card py-8 text-center text-sm text-gray-500">No nodes connected yet.</div>
                )}
            </div>
        </div>
    )
}

function SettingsPage({ serialStatus, onStatusUpdate }) {
    const [ports, setPorts] = React.useState([])
    const [port, setPort] = React.useState('')
    const [baud, setBaud] = React.useState(115200)
    const [simulate, setSimulate] = React.useState(true)
    const [saving, setSaving] = React.useState(false)
    const [saveMsg, setSaveMsg] = React.useState('')

    React.useEffect(() => {
        fetchPorts().then((d) => {
            const list = d.ports ?? []
            setPorts(list)
            if (!port && list.length > 0) setPort(list[0])
        }).catch(console.error)
        if (serialStatus) {
            setPort(serialStatus.port || '')
            setBaud(serialStatus.baud || 115200)
            setSimulate(serialStatus.mode === 'simulator')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleConnect = async (e) => {
        e.preventDefault()
        setSaving(true)
        setSaveMsg('')
        try {
            const result = await connectSerial({ port: simulate ? null : port, baud, simulate })
            onStatusUpdate(result.status ?? result)
            setSaveMsg('Connected successfully.')
        } catch (err) {
            setSaveMsg('Error: ' + (err.message ?? err))
        } finally {
            setSaving(false)
        }
    }

    const IS_LIVE = serialStatus?.mode === 'serial' && serialStatus?.connected

    return (
        <div className="p-4 max-w-xl">
            <h1 className="text-lg font-bold text-white mb-4">Settings</h1>

            {/* Current status banner */}
            <div className={`mb-4 flex items-center gap-3 rounded-lg px-4 py-3 border text-sm ${IS_LIVE ? 'border-accent-green/40 bg-accent-green/5 text-accent-green' : 'border-accent-yellow/40 bg-accent-yellow/5 text-accent-yellow'}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${IS_LIVE ? 'bg-accent-green animate-pulse' : 'bg-accent-yellow'}`} />
                <span className="font-semibold">{IS_LIVE ? 'LIVE — Hardware Connected' : 'SIMULATOR — Demo Mode'}</span>
                {serialStatus?.port && <span className="ml-auto font-mono text-xs text-gray-400">{serialStatus.port} @ {serialStatus.baud}</span>}
            </div>

            {serialStatus?.error && (
                <div className="mb-4 rounded-lg px-4 py-3 border border-accent-red/40 bg-accent-red/5 text-accent-red text-xs font-mono">
                    {serialStatus.error}
                </div>
            )}

            {/* Serial config form */}
            <div className="card">
                <h3 className="text-sm font-semibold text-white mb-4">Serial Port Configuration</h3>
                <form onSubmit={handleConnect} className="space-y-4">

                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <div className={`relative w-10 h-5 rounded-full transition-colors ${simulate ? 'bg-accent-yellow/60' : 'bg-surface-border'}`}>
                            <input type="checkbox" className="sr-only" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
                            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${simulate ? 'translate-x-5' : ''}`} />
                        </div>
                        <span className="text-sm text-gray-300">Use simulator (no hardware required)</span>
                    </label>

                    {!simulate && (
                        <>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">COM Port</label>
                                <div className="flex gap-2">
                                    <select
                                        value={port}
                                        onChange={(e) => setPort(e.target.value)}
                                        className="flex-1 bg-surface-elevated border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-blue"
                                    >
                                        {ports.length === 0 && <option value="">— no ports detected —</option>}
                                        {ports.map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => fetchPorts().then((d) => setPorts(d.ports ?? [])).catch(console.error)}
                                        className="px-3 py-2 text-xs rounded bg-surface-elevated border border-surface-border text-gray-400 hover:text-white transition-colors"
                                        title="Refresh COM ports"
                                    >
                                        ↻
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Baud Rate</label>
                                <select
                                    value={baud}
                                    onChange={(e) => setBaud(Number(e.target.value))}
                                    className="w-full bg-surface-elevated border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-blue"
                                >
                                    {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((b) => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full py-2 rounded bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/80 disabled:opacity-50 transition-colors"
                    >
                        {saving ? 'Connecting…' : simulate ? 'Start Simulator' : 'Connect to Hardware'}
                    </button>

                    {saveMsg && (
                        <p className={`text-xs ${saveMsg.startsWith('Error') ? 'text-accent-red' : 'text-accent-green'}`}>
                            {saveMsg}
                        </p>
                    )}
                </form>
            </div>

            {/* Connection info */}
            <div className="card mt-4">
                <h3 className="text-sm font-semibold text-white mb-3">Connection Info</h3>
                <dl className="space-y-2 text-xs">
                    <div className="flex justify-between">
                        <dt className="text-gray-500">WebSocket URL</dt>
                        <dd className="font-mono text-accent-blue">{import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws'}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-gray-500">REST API URL</dt>
                        <dd className="font-mono text-accent-blue">{import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}</dd>
                    </div>
                </dl>
            </div>
        </div>
    )
}
