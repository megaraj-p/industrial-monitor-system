/**
 * NotificationPanel.jsx
 * Live notification feed showing the most recent events in a side panel.
 * Also exports the utility hook `useToastAlerts` that fires toast popups.
 */

import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// ---------------------------------------------------------------------------
// Toast helper — call this from the App-level WebSocket handler
// ---------------------------------------------------------------------------

export function fireAlertToast(alert) {
    const icon =
        alert.severity === 'critical' ? '🔴'
            : alert.severity === 'warning' ? '⚠️'
                : 'ℹ️'

    const msg = `${icon} ${alert.message}`

    if (alert.severity === 'critical') {
        toast.error(msg, { duration: 8000 })
    } else if (alert.severity === 'warning') {
        toast(msg, {
            icon: '⚠️',
            style: {
                background: '#161b22',
                color: '#d29922',
                border: '1px solid #d29922',
            },
            duration: 6000,
        })
    } else {
        toast.success(msg, { duration: 4000 })
    }
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

function formatTs(ts) {
    try {
        return format(new Date(ts * 1000), 'HH:mm:ss')
    } catch {
        return '—'
    }
}

const SEVERITY_DOT = {
    critical: 'bg-accent-red',
    warning: 'bg-accent-yellow',
    info: 'bg-accent-blue',
}

const SEVERITY_BORDER = {
    critical: 'border-red-500/40 bg-red-500/5',
    warning: 'border-yellow-500/40 bg-yellow-500/5',
    info: 'border-blue-500/40 bg-blue-500/5',
}

const SEVERITY_LABEL = {
    critical: { text: 'CRITICAL', cls: 'text-red-400' },
    warning: { text: 'WARNING', cls: 'text-yellow-400' },
    info: { text: 'INFO', cls: 'text-blue-400' },
}

function NotificationItem({ n, idx, onDismiss }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div
            className={`relative border rounded-lg px-3 py-2 transition-colors cursor-pointer select-none ${SEVERITY_BORDER[n.severity] ?? 'border-gray-700'}`}
            onClick={() => setExpanded((e) => !e)}
        >
            {/* Top row: dot + severity label + timestamp + dismiss */}
            <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${SEVERITY_DOT[n.severity] ?? 'bg-gray-500'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${SEVERITY_LABEL[n.severity]?.cls ?? 'text-gray-400'}`}>
                    {SEVERITY_LABEL[n.severity]?.text ?? n.severity}
                </span>
                <span className="text-[10px] text-gray-500 font-mono ml-auto shrink-0">{formatTs(n.timestamp)}</span>
                {onDismiss && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDismiss(n.id ?? idx) }}
                        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-600 transition-colors text-base leading-none"
                        title="Dismiss"
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Message — truncated by default, full when expanded */}
            <p className={`text-xs text-gray-200 leading-snug mt-1 ${expanded ? '' : 'line-clamp-1'}`}>
                {n.message}
            </p>

            {/* Expand hint */}
            {!expanded && n.message?.length > 60 && (
                <p className="text-[10px] text-gray-500 mt-0.5">Click to expand</p>
            )}

            {/* Extra detail when expanded */}
            {expanded && n.alert_type && (
                <p className="text-[10px] text-gray-500 mt-1">
                    Type: <span className="font-mono text-gray-400">{n.alert_type}</span>
                    {n.value != null && <> · Value: <span className="font-mono text-gray-400">{n.value}</span></>}
                    {n.action && <> · Action: <span className="font-mono text-gray-400">{n.action}</span></>}
                </p>
            )}
        </div>
    )
}

export default function NotificationPanel({ notifications = [], onDismiss }) {
    return (
        <div className="card flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Live Notifications</h2>
                <span className="text-xs text-gray-500">{notifications.length} events</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-64">
                {notifications.length === 0 && (
                    <div className="py-4 text-center text-xs text-gray-500">No events yet.</div>
                )}
                {notifications.slice(0, 40).map((n, idx) => (
                    <NotificationItem key={n.id ?? idx} n={n} idx={idx} onDismiss={onDismiss} />
                ))}
            </div>
        </div>
    )
}
