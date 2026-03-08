/**
 * NodeSelector.jsx
 * Right-panel list of discovered machine nodes.
 * Clicking a node updates the selected node in the dashboard.
 */

import React from 'react'

const STATE_COLOR = {
    running: 'bg-accent-green',
    idle: 'bg-gray-500',
    warning: 'bg-accent-yellow',
    fault: 'bg-accent-red',
    offline: 'bg-gray-600',
    unknown: 'bg-gray-600',
}

const STATE_LABEL_COLOR = {
    running: 'text-accent-green',
    idle: 'text-gray-400',
    warning: 'text-accent-yellow',
    fault: 'text-accent-red',
    offline: 'text-gray-500',
    unknown: 'text-gray-500',
}

function timeAgo(ts) {
    if (!ts) return null
    const secs = Math.floor((Date.now() - ts) / 1000)
    if (secs < 5) return 'just now'
    if (secs < 60) return `${secs}s ago`
    return `${Math.floor(secs / 60)}m ago`
}

export default function NodeSelector({ nodes, selectedNodeId, onSelect }) {
    return (
        <div className="flex flex-col w-52 min-h-screen bg-surface-raised border-l border-surface-border shrink-0">
            <div className="px-4 py-4 border-b border-surface-border">
                <h2 className="text-sm font-semibold text-white">Machine Nodes</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                    {nodes.filter((n) => n.online).length} of {nodes.length} online
                </p>
            </div>

            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
                {nodes.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-gray-500">
                        <div className="mb-2">No nodes discovered yet.</div>
                        <div>Waiting for CAN bus data…</div>
                    </div>
                )}

                {nodes.map((node) => {
                    const isSelected = node.node_id === selectedNodeId
                    const state = node.state || 'unknown'
                    const dotColor = STATE_COLOR[state] || 'bg-gray-500'
                    const labelColor = STATE_LABEL_COLOR[state] || 'text-gray-400'
                    const lastSeenText = node.online ? timeAgo(node.lastSeen) : null

                    return (
                        <button
                            key={node.node_id}
                            onClick={() => onSelect(node.node_id)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${isSelected
                                ? 'bg-accent-blue/15 ring-1 ring-accent-blue/40'
                                : 'hover:bg-surface-elevated'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor} ${node.online ? 'animate-pulse' : ''}`} />
                                <span className="text-sm font-medium text-white truncate">{node.label}</span>
                            </div>

                            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                                {node.temperature != null && (
                                    <span className="text-gray-400">
                                        🌡 <span className="text-white">{node.temperature.toFixed(1)}°C</span>
                                    </span>
                                )}
                                {node.current != null && (
                                    <span className="text-gray-400">
                                        ⚡ <span className="text-white">{node.current.toFixed(1)}A</span>
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center justify-between mt-1">
                                <span className={`text-[10px] font-medium uppercase tracking-wide ${labelColor}`}>
                                    {state}
                                </span>
                                {lastSeenText && (
                                    <span className="text-[10px] text-gray-600">{lastSeenText}</span>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>

            <div className="px-4 py-3 border-t border-surface-border text-[11px] text-gray-500">
                Nodes auto-discovered via CAN Bus
            </div>
        </div>
    )
}
