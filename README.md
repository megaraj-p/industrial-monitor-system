# Industrial IoT Machine Monitoring & Protection System

A complete real-time SCADA-like monitoring platform for CAN Bus-connected industrial machines.

```
ESP32 (WiFi + MCP2515)
       ↓  CAN Bus
STM32 Controller (sensors + relay protection)
       ↓  USB Serial
FastAPI Backend (Python)
       ↓  WebSocket
React Dashboard (Vite + TailwindCSS + Chart.js)
```

---

## Features

| Feature | Details |
|---|---|
| Real-time telemetry | Temperature, Current, Vibration, State |
| Auto node discovery | New CAN nodes appear dynamically in the UI |
| Hardware protection alerts | STM32 relay cutoff events parsed and displayed |
| Rule-based anomaly engine | Pre-shutdown warnings at configurable thresholds |
| AI health score | 0–100 per-node machine health indicator |
| WebSocket streaming | Sub-second dashboard updates |
| Multi-machine monitoring | Up to N nodes on a single CAN bus |
| Offline detection | Nodes marked offline after 10 s without heartbeat |
| Toast notifications | Critical alerts pop in real time |
| Demo simulator | No hardware needed — built-in data generator |

---

## Project Structure

```
industrial-monitor-system/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app + lifespan + REST + WebSocket
│   │   ├── serial_listener.py    # Serial reader + demo simulator
│   │   ├── packet_parser.py      # Parses STM32 telemetry & alert packets
│   │   ├── node_manager.py       # Node registry & heartbeat checker
│   │   ├── prediction_engine.py  # Rule-based anomaly detection
│   │   ├── alert_manager.py      # Alert storage & retrieval
│   │   └── websocket_manager.py  # WebSocket broadcast hub
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── services/
        │   ├── api.js             # REST client
        │   └── websocket.js       # WebSocket client with auto-reconnect
        ├── components/
        │   ├── Sidebar.jsx
        │   ├── NodeSelector.jsx
        │   ├── SensorCards.jsx
        │   ├── AlertsPanel.jsx
        │   ├── NotificationPanel.jsx
        │   └── charts/
        │       ├── chartDefaults.js
        │       ├── TemperatureChart.jsx
        │       ├── CurrentChart.jsx
        │       └── VibrationChart.jsx
        └── pages/
            └── Dashboard.jsx
```

---

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt

# Run with built-in demo simulator (no hardware needed):
SERIAL_SIMULATE=true uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run with real STM32 hardware:
SERIAL_PORT=/dev/ttyUSB0 BAUD_RATE=115200 uvicorn app.main:app --host 0.0.0.0 --port 8000
```

On **Windows** set env vars before the command:
```powershell
$env:SERIAL_SIMULATE="true"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Serial Packet Protocol

### Telemetry packet (from STM32)
```
node_id=2,temp=36.5,current=5.2,vibration=0.03,state=1
```

| Field | Type | Description |
|---|---|---|
| `node_id` | int | Unique machine identifier |
| `temp` | float | Temperature in °C |
| `current` | float | Electrical current in Amperes |
| `vibration` | float | Vibration in g |
| `state` | int | 0=idle, 1=running, 2=warning, 3=fault |

### Alert packet (from STM32 hardware protection)
```
node_id=2,alert=overcurrent,value=24,action=power_cutoff
```

| Alert type | Trigger |
|---|---|
| `overcurrent` | Current > 20 A |
| `overtemp` | Temperature > 70°C |
| `vibration` | Vibration > threshold |

---

## Protection Thresholds

| Sensor | Warning | Critical / Shutdown |
|---|---|---|
| Temperature | 60°C | 70°C |
| Current | 15 A | 20 A |
| Vibration | 0.08 g | 0.15 g |
| Heartbeat | — | No data for 10 s → offline |

---

## REST API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/nodes` | List all discovered nodes |
| GET | `/telemetry/{node_id}?limit=100` | Telemetry history for a node |
| GET | `/alerts?node_id=&limit=100` | Recent alerts |
| GET | `/health` | Backend health check |
| WS | `/ws` | WebSocket stream |

### WebSocket message types

| Type | Direction | Payload |
|---|---|---|
| `init` | server → client | Initial state (nodes + alerts) |
| `telemetry` | server → client | Live sensor packet + health score + rule alerts |
| `hardware_alert` | server → client | STM32 relay protection event |
| `node_discovery` | server → client | New node detected |
| `node_offline` | server → client | Node heartbeat timeout |

---

## Hardware Notes

### STM32 Setup
- Read sensors (thermocouple/NTC for temp, ACS712 for current, MPU6050 for vibration)
- Apply protection rules and control relay
- Send packets over USB-CDC serial at 115200 baud

### ESP32 + MCP2515
- Connect to CAN bus via SPI (MCP2515)
- Forward CAN frames to STM32 or act as a WiFi bridge
- Can send telemetry directly over WiFi to backend if preferred

### CAN Bus
- Standard CAN 2.0B
- Recommended baud rate: 500 kbps
- Termination resistors: 120Ω at each end

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SERIAL_PORT` | `/dev/ttyUSB0` | Serial port path |
| `BAUD_RATE` | `115200` | Serial baud rate |
| `SERIAL_SIMULATE` | `true` | Enable demo simulator |
| `VITE_API_URL` | `http://localhost:8000` | Frontend → backend REST URL |
| `VITE_WS_URL` | `ws://localhost:8000/ws` | Frontend WebSocket URL |
