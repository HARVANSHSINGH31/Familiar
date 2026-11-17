"""
Runs on the brooch or the bedside hub. Writes the device's own state to Supabase
every few seconds, which is what makes the app real rather than illustrative.

    export SUPABASE_URL=... SUPABASE_KEY=... ARERA_PAIRING_CODE=123456
    python hub/publish_status.py

Pairing code is the six digits printed inside the brooch box. The app binds it
to the household during onboarding, and from then on this script keeps the
device row alive: battery, worn state, Wi-Fi, firmware, last seen.
"""
import os
import sys
import time
import json
import urllib.request

URL = os.environ.get("SUPABASE_URL", "https://udlbvxyqapdvnbvwlnfp.supabase.co")
KEY = os.environ.get("SUPABASE_KEY", "")
CODE = os.environ.get("ARERA_PAIRING_CODE", "")
INTERVAL = int(os.environ.get("ARERA_PUBLISH_SECONDS", "20"))


def read_battery():
    """Real battery percentage. Replace with your fuel gauge if you have one."""
    try:
        with open("/sys/class/power_supply/BAT0/capacity") as f:
            return int(f.read().strip())
    except Exception:
        return None


def read_wifi():
    try:
        import subprocess
        out = subprocess.run(["iwgetid", "-r"], capture_output=True, text=True, timeout=3)
        return out.stdout.strip() or None
    except Exception:
        return None


def worn():
    """Worn state. Swap for your magnet or proximity switch."""
    return True


def publish():
    if not KEY or not CODE:
        sys.exit("Set SUPABASE_KEY and ARERA_PAIRING_CODE first.")

    body = json.dumps({
        "household": "demo",
        "pairing_code": CODE,
        "name": "ARERA Brooch",
        "battery": read_battery(),
        "worn": worn(),
        "online": True,
        "wifi": read_wifi(),
        "firmware": "0.1.0",
        "last_seen": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }).encode()

    req = urllib.request.Request(
        f"{URL}/rest/v1/devices?on_conflict=pairing_code",
        data=body,
        method="POST",
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        print(f"{r.status} · battery {read_battery()} · online")


if __name__ == "__main__":
    print(f"Publishing every {INTERVAL}s for code {CODE}")
    while True:
        try:
            publish()
        except Exception as e:
            print("publish failed:", e)
        time.sleep(INTERVAL)
