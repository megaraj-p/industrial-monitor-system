import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
        <Toaster
            position="top-right"
            toastOptions={{
                duration: 5000,
                style: {
                    background: '#161b22',
                    color: '#e6edf3',
                    border: '1px solid #30363d',
                    fontSize: '13px',
                    maxWidth: '420px',
                },
                success: { iconTheme: { primary: '#3fb950', secondary: '#161b22' } },
                error: { iconTheme: { primary: '#f85149', secondary: '#161b22' } },
            }}
        />
    </React.StrictMode>
)
