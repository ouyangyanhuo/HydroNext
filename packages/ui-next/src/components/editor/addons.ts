import { ownRegistration } from '../../registry/lifecycle';

export interface EditorAddonContext {
  userId?: number;
  domainId: string;
  pid: string | number;
  submitPid: string | number;
  tid?: string;
  ui: Record<string, any>;
  translate: (key: string) => string;
}

export interface EditorAddonReceipt {
  fields: Record<string, unknown>;
  complete: (result: Record<string, any>) => Promise<void>;
}

export interface EditorAddon {
  initialize: (code: string, signal?: AbortSignal) => Promise<string>;
  capture: (code: string, lang: string) => void;
  action: (action: string, lang: string, characters?: number) => void;
  change: (previousCode: string, code: string, lang: string, changes: any[], selections: any[]) => void;
  beforeSubmit: (code: string, lang: string) => Promise<EditorAddonReceipt>;
}

const factories = new Map<string, (context: EditorAddonContext) => EditorAddon | null>();

export function registerEditorAddon(name: string, factory: (context: EditorAddonContext) => EditorAddon | null) {
  if (factories.has(name)) throw new Error(`Duplicate editor addon: ${name}`);
  factories.set(name, factory);
  return ownRegistration(() => { if (factories.get(name) === factory) factories.delete(name); });
}

/** A missing optional addon must never prevent editing or submitting code. */
export function createEditorAddon(context: EditorAddonContext): EditorAddon | null {
  const addons = [...factories.values()].map((factory) => factory(context)).filter((addon): addon is EditorAddon => addon !== null);
  if (!addons.length) return null;
  return {
    async initialize(code, signal) {
      let current = code;
      for (const addon of addons) {
        if (signal?.aborted) return code;
        current = await addon.initialize(current, signal);
      }
      return current;
    },
    capture: (code, lang) => { addons.forEach((addon) => addon.capture(code, lang)); },
    action: (action, lang, characters) => { addons.forEach((addon) => addon.action(action, lang, characters)); },
    change: (...args) => { addons.forEach((addon) => addon.change(...args)); },
    async beforeSubmit(code, lang) {
      const receipts = await Promise.all(addons.map((addon) => addon.beforeSubmit(code, lang)));
      return {
        fields: Object.assign({}, ...receipts.map((receipt) => receipt.fields)),
        complete: async (result) => { await Promise.all(receipts.map((receipt) => receipt.complete(result))); },
      };
    },
  };
}
