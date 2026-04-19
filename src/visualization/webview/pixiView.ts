/** Webview runtime: boot Pixi, receive data messages, and render debug content. */
import { Application, Container, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";

interface PixiElement {
  id: string;
  label: string;
  type: "directory" | "file";
  parentId?: string;
  lineCount?: number;
}

interface GraphUpdateMessage {
  type: "updateGraph";
  elements: PixiElement[];
}

/** Guards extension -> webview message payload shape. */
function isGraphUpdateMessage(value: unknown): value is GraphUpdateMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<GraphUpdateMessage>;
  return message.type === "updateGraph" && Array.isArray(message.elements);
}

declare global {
  interface Window {
    __pixiApp?: Application;
    __pixiViewport?: Viewport;
    __pixiLastElements?: PixiElement[];
  }
}

let app: Application | undefined;
let viewport: Viewport | undefined;
let scene: Container | undefined;
let pendingElements: PixiElement[] | undefined;
const WORLD_PADDING_PX = 120;

/** Reads current renderer dimensions for viewport screen sizing. */
function getScreenSize(): { width: number; height: number } {
  if (!app) {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  return {
    width: app.renderer.width,
    height: app.renderer.height,
  };
}

/** Computes world bounds from rendered scene content plus a small margin. */
function getWorldSizeFromContent(
  screenWidth: number,
  screenHeight: number,
): { worldWidth: number; worldHeight: number } {
  if (!scene || scene.children.length === 0) {
    return {
      worldWidth: screenWidth,
      worldHeight: screenHeight,
    };
  }

  const bounds = scene.getLocalBounds();
  const contentWidth = Math.max(
    1,
    Math.ceil(bounds.width + WORLD_PADDING_PX * 2),
  );
  const contentHeight = Math.max(
    1,
    Math.ceil(bounds.height + WORLD_PADDING_PX * 2),
  );

  return {
    worldWidth: Math.max(screenWidth, contentWidth),
    worldHeight: Math.max(screenHeight, contentHeight),
  };
}

/** Updates viewport screen and world sizes after resize or content changes. */
function updateViewportSize(): void {
  if (!viewport) {
    return;
  }

  const { width, height } = getScreenSize();
  const { worldWidth, worldHeight } = getWorldSizeFromContent(width, height);
  viewport.resize(width, height, worldWidth, worldHeight);
}

/** Draws a simple text preview so we can verify incoming element data quickly. */
function renderElements(elements: PixiElement[]): void {
  pendingElements = elements;
  window.__pixiLastElements = elements;

  if (!scene) {
    return;
  }

  scene.removeChildren();

  const totalText = new Text({
    text: `Received elements: ${elements.length}`,
    style: {
      fill: 0xffffff,
      fontSize: 18,
    },
  });
  totalText.x = 16;
  totalText.y = 12;
  scene.addChild(totalText);

  const previewLines = elements
    .slice(0, 18)
    .map(
      (element) =>
        `${element.type === "directory" ? "[D]" : "[F]"} ${element.label}`,
    )
    .join("\n");

  const previewText = new Text({
    text: previewLines || "No elements received yet.",
    style: {
      fill: 0xd4d4d4,
      fontSize: 13,
    },
  });
  previewText.x = 16;
  previewText.y = 44;
  scene.addChild(previewText);

  updateViewportSize();
}

/** Receives graph updates posted from the extension host. */
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isGraphUpdateMessage(event.data)) {
    return;
  }

  renderElements(event.data.elements);
});

/** Initializes Pixi app, viewport controls, and first frame state. */
async function bootstrapPixi(): Promise<void> {
  const canvas = document.getElementById(
    "pixi-canvas",
  ) as HTMLCanvasElement | null;
  if (!canvas) {
    return;
  }

  app = new Application();
  await app.init({
    canvas,
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
  });

  scene = new Container();

  const { width, height } = getScreenSize();
  const { worldWidth, worldHeight } = getWorldSizeFromContent(width, height);
  viewport = new Viewport({
    screenWidth: width,
    screenHeight: height,
    worldWidth,
    worldHeight,
    events: app.renderer.events,
  });

  // Left mouse drag + wheel zoom with smoothing + movement deceleration.
  viewport
    .drag({ mouseButtons: "left" })
    .wheel({ smooth: 5 })
    .decelerate({ friction: 0.9, minSpeed: 0.02 });

  app.stage.addChild(viewport);

  viewport.addChild(scene);

  window.addEventListener("resize", () => {
    updateViewportSize();
  });

  if (pendingElements) {
    renderElements(pendingElements);
  } else {
    renderElements([]);
  }

  window.__pixiApp = app;
  window.__pixiViewport = viewport;
}

void bootstrapPixi();
