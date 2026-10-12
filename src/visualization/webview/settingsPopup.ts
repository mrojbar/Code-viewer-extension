import type { SettingsViewDatum } from "../interfaces/messages.js";
import { buildSettingsRowsHtml } from "./settingsRowsHtml.js";
import { initSettingsControls } from "./settingsControls.js";

/** Owns the settings button and popup DOM of the graph view. */
let settingsBtn: HTMLElement | null = null;
let settingsPopup: HTMLElement | null = null;
let settingsPopupContent: HTMLElement | null = null;
let cachedSettings: readonly SettingsViewDatum[] = [];

/** Binds settings popup controls. Call once after the DOM is ready. */
export function initSettingsPopup(): void {
  settingsBtn = document.getElementById("btn-settings");
  settingsPopup = document.getElementById("settings-popup");
  settingsPopupContent = document.querySelector<HTMLElement>(
    "#settings-popup .settings-popup-scroll",
  );

  settingsBtn?.addEventListener("click", () => {
    if (settingsPopup?.classList.contains("visible")) {
      settingsPopup.classList.remove("visible");
      return;
    }
    renderRows();
    settingsPopup?.classList.add("visible");
  });

  document.addEventListener("click", (e) => {
    if (
      settingsPopup?.classList.contains("visible") &&
      !settingsPopup.contains(e.target as Node) &&
      !settingsBtn?.contains(e.target as Node)
    ) {
      settingsPopup.classList.remove("visible");
    }
  });
}

/** Caches host-provided settings data and re-renders an open popup. */
export function updateSettingsData(
  settings: readonly SettingsViewDatum[],
): void {
  cachedSettings = settings;
  if (settingsPopup?.classList.contains("visible")) {
    renderRows();
  }
}

function renderRows(): void {
  if (!settingsPopupContent) {
    return;
  }
  settingsPopupContent.innerHTML = buildSettingsRowsHtml(cachedSettings, {
    tooltip: true,
  });
  initSettingsControls(settingsPopupContent);
}
