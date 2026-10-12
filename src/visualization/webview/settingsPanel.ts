/** Settings sidebar webview: renders setting rows from host-provided data. */
import type { SettingsViewDataMessage } from "../interfaces/messages.js";
import { initSettingsControls } from "./settingsControls.js";
import { buildSettingsRowsHtml } from "./settingsRowsHtml.js";
import { isSettingsViewDataMessage } from "./utils.js";
import { initDevLogsBridge } from "./devlogs.js";
import { vscodeApi } from "./vscodeApi.js";

initDevLogsBridge("settings-panel");

const rowsContainer = document.querySelector<HTMLElement>(".settings-rows");

initSettingsControls();

function renderRows(message: SettingsViewDataMessage): void {
  if (!rowsContainer) {
    return;
  }
  rowsContainer.innerHTML = buildSettingsRowsHtml(message.settings);
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (isSettingsViewDataMessage(event.data)) {
    renderRows(event.data);
    return;
  }
});

vscodeApi?.postMessage({ type: "webviewReady" });
