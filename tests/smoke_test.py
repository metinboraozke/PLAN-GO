"""
PLANİGO Smoke Test
==================
Tüm router'ların kayıtlı olduğunu ve beklenen HTTP kodlarını döndürdüğünü doğrular.

Çalıştırma (sunucuya ihtiyaç yok — FastAPI TestClient kullanır):
    cd c:\\...\\PLANİGO
    python tests/smoke_test.py

Seçenekler:
    --live    Sunucuya bağlanarak test et (http://localhost:8000)
"""

import sys
import os

# Windows console UTF-8 fix
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Test tanımları ─────────────────────────────────────────────────────────────
# (method, path, json_body, expected_status, description)
TESTS = [
    # Health
    ("GET",    "/",                                                None, 200, "Health root"),
    ("GET",    "/api/v1/health",                                   None, 200, "Health detailed"),

    # Auth Router
    ("GET",    "/api/v1/auth/me",                                  None, 401, "Auth: me -> 401 no token"),
    ("POST",   "/api/v1/auth/login",
               {"email": "test@test.com", "password": "wrong"},   401, "Auth: login wrong creds -> 401"),

    # Discovery Router
    ("GET",    "/api/v1/discover/categories",                      None, 200, "Discovery: categories"),
    ("GET",    "/api/v1/discover/hero",                            None, 200, "Discovery: hero"),
    ("GET",    "/api/v1/discover/trending",                        None, 200, "Discovery: trending"),
    ("GET",    "/api/v1/discover/deals",                           None, 200, "Discovery: deals"),
    ("GET",    "/api/v1/discover/budget-friendly",                 None, 200, "Discovery: budget-friendly"),
    ("GET",    "/api/v1/discover/vizesiz",                         None, 200, "Discovery: vizesiz"),

    # Pins Router
    ("GET",    "/api/v1/map/pins",                                 None, 200, "Pins: list"),
    ("GET",    "/api/v1/map/pins/nearby?lat=41&lng=29&radius_km=10", None, 200, "Pins: nearby"),

    # Events Router
    ("GET",    "/api/v1/map/events",                               None, 200, "Events: list"),
    ("GET",    "/api/v1/map/events/nonexistent_id",                None, 400, "Events: invalid id -> 400"),

    # AI Router
    ("GET",    "/api/v1/ai/pax-itinerary?city=Paris&days=2",       None, [200, 502], "AI: pax-itinerary (200 or 502)"),
    ("GET",    "/api/v1/ai/travel-recommendations?city=Rome",      None, [200, 502], "AI: travel-recommendations (200 or 502)"),
    ("GET",    "/api/v1/ai/pax-itinerary?city=Tokyo&days=3",       None, [200, 502], "AI: pax-itinerary Tokyo"),

    # Planner Router
    ("GET",    "/api/v1/wishlists",                                None, 200, "Planner: wishlists list"),
    ("DELETE", "/api/v1/wishlists/000000000000000000000000",       None, [404, 400], "Planner: delete nonexistent -> 404/400"),

    # Profile Router
    ("GET",    "/api/v1/profile",                                  None, 200, "Profile: get profile"),
    ("GET",    "/api/v1/profile/passport",                         None, 200, "Profile: passport"),
    ("GET",    "/api/v1/profile/stats",                            None, 200, "Profile: stats"),
    ("GET",    "/api/v1/profile/visited-countries",                None, 200, "Profile: visited countries"),
    ("GET",    "/api/v1/profile/wishlist",                         None, 200, "Profile: wishlist cards"),
    ("GET",    "/api/v1/profile/full-stats",                       None, 200, "Profile: full stats"),
    ("GET",    "/api/v1/users/nonexistent/public-profile",         None, 200, "Profile: public profile (found=False)"),

    # Image Service
    ("GET",    "/api/v1/image/city?q=Istanbul&w=400",              None, 200, "Image: city url"),
    ("GET",    "/api/v1/image/city?q=Paris&w=800",                 None, 200, "Image: city Paris url"),

    # Legacy endpoints
    ("GET",    "/wishlists",                                       None, 200, "Legacy: /wishlists"),
]


