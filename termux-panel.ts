/**
 * Termux System Panel — Pi extension (single file)
 *
 * Keyboard-driven device dashboard via Termux:API.
 * Commands: /termux (panel), /battery, /location
 * Agent tool: termux_read (battery|location <provider>) — text output, headless-safe
 *
 * Install: copy to ~/.pi/agent/extensions/termux-panel.ts, then /reload
 * Requires: Termux:API app (F-Droid) + `pkg install termux-api`
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CONFIG = {
  timeoutMs: 15000,
  gpsTimeoutMs: 30000,
  overviewLines: 12,
  maxLines: 50,
  cameraId: "0",
  vibrateMs: "500",
  photoDir: "/storage/emulated/0/Pictures",
} as const;

async function run(cmd: string, args: string[] = [], timeout: number = CONFIG.timeoutMs): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { timeout });
  return stdout.trim();
}

async function termuxJson(cmd: string, args: string[] = [], timeout: number = CONFIG.timeoutMs): Promise<string[]> {
  const text = await run(cmd, args, timeout);
  const data = safeParseJSON<Record<string, unknown>>(text);
  return data ? fmtJson(data) : [text];
}

function fmtJson(obj: unknown): string[] {
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
    );
  }
  return [String(obj)];
}

function safeParseJSON<T = unknown>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { return null; }
}

function showLines(ctx: any, title: string, lines: string[]): Promise<void> {
  const items = lines.length > 0 ? lines : ["(no output)"];
  const view = items.slice(0, CONFIG.maxLines);
  view.push("← Back");
  return ctx.ui.select(title, view);
}

const ERR_MISSING = /not found|ENOENT/i;
const ERR_TIMEOUT = /timed out|timeout/i;
const ERR_PERMISSION = /permission|denied/i;

function isTimeout(e: any): boolean {
  return e?.killed === true || e?.code === "ETIMEDOUT" || ERR_TIMEOUT.test(e?.message ?? String(e));
}

function apiError(e: any): string {
  const msg = e?.message ?? String(e);
  if (ERR_MISSING.test(msg)) return "termux-api missing. Run: pkg install termux-api + install Termux:API app";
  if (isTimeout(e)) return "Timed out (location/GPS needs sky view + permission)";
  if (ERR_PERMISSION.test(msg)) return "Permission denied. Grant in Android settings / run termux-setup-storage";
  return msg;
}

async function withErrors(ctx: any, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    ctx.ui.notify(apiError(e), "error");
  }
}

interface Ui {
  select(title: string, options: string[]): Promise<string | undefined>;
  input(prompt: string, def: string): Promise<string | undefined>;
  confirm(title: string, body: string): Promise<boolean>;
  notify(msg: string, kind: "info" | "error" | "warning"): void;
}
interface Ctx {
  mode: string;
  hasUI: boolean;
  ui: Ui;
}

// Pure text readers (no UI) — reused by agent tool + slash commands.
async function batteryText(): Promise<string[]> {
  return termuxJson("termux-battery-status");
}

async function locationText(prov: string, timeoutMs: number = CONFIG.timeoutMs): Promise<string[]> {
  return termuxJson("termux-location", ["-p", prov], timeoutMs);
}

async function showBattery(ctx: Ctx): Promise<void> {
  await showLines(ctx, "Battery", await batteryText());
}

interface Action {
  id: string;
  label: string;
  run(ctx: Ctx): Promise<void>;
}

const ACTIONS: Action[] = [
  {
    id: "overview",
    label: "📊 Device Overview",
    run: async (ctx) => {
      const [b, d] = await Promise.all([
        batteryText().catch((e) => [`Battery: ${apiError(e)}`]),
        termuxJson("termux-device-info")
          .then((lines) => lines.slice(0, CONFIG.overviewLines))
          .catch((e) => [`Device: ${apiError(e)}`]),
      ]);
      await showLines(ctx, "Device Overview", [...b, "---", ...d]);
    },
  },
  {
    id: "battery",
    label: "🔋 Battery Status",
    run: (ctx) => showBattery(ctx),
  },
  {
    id: "location",
    label: "📍 Location",
    run: async (ctx) => {
      const prov = await ctx.ui.select("Provider", ["network", "gps", "passive"]);
      if (!prov) return;
      const lines = await locationText(prov, prov === "gps" ? CONFIG.gpsTimeoutMs : CONFIG.timeoutMs);
      await showLines(ctx, `Location (${prov})`, lines);
    },
  },
  {
    id: "clipboard-get",
    label: "📋 Clipboard: Get",
    run: async (ctx) => {
      const t = await run("termux-clipboard-get");
      await showLines(ctx, "Clipboard", [t || "(empty)"]);
    },
  },
  {
    id: "clipboard-set",
    label: "📋 Clipboard: Set",
    run: async (ctx) => {
      const t = await ctx.ui.input("Clipboard text:", "");
      if (t) {
        await run("termux-clipboard-set", [t]);
        ctx.ui.notify("Clipboard set", "info");
      }
    },
  },
  {
    id: "torch",
    label: "🔦 Torch Toggle",
    run: async (ctx) => {
      const how = await ctx.ui.select("Torch", ["toggle", "on", "off"]);
      if (!how) return;
      await run("termux-torch", [how]);
      ctx.ui.notify(`Torch ${how}`, "info");
    },
  },
  {
    id: "photo",
    label: "📷 Take Photo",
    run: async (ctx) => {
      const p = `${CONFIG.photoDir}/termux_${Date.now()}.jpg`;
      await run("termux-camera-photo", ["-c", CONFIG.cameraId, p]);
      ctx.ui.notify(`Saved: ${p}`, "info");
    },
  },
  {
    id: "sms",
    label: "💬 Send SMS",
    run: async (ctx) => {
      const num = await ctx.ui.input("Phone number:", "");
      if (!num) return;
      const msg = await ctx.ui.input("Message:", "");
      if (!msg) return;
      const ok = await ctx.ui.confirm("Send SMS?", `To ${num}: ${msg}`);
      if (ok) {
        await run("termux-sms-send", ["-n", num, msg]);
        ctx.ui.notify("SMS sent", "info");
      }
    },
  },
  {
    id: "notify",
    label: "🔔 Send Notification",
    run: async (ctx) => {
      const title = await ctx.ui.input("Title:", "Pi");
      const body = await ctx.ui.input("Content:", "");
      if (title === undefined || body === undefined) return;
      await run("termux-notification", ["-t", title, "-c", body]);
      ctx.ui.notify("Notified", "info");
    },
  },
  {
    id: "vibrate",
    label: "📳 Vibrate",
    run: async (_ctx) => {
      await run("termux-vibrate", ["-d", CONFIG.vibrateMs]);
    },
  },
  {
    id: "tts",
    label: "🗣️ Text-to-Speech",
    run: async (ctx) => {
      const t = await ctx.ui.input("Speak:", "");
      if (t) await run("termux-tts-speak", [t]);
    },
  },
  {
    id: "system-info",
    label: "ℹ️ System Info",
    run: async (ctx) => {
      await showLines(ctx, "System Info", await termuxJson("termux-device-info"));
    },
  },
  {
    id: "wifi",
    label: "📶 WiFi Info",
    run: async (ctx) => {
      await showLines(ctx, "WiFi", await termuxJson("termux-wifi-connectioninfo"));
    },
  },
];

const labelToId = new Map(ACTIONS.map((a) => [a.label, a.id]));
const actionById = new Map(ACTIONS.map((a) => [a.id, a]));

async function openPanel(ctx: any): Promise<void> {
  if (ctx.mode !== "tui" && !ctx.hasUI) {
    ctx.ui.notify("Panel needs interactive mode", "warning");
    return;
  }
  for (;;) {
    const pick: string | undefined = await ctx.ui.select("📱 Termux Panel (Esc exits)", ACTIONS.map((a) => a.label));
    if (!pick) return;
    const id = labelToId.get(pick);
    if (!id) continue;
    const act = actionById.get(id);
    if (!act) continue;
    await withErrors(ctx, () => act.run(ctx as Ctx));
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("termux", {
    description: "Open Termux system control panel",
    handler: async (_args, ctx) => {
      await openPanel(ctx);
    },
  });

  pi.registerCommand("battery", {
    description: "Show battery status",
    handler: async (_args, ctx) => {
      await withErrors(ctx, async () => {
        await showBattery(ctx as Ctx);
      });
    },
  });

  pi.registerCommand("location", {
    description: "Show current location (network provider)",
    handler: async (_args, ctx) => {
      await withErrors(ctx, async () => {
        const lines = await locationText("network");
        await showLines(ctx, "Location", lines);
      });
    },
  });

  // Agent-callable read tool: headless-safe (no ctx.ui), reads only.
  // Cast: type-lens ExtensionAPI shim lacks registerTool (see pi-types.d.ts).
  (pi as any).registerTool({
    name: "termux_read",
    description: "Read device info via Termux:API — no side effects, safe to call when the user is not present. Returns plain text lines.",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description: "What to read: 'battery' or 'location'",
        },
        provider: {
          type: "string",
          enum: ["network", "gps", "passive"],
          description: "Location provider (only for field='location')",
        },
      },
      required: ["field"],
    },
    async execute(_id: string, params: { field?: string; provider?: string }) {
      const field = params?.field;
      if (field === "battery") {
        try {
          const lines = await batteryText();
          return { content: [{ type: "text", text: lines.length > 0 ? lines.join("\n") : "(no output)" }], details: {}, terminate: false };
        } catch (e: any) {
          return { content: [{ type: "text", text: apiError(e) }], details: {}, terminate: false };
        }
      }
      if (field === "location") {
        const prov = ["network", "gps", "passive"].includes(params?.provider as string) ? (params?.provider as string) : "network";
        const timeoutMs = prov === "gps" ? CONFIG.gpsTimeoutMs : CONFIG.timeoutMs;
        try {
          const lines = await locationText(prov, timeoutMs);
          return { content: [{ type: "text", text: lines.join("\n") }], details: {}, terminate: false };
        } catch (e: any) {
          return { content: [{ type: "text", text: apiError(e) }], details: {}, terminate: false };
        }
      }
      return { content: [{ type: "text", text: `Unknown field '${String(field)}'. Use: battery | location` }], details: { error: "invalid_field" }, terminate: false };
    },
  });

}
