/**
 * AlertsPanel.jsx
 * Table of recent alerts. Click any row to expand full details + remediation hints.
 */

import React, { useState } from 'react'
import { format } from 'date-fns'

// ---------------------------------------------------------------------------
// Remediation knowledge base — keyed by alert_type
// ---------------------------------------------------------------------------
const REMEDIATION = {
    overcurrent: {
        cause: 'Electrical current exceeded the safe hardware threshold. The STM32 protection circuit has triggered an automatic power cut-off.',
        steps: [
            'Inspect the motor or actuator connected to this node for a mechanical jam or stall.',
            'Check the power supply rail voltage — an undervoltage condition can draw excess current.',
            'Verify wiring insulation for short circuits between phases or to ground.',
            'After resolving the root cause, reset the node and monitor current on restart.',
            'If the fault repeats, replace the current-sensing shunt or driver IC.',
        ],
    },
    current_warning: {
        cause: 'Current is elevated above the warning threshold but has not yet reached the hardware cut-off limit.',
        steps: [
            'Reduce the mechanical load on the machine if possible.',
            'Monitor the trend — if current keeps rising, schedule a planned shutdown.',
            'Inspect for partial mechanical blockage or increased friction in moving parts.',
            'Check for a deteriorating motor winding resistance (increasing over time signals wear).',
        ],
    },
    overtemp: {
        cause: 'Temperature exceeded the critical threshold. The STM32 protection has triggered an automatic shutdown to prevent component damage.',
        steps: [
            'Allow the machine to cool completely before restarting.',
            'Check and clean cooling fans, heat sinks, or ventilation paths.',
            'Verify the thermal paste / pad on power components has not dried out.',
            'Reduce duty cycle or operating speed to lower heat generation.',
            'Check ambient temperature — if the environment is too hot, add external cooling.',
            'If the fault is immediate on cold start, inspect the temperature sensor for a fault.',
        ],
    },
    temp_warning: {
        cause: 'Temperature is rising toward the critical threshold. No shutdown has occurred yet.',
        steps: [
            'Check that cooling fans are spinning and airflow is unrestricted.',
            'Reduce machine load temporarily to bring temperature down.',
            'Inspect for blocked ventilation grilles or excessive dust buildup.',
            'Monitor the trend closely — schedule maintenance if temperature keeps climbing.',
        ],
    },
    vibration_critical: {
        cause: 'Vibration levels indicate severe mechanical instability. Continued operation risks structural damage or bearing failure.',
        steps: [
            'Stop the machine immediately and lock out / tag out before inspecting.',
            'Check all mounting bolts and fasteners for looseness.',
            'Inspect rotating components (bearings, shafts, couplings) for wear or damage.',
            'Check for mass imbalance on rotating assemblies — re-balance if needed.',
            'Inspect the base frame / mounting surface for cracks or deformation.',
        ],
    },
    vibration_warning: {
        cause: 'Vibration is above the normal baseline, suggesting developing mechanical wear or imbalance.',
        steps: [
            'Schedule a maintenance inspection at the next available opportunity.',
            'Check mounting bolts and tighten if loose.',
            'Listen for abnormal bearing noise during operation.',
            'Log the vibration trend — a steady increase indicates progressing wear.',
            'Consider vibration spectrum analysis to identify the frequency source.',
        ],
    },
    offline: {
        cause: 'The node stopped sending data for more than 10 seconds. It may have lost power, experienced a firmware crash, or has a CAN bus communication fault.',
        steps: [
            'Check the power supply to the node (verify LED indicators if present).',
            'Inspect the CAN bus cable for disconnection, damage, or incorrect termination.',
            'Verify CAN bus termination resistors (120 Ω) are present at both ends of the bus.',
            'Check for a firmware hang — cycle power to the STM32 node.',
            'Review the system log for the last packet timestamp to estimate when it went offline.',
        ],
    },
    node_connected: {
        cause: 'A new machine node was detected on the CAN bus for the first time.',
        steps: [
            'Verify this is an expected node — confirm node ID matches your hardware configuration.',
            'Check initial sensor readings are within normal ranges.',
            'No further action required if the node ID is correct.',
        ],
    },
}