# ── Renk kodları ────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"
BOLD   = "\033[1m"


def _status_ok(actual: int, expected) -> bool:
    if isinstance(expected, list):
        return actual in expected
    return actual == expected


def run_with_test_client():
    """In-process TestClient (no running server needed)."""
    from fastapi.testclient import TestClient
    from main import app

    print(f"\n{BOLD}=== PLANİGO Smoke Test — TestClient (in-process) ==={RESET}\n")
    client = TestClient(app, raise_server_exceptions=False)

    passed = failed = 0
    failures = []

    for method, path, body, expected, desc in TESTS:
        try:
            if method == "GET":
                r = client.get(path)
            elif method == "POST":
                r = client.post(path, json=body)
            elif method == "DELETE":
                r = client.delete(path)
            elif method == "PATCH":
                r = client.patch(path, json=body)
            else:
                r = client.request(method, path, json=body)

            ok = _status_ok(r.status_code, expected)
            if ok:
                passed += 1
                tag = f"{GREEN}PASS{RESET}"
            else:
                failed += 1
                tag = f"{RED}FAIL{RESET}"
                failures.append((desc, expected, r.status_code, path))

            exp_str = str(expected) if isinstance(expected, list) else str(expected)
            print(f"  [{tag}] {desc:<48} {r.status_code:>3}  (beklenen: {exp_str})")

        except Exception as e:
            failed += 1
            tag = f"{RED}ERR {RESET}"
            failures.append((desc, expected, f"EXC: {e}", path))
            print(f"  [{tag}] {desc:<48} Exception: {e}")

    _print_summary(passed, failed, failures)
    return failed == 0


def run_with_live_server(base_url: str = "http://localhost:8000"):
    """HTTP client against live server."""
    try:
        import httpx
    except ImportError:
        print("httpx bulunamadı, pip install httpx")
        return False

    print(f"\n{BOLD}=== PLANİGO Smoke Test — Live Server ({base_url}) ==={RESET}\n")

    passed = failed = 0
    failures = []

    with httpx.Client(base_url=base_url, timeout=10.0) as client:
        for method, path, body, expected, desc in TESTS:
            try:
                r = client.request(method, path, json=body)
                ok = _status_ok(r.status_code, expected)
                if ok:
                    passed += 1
                    tag = f"{GREEN}PASS{RESET}"
                else:
                    failed += 1
                    tag = f"{RED}FAIL{RESET}"
                    failures.append((desc, expected, r.status_code, path))

                exp_str = str(expected) if isinstance(expected, list) else str(expected)
                print(f"  [{tag}] {desc:<48} {r.status_code:>3}  (beklenen: {exp_str})")

            except Exception as e:
                failed += 1
                failures.append((desc, expected, f"EXC: {e}", path))
                print(f"  [{RED}ERR {RESET}] {desc:<48} Exception: {e}")

    _print_summary(passed, failed, failures)
    return failed == 0


def _print_summary(passed: int, failed: int, failures: list):
    total = passed + failed
    print(f"\n{BOLD}{'─'*60}{RESET}")
    if failed == 0:
        print(f"{GREEN}{BOLD}Results: {passed}/{total} PASS — tüm testler geçti OK{RESET}")
    else:
        print(f"{RED}{BOLD}Results: {passed}/{total} PASS — {failed} test başarısız{RESET}")
        print(f"\n{YELLOW}Başarısız testler:{RESET}")
        for desc, expected, actual, path in failures:
            print(f"  x {desc}")
            print(f"    Path: {path}")
            print(f"    Beklenen: {expected} | Gelen: {actual}")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    use_live = "--live" in sys.argv

    if use_live:
        base = "http://localhost:8000"
        for arg in sys.argv[1:]:
            if arg.startswith("http"):
                base = arg
        success = run_with_live_server(base)
    else:
        success = run_with_test_client()

    sys.exit(0 if success else 1)
