#!/usr/bin/env python3
"""Fetch Bilibili subtitles directly via public API (no cookies needed)."""
import json, sys, asyncio, hashlib, urllib.request, urllib.parse, re, os, pathlib

WBI_KEY = None

async def get_wbi_keys() -> tuple:
    global WBI_KEY
    if WBI_KEY:
        return WBI_KEY
    req = urllib.request.Request(
        "https://api.bilibili.com/x/web-interface/nav",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://www.bilibili.com/"}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())

    img_url: str = data["data"]["wbi_img"]["img_url"]
    sub_url: str = data["data"]["wbi_img"]["sub_url"]
    IMG_KEY = re.search(r"/([^/]+)\.png", img_url).group(1) if "/" in img_url else img_url.split(".")[0]
    SUB_KEY = re.search(r"/([^/]+)\.png", sub_url).group(1) if "/" in sub_url else sub_url.split(".")[0]
    mixed = "".join(sorted([IMG_KEY, SUB_KEY]))
    WBI_KEY = hashlib.md5(mixed.encode()).hexdigest()
    return WBI_KEY

def wbi_sign(params: dict) -> dict:
    keys = sorted(params.keys())
    query = "&".join([f"{k}={params[k]}" for k in keys])
    wts = int(__import__("time").time())
    query += f"&wts={wts}"
    w_rid = hashlib.md5((query + WBI_KEY).encode()).hexdigest()
    params["wts"] = wts
    params["w_rid"] = w_rid
    return params

def api_get(url: str, params: dict = None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.bilibili.com/",
        }
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

async def fetch_subtitles(bv_id: str, langs: str = "zh,en") -> str:
    mixin_key = asyncio.get_event_loop().run_in_executor(None, get_wbi_keys)
    lang_list = [l.strip() for l in langs.split(",")]

    # 1. Get video info to find cid
    await get_wbi_keys()
    info = await asyncio.get_event_loop().run_in_executor(
        None, lambda: api_get(f"https://api.bilibili.com/x/web-interface/view?bvid={bv_id}")
    )
    if info.get("code") != 0:
        # Try as URL
        match = re.search(r"BV\w+", bv_id)
        if match:
            return await fetch_subtitles(match.group(), langs)
        raise ValueError(f"Bilibili API error: {info.get('message', 'unknown')}")

    data = info["data"]
    title = data.get("title", "")

    # Handle multi-page: cid from first page or directly from data
    pages = data.get("pages", [])
    if "cid" in data:
        cid = data["cid"]
    elif pages:
        cid = pages[0]["cid"]
    else:
        raise ValueError("No cid found")

    # 2. Get subtitle tracks
    sub_info = api_get(
        f"https://api.bilibili.com/x/player/v2?bvid={bv_id}&cid={cid}",
        wbi_sign({"bvid": bv_id, "cid": cid, "platform": "web"}),
    )

    if sub_info.get("code") != 0:
        raise ValueError(f"Subtitle API error: {sub_info.get('message')}")

    subtitle_urls = sub_info["data"].get("subtitle", {}).get("subtitles", [])
    if not subtitle_urls:
        return f"No subtitle tracks found for BV{bv_id} (cid={cid}).\nTitle: {title}\nSubtitle info: {json.dumps(sub_info['data'].get('subtitle', {}), ensure_ascii=False)}"

    # Pick best matching language
    chosen = None
    for lang_code in lang_list:
        for sub in subtitle_urls:
            if sub.get("lang_key", "").startswith(lang_code) or sub.get("lang", "").startswith(lang_code):
                chosen = sub
                break
        if chosen:
            break
    if not chosen:
        chosen = subtitle_urls[0]

    # Download subtitle JSON
    sub_url = chosen["subtitle_url"]
    if sub_url.startswith("//"):
        sub_url = "https:" + sub_url
    sub_data = api_get(sub_url)

    # Extract text
    lines = []
    for item in sub_data.get("body", []):
        content = item.get("content", "")
        if content:
            start = item.get("from", 0)
            end = item.get("to", 0)
            lines.append(f"[{start:.1f}s-{end:.1f}s] {content}")

    full_text = "\n".join(lines) if lines else json.dumps(sub_data, ensure_ascii=False)[:500]

    return f"Title: {title}\nLanguage: {chosen.get('lang', 'unknown')}\nTracks: {len(lines)}\n\n{full_text}"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python bilibili_sub.py <BV_id_or_url>")
        sys.exit(1)
    text = asyncio.run(fetch_subtitles(sys.argv[1]))
    print(text)
