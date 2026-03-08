/**
 * chartDefaults.js
 * Shared Chart.js registration and default options for the dark industrial theme.
 */

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js'

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
)

export const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 150 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: '#161b22',
            borderColor: '#30363d',
            borderWidth: 1,
            titleColor: '#e6edf3',
            bodyColor: '#8b949e',
            padding: 10,
        },
    },
    scales: {
        x: {
            ticks: {
                color: '#6e7681',
                maxTicksLimit: 8,
                font: { family: 'JetBrains Mono', size: 10 },
            },
            grid: { color: '#21262d' },
        },
        y: {
            ticks: {
                color: '#6e7681',
                font: { family: 'JetBrains Mono', size: 10 },
            },
            grid: { color: '#21262d' },
        },
    },
}

/** Max data points shown in rolling charts */
export const MAX_POINTS = 60
