"""
Writes one real event to Supabase so the app shows something that came from
outside it. This is the piece that turns the app from a mockup into a product.

    python scripts/send_event.py left_room "Got up, back in bed after 4 min"
    python scripts/send_event.py ok "Settled back down"

The app subscribes to INSERT on public.events filtered by household. Run this
and the phone in your hand reacts.
"""
import os
import sys
import json
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://udlbvxyqapdvnbvwlnfp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")          # put the service key here, never commit it
HOUSEHOLD = os.environ.get("ARERA_HOUSEHOLD", "demo")

def send(event_type: str, detail: str) -> None:
    if not SUPABASE_KEY:
        sys.exit("Set SUPABASE_KEY first. It is a secret; keep it in your shell, not in git.")

    body = json.dumps({
        "household": HOUSEHOLD,
        "type": event_type,          # left_room | ok | info
        "detail": detail,
    }).encode()

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/events",
        data=body,
        method="POST",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        print(f"{r.status} · {event_type} · {detail}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    send(sys.argv[1], " ".join(sys.argv[2:]))
