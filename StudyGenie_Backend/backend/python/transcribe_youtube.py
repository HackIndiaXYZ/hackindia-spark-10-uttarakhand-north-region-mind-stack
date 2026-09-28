import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from contextlib import redirect_stdout


def eprint(*args):
    print(*args, file=sys.stderr, flush=True)


def download_audio(url: str, temp_dir: str):
    import yt_dlp
    max_minutes = int(os.getenv("MAX_VIDEO_MINUTES", "180"))
    def duration_filter(info, *, incomplete=False):
        if info.get("is_live"):
            return "Live streams are not supported."
        if (info.get("duration") or 0) > max_minutes * 60:
            return f"Video is too long. Maximum supported length is {max_minutes} minutes."
    outtmpl = str(Path(temp_dir) / "audio.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "match_filter": duration_filter,
        "max_filesize": 1024 * 1024 * 1024,
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": False,
        "js_runtimes": {"node": {"path": os.getenv("STUDYGENIE_NODE_BIN", "node")}},
        "noplaylist": True,
        "restrictfilenames": True,
        "retries": 3,
        "fragment_retries": 3,
        "socket_timeout": 30,
        "continuedl": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        eprint("Downloading lecture audio...")
        info = ydl.extract_info(url, download=True) or {}
        if not info or info.get("_type") == "playlist":
            raise RuntimeError("A single playable lecture video is required.")
        audio_path = ydl.prepare_filename(info)
    if not Path(audio_path).exists():
        raise RuntimeError("Audio download completed but the audio file was not found.")
    return info, audio_path


def transcribe(audio_path: str):
    from faster_whisper import WhisperModel
    model_name = os.getenv("WHISPER_MODEL", "tiny")
    device = os.getenv("WHISPER_DEVICE", "cpu")
    compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    language = os.getenv("WHISPER_LANGUAGE", "").strip() or None

    eprint(f"Loading Faster-Whisper model={model_name} device={device} compute={compute_type}")
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    eprint("Model loaded. Transcribing audio...")
    segments, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=True,
    )

    next_progress = 60
    parts = []
    segment_rows = []
    for segment in segments:
        if segment.end >= next_progress:
            eprint(f"Transcribed {int(segment.end)} seconds of audio")
            next_progress = segment.end + 60
        text = (segment.text or "").strip()
        if not text:
            continue
        parts.append(text)
        segment_rows.append({
            "start": round(float(segment.start), 2),
            "end": round(float(segment.end), 2),
            "text": text,
        })

    return {
        "text": " ".join(parts).strip(),
        "segments": segment_rows,
        "detected_language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
    }


def main():
    parser = argparse.ArgumentParser(description="Download and transcribe one YouTube lecture.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--tmp-dir", default=None)
    args = parser.parse_args()

    max_minutes = int(os.getenv("MAX_VIDEO_MINUTES", "180"))
    base_tmp = args.tmp_dir or None
    if base_tmp:
        Path(base_tmp).mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="studygenie_", dir=base_tmp) as temp_dir:
        with redirect_stdout(sys.stderr):
            info, audio_path = download_audio(args.url, temp_dir)
        duration_raw = info.get("duration")
        try:
            duration = int(duration_raw or 0)
        except (TypeError, ValueError):
            duration = 0
        if duration and duration > max_minutes * 60:
            raise RuntimeError(f"Video is too long. Maximum supported length is {max_minutes} minutes.")

        with redirect_stdout(sys.stderr):
            result = transcribe(audio_path)
        payload = {
            "title": info.get("title") or info.get("fulltitle") or "YouTube Lecture",
            "video_id": info.get("id") or None,
            "duration_seconds": duration,
            "channel": info.get("channel") or info.get("uploader") or info.get("creator") or "YouTube",
            "webpage_url": info.get("webpage_url") or args.url,
            **result,
        }
        print(json.dumps(payload, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        for stream in (sys.stdout, sys.stderr):
            if hasattr(stream, "reconfigure"):
                stream.reconfigure(encoding="utf-8", errors="replace")
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), flush=True)
        sys.exit(1)
