export function normalizeUrl(url: string) {
  return new URL(url).toString();
}
