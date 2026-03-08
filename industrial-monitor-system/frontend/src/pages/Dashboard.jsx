/**
 * Dashboard.jsx
 * Main monitoring page — pure presentation component.
 * All data and state is received via props from App.jsx.
 */

import React from 'react'

import SensorCards from '../components/SensorCards'
import AlertsPanel from '../components/AlertsPanel'
import NotificationPanel from '../components/NotificationPanel'
import TemperatureChart from '../components/charts/TemperatureChart'
import CurrentChart from '../components/charts/CurrentChart'
import VibrationChart from '../components/charts/VibrationChart'

export default function Dashboard({
    nodes = [],
    alerts = [],
    notifications = [],
    telemetryMap = {},
    healthScores = {},
    wsConnected = false,
    faultCount = 0,
    selectedNodeId = null,
    serialStatus = {},
    onClearAlerts,
    onDismissNotification,
}) {
    const selectedHistory = telemetryMap[selectedNodeId] ?? []
    const latestPacket = selectedHistory[selectedHistory.length - 1] ?? null
    const selectedHealth = healthScores[selectedNodeId] ?? null
    const onlineCount = nodes.filter((n) => n.online).length
    const isLive = serialStatus?.mode === 'serial' && serialStatus?.connected

    return (
        <div className="flex flex-col gap-4 p-4 overflow-y-auto">
            {/* ── Top summary bar ──────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h1 className="text-lg font-bold text-white">
                        {selectedNodeId
                            ? `Node ${String(selectedNodeId).padStart(2, '0')} — Live Telemetry`
                            : 'System Overview'}
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        CAN Bus Machine Monitoring · Real-time SCADA Dashboard
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Serial mode badge */}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${isLive
                        ? 'border-accent-green/50 bg-accent-green/10 text-accent-green'
                        : 'border-accent-yellow/50 bg-accent-yellow/10 text-accent-yellow'}`}>
                        {isLive ? '● LIVE' : '○ SIM'}
                    </span>
                    {/* WebSocket indicator */}
                    <span className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
                    <span className="text-xs text-gray-400">{wsConnected ? 'Connected' : 'Reconnecting…'}</span>
                </div>
            </div>

            {/* ── KPI row ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
                <div className="card text-center">
                    <div className="text-2xl font-bold font-mono text-accent-green">{onlineCount}</div>
                    <div className="text-xs text-gray-400 mt-0.5">Active Nodes</div>
                </div>
                <div className="card text-center">
                    <div className="text-2xl font-bold font-mono text-accent-red">{faultCount}</div>
                    <div className="text-xs text-gray-400 mt-0.5">Active Faults</div>
                </div>
                <div className="card text-center">
                    <div className={`text-2xl font-bold font-mono ${selectedHealth == null ? 'text-gray-500'
                        : selectedHealth >= 80 ? 'text-accent-green'
                            : selectedHealth >= 50 ? 'text-accent-yellow'
                                : 'text-accent-red'
                        }`}>
                        {selectedHealth != null ? `${selectedHealth.toFixed(0)}%` : '—'}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">AI Health Score</div>
                </div>
            </div>

            {/* ── Sensor cards ──────────────────────────────────────────── */}
            {selectedNodeId ? (
                <SensorCards telemetry={latestPacket} healthScore={selectedHealth} />
            ) : (
                <div className="card py-6 text-center text-sm text-gray-500">
                    Select a machine node from the right panel to view sensor data.
                </div>
            )}

            {/* ── Charts ───────────────────────────────────────────────── */}
            {selectedNodeId && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <TemperatureChart history={selectedHistory} />
                    <CurrentChart history={selectedHistory} />
                    <VibrationChart history={selectedHistory} />
                </div>
            )}

            {/* ── Alerts + Notifications ────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <div className="xl:col-span-2">
                    <AlertsPanel
                        alerts={alerts}
                        nodeId={selectedNodeId}
                        onClearAlerts={onClearAlerts}
                    />
                </div>
                <NotificationPanel notifications={notifications} onDismiss={onDismissNotification} />
            </div>
        </div>
    )
}
