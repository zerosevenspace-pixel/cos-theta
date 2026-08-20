"""
Authentication, Session Management, and Role-Based Access Control (RBAC).
"""

from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, status
from backend.database import DBRepository, verify_password


class AuthService:
    @staticmethod
    def authenticate(username: str, password: str) -> Optional[Dict[str, Any]]:
        user = DBRepository.get_user_by_username(username)
        if not user:
            return None
        if not verify_password(password, user["password_hash"]):
            return None
        return user

    @staticmethod
    def check_business_access(user: Dict[str, Any], requested_business: str) -> bool:
        if user["role"] == "founder":
            return True
        user_biz = user.get("assigned_business", "all")
        if user_biz == "all":
            return True
        if requested_business == "all":
            return True  # Filtered dynamically
        return user_biz == requested_business
