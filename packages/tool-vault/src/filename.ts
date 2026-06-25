import crypto from "node:crypto";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function createNoteId(sourceUrl: string, timestamp: string) {
  const date = timestamp.slice(0, 10).replace(/-/g, "");
  const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 8);
  return `${date}_${hash}`;
}

export function createNoteFilename(title: string, sourceUrl: string, timestamp: string) {
  const date = timestamp.slice(0, 10);
  const slug = slugify(title) || "note";
  const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 8);
  return `${date}__${slug}__${hash}.md`;
}
