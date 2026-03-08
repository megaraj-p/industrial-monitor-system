"""
main.py
FastAPI application entry point for the Industrial IoT Machine Monitoring System.

Start with:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Environment variables:
    SERIAL_PORT      – serial port to open  (Windows: COM3, Linux: /dev/ttyUSB0)
    BAUD_RATE        – baud rate            (default: 115200)
    SERIAL_SIMULATE  – set "true" only when running without hardware (default: false)
"""

import asyncio
import logging
import sys
import os

# Make the app directory importable when running as `python main.py`
sys.path.insert(0, os.path.dirname(__file__))

from contextlib import asynccontextmanager

from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from packet_parser import parse_packet
from node_manager import NodeManager
from alert_manager import AlertManager
from prediction_engine import PredictionEngine
from websocket_manager import WebSocketManager
from serial_listener import start_listener, get_available_ports, get_serial_status, set_serial_config
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared service instances (singletons for this process)
# ---------------------------------------------------------------------------
node_manager = NodeManager()
alert_manager = AlertManager()
prediction_engine = PredictionEngine(alert_manager)
ws_manager = WebSocketManager()

# In-memory telemetry history: { node_id: [packet, ...] }
telemetry_history: dict = {}
HISTORY_PER_NODE = 200  # keep last N readings per node

# ---------------------------------------------------------------------------
# Packet processing pipeline
# ---------------------------------------------------------------------------

async def on_packet_received(raw_line: str) -> None:
    """Called for every raw line coming from the serial listener."""
    packet = parse_packet(raw_line)
    if packet is None:
        return

    node_id = packet["node_id"]

    if packet["type"] == "telemetry":
        # Node auto-discovery
        is_new, came_back_online = node_manager.process_telemetry(packet)

        if is_new:
            discovery_alert = alert_manager.add_info(
                node_id=node_id,
                alert_type="node_connected",
                message=f"New machine node discovered: Node {node_id:02d}",
            )
            await ws_manager.broadcast({
                "type": "node_discovery",
                "alert": discovery_alert.to_dict(),
                "node": node_manager.get_node(node_id).to_dict(),
                "online_count": node_manager.get_online_count(),
            })
            logger.info("New node discovered: %d (total online: %d)",
                        node_id, node_manager.get_online_count())

        elif came_back_online:
            # Node was offline and is now sending data again
            await ws_manager.broadcast({
                "type": "node_online",
                "node_id": node_id,
                "node": node_manager.get_node(node_id).to_dict(),
                "online_count": node_manager.get_online_count(),
            })
            logger.info("Node %d came back online (total online: %d)",
                        node_id, node_manager.get_online_count())

        # Store telemetry history
        history = telemetry_history.setdefault(node_id, [])
        history.append(packet)
        if len(history) > HISTORY_PER_NODE:
            telemetry_history[node_id] = history[-HISTORY_PER_NODE:]

        # Run prediction engine
        rule_alerts = prediction_engine.evaluate(packet)
        health = prediction_engine.compute_health_score(packet)

        # Broadcast to WebSocket clients
        await ws_manager.broadcast({
            "type": "telemetry",
            "data": packet,
            "health_score": health,
            "alerts": rule_alerts,
            "online_count": node_manager.get_online_count(),
        })

    elif packet["type"] == "alert":
        # Hardware protection alert from STM32
        node_manager.touch_node(node_id)
        event = alert_manager.add_hardware_alert(packet)
        await ws_manager.broadcast({
            "type": "hardware_alert",
            "alert": event.to_dict(),
        })
        logger.warning("Hardware alert from node %d: %s", node_id, packet.get("alert"))


# ---------------------------------------------------------------------------
# Heartbeat checker (runs every 5 s)
# ---------------------------------------------------------------------------

