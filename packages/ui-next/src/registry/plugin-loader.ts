import type { PluginDefinition } from './plugin';

export type PluginEntry = PluginDefinition | {
  name: string;
  load?: () => Promise<Partial<PluginDefinition>>;
  unavailable?: boolean;
};

export async function awaitPluginLoad<T>(load: () => Promise<T>, timeoutMs = 20000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      load(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Plugin load timed out.')), timeoutMs); }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Load concurrently, but install in configuration order so slot priorities stay stable. */
export async function loadPluginEntries(
  entries: PluginEntry[],
  install: (plugin: PluginDefinition) => unknown,
  failed: (name: string, error: unknown) => void,
  timeoutMs = 20000,
) {
  const modules = await Promise.all(entries.map(async (entry) => {
    const name = typeof entry?.name === 'string' ? entry.name : 'Unknown plugin';
    try {
      if (!entry || typeof entry.name !== 'string') throw new Error('Invalid plugin manifest entry.');
      if ('unavailable' in entry && entry.unavailable) throw new Error('Plugin is unavailable.');
      const plugin = await awaitPluginLoad(() => 'load' in entry && entry.load ? entry.load() : Promise.resolve(entry), timeoutMs);
      if (!('setup' in plugin) || typeof plugin.setup !== 'function') throw new Error('Plugin setup is missing.');
      return { ...plugin, name } as PluginDefinition;
    } catch (error) {
      failed(name, error);
      return null;
    }
  }));
  for (const plugin of modules) {
    if (!plugin) continue;
    try {
      install(plugin);
    } catch (error) {
      failed(plugin.name, error);
    }
  }
}