const DEFAULT_REMEDIATION = {
    cause: 'An unexpected condition was flagged by the monitoring system.',
    steps: [
        'Review the full alert message and the sensor value at the time of the event.',
        'Cross-reference with recent maintenance or operational changes on this machine.',
        'If the alert persists, escalate to the maintenance team for on-site inspection.',
    ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SEVERITY_BADGE = {
    critical: 'badge-critical',
    warning: 'badge-warning',
    info: 'badge-info',
}

const SEVERITY_ICON = {
    critical: '🔴',
    warning: '⚠️',
    info: 'ℹ️',
}

const DETAIL_BG = {
    critical: 'bg-red-950/40 border-red-500/30',
    warning: 'bg-yellow-950/40 border-yellow-500/30',
    info: 'bg-blue-950/40 border-blue-500/30',
}

function formatTs(ts) {
    if (!ts) return '—'
    try {
        return format(new Date(ts * 1000), 'dd MMM HH:mm:ss')
    } catch {
        return '—'
    }
}

// ---------------------------------------------------------------------------
// Expandable row
// ---------------------------------------------------------------------------
function AlertRow({ alert }) {
    const [open, setOpen] = useState(false)
    const remedy = REMEDIATION[alert.alert_type] ?? DEFAULT_REMEDIATION

    return (
        <>
            {/* Main table row */}
            <tr
                onClick={() => setOpen((o) => !o)}
                className={`border-b border-surface-border/50 cursor-pointer transition-colors ${open ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/50'
                    }`}
            >
                <td className="py-2 text-base">{SEVERITY_ICON[alert.severity] ?? '•'}</td>
                <td className="py-2 text-gray-400 font-mono whitespace-nowrap">{formatTs(alert.timestamp)}</td>
                <td className="py-2 font-mono text-accent-blue whitespace-nowrap">
                    Node {String(alert.node_id).padStart(2, '0')}
                </td>
                <td className="py-2 text-gray-300 font-mono whitespace-nowrap">{alert.alert_type}</td>
                <td className="py-2 text-gray-300 max-w-xs truncate">{alert.message}</td>
                <td className="py-2">
                    <span className={SEVERITY_BADGE[alert.severity] ?? 'badge-info'}>
                        {alert.severity}
                    </span>
                </td>
                <td className="py-2 text-gray-500 text-base select-none">{open ? '▲' : '▼'}</td>
            </tr>

            {/* Expanded detail row */}
            {open && (
                <tr className="border-b border-surface-border/50">
                    <td colSpan={7} className="pb-3 pt-1 px-2">
                        <div className={`rounded-lg border p-3 text-xs space-y-3 ${DETAIL_BG[alert.severity] ?? 'bg-surface-elevated border-surface-border'}`}>

                            {/* Node + value summary */}
                            <div className="flex flex-wrap gap-4 text-[11px] font-mono">
                                <span>
                                    <span className="text-gray-500">Node: </span>
                                    <span className="text-accent-blue font-semibold">
                                        Node {String(alert.node_id).padStart(2, '0')}
                                    </span>
                                </span>
                                <span>
                                    <span className="text-gray-500">Type: </span>
                                    <span className="text-gray-200">{alert.alert_type}</span>
                                </span>
                                {alert.value != null && (
                                    <span>
                                        <span className="text-gray-500">Value: </span>
                                        <span className="text-gray-200">{alert.value}</span>
                                    </span>
                                )}
                                {alert.action && (
                                    <span>
                                        <span className="text-gray-500">Action taken: </span>
                                        <span className="text-gray-200">{alert.action.replace(/_/g, ' ')}</span>
                                    </span>
                                )}
                            </div>

                            {/* Full message */}
                            <div>
                                <p className="text-gray-500 uppercase tracking-wider text-[10px] font-semibold mb-1">What happened</p>
                                <p className="text-gray-200 leading-relaxed">{alert.message}</p>
                                <p className="text-gray-400 leading-relaxed mt-1">{remedy.cause}</p>
                            </div>

                            {/* Remediation steps */}
                            <div>
                                <p className="text-gray-500 uppercase tracking-wider text-[10px] font-semibold mb-1">
                                    🔧 How to resolve
                                </p>
                                <ol className="list-decimal list-inside space-y-1 text-gray-300 leading-relaxed">
                                    {remedy.steps.map((step, i) => (
                                        <li key={i}>{step}</li>
                                    ))}
                                </ol>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
export default function AlertsPanel({ alerts = [], nodeId = null, onClearAlerts }) {
    const filtered = nodeId
        ? alerts.filter((a) => a.node_id === nodeId)
        : alerts

    return (
        <div className="card flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                    {nodeId ? `Alerts — Node ${String(nodeId).padStart(2, '0')}` : 'Recent Alerts'}
                </h2>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">Click a row for details & fix steps</span>
                    <span className="badge-critical">
                        {filtered.filter((a) => a.severity === 'critical').length} critical
                    </span>
                    {onClearAlerts && filtered.length > 0 && (
                        <button
                            onClick={onClearAlerts}
                            className="text-[11px] px-2 py-0.5 rounded bg-surface-elevated text-gray-500 hover:text-white hover:bg-surface-border transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-500">No alerts recorded yet.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-surface-border text-gray-500">
                                <th className="text-left pb-2 font-medium w-6" />
                                <th className="text-left pb-2 font-medium">Time</th>
                                <th className="text-left pb-2 font-medium">Node</th>
                                <th className="text-left pb-2 font-medium">Type</th>
                                <th className="text-left pb-2 font-medium">Message</th>
                                <th className="text-left pb-2 font-medium">Severity</th>
                                <th className="w-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.slice(0, 50).map((alert) => (
                                <AlertRow key={alert.id} alert={alert} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
