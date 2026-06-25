import TurndownService from "turndown";

export function createTurndownService() {
  const { gfm } = require("turndown-plugin-gfm") as {
    gfm: (service: TurndownService) => void;
  };

  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    linkStyle: "inlined"
  });

  turndownService.use(gfm);
  turndownService.remove(["script", "style", "noscript"]);

  return turndownService;
}
