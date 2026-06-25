export function extractMetadata(document: Document, fallbackTitle: string | undefined, sourceUrl: string) {
  const title =
    document.querySelector("title")?.textContent?.trim() ||
    document.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim() ||
    fallbackTitle ||
    sourceUrl;

  const excerpt =
    document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ||
    document.querySelector("meta[property='og:description']")?.getAttribute("content")?.trim() ||
    undefined;

  const byline =
    document.querySelector("meta[name='author']")?.getAttribute("content")?.trim() ||
    undefined;

  const siteName =
    document.querySelector("meta[property='og:site_name']")?.getAttribute("content")?.trim() ||
    undefined;

  const language = document.documentElement.lang?.trim() || undefined;

  return {
    title,
    source_url: sourceUrl,
    byline,
    excerpt,
    site_name: siteName,
    language
  };
}
