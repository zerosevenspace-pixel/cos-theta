"""
Deepgram transcription integration for call recordings.
Uses Deepgram Nova-2 model for high-accuracy speech-to-text.
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)

DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "a2e3371df734caf6ad135e6cb45405c4e2bbe2f2")
DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"


def transcribe_audio(file_bytes: bytes, mime_type: str = "audio/mpeg") -> dict:
    """
    Transcribe audio bytes using Deepgram Nova-2.
    Returns dict with 'text' (full transcript) and 'paragraphs' (formatted), or None on failure.
    """
    if not DEEPGRAM_API_KEY:
        logger.warning("Deepgram API key not configured")
        return None
    
    try:
        params = {
            "model": "nova-2",
            "language": "en",
            "detect_language": "true",   # Auto-detect Hindi/English
            "smart_format": "true",      # Punctuation, casing
            "paragraphs": "true",        # Paragraph formatting
            "utterances": "true",         # Speaker turns
            "diarize": "true",           # Speaker identification
        }
        
        headers = {
            "Authorization": f"Token {DEEPGRAM_API_KEY}",
            "Content-Type": mime_type,
        }
        
        response = httpx.post(
            DEEPGRAM_URL,
            params=params,
            headers=headers,
            content=file_bytes,
            timeout=120.0,  # Transcription can take time for large files
        )
        
        if response.status_code != 200:
            logger.error(f"Deepgram error {response.status_code}: {response.text[:300]}")
            return None
        
        result = response.json()
        
        # Extract transcript text
        channels = result.get("results", {}).get("channels", [])
        if not channels:
            return None
        
        alternatives = channels[0].get("alternatives", [])
        if not alternatives:
            return None
        
        transcript_text = alternatives[0].get("transcript", "")
        confidence = alternatives[0].get("confidence", 0)
        
        # Extract paragraphs for formatted output
        paragraphs = alternatives[0].get("paragraphs", {}).get("paragraphs", [])
        formatted_lines = []
        for para in paragraphs:
            sentences = para.get("sentences", [])
            for s in sentences:
                formatted_lines.append(s.get("text", ""))
        
        formatted_text = "\n\n".join(formatted_lines) if formatted_lines else transcript_text
        
        # Detect language
        detected_lang = result.get("results", {}).get("channels", [{}])[0].get("detected_language", "en")
        
        logger.info(f"Transcription complete: {len(transcript_text)} chars, confidence: {confidence:.2f}, lang: {detected_lang}")
        
        return {
            "text": transcript_text,
            "formatted_text": formatted_text,
            "confidence": confidence,
            "language": detected_lang,
        }
    
    except httpx.TimeoutException:
        logger.error("Deepgram transcription timed out")
        return None
    except Exception as e:
        logger.error(f"Deepgram transcription failed: {e}")
        return None


def is_available() -> bool:
    """Check if Deepgram is configured."""
    return bool(DEEPGRAM_API_KEY)
