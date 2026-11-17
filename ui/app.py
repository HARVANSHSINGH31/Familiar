import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from database.db import get_db
import re
import threading
import time
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.environ.get("ARERA_SECRET", "dev-only-change-me")
app.config["MAX_CONTENT_LENGTH"] = 24 * 1024 * 1024  # 24 MB per upload

PHOTO_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "photos")
ALLOWED = {".jpg", ".jpeg", ".png", ".webp"}


def person_folder(name: str) -> str:
    """A safe, stable folder name for a person. Never trust the typed name."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "person"
    return os.path.join(PHOTO_ROOT, slug)


def photo_counts():
    db = get_db()
    rows = db.execute(
        "SELECT person_id, COUNT(*) AS n FROM person_photos GROUP BY person_id"
    ).fetchall()
    db.close()
    return {r["person_id"]: r["n"] for r in rows}

# In-memory recognition log for the UI
recognition_log = []
detector_thread = None
detector_running = False

def log_recognition(name, confidence):
    recognition_log.insert(0, {
        "name": name,
        "confidence": confidence,
        "time": time.strftime("%H:%M:%S")
    })
    if len(recognition_log) > 50:
        recognition_log.pop()

@app.route("/")
def dashboard():
    db = get_db()
    people = db.execute("SELECT * FROM persons ORDER BY name").fetchall()
    db.close()
    return render_template(
        "dashboard.html",
        people=people,
        photos=photo_counts(),
        log=recognition_log,
        running=detector_running,
    )

@app.route("/add_person", methods=["POST"])
def add_person():
    name = request.form.get("name", "").strip()
    relationship = request.form.get("relationship", "").strip()
    key_facts = request.form.get("key_facts", "").strip()

    if not name or not relationship:
        return redirect(url_for("dashboard"))

    db = get_db()
    existing = db.execute("SELECT id FROM persons WHERE name = ?", (name,)).fetchone()
    if existing:
        db.execute(
            "UPDATE persons SET relationship = ?, key_facts = ? WHERE id = ?",
            (relationship, key_facts, existing["id"]),
        )
    else:
        db.execute(
            "INSERT INTO persons (name, relationship, key_facts) VALUES (?, ?, ?)",
            (name, relationship, key_facts),
        )
    db.commit()
    db.close()

    os.makedirs(person_folder(name), exist_ok=True)
    return redirect(url_for("dashboard"))

@app.route("/add_photos/<int:person_id>", methods=["POST"])
def add_photos(person_id):
    db = get_db()
    person = db.execute("SELECT * FROM persons WHERE id = ?", (person_id,)).fetchone()
    if not person:
        db.close()
        return redirect(url_for("dashboard"))

    folder = person_folder(person["name"])
    os.makedirs(folder, exist_ok=True)

    saved = 0
    for f in request.files.getlist("photos"):
        if not f or not f.filename:
            continue
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED:
            continue
        safe = secure_filename(f.filename) or f"photo-{int(time.time()*1000)}{ext}"
        path = os.path.join(folder, safe)
        f.save(path)
        db.execute(
            "INSERT INTO person_photos (person_id, photo_path) VALUES (?, ?)",
            (person_id, path),
        )
        saved += 1

    db.commit()
    db.close()
    flash(f"{saved} photo{'s' if saved != 1 else ''} added for {person['name']}.")
    return redirect(url_for("dashboard"))


@app.route("/delete_person/<int:person_id>", methods=["POST"])
def delete_person(person_id):
    db = get_db()
    person = db.execute("SELECT name FROM persons WHERE id = ?", (person_id,)).fetchone()
    db.execute("DELETE FROM person_photos WHERE person_id = ?", (person_id,))
    db.execute("DELETE FROM persons WHERE id = ?", (person_id,))
    db.commit()
    db.close()

    # the photos on disk go too, or recognition keeps matching someone you removed
    if person:
        folder = person_folder(person["name"])
        if os.path.isdir(folder):
            for name in os.listdir(folder):
                try:
                    os.remove(os.path.join(folder, name))
                except OSError:
                    pass
            try:
                os.rmdir(folder)
            except OSError:
                pass
    return redirect(url_for("dashboard"))

@app.route("/api/log")
def api_log():
    return jsonify(recognition_log)

@app.route("/api/status")
def api_status():
    return jsonify({"running": detector_running})

@app.route("/api/start", methods=["POST"])
def api_start():
    global detector_thread, detector_running

    if detector_running:
        return jsonify({"status": "already running"})

    from recognition.detector import run_detector
    from voice.cue_generator import generate_cue
    from voice.player import speak

    def on_face_detected(name, confidence):
        log_recognition(name, confidence)
        db = get_db()
        person = db.execute(
            "SELECT * FROM persons WHERE name = ?", (name,)
        ).fetchone()
        db.close()

        if not person:
            return

        cue = generate_cue(person["name"], person["relationship"], person["key_facts"] or "")
        speak(cue)

    def run():
        global detector_running
        detector_running = True
        run_detector(on_face_detected, headless=True)
        detector_running = False

    detector_thread = threading.Thread(target=run, daemon=True)
    detector_thread.start()
    return jsonify({"status": "started"})

@app.route("/api/stop", methods=["POST"])
def api_stop():
    global detector_running
    detector_running = False
    from recognition.detector import request_stop
    request_stop()          # tells the detector loop to leave
    return jsonify({"status": "stopped"})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False, use_reloader=False)
