"""
Google Drive integration for call recording uploads.
Uses Service Account authentication for headless server-to-server access.
"""
import os
import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

ROOT_FOLDER_ID = "105mtdVl4j4VR9TAqM73eVaRhc0ul0KK3"
CREDENTIALS_PATH = os.environ.get(
    "GOOGLE_DRIVE_CREDENTIALS",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "google_drive_credentials.json")
)

_service = None

def _get_service():
    """Lazy-init the Drive API service."""
    global _service
    if _service:
        return _service
    if not os.path.exists(CREDENTIALS_PATH):
        logger.warning(f"Google Drive credentials not found at {CREDENTIALS_PATH}")
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        credentials = service_account.Credentials.from_service_account_file(
            CREDENTIALS_PATH,
            scopes=["https://www.googleapis.com/auth/drive"]
        )
        _service = build("drive", "v3", credentials=credentials)
        logger.info("Google Drive service initialized")
        return _service
    except Exception as e:
        logger.error(f"Failed to init Drive service: {e}")
        return None


def _find_or_create_folder(name: str, parent_id: str) -> Optional[str]:
    """Find existing folder by name under parent, or create one."""
    service = _get_service()
    if not service:
        return None
    try:
        query = f"name='{name}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = service.files().list(q=query, fields="files(id)", pageSize=1).execute()
        files = results.get("files", [])
        if files:
            return files[0]["id"]
        # Create folder
        metadata = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id]
        }
        folder = service.files().create(body=metadata, fields="id").execute()
        logger.info(f"Created Drive folder: {name} ({folder['id']})")
        return folder["id"]
    except Exception as e:
        logger.error(f"Drive folder error: {e}")
        return None


def upload_recording(
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    lead_name: str,
    business_name: str = ""
) -> Optional[dict]:
    """
    Upload a recording file to Google Drive.
    Returns dict with file_id, web_view_link, embed_link or None on failure.
    """
    service = _get_service()
    if not service:
        logger.warning("Drive service not available, skipping upload")
        return None
    
    try:
        # Create lead subfolder: "Lead Name - Business Name" or just "Lead Name"
        folder_name = f"{lead_name} - {business_name}".strip(" -") if business_name else lead_name
        # Sanitize folder name
        folder_name = folder_name.replace("/", "-").replace("\\", "-")[:100]
        
        lead_folder_id = _find_or_create_folder(folder_name, ROOT_FOLDER_ID)
        if not lead_folder_id:
            lead_folder_id = ROOT_FOLDER_ID  # fallback to root
        
        # Upload file
        from googleapiclient.http import MediaInMemoryUpload
        file_metadata = {
            "name": filename,
            "parents": [lead_folder_id]
        }
        media = MediaInMemoryUpload(file_bytes, mimetype=mime_type, resumable=True)
        uploaded = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id,webViewLink,webContentLink,size"
        ).execute()
        
        file_id = uploaded.get("id")
        
        # Make file viewable by anyone with the link
        service.permissions().create(
            fileId=file_id,
            body={"type": "anyone", "role": "reader"},
            fields="id"
        ).execute()
        
        embed_link = f"https://drive.google.com/file/d/{file_id}/preview"
        
        logger.info(f"Uploaded to Drive: {filename} -> {file_id}")
        return {
            "file_id": file_id,
            "web_view_link": uploaded.get("webViewLink", ""),
            "embed_link": embed_link,
            "web_content_link": uploaded.get("webContentLink", "")
        }
    except Exception as e:
        logger.error(f"Drive upload failed: {e}")
        return None


def get_file_stream(file_id: str) -> Optional[tuple]:
    """Download file bytes from Drive. Returns (bytes, mime_type) or None."""
    service = _get_service()
    if not service:
        return None
    try:
        meta = service.files().get(fileId=file_id, fields="mimeType,name").execute()
        request = service.files().get_media(fileId=file_id)
        buffer = io.BytesIO()
        from googleapiclient.http import MediaIoBaseDownload
        downloader = MediaIoBaseDownload(buffer, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        buffer.seek(0)
        return buffer.read(), meta.get("mimeType", "application/octet-stream")
    except Exception as e:
        logger.error(f"Drive download failed: {e}")
        return None


def is_available() -> bool:
    """Check if Drive integration is configured and working."""
    return _get_service() is not None
