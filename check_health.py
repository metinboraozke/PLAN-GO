import urllib.request
import json
import time

API_URL = "http://localhost:8000/api/v1"

def check_health():
    print(f"Checking {API_URL}...")
    try:
        with urllib.request.urlopen("http://localhost:8000/docs", timeout=5) as response:
            if response.status == 200:
                print("[OK] Backend is UP (Docs accessible)")
            else:
                print(f"[WARN] Backend returned {response.status}")

        req = urllib.request.Request(f"{API_URL}/wishlists")
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                print(f"[OK] DB Connected (Wishlists: {len(data)} items)")
            else:
                print(f"[WARN] Wishlists endpoint returned {response.status}")

    except Exception as e:
        print(f"[FAIL] Connection Failed: {e}")

if __name__ == "__main__":
    time.sleep(2)
    check_health()
