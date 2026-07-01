import { describe, expect, it } from "vitest";

import { detectVideoPlatform } from "./detect-video-platform";
import { fetchTranscript } from "./transcript-fetcher";

describe("tool-video", () => {
  it("detects YouTube and extracts transcript lines from captured HTML", async () => {
    const result = await fetchTranscript({
      url: "https://www.youtube.com/watch?v=abc123",
      html: `
        <html>
          <head>
            <title>Video Title</title>
            <meta property="og:title" content="Video Title" />
            <meta name="author" content="Uploader Name" />
          </head>
          <body>
            <div data-transcript-text="Hello world" data-start="0" data-end="2"></div>
            <div data-transcript-text="Second line" data-start="2" data-end="4"></div>
          </body>
        </html>
      `
    });

    expect(result.ok).toBe(true);
    expect(result.platform).toBe("youtube");
    expect(result.transcript).toHaveLength(2);
    expect(result.next_action).toBe("summarize");
  });

  it("extracts bilibili-style transcript payloads from inline scripts", async () => {
    const result = await fetchTranscript({
      url: "https://www.bilibili.com/video/BV1xx411c7mD",
      html: `
        <html>
          <head>
            <meta property="og:title" content="Bilibili Demo" />
          </head>
          <body>
            <script>
              window.__INITIAL_STATE__ = {"subtitle":{"transcript":[{"from":0,"to":2,"text":"Ni hao"},{"from":2,"to":4,"text":"World"}]}};
            </script>
          </body>
        </html>
      `
    });

    expect(result.ok).toBe(true);
    expect(result.platform).toBe("bilibili");
    expect(result.transcript?.[0]?.text).toBe("Ni hao");
  });

  it("returns need_audio_transcription when no transcript is found", async () => {
    const result = await fetchTranscript({
      url: "https://www.youtube.com/watch?v=missing",
      html: "<html><body><video></video></body></html>"
    });

    expect(result.ok).toBe(false);
    expect(result.next_action).toBe("need_audio_transcription");
  });

  it("detects unsupported platforms", () => {
    expect(detectVideoPlatform("https://example.com/video/1")).toBe("unknown");
  });

  it("detects mainstream short-video and social video platforms by explicit hosts", () => {
    expect(detectVideoPlatform("https://www.douyin.com/video/7340000000000000000")).toBe("douyin");
    expect(detectVideoPlatform("https://www.douyin.com/jingxuan/video/7340000000000000000")).toBe("douyin");
    expect(detectVideoPlatform("https://v.douyin.com/iExample/")).toBe("douyin");
    expect(detectVideoPlatform("https://www.xiaohongshu.com/explore/65f000000000000000000000")).toBe("xiaohongshu");
    expect(detectVideoPlatform("https://xhslink.com/a/example")).toBe("xiaohongshu");
    expect(detectVideoPlatform("https://www.tiktok.com/@creator/video/7340000000000000000")).toBe("tiktok");
    expect(detectVideoPlatform("https://vm.tiktok.com/ZMexample/")).toBe("tiktok");
  });

  it("does not infer video platform from generic path words", () => {
    expect(detectVideoPlatform("https://example.com/video/1")).toBe("unknown");
    expect(detectVideoPlatform("https://news.example.com/watch/story")).toBe("unknown");
  });
});
