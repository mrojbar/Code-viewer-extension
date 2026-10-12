import type { LayoutDiagnostics } from "../interfaces/messages.js";
import { buildWarningHtml } from "./render/warningHtml.js";

/** Owns the warning button and popup DOM of the graph view. */
let warningBtn: HTMLButtonElement | null = null;
let warningPopup: HTMLElement | null = null;

/** Binds warning popup controls. Call once after the DOM is ready. */
export function initWarningPopup(): void {
  warningBtn = document.getElementById(
    "btn-warning",
  ) as HTMLButtonElement | null;
  warningPopup = document.getElementById("warning-popup");

  warningBtn?.addEventListener("click", () => {
    warningPopup?.classList.toggle("visible");
  });

  document.addEventListener("click", (e) => {
    if (
      warningPopup?.classList.contains("visible") &&
      !warningPopup.contains(e.target as Node) &&
      !warningBtn?.contains(e.target as Node)
    ) {
      warningPopup.classList.remove("visible");
    }
  });
}

/** Shows the warning button with rendered diagnostics, or hides it when clean. */
export function renderWarning(diagnostics: LayoutDiagnostics | undefined): void {
  if (!warningBtn || !warningPopup) {
    return;
  }

  const html = buildWarningHtml(diagnostics);
  if (html) {
    warningBtn.style.display = "flex";
    warningPopup.innerHTML = html;
    warningPopup.classList.add("visible");
  } else {
    warningBtn.style.display = "none";
    warningPopup.classList.remove("visible");
  }
}
