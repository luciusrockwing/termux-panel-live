// Ambient module declaration for the Pi runtime package.
// Loaded as a GLOBAL .d.ts (no top-level `export {}`): a bare
// `declare module "x"` at top level tells tsc that module `x` provides
// these types when it cannot be resolved on disk (jiti supplies it live).
// If `export {}` is added, tsc treats this as module-augmentation of an
// EXISTING module and falls back to "cannot find module".
declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    registerCommand(name: string, options: {
      description?: string;
      handler: (args: string, ctx: any) => void | Promise<void>;
    }): void;
    registerTool(tool: {
      name: string;
      description?: string;
      parameters?: unknown;
      execute: (id: string, params: any) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown; terminate: boolean }>;
    }): void;
  }
}
