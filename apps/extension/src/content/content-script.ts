import { collectPageContext } from "./page-capture";

const chromeApi = (globalThis as { chrome?: any }).chrome;

if (chromeApi?.runtime?.onMessage) {
  chromeApi.runtime.onMessage.addListener(
    (message: { type?: string }, _sender: unknown, sendResponse: (value: unknown) => void) => {
      if (message?.type === "ska:get-page-context") {
        sendResponse(collectPageContext());
        return true;
      }

      return false;
    }
  );
}
