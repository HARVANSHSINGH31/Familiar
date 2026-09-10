import cv2
import os
import time

name = input("Enter person name (must match photos folder): ").strip()
save_dir = f"data/photos/{name}"
os.makedirs(save_dir, exist_ok=True)

existing = len([f for f in os.listdir(save_dir) if f.endswith(('.jpg', '.jpeg', '.png'))])
print(f"Existing photos: {existing}")
print("Press SPACE to capture. Press Q to quit.")
print("Take 30+ photos: front, slight left, slight right, looking up, looking down, different expressions.")

cap = cv2.VideoCapture(0)
count = existing

while True:
    ret, frame = cap.read()
    if not ret:
        break

    display = frame.copy()
    cv2.putText(display, f"Photos taken: {count - existing} | Total: {count}", 
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(display, "SPACE=capture  Q=quit", 
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 1)
    cv2.imshow("Familiar - Photo Capture", display)

    key = cv2.waitKey(1) & 0xFF
    if key == ord(' '):
        filename = f"{save_dir}/webcam_{count:03d}.jpg"
        cv2.imwrite(filename, frame)
        count += 1
        print(f"Saved: {filename}")
    elif key == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print(f"Done. Captured {count - existing} new photos. Total: {count}")
