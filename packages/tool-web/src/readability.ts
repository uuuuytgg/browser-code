import { Readability, isProbablyReaderable } from "@mozilla/readability";

export function parseReadableArticle(document: Document) {
  const documentClone = document.cloneNode(true) as Document;
  const article = new Readability(documentClone, {
    keepClasses: false
  }).parse();

  return {
    article,
    isProbablyArticle: isProbablyReaderable(document)
  };
}
