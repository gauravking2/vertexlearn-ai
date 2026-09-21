"""Final proof: hosted AI Tutor answers via Pollinations route (timed).

Mirrors the browser: register -> login -> enroll -> session -> message.
Prints status/latency/answer only. Never prints tokens.
"""
import json
import time
import urllib.error
import urllib.request

BASE = "https://vertexlearn-backend.onrender.com/api/v1"
COURSE = "8cd61eac-3976-4ee1-973f-a99b119dda86"  # Python Fundamentals (Demo)
STAMP = str(int(time.time()))[-6:]
EMAIL = f"finalprove{STAMP}@example.com"
PW = "FinalProve123!"


def call(method, path, body=None, token=None, timeout=240):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"content-type": "application/json"},
        method=method,
    )
    if token:
        req.add_unredirected_header("Authorization", f"Bearer {token}")
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
        dt = time.monotonic() - t0
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {"_raw": raw[:200]}
        return ("OK", r.status, round(dt, 1), parsed)
    except urllib.error.HTTPError as e:
        dt = time.monotonic() - t0
        try:
            detail = e.read().decode()[:300]
        except Exception:
            detail = ""
        return ("HTTP", e.code, round(dt, 1), detail)
    except Exception as e:
        dt = time.monotonic() - t0
        return ("FAIL", type(e).__name__, round(dt, 1), str(e)[:200])


def show(label, res):
    status, code, dt, body = res
    if isinstance(body, dict):
        extra = ""
        if "answer" in body:
            extra = f" answer_len={len(str(body['answer']))} grounded={body.get('grounded')}"
            print(f"  ANSWER: {str(body['answer'])[:400]}")
            srcs = body.get("sources", [])
            print(f"  SOURCES: {len(srcs)}")
        if "error" in body:
            extra = f" error={body.get('error')} msg={(body.get('message') or '')[:150]}"
        print(f"{label}: {status} {code} {dt}s{extra}")
    else:
        print(f"{label}: {status} {code} {dt}s :: {body[:200]}")
    return res


show("register", call("POST", "/auth/register", {"name": "Final", "email": EMAIL, "password": PW}, timeout=60))
login = show("login", call("POST", "/auth/login", {"email": EMAIL, "password": PW}, timeout=60))
tok = login[3].get("accessToken") if login[0] == "OK" else None
assert tok, "no token"
show("enroll", call("POST", f"/courses/{COURSE}/enroll", {}, token=tok, timeout=60))
sess = show("session", call("POST", "/ai/chat/sessions", {"courseId": COURSE, "mode": "intermediate"}, token=tok, timeout=60))
sid = sess[3].get("id") if sess[0] == "OK" else None
assert sid, "no session"
show("message", call("POST", f"/ai/chat/sessions/{sid}/messages", {"content": "Explain Python variables in simple terms"}, token=tok, timeout=240))
