# Familiar

> **"Remember everyone. Forget nothing."**

A wearable AI assistive device for Alzheimer's and memory loss patients. Kinnect combines real-time face recognition with family voice cloning to help patients recognise loved ones — without embarrassment, without surveillance, without making them feel impaired.

---

## The Problem

153 million people are projected to live with dementia by 2050. A new case is diagnosed every 4 seconds.

One of the earliest and most devastating symptoms is **prosopagnosia** — the inability to recognise familiar faces. A patient looks at their daughter and sees a stranger. The social moment collapses. The family member is hurt. The patient is confused and ashamed.

Existing solutions are clinical, surveillance-heavy, or simply don't exist. No shipped consumer product addresses this specific moment — the moment of recognition failure between a patient and someone they love.

---

## What Kinnect Does

Kinnect is a two-piece wearable: a discreet brooch with an embedded camera, and a bone conduction earpiece.

**Layer 1 — Social dignity**
When a known person approaches, the brooch camera identifies them. Before the patient has to ask, they hear — through the earpiece, in a family member's own cloned voice — *"Hi Nana, it's your daughter Priya."* The social moment is preserved. Nobody else in the room knows the device helped.

**Layer 2 — Daily autonomy**
Medication reminders, appointments, and daily routine anchors delivered through the same trusted voice channel. Confirmed with a single tap on the brooch.

**Layer 3 — Caregiver peace**
A companion web dashboard lets family register people, set reminders, and receive event-based notifications — medicine taken, visitor recognised. No live camera feed. No audio stream. Events only.

---

## Demo

*(Video coming soon — Phase 1 software prototype)*

**What the demo shows:**
- Camera detects and recognises a face in real time
- Confidence gate: system stays silent below 70% confidence to prevent wrong identification
- Voice cue fires in a warm, human voice: *"Hi, it's your son Harvansh. I'm right here with you."*
- Caregiver dashboard logs the recognition event live

---

## Technical Architecture
**Key design decisions:**
- **Confirmation window:** Face must be visible for 1.5 seconds before triggering — eliminates false positives from people walking past
- **Cooldown (5 minutes):** Same person will not re-trigger for 5 minutes — prevents repetitive audio that would distress the patient
- **Confidence threshold:** Below 70% match confidence, the system stays silent — a wrong name is worse than no name
- **Headless mode:** Detector runs as a background thread with no display — matches the real hardware form factor where there is no screen

---

## Stack

| Layer | Technology |
|---|---|
| Face recognition | DeepFace (VGG-Face model) |
| Computer vision | OpenCV |
| Voice synthesis | ElevenLabs API (Phase 1), Coqui TTS (Phase 2) |
| Audio playback | pygame |
| Backend | Python 3.11, Flask |
| Database | SQLite |
| Environment | Conda |

---

## Project Status

**Phase 1 — Software prototype** ✅ Complete
- Real-time face recognition with confidence gating
- ElevenLabs voice cue pipeline
- Flask caregiver dashboard
- Recognition logging

**Phase 2 — Hardware prototype** 🔄 Planned (August 2026)
- Raspberry Pi Zero 2W + camera module
- 3D printed brooch housing
- Coqui TTS for fully on-device voice (no API calls)

**Phase 3 — User testing** 🔄 Planned (August–October 2026)
- Real Alzheimer's families via Delhi NGO partners
- ARDSI Delhi, Samvedna Care, Epoch Elder Care

---

## Ethical Design

Kinnect is built privacy-first by design, not as an afterthought.

- **No footage transmitted.** The camera never sends video or images anywhere. All processing is on-device.
- **No audio streaming.** The caregiver dashboard shows events only — who was recognised, when. Never what was said or heard.
- **Consent-driven voice cloning.** Family members explicitly record and consent to their voice being used. The voice model is stored locally, never uploaded.
- **Silence over error.** Below 70% confidence, the system stays silent. A wrong identification in an Alzheimer's context is not a minor bug — it is a trust-destroying event.

---

## Running Locally

```bash
# Clone the repo
git clone https://github.com/HARVANSHSINGH31/Kinnect.git
cd Kinnect

# Create and activate environment
conda create -n kinnect python=3.11
conda activate kinnect

# Install dependencies
pip install deepface opencv-contrib-python elevenlabs flask pygame python-dotenv requests pillow

# Set up environment variables
cp .env.example .env
# Add your ElevenLabs API key to .env

# Initialise database
python database/db.py

# Add training photos
python capture_photos.py

# Run the caregiver dashboard
python ui/app.py
# Open http://localhost:5001

# Or run the terminal detector directly
python main.py
```

---

## Why This Matters

This is not a productivity tool. This is not another chatbot.

This is a device that helps a grandmother recognise her son's face before she has to admit she cannot. That preserves dignity. That keeps families together longer.

The market is real — $17.28 billion TAM, 14% CAGR, 153 million projected cases by 2050. But the reason to build this is not the market. It is the 4 seconds.

---

## Author

**Harvansh Singh**
Third-year BCA student, AI & ML specialisation, Amity University Noida
[GitHub](https://github.com/HARVANSHSINGH31)

