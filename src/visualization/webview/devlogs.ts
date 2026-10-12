/**
 * Forwards webview console output and uncaught errors to DevLogs MCP
 * (HTTP POST /webview-log, default port 3939). Fire-and-forget: failures
 * are swallowed so logging can never break rendering.
 */

const DEVLOGS_ENDPOINT = "http://127.0.0.1:3939/webview-log";

type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

const CONSOLE_LEVELS: readonly ConsoleLevel[] = [
  "log",
  "info",
  "warn",
  "error",
  "debug",
];

function send(level: string, channel: string, message: string): void {
  void fetch(DEVLOGS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      level,
      channel,
      message,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});
}

function formatArgs(args: unknown[]): string {
  return args
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
    .join(" ");
}

/**
 * Installs console and error forwarding for this webview.
 * Call once at startup, before any code that logs.
 */
export function initDevLogsBridge(channel: string): void {
  const consoleRecord = console as unknown as Record<
    ConsoleLevel,
    (...args: unknown[]) => void
  >;

  for (const level of CONSOLE_LEVELS) {
    const original = console[level].bind(console) as (
      ...args: unknown[]
    ) => void;
    consoleRecord[level] = (...args: unknown[]) => {
      send(level, channel, formatArgs(args));
      original(...args);
    };
  }

  window.addEventListener("error", (event) => {
    send(
      "error",
      channel,
      `${event.message} (${event.filename}:${event.lineno})`,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason);
    send("error", channel, `Unhandled rejection: ${message}`);
  });
}
