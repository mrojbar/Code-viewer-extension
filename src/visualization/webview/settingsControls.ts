import { vscodeApi } from "./vscodeApi.js";

function updateModifiedIndicator(key: string, value: unknown): void {
  const row = document.querySelector<HTMLElement>(
    `.setting-row[data-key="${key}"]`,
  );
  if (!row) {
    return;
  }
  const defaultVal = row.getAttribute("data-default");
  const isConfigured = String(value) !== String(defaultVal);
  row.classList.toggle("is-configured", isConfigured);
}

function handleCheckboxChange(target: HTMLElement): void {
  const row = target.closest<HTMLElement>(".setting-row");
  if (!row) {
    return;
  }
  const key = row.getAttribute("data-key");
  if (!key) {
    return;
  }
  const checked = (target as any).checked ?? false;
  vscodeApi?.postMessage({ command: "updateSetting", key, value: checked });
  updateModifiedIndicator(key, checked);
}

function handleNumberSliderInput(target: HTMLInputElement): void {
  const row = target.closest<HTMLElement>(".setting-row");
  if (!row) {
    return;
  }
  const key = row.getAttribute("data-key");
  if (!key) {
    return;
  }
  const input = document.getElementById(
    `${key}-input`,
  ) as HTMLInputElement | null;
  if (input) {
    input.value = target.value;
  }
  updateModifiedIndicator(key, target.value);
}

function handleNumberSliderChange(target: HTMLInputElement): void {
  const row = target.closest<HTMLElement>(".setting-row");
  if (!row) {
    return;
  }
  const key = row.getAttribute("data-key");
  if (!key) {
    return;
  }
  const val = parseFloat(target.value);
  vscodeApi?.postMessage({ command: "updateSetting", key, value: val });
}

function handleNumberInputChange(target: HTMLInputElement): void {
  const row = target.closest<HTMLElement>(".setting-row");
  if (!row) {
    return;
  }
  const key = row.getAttribute("data-key");
  if (!key) {
    return;
  }
  const slider = document.getElementById(
    `${key}-slider`,
  ) as HTMLInputElement | null;
  let val = parseFloat(target.value);
  if (slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    if (val < min) {
      val = min;
    }
    if (val > max) {
      val = max;
    }
    target.value = String(val);
    slider.value = String(val);
  }
  updateModifiedIndicator(key, val);
  vscodeApi?.postMessage({ command: "updateSetting", key, value: val });
}

function handleTextFieldChange(target: HTMLElement): void {
  const row = target.closest<HTMLElement>(".setting-row");
  if (!row) {
    return;
  }
  const key = row.getAttribute("data-key");
  if (!key) {
    return;
  }
  const value = (target as any).value ?? "";
  vscodeApi?.postMessage({ command: "updateSetting", key, value });
  updateModifiedIndicator(key, value);
}

function handleDropdownChange(target: HTMLElement): void {
  const row = target.closest<HTMLElement>(".setting-row");
  if (!row) {
    return;
  }
  const key = row.getAttribute("data-key");
  if (!key) {
    return;
  }
  const value = (target as any).value ?? "";
  vscodeApi?.postMessage({ command: "updateSetting", key, value });
  updateModifiedIndicator(key, value);
}

function handleResetClick(): void {
  vscodeApi?.postMessage({ command: "resetSettings" });
}

/**
 * Binds settings controls inside `container` via event delegation.
 * Safe to call multiple times on the same container
 */
export function initSettingsControls(container?: HTMLElement): void {
  const root = container ?? document.body;
  if ((root as any).__settingsControlsBound) {
    return;
  }
  (root as any).__settingsControlsBound = true;

  root.addEventListener("click", (e) => {
    const resetBtn = (e.target as HTMLElement).closest(".settings-reset-btn");
    if (resetBtn) {
      e.preventDefault();
      handleResetClick();
    }
  });

  root.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("vscode-checkbox")) {
      handleCheckboxChange(target);
      return;
    }
    if (target.classList.contains("native-slider")) {
      handleNumberSliderChange(target as HTMLInputElement);
      return;
    }
    if (target.classList.contains("native-number")) {
      handleNumberInputChange(target as HTMLInputElement);
      return;
    }
    if (target.closest("vscode-text-field")) {
      handleTextFieldChange(target);
      return;
    }
    if (target.closest("vscode-dropdown")) {
      handleDropdownChange(target);
      return;
    }
  });

  root.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("native-slider")) {
      handleNumberSliderInput(target as HTMLInputElement);
    }
  });
}
