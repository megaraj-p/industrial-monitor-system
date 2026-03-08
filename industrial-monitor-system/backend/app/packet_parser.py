"""
packet_parser.py
Parses raw STM32 serial telemetry and alert packets into structured dicts.

Telemetry packet format:
    node_id=2,temp=36.5,current=5.2,vibration=0.03,state=1

Alert packet format:
    node_id=2,alert=overcurrent,value=24,action=power_cutoff
"""

import time
from typing import Optional

# Machine state map from numeric codes
STATE_MAP = {
    "0": "idle",
    "1": "running",
    "2": "warning",
    "3": "fault",
    "4": "offline",
}


def parse_packet(raw: str) -> Optional[dict]:
    """
    Parse a raw serial packet string into a structured dict.

    Returns one of:
        - telemetry dict  (contains 'type': 'telemetry')
        - alert dict      (contains 'type': 'alert')
        - None            (if packet is malformed)
    """
    raw = raw.strip()
    if not raw:
        return None

    try:
        fields = {}
        for part in raw.split(","):
            part = part.strip()
            if "=" not in part:
                continue
            key, _, value = part.partition("=")
            fields[key.strip()] = value.strip()

        if "node_id" not in fields:
            return None

        node_id = int(fields["node_id"])
        timestamp = time.time()

        # Alert packet detection
        if "alert" in fields:
            return {
                "type": "alert",
                "node_id": node_id,
                "alert": fields.get("alert", "unknown"),
                "value": _try_float(fields.get("value")),
                "action": fields.get("action", ""),
                "timestamp": timestamp,
                "message": _build_alert_message(node_id, fields),
            }

        # Telemetry packet
        state_raw = fields.get("state", "1")
        state_label = STATE_MAP.get(state_raw, state_raw)

        return {
            "type": "telemetry",
            "node_id": node_id,
            "temperature": _try_float(fields.get("temp")),
            "current": _try_float(fields.get("current")),
            "vibration": _try_float(fields.get("vibration")),
            "state": state_label,
            "timestamp": timestamp,
        }

    except (ValueError, AttributeError):
        return None


def _try_float(value: Optional[str]) -> Optional[float]:
    """Convert a string to float; return None on failure."""
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _build_alert_message(node_id: int, fields: dict) -> str:
    """Generate a human-readable alert message from parsed alert fields."""
    alert_type = fields.get("alert", "unknown")
    value = fields.get("value", "N/A")
    action = fields.get("action", "")

    messages = {
        "overcurrent": (
            f"Node {node_id} machine is getting high electrical flow ({value}A) "
            f"which is harmful for the machine. "
            f"Power has been automatically turned off."
        ),
        "overtemp": (
            f"Node {node_id} machine temperature is critically high ({value}°C). "
            f"Automatic protection has been triggered."
        ),
        "vibration": (
            f"Node {node_id} machine is experiencing abnormal vibration ({value}). "
            f"Mechanical instability detected."
        ),
        "offline": (
            f"Node {node_id} has stopped sending data. Machine may be offline."
        ),
    }

    base = messages.get(
        alert_type,
        f"Node {node_id} triggered alert '{alert_type}' with value {value}.",
    )

    if action:
        action_str = action.replace("_", " ").capitalize()
        if "power_cutoff" in action:
            return base  # already embedded in overcurrent/overtemp messages
        base += f" Action taken: {action_str}."

    return base
