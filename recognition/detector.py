import cv2
import time
import threading
from deepface import DeepFace

last_triggered = {}
COOLDOWN_SECONDS = 300
CONFIDENCE_THRESHOLD = 70.0  # Below this, stay silent — wrong cue is worse than no cue

def should_trigger(person_name):
    now = time.time()
    if person_name not in last_triggered:
        return True
    if now - last_triggered[person_name] > COOLDOWN_SECONDS:
        return True
    return False

def mark_triggered(person_name):
    last_triggered[person_name] = time.time()

def run_detector(on_face_detected, headless=False):
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open camera.")
        return
    print("Camera started. Press Q to quit.")
    face_detected_time = {}
    CONFIRM_SECONDS = 1.5

    while True:
        ret, frame = cap.read()
        if not ret:
            print("ERROR: Failed to grab frame.")
            break
        small = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
        try:
            results = DeepFace.find(
                img_path=small,
                db_path="data/photos",
                enforce_detection=False,
                silent=True,
                model_name="VGG-Face"
            )
            for result in results:
                if result.empty:
                    continue
                top = result.iloc[0]
                identity = top.get("identity", "")
                distance = top.get("distance", 1.0)
                threshold = top.get("threshold", 0.4)
                if distance < threshold:
                    parts = identity.replace("\\", "/").split("/")
                    name = parts[-2] if len(parts) >= 2 else "Unknown"
                    confidence = round((1 - distance / threshold) * 100, 1)
                    now = time.time()

                    if name not in face_detected_time:
                        face_detected_time[name] = now
                    visible_for = now - face_detected_time[name]

                    if visible_for >= CONFIRM_SECONDS and should_trigger(name):
                        if confidence >= CONFIDENCE_THRESHOLD:
                            mark_triggered(name)
                            face_detected_time.pop(name, None)
                            print(f"RECOGNISED: {name} ({confidence}% confidence)")
                            threading.Thread(
                                target=on_face_detected,
                                args=(name, confidence),
                                daemon=True
                            ).start()
                        else:
                            face_detected_time.pop(name, None)
                            print(f"[FAMILIAR] Low confidence ({confidence}%) for {name} — staying silent")

                    if not headless:
                        color = (0, 255, 0) if confidence >= CONFIDENCE_THRESHOLD else (0, 165, 255)
                        cv2.putText(
                            frame, f"{name} {confidence}%",
                            (20, 40), cv2.FONT_HERSHEY_SIMPLEX,
                            1, color, 2
                        )
        except Exception as e:
            pass

        if not headless:
            cv2.imshow("Familiar - Press Q to quit", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        else:
            time.sleep(0.05)

    cap.release()
    if not headless:
        cv2.destroyAllWindows()
    print("Camera stopped.")

if __name__ == "__main__":
    def test_callback(name, confidence):
        print(f">> Callback fired: {name} at {confidence}%")
    run_detector(test_callback)
