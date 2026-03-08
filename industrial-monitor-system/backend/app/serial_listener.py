"""
serial_listener.py
Reads STM32 serial data using pyserial directly in a daemon thread.
Works reliably on Windows (COM ports) and Linux (/dev/ttyUSBx) without
pyserial-asyncio.  A threading bridge pushes lines into the asyncio loop.

Runtime config can be changed via set_serial_config() — the listener
restarts automatically on the next cycle.

Environment variables:
    SERIAL_PORT      – serial port to open  (Windows default: COM3, Linux: /dev/ttyUSB0)
    BAUD_RATE        – baud rate            (default: 115200)
    SERIAL_SIMULATE  – set to "true" only when running without hardware (default: false)
"""

import asyncio
import logging
import os
import random
import sys
import threading
import time
from typing import Callable, Awaitable, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_DEFAULT_PORT = "COM3" if sys.platform == "win32" else "/dev/ttyUSB0"
RECONNECT_DELAY = 5

PacketCallback = Callable[[str], Awaitable[None]]

# Mutable runtime config — updated via set_serial_config()
_config: dict = {
    "port":     os.getenv("SERIAL_PORT",     _DEFAULT_PORT),
    "baud":     int(os.getenv("BAUD_RATE",   "115200")),
    "simulate": os.getenv("SERIAL_SIMULATE", "false").lower() in ("1", "true", "yes"),
}

_status: dict = {
    "connected": False,
    "port":      _config["port"],
    "baud":      _config["baud"],
    "mode":      "simulator" if _config["simulate"] else "serial",
    "error":     None,
}

# Signals the current listener sub-coroutine to exit so start_listener restarts
_config_changed = False
_serial_stop    = threading.Event()  # wakes serial thread on config change


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_serial_status() -> dict:
    return dict(_status)


def set_serial_config(
    port: Optional[str]  = None,
    baud: Optional[int]  = None,
    simulate: Optional[bool] = None,
) -> None:
    """Update connection config and signal the listener to restart."""
    global _config_changed
    if port     is not None: _config["port"]     = port;     _status["port"]  = port
    if baud     is not None: _config["baud"]     = baud;     _status["baud"]  = baud
    if simulate is not None: _config["simulate"] = simulate; _status["mode"]  = "simulator" if simulate else "serial"
    _config_changed = True
    _serial_stop.set()   # interrupt any ongoing serial wait


def get_available_ports() -> list:
    """Return list of available serial ports (requires pyserial)."""
    try:
        from serial.tools import list_ports  # type: ignore
        return [
            {"port": p.device, "description": p.description, "hwid": p.hwid}
            for p in sorted(list_ports.comports())
        ]
    except ImportError:
        return []


# NOTE: These module-level aliases are captured at import time and are NOT
# updated when set_serial_config() is called. Use _config[] or get_serial_status()
# for the live values.  Kept only so existing imports don't break.
SERIAL_PORT = _config["port"]
BAUD_RATE   = _config["baud"]
SIMULATE    = _config["simulate"]


# ---------------------------------------------------------------------------
# Simulator – generates realistic demo telemetry when no hardware present
# ---------------------------------------------------------------------------

class _DemoSimulator:
    """Generates fake multi-node telemetry that drifts realistically."""

    _NODE_COUNT = 4
    _INTERVAL   = 0.5

    def __init__(self):
        self._state: dict = {}
        for nid in range(1, self._NODE_COUNT + 1):
            self._state[nid] = {
                "temp":        35.0 + random.uniform(0, 10),
                "current":     5.0  + random.uniform(0, 3),
                "vibration":   0.02 + random.uniform(0, 0.01),
                "state":       1,
                "spike_timer": random.randint(40, 80),
            }

    def next_packets(self) -> list:
        packets = []
        for nid, s in self._state.items():
            s["temp"]      += random.uniform(-0.3,  0.4)
            s["current"]   += random.uniform(-0.2,  0.3)
            s["vibration"] += random.uniform(-0.005, 0.006)
            s["temp"]       = max(20.0, min(85.0,  s["temp"]))
            s["current"]    = max(0.5,  min(25.0,  s["current"]))
            s["vibration"]  = max(0.005, min(0.20, s["vibration"]))

            s["spike_timer"] -= 1
            if s["spike_timer"] <= 0:
                kind = random.choice(["temp", "current"])
                if kind == "temp":
                    s["temp"] = 75.0 + random.uniform(0, 5)
                    packets.append(f"node_id={nid},alert=overtemp,value={s['temp']:.1f},action=power_cutoff")
                else:
                    s["current"] = 22.0 + random.uniform(0, 4)
                    packets.append(f"node_id={nid},alert=overcurrent,value={s['current']:.1f},action=power_cutoff")
                s["spike_timer"] = random.randint(60, 120)
                s["state"] = 3
            else:
                s["state"] = 1 if s["temp"] < 60 and s["current"] < 15 else 2

            packets.append(
                f"node_id={nid},"
                f"temp={s['temp']:.1f},"
                f"current={s['current']:.1f},"
                f"vibration={s['vibration']:.3f},"
                f"state={s['state']}"
            )
        return packets


