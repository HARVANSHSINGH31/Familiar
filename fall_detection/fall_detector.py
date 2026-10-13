import sys
import zipfile
import numpy as np
import pandas as pd

G = 9.81

# --- thresholds ---
FREE_FALL_G = 0.5       # below this = falling
IMPACT_G = 2.5          # above this = hit something
IMPACT_WINDOW_S = 1.0   # impact must come within 1s after free fall
SETTLE_S = 2.0          # ignore bouncing right after impact
STILL_S = 3.0           # must lie still this long (real device: ~20s)
STILL_TOL_G = 0.15      # "still" = within 0.15 g of 1 g
BEFORE_S = 2.0          # posture = average of the 2s before the fall
TILT_DEG = 50           # body must tip over at least this much


def load(path):
    if path.endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            with z.open("Raw Data.csv") as f:
                df = pd.read_csv(f)
    else:
        df = pd.read_csv(path)
    t = df.iloc[:, 0].to_numpy()
    acc = df.iloc[:, 1:4].to_numpy() / G      # x, y, z in g (one row per sample)
    mag = np.linalg.norm(acc, axis=1)          # total acceleration in g
    return t, acc, mag


def tilt_deg(v1, v2):
    """Angle between two 'down' arrows, in degrees."""
    cos = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
    return np.degrees(np.arccos(np.clip(cos, -1.0, 1.0)))


def detect_falls(t, acc, mag, verbose=True):
    falls = []
    i = 0
    while i < len(t):
        if mag[i] < FREE_FALL_G:                                   # 1. free fall
            hits = np.where((t > t[i]) & (t <= t[i] + IMPACT_WINDOW_S) & (mag > IMPACT_G))[0]
            if hits.size:                                          # 2. impact
                j = hits[0]
                before = (t >= t[i] - BEFORE_S) & (t < t[i] - 0.2)
                quiet = (t > t[j] + SETTLE_S) & (t <= t[j] + SETTLE_S + STILL_S)

                wobble = np.percentile(np.abs(mag[quiet] - 1.0), 90) if quiet.any() else None
                still = wobble is not None and wobble < STILL_TOL_G      # 3. still after

                tilt = None
                if before.any() and quiet.any():
                    tilt = tilt_deg(acc[before].mean(axis=0), acc[quiet].mean(axis=0))
                tilted = tilt is not None and tilt >= TILT_DEG           # 4. tipped over

                is_fall = still and tilted

                if verbose:
                    peak = mag[j:j + 50].max()
                    if is_fall:
                        verdict = "FALL ✅"
                    elif not still:
                        verdict = "rejected ❌ (moving after)"
                    else:
                        verdict = "rejected ❌ (no tilt, still upright)"
                    wob = f"{wobble:.2f} g" if wobble is not None else "n/a"
                    tl = f"{tilt:5.1f}°" if tilt is not None else "  n/a"
                    print(f"t={t[j]:7.2f}s  peak={peak:5.1f} g  wobble={wob}  "
                          f"tilt={tl}  → {verdict}")

                if is_fall:
                    falls.append(round(float(t[j]), 2))
                i = int(np.searchsorted(t, t[j] + SETTLE_S + STILL_S))
                continue
        i += 1
    return falls


if __name__ == "__main__":
    t, acc, mag = load(sys.argv[1])
    falls = detect_falls(t, acc, mag)
    print(f"{sys.argv[1]}: {len(falls)} fall(s) at {falls} s")
