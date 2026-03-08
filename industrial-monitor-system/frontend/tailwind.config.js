/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                // Industrial dark theme palette
                surface: {
                    DEFAULT: '#0f1117',
                    raised: '#161b22',
                    elevated: '#1c2333',
                    border: '#30363d',
                },
                accent: {
                    blue: '#58a6ff',
                    green: '#3fb950',
                    yellow: '#d29922',
                    orange: '#f0883e',
                    red: '#f85149',
                    purple: '#bc8cff',
                },
            },
            fontFamily: {
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
            },
        },
    },
    plugins: [],
}
