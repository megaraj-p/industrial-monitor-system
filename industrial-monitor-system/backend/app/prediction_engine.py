"""
prediction_engine.py
Rule-based anomaly detection and predictive-warning engine.

Analyses each incoming telemetry snapshot and emits zero or more
AlertEvent objects through the AlertManager.  Rules fire *before*
the STM32 hardware protection threshold so the dashboard can display
warnings ahead of an automatic shutdown.
"""

from typing import List, Optional
from alert_manager import AlertManager, AlertSeverity

# ---------------------------------------------------------------------------
# Threshold configuration
# ---------------------------------------------------------------------------

TEMP_WARNING = 60.0       # °C  – warning before hardware trips at 70
TEMP_CRITICAL = 70.0      # °C  – mirrors STM32 hardware threshold

CURRENT_WARNING = 15.0    # A   – warning before hardware trips at 20
CURRENT_CRITICAL = 20.0   # A   – mirrors STM32 hardware threshold

VIBRATION_WARNING = 0.08  # g   – moderate instability
VIBRATION_CRITICAL = 0.15 # g   – severe instability


class PredictionEngine:
    """
    Rule engine that fires once per telemetry packet.

    Tracks per-node *active* warning state to avoid repeating the same
    alert every 100 ms while a sensor is continuously over threshold.
    """

    def __init__(self, alert_manager: AlertManager):
        self._am = alert_manager
        # Tracks which alert types are already active per node
        # { node_id: set of active alert_type strings }
        self._active: dict = {}

    def evaluate(self, packet: dict) -> List[dict]:
        """
        Evaluate a telemetry packet against all rules.

        Returns a list of newly generated alert dicts (may be empty).
        """
        node_id = packet["node_id"]
        new_alerts: List[dict] = []

        active = self._active.setdefault(node_id, set())

        temp = packet.get("temperature")
        current = packet.get("current")
        vibration = packet.get("vibration")

        # --- Temperature rules ---
        new_alerts += self._check(
            node_id, active, temp,
            warn_threshold=TEMP_WARNING,
            crit_threshold=TEMP_CRITICAL,
            warn_type="temp_warning",
            crit_type="overtemp",
            warn_msg=lambda v: (
                f"Node {node_id}: Temperature rising ({v:.1f}°C). "
                f"Approaching critical threshold of {TEMP_CRITICAL}°C."
            ),
            crit_msg=lambda v: (
                f"Node {node_id}: CRITICAL temperature ({v:.1f}°C)! "
                f"Automatic shutdown imminent."
            ),
        )

        # --- Current rules ---
        new_alerts += self._check(
            node_id, active, current,
            warn_threshold=CURRENT_WARNING,
            crit_threshold=CURRENT_CRITICAL,
            warn_type="current_warning",
            crit_type="overcurrent",
            warn_msg=lambda v: (
                f"Node {node_id}: Electrical current elevated ({v:.1f}A). "
                f"Limit is {CURRENT_CRITICAL}A."
            ),
            crit_msg=lambda v: (
                f"Node {node_id}: CRITICAL current ({v:.1f}A)! "
                f"Risk of hardware damage."
            ),
        )

        # --- Vibration rules ---
        new_alerts += self._check(
            node_id, active, vibration,
            warn_threshold=VIBRATION_WARNING,
            crit_threshold=VIBRATION_CRITICAL,
            warn_type="vibration_warning",
            crit_type="vibration_critical",
            warn_msg=lambda v: (
                f"Node {node_id}: Vibration level abnormal ({v:.3f}g). "
                f"Check mechanical components."
            ),
            crit_msg=lambda v: (
                f"Node {node_id}: CRITICAL vibration ({v:.3f}g)! "
                f"Mechanical failure risk."
            ),
        )

        # Clear active flags when sensor returns to safe zone
        self._clear_if_safe(active, temp, TEMP_WARNING, "temp_warning")
        self._clear_if_safe(active, temp, TEMP_CRITICAL, "overtemp")
        self._clear_if_safe(active, current, CURRENT_WARNING, "current_warning")
        self._clear_if_safe(active, current, CURRENT_CRITICAL, "overcurrent")
        self._clear_if_safe(active, vibration, VIBRATION_WARNING, "vibration_warning")
        self._clear_if_safe(active, vibration, VIBRATION_CRITICAL, "vibration_critical")

        return new_alerts

    def notify_offline(self, node_id: int) -> dict:
        """Generate an offline alert for a node that missed its heartbeat."""
        # Clear active-alert state so alerts re-fire when the node reconnects
        self._active.pop(node_id, None)
        event = self._am.add_rule_alert(
            node_id=node_id,
            alert_type="offline",
            message=(
                f"Node {node_id} has stopped responding. "
                f"No data received for 10 seconds. Machine may be offline."
            ),
            severity=AlertSeverity.CRITICAL,
        )
        return event.to_dict()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _check(
        self,
        node_id: int,
        active: set,
        value: Optional[float],
        warn_threshold: float,
        crit_threshold: float,
        warn_type: str,
        crit_type: str,
        warn_msg,
        crit_msg,
    ) -> List[dict]:
        if value is None:
            return []

        generated = []

        if value >= crit_threshold and crit_type not in active:
            active.add(crit_type)
            ev = self._am.add_rule_alert(
                node_id=node_id,
                alert_type=crit_type,
                message=crit_msg(value),
                severity=AlertSeverity.CRITICAL,
                value=value,
            )
            generated.append(ev.to_dict())

        elif warn_threshold <= value < crit_threshold and warn_type not in active:
            active.add(warn_type)
            ev = self._am.add_rule_alert(
                node_id=node_id,
                alert_type=warn_type,
                message=warn_msg(value),
                severity=AlertSeverity.WARNING,
                value=value,
            )
            generated.append(ev.to_dict())

        return generated

    @staticmethod
    def _clear_if_safe(active: set, value: Optional[float], threshold: float, key: str):
        if value is not None and value < threshold and key in active:
            active.discard(key)

    def compute_health_score(self, packet: dict) -> float:
        """
        Return a 0–100 health score for a telemetry snapshot.
        100 = all sensors nominal, 0 = all sensors critically over threshold.
        """
        scores = []

        temp = packet.get("temperature")
        if temp is not None:
            scores.append(max(0.0, 1.0 - max(0.0, temp - TEMP_WARNING) / (TEMP_CRITICAL - TEMP_WARNING + 1)))

        current = packet.get("current")
        if current is not None:
            scores.append(max(0.0, 1.0 - max(0.0, current - CURRENT_WARNING) / (CURRENT_CRITICAL - CURRENT_WARNING + 1)))

        vibration = packet.get("vibration")
        if vibration is not None:
            scores.append(max(0.0, 1.0 - max(0.0, vibration - VIBRATION_WARNING) / (VIBRATION_CRITICAL - VIBRATION_WARNING + 0.01)))

        if not scores:
            return 100.0
        return round(sum(scores) / len(scores) * 100, 1)
