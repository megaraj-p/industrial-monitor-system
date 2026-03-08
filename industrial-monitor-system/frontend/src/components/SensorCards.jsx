/**
 * SensorCards.jsx
 * Stat cards showing the latest sensor readings for the selected node.
 */

import React from 'react'

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val))
}

function ProgressBar({ value, min = 0, max = 100, colorClass }) {
    const pct = clamp(((value - min) / (max - min)) * 100, 0, 100)
    return (
        <div className="mt-2 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
            <div
                className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
                style={{ width: `${pct}%` }}
            />
        </div>
    )
}

function SensorCard({ label, value, unit, icon, colorClass, barMax, barWarn, barCrit, rawValue }) {
    let barColor = 'bg-accent-green'
    if (rawValue != null) {
        if (rawValue >= barCrit) barColor = 'bg-accent-red'
        else if (rawValue >= barWarn) barColor = 'bg-accent-yellow'
    }

    return (
        <div className="card flex flex-col gap-1">
            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</span>
                <span className={`text-lg ${colorClass}`}>{icon}</span>
            </div>
            <div className="flex items-end gap-1">
                <span className={`text-2xl font-bold font-mono ${colorClass}`}>
                    {value ?? '—'}
                </span>
                <span className="text-sm text-gray-500 mb-0.5">{unit}</span>
            </div>
            {rawValue != null && (
                <ProgressBar value={rawValue} min={0} max={barMax} colorClass={barColor} />
            )}
        </div>
    )
}

export default function SensorCards({ telemetry, healthScore }) {
    const temp = telemetry?.temperature
    const current = telemetry?.current
    const vibration = telemetry?.vibration
    const state = telemetry?.state ?? 'unknown'

    const stateColors = {
        running: 'text-accent-green',
        idle: 'text-gray-400',
        warning: 'text-accent-yellow',
        fault: 'text-accent-red',
        offline: 'text-gray-500',
        unknown: 'text-gray-500',
    }

    const healthColor =
        healthScore >= 80 ? 'text-accent-green'
            : healthScore >= 50 ? 'text-accent-yellow'
                : 'text-accent-red'

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SensorCard
                label="Temperature"
                value={temp != null ? temp.toFixed(1) : null}
                unit="°C"
                icon="🌡"
                colorClass={temp != null && temp >= 70 ? 'text-accent-red' : temp >= 60 ? 'text-accent-yellow' : 'text-accent-blue'}
                rawValue={temp}
                barMax={100}
                barWarn={60}
                barCrit={70}
            />
            <SensorCard
                label="Current"
                value={current != null ? current.toFixed(1) : null}
                unit="A"
                icon="⚡"
                colorClass={current != null && current >= 20 ? 'text-accent-red' : current >= 15 ? 'text-accent-yellow' : 'text-accent-green'}
                rawValue={current}
                barMax={30}
                barWarn={15}
                barCrit={20}
            />
            <SensorCard
                label="Vibration"
                value={vibration != null ? vibration.toFixed(3) : null}
                unit="g"
                icon="📳"
                colorClass={vibration != null && vibration >= 0.15 ? 'text-accent-red' : vibration >= 0.08 ? 'text-accent-yellow' : 'text-accent-green'}
                rawValue={vibration}
                barMax={0.25}
                barWarn={0.08}
                barCrit={0.15}
            />

            {/* Health Score card */}
            <div className="card flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">AI Health</span>
                    <span className="text-lg">🤖</span>
                </div>
                <div className="flex items-end gap-1">
                    <span className={`text-2xl font-bold font-mono ${healthColor}`}>
                        {healthScore != null ? healthScore.toFixed(0) : '—'}
                    </span>
                    <span className="text-sm text-gray-500 mb-0.5">/ 100</span>
                </div>
                <div className={`mt-1 text-xs font-medium uppercase tracking-wide ${stateColors[state] || 'text-gray-500'}`}>
                    {state}
                </div>
            </div>
        </div>
    )
}
