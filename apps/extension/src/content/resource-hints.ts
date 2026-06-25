export function getResourceHints() {
  return Array.from(document.querySelectorAll<HTMLElement>("[src]"))
    .map((element) => {
      const src = element.getAttribute("src");

      if (!src) {
        return undefined;
      }

      return {
        type: element.tagName.toLowerCase(),
        src: new URL(src, location.href).toString()
      };
    })
    .filter((value): value is { type: string; src: string } => Boolean(value));
}