# ---------------------------------------------------------------------------
# Simulator async runner
# ---------------------------------------------------------------------------

async def _run_simulator(callback: PacketCallback) -> None:
    global _config_changed
    _config_changed      = False
    _status["connected"] = True
    _status["mode"]      = "simulator"
    _status["error"]     = None
    logger.info("Serial simulator running (4 virtual CAN nodes)")
    sim = _DemoSimulator()
    while not _config_changed:
        for packet in sim.next_packets():
            await callback(packet)
        await asyncio.sleep(_DemoSimulator._INTERVAL)
    logger.info("Simulator stopped — config changed")


# ---------------------------------------------------------------------------
# Real serial reader  (pyserial + daemon thread)
# ---------------------------------------------------------------------------

def _serial_thread_fn(
    queue: "asyncio.Queue[str]",
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Blocking pyserial read loop in a daemon thread."""
    global _config_changed
    try:
        import serial  # type: ignore
    except ImportError:
        _status["error"] = "pyserial not installed — run: pip install pyserial"
        logger.error(_status["error"])
        return

    port = _config["port"]
    baud = _config["baud"]
    _serial_stop.clear()

    while not _serial_stop.is_set() and not _config_changed:
        try:
            logger.info("Opening serial port %s @ %d baud", port, baud)
            with serial.Serial(port, baud, timeout=1) as ser:
                _status["connected"] = True
                _status["error"]     = None
                _status["mode"]      = "serial"
                logger.info("Serial port %s open — reading STM32 data", port)
                loop.call_soon_threadsafe(queue.put_nowait, "__CONNECTED__")
                while not _serial_stop.is_set() and not _config_changed:
                    raw = ser.readline()
                    if raw:
                        line = raw.decode("utf-8", errors="replace").strip()
                        if line:
                            loop.call_soon_threadsafe(queue.put_nowait, line)
        except Exception as exc:
            _status["connected"] = False
            _status["error"]     = str(exc)
            logger.warning("Serial error: %s — retrying in %ds", exc, RECONNECT_DELAY)
            loop.call_soon_threadsafe(queue.put_nowait, f"__ERROR__{exc}")
            _serial_stop.wait(timeout=RECONNECT_DELAY)
            _serial_stop.clear()

    _status["connected"] = False
    logger.info("Serial thread exiting")


async def _run_serial_reader(callback: PacketCallback) -> None:
    global _config_changed
    _config_changed = False
    loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    thread = threading.Thread(
        target=_serial_thread_fn, args=(queue, loop), daemon=True
    )
    thread.start()

    try:
        while not _config_changed:
            try:
                line = await asyncio.wait_for(queue.get(), timeout=1.0)
                if not line.startswith("__"):
                    await callback(line)
            except asyncio.TimeoutError:
                pass
    finally:
        _serial_stop.set()
        thread.join(timeout=3)
    logger.info("Serial reader stopped — config changed")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def start_listener(callback: PacketCallback) -> None:
    """
    Runs forever.  Automatically restarts when set_serial_config() is called.
    Dispatches to the demo simulator or real pyserial reader based on config.
    """
    while True:
        if _config.get("simulate", True):
            await _run_simulator(callback)
        else:
            await _run_serial_reader(callback)
        await asyncio.sleep(0.5)
