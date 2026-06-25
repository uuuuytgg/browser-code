const chromeApi = (globalThis as { chrome?: any }).chrome;

if (chromeApi?.runtime?.onInstalled) {
  chromeApi.runtime.onInstalled.addListener(() => {
    chromeApi.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  });
}

if (chromeApi?.action?.onClicked) {
  chromeApi.action.onClicked.addListener(async (tab: { windowId?: number }) => {
    if (typeof tab.windowId === "number") {
      await chromeApi.sidePanel?.open?.({ windowId: tab.windowId });
    }
  });
}
