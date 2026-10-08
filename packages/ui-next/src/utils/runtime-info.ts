export interface RuntimeInfo {
  kind: 'container' | 'application';
  startedAt: string;
  sampledAt: string;
  uptimeSeconds: number;
  containerDetected: boolean;
}

export function isRuntimeInfo(value: unknown): value is RuntimeInfo {
  if (!value || typeof value !== 'object') return false;
  const info = value as RuntimeInfo;
  return ['container', 'application'].includes(info.kind)
    && typeof info.startedAt === 'string' && Number.isFinite(Date.parse(info.startedAt))
    && typeof info.sampledAt === 'string' && Number.isFinite(Date.parse(info.sampledAt))
    && typeof info.uptimeSeconds === 'number' && Number.isFinite(info.uptimeSeconds) && info.uptimeSeconds >= 0
    && typeof info.containerDetected === 'boolean';
}

export function runtimeDuration(seconds: number, elapsedMilliseconds = 0) {
  const total = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0)
    + Math.max(0, Number.isFinite(elapsedMilliseconds) ? elapsedMilliseconds : 0) / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
  };
}
