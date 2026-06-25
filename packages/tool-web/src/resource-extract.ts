import type { WebResource } from "@ska/schemas";

function classifyHref(href: string): WebResource["type"] {
  const lower = href.toLowerCase();

  if (/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/.test(lower)) {
    return "image";
  }

  if (/\.(pdf|docx?|pptx?|xlsx?)(\?|#|$)/.test(lower)) {
    return "document";
  }

  if (/\.(mp4|mp3|wav|webm|ogg|m4a)(\?|#|$)/.test(lower)) {
    return "media";
  }

  return "link";
}

export function extractResources(document: Document, baseUrl: string): WebResource[] {
  const resources: WebResource[] = [];
  const seen = new Set<string>();

  const addResource = (resource: WebResource) => {
    const key = `${resource.type}:${resource.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      resources.push(resource);
    }
  };

  for (const image of document.querySelectorAll("img")) {
    const src = image.getAttribute("src");
    if (!src) continue;
    addResource({
      type: "image",
      url: new URL(src, baseUrl).toString(),
      text: image.getAttribute("alt") || undefined
    });
  }

  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    const url = new URL(href, baseUrl).toString();
    addResource({
      type: classifyHref(url),
      url,
      text: anchor.textContent?.trim() || undefined
    });
  }

  return resources;
}
