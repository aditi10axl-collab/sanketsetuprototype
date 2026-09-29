import cv2
import requests
import base64
import json
import time

API = "http://127.0.0.1:8000"
TARGET_FRAMES = 32
MAX_ATTEMPTS = 120

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

if not cap.isOpened():
    print("❌ Camera open nahi hua")
    raise SystemExit

print("========================================")
print("     SANKET SETU - ACTUAL SIGN TEST")
print("========================================")
print("✅ Camera ON")
print("👉 Apna trained sign clearly dikhao")
print("🎯 32 VALID hand frames collect honge")
print()

sequence = []
attempts = 0

while len(sequence) < TARGET_FRAMES and attempts < MAX_ATTEMPTS:

    ok, frame = cap.read()
    attempts += 1

    if not ok:
        print(f"⚠️ Frame {attempts}: camera read failed")
        continue

    ok, buffer = cv2.imencode(".jpg", frame)

    if not ok:
        print(f"⚠️ Frame {attempts}: JPEG encoding failed")
        continue

    image_b64 = (
        "data:image/jpeg;base64,"
        + base64.b64encode(buffer).decode("utf-8")
    )

    try:
        r = requests.post(
            API + "/extract_features",
            json={"image_base64": image_b64},
            timeout=5
        )

        if r.status_code != 200:
            print("❌ Feature API error:", r.text)
            continue

        data = r.json()

        hands = data.get("handsDetected", 0)

        if hands >= 1:
            sequence.append(data["features"])

            print(
                f"✅ Valid frame "
                f"{len(sequence):02d}/{TARGET_FRAMES} "
                f"| Hands: {hands}"
            )
        else:
            print(
                f"⏭️ Skipped "
                f"| Hands: 0 "
                f"| Valid: {len(sequence)}/{TARGET_FRAMES}"
            )

    except Exception as e:
        print("⚠️ API error:", e)

    time.sleep(0.08)

cap.release()

print()
print("========================================")

if len(sequence) < TARGET_FRAMES:
    print("❌ Could not collect 32 valid hand frames")
    print(f"Valid frames: {len(sequence)}/{TARGET_FRAMES}")
    print("Try keeping your hand clearly visible.")
    raise SystemExit

print("✅ 32 VALID hand frames collected")
print("🧠 Sending sequence to CUSTOM MODEL...")
print("========================================")

try:
    r = requests.post(
        API + "/predict_custom",
        json={"sequence": sequence},
        timeout=10
    )

    print()
    print("========== FINAL PREDICTION ==========")
    print(json.dumps(r.json(), indent=2))
    print("======================================")

except Exception as e:
    print("❌ Prediction API error:", e)