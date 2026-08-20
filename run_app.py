"""
COS Theta Business Operating System Launcher.
Starts the FastAPI / Uvicorn server and serves the complete system on http://127.0.0.1:8000
"""

import uvicorn
import os
import sys

if __name__ == "__main__":
    print("=" * 60)
    print("  COS THETA ENTERPRISE BUSINESS OPERATING SYSTEM (v2.0)")
    print("  Zero7 Consultancy & FILTR Coffee")
    print("=" * 60)
    print("  Access Web Interface: http://127.0.0.1:8000")
    print("  API Documentation:    http://127.0.0.1:8000/docs")
    print("=" * 60)
    
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=True)