async def heartbeat_checker() -> None:
    while True:
        await asyncio.sleep(5)
        offline_nodes = node_manager.check_heartbeats()
        for nid in offline_nodes:
            offline_alert = prediction_engine.notify_offline(nid)
            await ws_manager.broadcast({
                "type": "node_offline",
                "alert": offline_alert,
                "node_id": nid,
                "online_count": node_manager.get_online_count(),
            })
            logger.warning("Node %d went offline (total online: %d)",
                           nid, node_manager.get_online_count())


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background tasks
    serial_task = asyncio.create_task(start_listener(on_packet_received))
    heartbeat_task = asyncio.create_task(heartbeat_checker())
    logger.info("Industrial Monitor backend started.")
    yield
    serial_task.cancel()
    heartbeat_task.cancel()
    logger.info("Backend shutting down.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Industrial IoT Machine Monitor",
    version="1.0.0",
    description="CAN Bus machine telemetry monitoring and protection system.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # lock down in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/nodes", summary="List all discovered machine nodes")
def get_nodes():
    return {
        "nodes": node_manager.get_all_nodes(),
        "online_count": node_manager.get_online_count(),
    }


@app.get("/telemetry/{node_id}", summary="Get telemetry history for a node")
def get_telemetry(node_id: int, limit: int = 100):
    if not node_manager.node_exists(node_id):
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    history = telemetry_history.get(node_id, [])
    return {
        "node_id": node_id,
        "count": len(history),
        "telemetry": history[-limit:],
    }


@app.get("/alerts", summary="Get recent alerts (all nodes or filtered)")
def get_alerts(node_id: Optional[int] = None, limit: int = 100):
    if node_id is not None:
        return {"alerts": alert_manager.get_by_node(node_id, limit)}
    return {
        "alerts": alert_manager.get_all(limit),
        "fault_count": alert_manager.get_active_fault_count(),
    }


@app.get("/health", summary="Backend health check")
def health_check():
    return {
        "status": "ok",
        "nodes": node_manager.get_online_count(),
        "ws_clients": ws_manager.client_count(),
    }


# ---------------------------------------------------------------------------
# Serial port management endpoints
# ---------------------------------------------------------------------------

@app.get("/ports", summary="List available serial ports")
def list_ports():
    return {"ports": get_available_ports()}


@app.get("/serial/status", summary="Current serial connection status")
def serial_status_endpoint():
    return get_serial_status()


class SerialConnectRequest(BaseModel):
    port: str | None = None
    baud: int | None = None
    simulate: bool | None = None


@app.post("/serial/connect", summary="Change serial port / switch to simulator")
async def serial_connect(req: SerialConnectRequest):
    set_serial_config(port=req.port, baud=req.baud, simulate=req.simulate)
    status = get_serial_status()
    await ws_manager.broadcast({"type": "serial_status", "status": status})
    return {"ok": True, "status": status}


# ---------------------------------------------------------------------------
# Per-node statistics endpoint
# ---------------------------------------------------------------------------

@app.get("/stats/{node_id}", summary="Min/max/avg statistics for a node")
def get_node_stats(node_id: int):
    if not node_manager.node_exists(node_id):
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    history = telemetry_history.get(node_id, [])
    if not history:
        return {"node_id": node_id, "sample_count": 0, "stats": {}}

    def field_stats(key):
        vals = [p[key] for p in history if p.get(key) is not None]
        if not vals:
            return None
        return {
            "min":    round(min(vals), 3),
            "max":    round(max(vals), 3),
            "avg":    round(sum(vals) / len(vals), 3),
            "latest": round(vals[-1], 3),
            "count":  len(vals),
        }

    return {
        "node_id":      node_id,
        "sample_count": len(history),
        "stats": {
            "temperature": field_stats("temperature"),
            "current":     field_stats("current"),
            "vibration":   field_stats("vibration"),
        },
    }


@app.delete("/alerts", summary="Clear all stored alerts")
def delete_alerts():
    alert_manager.clear()
    return {"ok": True}


@app.patch("/alerts/{alert_id}/acknowledge", summary="Acknowledge an alert by ID")
def acknowledge_alert(alert_id: str):
    found = alert_manager.acknowledge(alert_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    return {"ok": True, "alert_id": alert_id}


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)

    # Send current state to newly connected client
    await ws_manager.send_to(websocket, {
        "type": "init",
        "nodes": node_manager.get_all_nodes(),
        "alerts": alert_manager.get_all(50),
        "fault_count": alert_manager.get_active_fault_count(),
    })

    try:
        while True:
            # Keep connection alive; client may send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
