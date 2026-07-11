#!/usr/bin/env python3
"""Volcengine ASR — short audio transcription (auto-detect format)."""
import json, sys, struct, asyncio, os, gzip, subprocess, tempfile, pathlib

async def transcribe(audio_path: str) -> str:
    api_key = (os.environ.get("VOLC_ASR_API_KEY") or os.environ.get("VOLC_ASR_KEY") or "")
    resource_id = os.environ.get("VOLC_ASR_RESOURCE_ID", "volc.seedasr.sauc.duration")
    if not api_key:
        raise ValueError("VOLC_ASR_API_KEY required")

    # Detect audio format via ffprobe
    fmt = "wav"
    rate = 16000
    bits = 16
    channel = 1

    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", audio_path],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            info = json.loads(result.stdout)
            streams = info.get("streams", [])
            if streams:
                s = streams[0]
                rate = int(s.get("sample_rate", 16000))
                bits = int(s.get("bits_per_sample", 16) or s.get("bits_per_raw_sample", 16) or 16)
                channel = int(s.get("channels", 1))
    except:
        pass

    # Read raw audio bytes
    audio = pathlib.Path(audio_path).read_bytes()

    import websockets
    from websockets.asyncio.client import connect

    async with connect(
        "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
        additional_headers={"X-Api-Key": api_key, "X-Api-Resource-Id": resource_id},
        max_size=10 * 1024 * 1024,
        ping_interval=None,
    ) as ws:
        # Full client request
        full_payload = json.dumps({
            "user": {"uid": "browser-code"},
            "audio": {"format": fmt, "rate": rate, "bits": bits, "channel": channel},
            "request": {"model_name": "bigmodel", "enable_itn": True},
        }).encode("utf-8")

        await ws.send(
            struct.pack("!BBBB", 0x11, 0x10, 0x10, 0) +
            struct.pack("!I", len(full_payload)) + full_payload
        )

        # Audio only (type=2, flags=2 = last packet, raw bytes)
        await ws.send(
            struct.pack("!BBBB", 0x11, 0x22, 0x00, 0) +
            struct.pack("!I", len(audio)) + audio
        )

        # Read responses
        all_text = []
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=60)
            if not isinstance(raw, bytes) or len(raw) < 8:
                break

            b1, msg_type, flags = raw[1], raw[1] >> 4, raw[1] & 0xF

            if msg_type == 15:
                err_size = struct.unpack("!I", raw[8:12])[0]
                err_msg = raw[12:12+err_size].decode("utf-8", errors="replace")
                raise ValueError(f"ASR error: {err_msg}")

            if msg_type in (4, 9):
                off = 8 if (flags & 1) else 4
                if len(raw) < off + 4:
                    break
                pl_size = struct.unpack("!I", raw[off:off+4])[0]
                pl_raw = raw[off+4:off+4+pl_size]
                if pl_raw[:2] == b'\x1f\x8b':
                    pl_raw = gzip.decompress(pl_raw)

                data = json.loads(pl_raw.decode("utf-8", errors="replace"))
                result = data.get("result", {})
                if isinstance(result, dict):
                    text = result.get("text", "")
                    if text:
                        all_text.append(text)

                if msg_type == 4 or flags == 3:
                    break

    return " ".join(all_text).strip() or "[no speech detected]"


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else sys.exit("Usage: python volc_asr.py <audio>")
    print(asyncio.run(transcribe(path)))
