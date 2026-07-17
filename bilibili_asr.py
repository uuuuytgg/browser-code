#!/usr/bin/env python3
"""Download Bilibili audio for ASR via public API, no cookies needed."""
import json, sys, hashlib, urllib.request, re, os, subprocess, time, pathlib, shutil, tempfile

WBI_KEY = None
def get_mixin_key():
    global WBI_KEY
    if WBI_KEY: return WBI_KEY
    req = urllib.request.Request("https://api.bilibili.com/x/web-interface/nav",headers={"User-Agent":"Mozilla/5.0","Referer":"https://www.bilibili.com/"})
    with urllib.request.urlopen(req,timeout=10) as r: d=json.loads(r.read())["data"]["wbi_img"]
    a=d["img_url"].split("/")[-1].split(".")[0]; b=d["sub_url"].split("/")[-1].split(".")[0]
    WBI_KEY=hashlib.md5("".join(sorted([a,b])).encode()).hexdigest(); return WBI_KEY
def sign(p):
    mk=get_mixin_key(); keys=sorted(p.keys()); qs="&".join([f"{k}={p[k]}" for k in keys])
    wts=int(time.time()); p["w_rid"]=hashlib.md5((f"{qs}&wts={wts}"+mk).encode()).hexdigest(); p["wts"]=wts; return p
def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Referer":"https://www.bilibili.com/"})
    with urllib.request.urlopen(req,timeout=15) as r: return json.loads(r.read())

def process(url_or_bvid):
    m=re.search(r"BV\w+",url_or_bvid)
    if not m: return "Invalid URL"
    bvid=m.group()
    info=fetch(f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}")
    if info["code"]!=0: return f"API error: {info.get('message','unknown')}"
    cid=info["data"].get("cid") or info["data"]["pages"][0]["cid"]
    title=info["data"]["title"]
    print(f"Title: {title}", flush=True)

    sub_info=fetch("https://api.bilibili.com/x/player/v2?"+urllib.parse.urlencode(sign({"bvid":bvid,"cid":str(cid)})))
    subs=sub_info["data"].get("subtitle",{}).get("subtitles",[])
    if subs:
        su=subs[0]["subtitle_url"]
        if su.startswith("//"): su="https:"+su
        sd=fetch(su)
        lines=[i["content"] for i in sd.get("body",[]) if i.get("content")]
        return f"Title: {title}\n({subs[0].get('lang','unknown')} subs, {len(lines)} lines):\n\n"+("\n".join(lines))

    # Get audio URL
    print("No subs.", flush=True)
    play=fetch("https://api.bilibili.com/x/player/playurl?"+urllib.parse.urlencode(sign({"bvid":bvid,"cid":str(cid),"platform":"web","qn":"16","fnver":"0","fnval":"4048"})))
    audio_url=None
    dash=play.get("data",{}).get("dash",{})
    audios=dash.get("audio",[])
    if audios:
        audio_url=audios[0]["baseUrl"]
    if not audio_url and play.get("data",{}).get("durl"):
        audio_url=play["data"]["durl"][0]["url"]
    if not audio_url:
        return f"No audio URL:\n{json.dumps(play.get('data',{}),ensure_ascii=False)[:500]}"

    # Bilibili URLs use & for &, need to decode
    audio_url = audio_url.replace("\\u0026", "&")
    print(f"URL ok", flush=True)

    tmp=pathlib.Path(tempfile.mkdtemp())
    try:
        m4s=tmp/"audio.m4s"
        req=urllib.request.Request(audio_url,headers={"User-Agent":"Mozilla/5.0","Referer":"https://www.bilibili.com/"})
        with urllib.request.urlopen(req,timeout=120) as r, open(str(m4s),"wb") as f:
            size=0
            while True:
                c=r.read(65536)
                if not c: break
                f.write(c); size+=len(c)
        print(f"Downloaded {size} bytes", flush=True)
        if size<1000:
            return f"Audio too small ({size}B)"

        wav=tmp/"audio.wav"
        subprocess.run(["ffmpeg","-y","-hide_banner","-loglevel","error",
            "-i",str(m4s),"-ac","1","-ar","16000","-sample_fmt","s16",str(wav)],check=True,timeout=120)
        print(f"WAV ready", flush=True)

        key=os.environ.get("VOLC_ASR_API_KEY") or os.environ.get("VOLC_ASR_KEY","")
        if not key: return "VOLC_ASR_API_KEY not set"
        r=subprocess.run(["python",str(pathlib.Path(__file__).parent/"volc_asr.py"),str(wav)],
            capture_output=True,text=True,timeout=300,
            env={**os.environ,"VOLC_ASR_API_KEY":key})
        print(f"ASR ok" if r.returncode==0 else f"ASR err", flush=True)
        return f"Title: {title}\n(ASR):\n\n{r.stdout.strip() or r.stderr.strip()[:200] or '[empty]'}"
    finally:
        shutil.rmtree(str(tmp),ignore_errors=True)

if __name__=="__main__":
    if len(sys.argv)<2: print("Usage: python bilibili_asr.py <BV_id>"); sys.exit(1)
    print(process(sys.argv[1]))
