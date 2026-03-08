/**
 * CurrentChart.jsx
 * Rolling line chart for electrical current readings.
 */

import React, { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { CHART_DEFAULTS, MAX_POINTS } from './chartDefaults'

export default function CurrentChart({ history = [] }) {
    const slice = history.slice(-MAX_POINTS)

    const labels = slice.map((p) => {
        const d = new Date(p.timestamp * 1000)
        return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    })

    const values = slice.map((p) => p.current ?? null)

    const data = useMemo(
        () => ({
            labels,
            datasets: [
                {
                    label: 'Current (A)',
                    data: values,
                    borderColor: '#3fb950',
                    backgroundColor: 'rgba(63,185,80,0.10)',
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
        scales: {
            ...CHART_DEFAULTS.scales,
            y: {
                ...CHART_DEFAULTS.scales.y,
                min: 0,
                suggestedMax: 25,
                title: { display: true, text: 'A', color: '#6e7681', font: { size: 10 } },
            },
        },
    }

    return (
        <div className="card flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Electrical Current</h3>
                <div className="flex gap-3 text-[10px]">
                    <span className="text-accent-yellow">⚠ 15A warn</span>
                    <span className="text-accent-red">🔴 20A crit</span>
                </div>
            </div>
            <div className="h-40">
                <Line data={data} options={options} />
            </div>
        </div>
    )
}
