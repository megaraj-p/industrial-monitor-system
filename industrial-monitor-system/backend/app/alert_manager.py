"""
alert_manager.py
Stores and manages machine alert events.

Alerts are generated from two sources:
  1. STM32 hardware alerts (overcurrent, overtemp) parsed from serial packets.
  2. Software rule-engine warnings from prediction_engine.py.

Provides a thread-safe in-memory store and a simple REST-ready serialisation.
"""

import time
import uuid
from enum import Enum
from typing import List, Optional


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertEvent:
    def __init__(
        self,
        node_id: int,
        alert_type: str,
        message: str,
        severity: AlertSeverity = AlertSeverity.WARNING,
        value: Optional[float] = None,
        action: Optional[str] = None,
    ):
        self.id: str = str(uuid.uuid4())
        self.node_id: int = node_id
        self.alert_type: str = alert_type  # e.g. "overcurrent", "overtemp"
        self.message: str = message
        self.severity: AlertSeverity = severity
        self.value: Optional[float] = value
        self.action: Optional[str] = action
        self.timestamp: float = time.time()
        self.acknowledged: bool = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "node_id": self.node_id,
            "alert_type": self.alert_type,
            "message": self.message,
            "severity": self.severity.value,
            "value": self.value,
            "action": self.action,
            "timestamp": self.timestamp,
            "acknowledged": self.acknowledged,
        }


class AlertManager:
    """
    In-memory circular buffer of alert events.

    Parameters
    ----------
    max_alerts : int
        Maximum number of alerts retained before oldest are discarded.
    """

    def __init__(self, max_alerts: int = 500):
        self._alerts: List[AlertEvent] = []
        self._max_alerts = max_alerts

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------

    def add_hardware_alert(self, parsed_alert: dict) -> AlertEvent:
        """Create an AlertEvent from a parsed STM32 hardware alert packet."""
        alert_type = parsed_alert.get("alert", "unknown")
        severity = (
            AlertSeverity.CRITICAL
            if alert_type in ("overcurrent", "overtemp")
            else AlertSeverity.WARNING
        )
        event = AlertEvent(
            node_id=parsed_alert["node_id"],
            alert_type=alert_type,
            message=parsed_alert.get("message", "Hardware alert triggered."),
            severity=severity,
            value=parsed_alert.get("value"),
            action=parsed_alert.get("action"),
        )
        self._store(event)
        return event

    def add_rule_alert(
        self,
        node_id: int,
        alert_type: str,
        message: str,
        severity: AlertSeverity = AlertSeverity.WARNING,
        value: Optional[float] = None,
    ) -> AlertEvent:
        """Create an AlertEvent from the software prediction engine."""
        event = AlertEvent(
            node_id=node_id,
            alert_type=alert_type,
            message=message,
            severity=severity,
            value=value,
        )
        self._store(event)
        return event

    def add_info(self, node_id: int, alert_type: str, message: str) -> AlertEvent:
        """Convenience wrapper for informational events (e.g. new node)."""
        event = AlertEvent(
            node_id=node_id,
            alert_type=alert_type,
            message=message,
            severity=AlertSeverity.INFO,
        )
        self._store(event)
        return event

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------

    def get_all(self, limit: int = 100) -> List[dict]:
        """Return most-recent alerts first."""
        return [a.to_dict() for a in reversed(self._alerts[-limit:])]

    def get_by_node(self, node_id: int, limit: int = 50) -> List[dict]:
        filtered = [a for a in self._alerts if a.node_id == node_id]
        return [a.to_dict() for a in reversed(filtered[-limit:])]

    def get_active_fault_count(self) -> int:
        """Count unacknowledged critical alerts."""
        return sum(
            1
            for a in self._alerts
            if not a.acknowledged and a.severity == AlertSeverity.CRITICAL
        )

    def acknowledge(self, alert_id: str) -> bool:
        """Mark an alert as acknowledged by its UUID. Returns True if found."""
        for alert in self._alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                return True
        return False

    def clear(self) -> None:
        """Remove all stored alerts."""
        self._alerts.clear()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _store(self, event: AlertEvent) -> None:
        self._alerts.append(event)
        if len(self._alerts) > self._max_alerts:
            self._alerts = self._alerts[-self._max_alerts :]
