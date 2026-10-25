export function createProblemTimeTracker(options: {
  beginAt: number;
  endAt: number;
  now: number;
  elapsed: number;
  visible: boolean;
}) {
  let lastAt = options.now;
  let visible = options.visible;
  let elapsed = Number.isFinite(options.elapsed) ? Math.max(0, options.elapsed) : 0;

  const tick = (now: number) => {
    if (visible) {
      elapsed += Math.max(0, Math.min(now, options.endAt) - Math.max(lastAt, options.beginAt));
    }
    lastAt = Math.max(lastAt, now);
    return elapsed;
  };

  return {
    tick,
    setVisible(nextVisible: boolean, now: number) {
      const result = tick(now);
      visible = nextVisible;
      return result;
    },
  };
}
