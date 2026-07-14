"""ElevenLabs text-to-speech for AI insights read-aloud."""
import os
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from elevenlabs import ElevenLabs
from auth import get_current, AuthContext

router = APIRouter(prefix="/tts", tags=["tts"])

_api_key = os.environ["ELEVENLABS_API_KEY"]
_voice_id = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Rachel
_model_id = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")

_client = ElevenLabs(api_key=_api_key)


class TTSIn(BaseModel):
    text: str
    voice_id: str | None = None


@router.post("/speak")
async def speak(inp: TTSIn, ctx: AuthContext = Depends(get_current)):
    if not inp.text or len(inp.text) > 5000:
        raise HTTPException(400, "Text must be 1-5000 chars")

    voice = inp.voice_id or _voice_id
    try:
        audio_stream = _client.text_to_speech.convert(
            voice_id=voice,
            model_id=_model_id,
            text=inp.text,
            output_format="mp3_44100_128",
        )
        # SDK returns a generator of bytes chunks
        buf = BytesIO()
        for chunk in audio_stream:
            if chunk:
                buf.write(chunk)
        buf.seek(0)
    except Exception as e:
        msg = str(e)
        if "paid_plan_required" in msg or "402" in msg:
            raise HTTPException(402, "ElevenLabs free tier does not allow library voices via API. Upgrade to Starter plan OR clone your own voice in the ElevenLabs Voice Lab and set ELEVENLABS_VOICE_ID.")
        raise HTTPException(500, f"TTS failed: {msg[:200]}")

    return StreamingResponse(
        buf,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/voices")
async def list_voices(ctx: AuthContext = Depends(get_current)):
    try:
        result = _client.voices.get_all()
        voices = [{"voice_id": v.voice_id, "name": v.name, "category": getattr(v, "category", None)} for v in result.voices]
        return {"voices": voices, "default": _voice_id}
    except Exception as e:
        raise HTTPException(500, f"Failed to list voices: {e}")
