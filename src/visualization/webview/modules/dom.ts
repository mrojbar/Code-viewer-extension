/**
 * Shared DOM helpers for style assignment and lazy element creation.
 */
export function applyDomStyles(
  element: HTMLElement,
  styles: Record<string, string>,
): void {
  Object.assign(element.style, styles);
}

export function getOrCreateElement(
  id: string,
  tagName: string,
  initialize: (element: HTMLElement) => void,
): HTMLElement {
  let element = document.getElementById(id) as HTMLElement | null;

  if (!element) {
    element = document.createElement(tagName);
    element.id = id;
    initialize(element);
    document.body.appendChild(element);
  }

  return element;
}
