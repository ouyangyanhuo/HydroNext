type Dispose = () => void;
let current: Dispose[] | undefined;

/** All public registration functions participate, including SDK calls outside PluginAPI. */
export function ownRegistration(dispose: Dispose): Dispose {
  let active = true;
  const once = () => {
    if (!active) return;
    active = false;
    dispose();
  };
  current?.push(once);
  return once;
}

export function registrationScope() {
  const disposers: Dispose[] = [];
  return {
    run(callback: () => void) {
      const previous = current;
      current = disposers;
      try {
        callback();
      } finally {
        current = previous;
      }
    },
    dispose() {
      for (const dispose of disposers.splice(0).reverse()) {
        try {
          dispose();
        } catch (error) {
          console.error('[Hydro] Plugin cleanup failed:', error);
        }
      }
    },
  };
}
