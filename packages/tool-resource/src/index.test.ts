import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runDownloadAsset, runScanPageResources } from "./index";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

function createTempRoot() {
  const root = path.join(os.tmpdir(), `ska-resource-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  tempRoots.push(root);
  return root;
}

describe("tool-resource", () => {
  it("scans links and media into typed resource items", async () => {
    const result = await runScanPageResources({
      page_url: "https://example.com",
      links: [
        { text: "PDF", href: "https://example.com/files/doc.pdf" },
        { text: "Playlist", href: "https://cdn.example.com/video/master.m3u8" }
      ],
      media: [
        { type: "img", src: "https://example.com/assets/cover.png" }
      ]
    });

    expect(result.items).toHaveLength(3);
    expect(result.items.find((item) => item.type === "pdf")?.downloadable_by_default).toBe(true);
    expect(result.items.find((item) => item.url.endsWith(".m3u8"))?.risk).toBe("high");
  });

  it("deduplicates repeated resource urls", async () => {
    const result = await runScanPageResources({
      page_url: "https://example.com",
      links: [
        { href: "https://example.com/files/doc.pdf" },
        { href: "https://example.com/files/doc.pdf" }
      ],
      media: []
    });

    expect(result.items).toHaveLength(1);
  });

  it("writes a placeholder asset record into the asset directory", async () => {
    const root = createTempRoot();
    const result = await runDownloadAsset({
      asset_dir: path.join(root, "vault", "assets"),
      resource: {
        id: "abc123",
        type: "pdf",
        url: "https://example.com/files/doc.pdf",
        filename: "doc.pdf",
        risk: "low",
        downloadable_by_default: true
      }
    });

    expect(result.skipped).toBe(false);
    const raw = await fs.readFile(result.saved_path, "utf8");
    expect(raw).toContain("https://example.com/files/doc.pdf");
  });
});
