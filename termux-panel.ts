/**
 * Termux System Panel — Pi extension (single file)
 *
 * Keyboard-driven device dashboard via Termux:API.
 * Commands: /termux (panel), /battery, /location
 *
 * Install: copy to ~/.pi/agent/extensions/termux-panel.ts, then /reload
 * Requires: Termux:API app (F-Droid) + `pkg install termux-api`
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 15000;

async function run(cmd: string, args: string[] = []): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { timeout: TIMEOUT_MS });
  return stdout.trim();
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

async function showLines(ctx: any, title: string, lines: string[]): Promise<void> {
  const items = lines.length > 0 ? lines : ["(no output)"];
  await ctx.ui.select(title, [...items.slice(0, 50), "← Back"]);
}

function apiError(e: any): string {
  const msg = e?.message ?? String(e);
  if (/not found|ENOENT/i.test(msg)) return "termux-api missing. Run: pkg install termux-api + install Termux:API app";
  if (/timed out|timeout/i.test(msg)) return "Timed out (location/GPS needs sky view + permission)";
  if (/permission|denied/i.test(msg)) return "Permission denied. Grant in Android settings / run termux-setup-storage";
  return msg;
}

async function batteryLines(): Promise<string[]> {
  const out = await run("termux-battery-status");
  const data = safeParseJSON<Record<string, unknown>>(out);
  return data ? fmtJson(data) : [out];
}

async function openPanel(ctx: any): Promise<void> {
  if (ctx.mode !== "tui" && !ctx.hasUI) {
    ctx.ui.notify("Panel needs interactive mode", "warning");
    return;
  }
  const MENU = [
    "📊 Device Overview",
    "🔋 Battery Status",
    "📍 Location",
    "📋 Clipboard: Get",
    "📋 Clipboard: Set",
    "🔦 Torch Toggle",
    "📷 Take Photo",
    "💬 Send SMS",
    "🔔 Send Notification",
    "📳 Vibrate",
    "🗣️ Text-to-Speech",
    "ℹ️ System Info",
    "📶 WiFi Info",
  ];
  for (;;) {
    const pick: string | undefined = await ctx.ui.select("📱 Termux Panel (Esc exits)", MENU);
    if (!pick) return;
    try {
      switch (pick) {
        case "📊 Device Overview": {
          const [b, d] = await Promise.all([
            batteryLines().catch((e) => [`Battery: ${apiError(e)}`]),
            run("termux-device-info").then((o) => (safeParseJSON<Record<string, unknown>>(o) ? fmtJson(safeParseJSON<Record<string, unknown>>(o)!).slice(0, 12) : [o])).catch((e) => [`Device: ${apiError(e)}`]),
          ]);
          await showLines(ctx, "Device Overview", [...b, "---", ...d]);
          break;
        }
        case "🔋 Battery Status":
          await showLines(ctx, "Battery", await batteryLines());
          break;
        case "📍 Location": {
          const prov = await ctx.ui.select("Provider", ["network", "gps", "passive"]);
          if (!prov) break;
          const out = await run("termux-location", ["-p", prov]);
          const d = safeParseJSON<Record<string, unknown>>(out);
          await showLines(ctx, `Location (${prov})`, d ? fmtJson(d) : [out]);
          break;
        }
        case "📋 Clipboard: Get": {
          const t = await run("termux-clipboard-get");
          await showLines(ctx, "Clipboard", [t || "(empty)"]);
          break;
        }
        case "📋 Clipboard: Set": {
          const t = await ctx.ui.input("Clipboard text:", "");
          if (t) {
            await run("termux-clipboard-set", [t]);
            ctx.ui.notify("Clipboard set", "info");
          }
          break;
        }
        case "🔦 Torch Toggle": {
          const how = await ctx.ui.select("Torch", ["toggle", "on", "off"]);
          if (!how) break;
          await run("termux-torch", [how]);
          ctx.ui.notify(`Torch ${how}`, "info");
          break;
        }
        case "📷 Take Photo": {
          const p = `/storage/emulated/0/Pictures/termux_${Date.now()}.jpg`;
          await run("termux-camera-photo", ["-c", "0", p]);
          ctx.ui.notify(`Saved: ${p}`, "info");
          break;
        }
        case "💬 Send SMS": {
          const num = await ctx.ui.input("Phone number:", "");
          if (!num) break;
          const msg = await ctx.ui.input("Message:", "");
          if (!msg) break;
          const ok = await ctx.ui.confirm("Send SMS?", `To ${num}: ${msg}`);
          if (ok) {
            await run("termux-sms-send", ["-n", num, msg]);
            ctx.ui.notify("SMS sent", "info");
          }
          break;
        }
        case "🔔 Send Notification": {
          const title = (await ctx.ui.input("Title:", "Pi")) ?? "Pi";
          const body = (await ctx.ui.input("Content:", "")) ?? "";
          await run("termux-notification", ["-t", title, "-c", body]);
          ctx.ui.notify("Notified", "info");
          break;
        }
        case "📳 Vibrate":
          await run("termux-vibrate", ["-d", "500"]);
          break;
        case "🗣️ Text-to-Speech": {
          const t = await ctx.ui.input("Speak:", "");
          if (t) await run("termux-tts-speak", [t]);
          break;
        }
        case "ℹ️ System Info": {
          const out = await run("termux-device-info");
          const info = safeParseJSON<Record<string, unknown>>(out);
          await showLines(ctx, "System Info", info ? fmtJson(info) : [out]);
          break;
        }
        case "📶 WiFi Info": {
          const out = await run("termux-wifi-connectioninfo");
          const w = safeParseJSON<Record<string, unknown>>(out);
          await showLines(ctx, "WiFi", w ? fmtJson(w) : [out]);
          break;
        }
      }
    } catch (e: any) {
      ctx.ui.notify(apiError(e), "error");
    }
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
      try {
        await showLines(ctx, "Battery", await batteryLines());
      } catch (e: any) {
        ctx.ui.notify(apiError(e), "error");
      }
    },
  });

  pi.registerCommand("location", {
    description: "Show current location (network provider)",
    handler: async (_args, ctx) => {
      try {
        const out = await run("termux-location", ["-p", "network"]);
        const data = safeParseJSON<Record<string, unknown>>(out);
        await showLines(ctx, "Location", data ? fmtJson(data) : [out]);
      } catch (e: any) {
        ctx.ui.notify(apiError(e), "error");
      }
    },
  });

}
