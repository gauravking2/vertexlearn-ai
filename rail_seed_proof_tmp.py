"""Final Railway proof: catalog has seeded courses -> chat with sources."""
import json
import time
import urllib.error
import urllib.request

BASE = "https://vertexlearn-backend-production-c3fe.up.railway.app/api/v1"
STAMP = str(int(time.time()))[-6:]
EMAIL = f"railprove{STAMP}@example.com"
PW = "RailProve123!"


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
            print(f"  ANSWER: {str(body['answer'])[:500]}")
            print(f"  SOURCES: {len(body.get('sources', []))}")
        if "error" in body:
            extra = f" error={body.get('error')} msg={(body.get('message') or '')[:150]}"
        if "data" in body and isinstance(body["data"], list):
            extra = f" items={len(body['data'])} total={body.get('total')}"
            for c in body["data"][:5]:
                print(f"    - {c.get('title')} ({c.get('id')})")
        print(f"{label}: {status} {code} {dt}s{extra}")
    else:
        print(f"{label}: {status} {code} {dt}s :: {body[:200]}")
    return res


show("register", call("POST", "/auth/register", {"name": "Rail", "email": EMAIL, "password": PW}, timeout=60))
login = show("login", call("POST", "/auth/login", {"email": EMAIL, "password": PW}, timeout=60))
tok = login[3].get("accessToken") if login[0] == "OK" else None
assert tok, "no token"
cat = show("catalog", call("GET", "/courses?page=1", token=tok, timeout=60))
data = cat[3].get("data", []) if cat[0] == "OK" else []
assert data, "no published courses"
course = next((c for c in data if "Learning Science" in c.get("title", "")), data[0])
cid = course["id"]
print(f"USING COURSE: {course.get('title')} ({cid})")
show("enroll", call("POST", f"/courses/{cid}/enroll", {}, token=tok, timeout=60))
sess = show("session", call("POST", "/ai/chat/sessions", {"courseId": cid, "mode": "intermediate"}, token=tok, timeout=60))
sid = sess[3].get("id") if sess[0] == "OK" else None
assert sid, "no session"
show("message", call("POST", f"/ai/chat/sessions/{sid}/messages", {"content": "Explain retrieval practice in simple terms"}, token=tok, timeout=240))
