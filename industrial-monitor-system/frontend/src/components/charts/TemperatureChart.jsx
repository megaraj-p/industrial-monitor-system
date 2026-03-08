/**
 * TemperatureChart.jsx
 * Rolling line chart for machine temperature readings.
 * Includes reference lines for warn (60°C) and critical (70°C) thresholds.
 */

import React, { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { CHART_DEFAULTS, MAX_POINTS } from './chartDefaults'

export default function TemperatureChart({ history = [] }) {
    const slice = history.slice(-MAX_POINTS)

    const labels = slice.map((p) => {
        const d = new Date(p.timestamp * 1000)
        return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    })

    const values = slice.map((p) => p.temperature ?? null)

    const data = useMemo(
        () => ({
            labels,
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: values,
                    borderColor: '#58a6ff',
                    backgroundColor: 'rgba(88,166,255,0.10)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.3,
                    fill: true,
                    spanGaps: true,
                },
            ],
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [history.length]
    )

    const options = {
        ...CHART_DEFAULTS,
        plugins: {
            ...CHART_DEFAULTS.plugins,
            annotation: undefined, // keep it simple without annotation plugin
        },
        scales: {
            ...CHART_DEFAULTS.scales,
            y: {
                ...CHART_DEFAULTS.scales.y,
                min: 0,
                suggestedMax: 80,
                title: { display: true, text: '°C', color: '#6e7681', font: { size: 10 } },
            },
        },
    }

    return (
        <div className="card flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Temperature</h3>
                <div className="flex gap-3 text-[10px]">
                    <span className="text-accent-yellow">⚠ 60°C warn</span>
                    <span className="text-accent-red">🔴 70°C crit</span>
                </div>
            </div>
            <div className="h-40">
                <Line data={data} options={options} />
            </div>
        </div>
    )
}
