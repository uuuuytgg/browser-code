import type { PageContext } from "../capture/types";
import { getResourceHints } from "./resource-hints";
import { getSelectedText } from "./selection";

function collectLinks() {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((link) => ({
    text: link.textContent?.trim() ?? "",
    href: new URL(link.getAttribute("href") ?? "", location.href).toString()
  }));
}

function collectMedia() {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[src]")).map((image) => ({
    type: "image",
    src: new URL(image.getAttribute("src") ?? "", location.href).toString()
  }));

  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video[src]")).map((video) => ({
    type: "video",
    src: new URL(video.getAttribute("src") ?? "", location.href).toString()
  }));

  const audio = Array.from(document.querySelectorAll<HTMLAudioElement>("audio[src]")).map((node) => ({
    type: "audio",
    src: new URL(node.getAttribute("src") ?? "", location.href).toString()
  }));

  return [...images, ...videos, ...audio];
}

function collectMeta() {
  return Array.from(document.querySelectorAll<HTMLMetaElement>("meta[name], meta[property]")).reduce<Record<string, string>>(
    (accumulator, meta) => {
      const key = meta.getAttribute("name") ?? meta.getAttribute("property");
      const value = meta.getAttribute("content");

      if (key && value) {
        accumulator[key] = value;
      }

      return accumulator;
    },
    {}
  );
}

export function collectPageContext(): PageContext {
  return {
    url: location.href,
    title: document.title,
    html: document.documentElement.outerHTML,
    selected_text: getSelectedText(),
    links: collectLinks(),
    media: [...collectMedia(), ...getResourceHints()],
    meta: collectMeta()
  };
}
