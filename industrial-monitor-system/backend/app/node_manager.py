"""
node_manager.py
Maintains the live registry of machine nodes discovered on the CAN bus.

Nodes are auto-discovered when a telemetry or alert packet arrives with a
previously-unseen node_id.  The manager tracks:
  - the latest sensor snapshot per node
  - the last-seen timestamp (for heartbeat / offline detection)
  - the connection history (first-seen, last-seen)
"""

import time
from typing import Dict, List, Optional


class NodeInfo:
    """Lightweight value-object holding a node's runtime state."""

    def __init__(self, node_id: int):
        self.node_id: int = node_id
        self.label: str = f"Node {node_id:02d}"
        self.first_seen: float = time.time()
        self.last_seen: float = time.time()
        self.online: bool = True

        # Latest telemetry snapshot
        self.temperature: Optional[float] = None
        self.current: Optional[float] = None
        self.vibration: Optional[float] = None
        self.state: str = "unknown"

    def update(self, telemetry: dict) -> None:
        """Apply a fresh telemetry packet to this node."""
        self.last_seen = telemetry.get("timestamp", time.time())
        self.temperature = telemetry.get("temperature", self.temperature)
        self.current = telemetry.get("current", self.current)
        self.vibration = telemetry.get("vibration", self.vibration)
        self.state = telemetry.get("state", self.state)
        self.online = True

    def to_dict(self) -> dict:
        return {
            "node_id": self.node_id,
            "label": self.label,
            "online": self.online,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
            "temperature": self.temperature,
            "current": self.current,
            "vibration": self.vibration,
            "state": self.state,
        }


class NodeManager:
    """
    Singleton-style registry for all discovered machine nodes.

    Usage
    -----
    nm = NodeManager()
    is_new = nm.process_telemetry(parsed_packet)
    nodes   = nm.get_all_nodes()
    """

    # Seconds without data before a node is considered offline
    OFFLINE_TIMEOUT: float = 10.0

    def __init__(self):
        self._nodes: Dict[int, NodeInfo] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_telemetry(self, packet: dict) -> tuple:
        """
        Register or update a node from a telemetry packet.

        Returns (is_new, came_back_online):
          - is_new           : True if this node_id was never seen before
          - came_back_online : True if the node was previously marked offline
                               and has just sent data again
        """
        node_id = packet["node_id"]
        is_new = node_id not in self._nodes
        if is_new:
            self._nodes[node_id] = NodeInfo(node_id)
        was_online = self._nodes[node_id].online
        self._nodes[node_id].update(packet)
        came_back_online = (not is_new) and (not was_online)
        return is_new, came_back_online

    def touch_node(self, node_id: int) -> bool:
        """
        Update last-seen timestamp for a node that sent an alert packet.
        Returns True if this is a newly discovered node.
        """
        is_new = node_id not in self._nodes
        if is_new:
            node = NodeInfo(node_id)
            self._nodes[node_id] = node
        self._nodes[node_id].last_seen = time.time()
        self._nodes[node_id].online = True
        return is_new

    def check_heartbeats(self) -> List[int]:
        """
        Mark nodes as offline if their last heartbeat exceeds OFFLINE_TIMEOUT.
        Returns a list of node_ids that just went offline.
        """
        now = time.time()
        just_went_offline: List[int] = []
        for node in self._nodes.values():
            if node.online and (now - node.last_seen) > self.OFFLINE_TIMEOUT:
                node.online = False
                node.state = "offline"
                just_went_offline.append(node.node_id)
        return just_went_offline

    def get_node(self, node_id: int) -> Optional[NodeInfo]:
        return self._nodes.get(node_id)

    def get_all_nodes(self) -> List[dict]:
        return [n.to_dict() for n in self._nodes.values()]

    def get_online_count(self) -> int:
        return sum(1 for n in self._nodes.values() if n.online)

    def node_exists(self, node_id: int) -> bool:
        return node_id in self._nodes
