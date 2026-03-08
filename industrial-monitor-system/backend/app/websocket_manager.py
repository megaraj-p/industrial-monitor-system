"""
websocket_manager.py
Manages active WebSocket client connections and broadcasts messages.

The manager is intentionally stateless beyond the connected-clients set so
it can be shared across threads / async tasks without complex locking.
"""

import json
import logging
from typing import Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    Broadcast hub for all connected dashboard clients.

    Usage
    -----
    manager = WebSocketManager()

    # In your WebSocket route handler:
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()   # keep alive
    except ...:
        manager.disconnect(websocket)

    # From any async context:
    await manager.broadcast({"type": "telemetry", ...})
    """

    def __init__(self):
        self._clients: Set[WebSocket] = set()

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)
        logger.info("WebSocket client connected. Total: %d", len(self._clients))

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)
        logger.info("WebSocket client disconnected. Total: %d", len(self._clients))

    # ------------------------------------------------------------------
    # Messaging
    # ------------------------------------------------------------------

    async def broadcast(self, payload: dict) -> None:
        """Send a JSON payload to all connected clients."""
        if not self._clients:
            return

        message = json.dumps(payload, default=str)
        dead: Set[WebSocket] = set()

        for client in list(self._clients):
            try:
                await client.send_text(message)
            except Exception:
                dead.add(client)

        for client in dead:
            self.disconnect(client)

    async def send_to(self, websocket: WebSocket, payload: dict) -> None:
        """Send a JSON payload to a single client."""
        try:
            await websocket.send_text(json.dumps(payload, default=str))
        except Exception:
            self.disconnect(websocket)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def client_count(self) -> int:
        return len(self._clients)
