import hashlib
import json
import base64
from fastapi import Request

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def create_token(user_id: str, role: str) -> str:
    payload = {"user_id": user_id, "role": role}
    json_payload = json.dumps(payload)
    return base64.b64encode(json_payload.encode()).decode()

def decode_token(token: str) -> dict:
    try:
        json_payload = base64.b64decode(token.encode()).decode()
        return json.loads(json_payload)
    except Exception:
        return None

def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth.split(" ")[1]
        decoded = decode_token(token)
        if decoded:
            return decoded
    return None
