import { execFile } from 'child_process';
import { access, readFile } from 'fs/promises';
import { promisify } from 'util';

export interface RuntimeInfo {
    kind: 'container' | 'application';
    startedAt: string;
    uptimeSeconds: number;
    sampledAt: string;
    containerDetected: boolean;
}

interface RuntimeDependencies {
    isContainer: () => Promise<boolean>;
    readFile: (path: string) => Promise<string>;
    clockTicks: () => Promise<number>;
    now: () => number;
    processUptime: () => number;
}

const run = promisify(execFile);
let clockTicks: Promise<number> | undefined;
const defaults: RuntimeDependencies = {
    isContainer: async () => process.platform === 'linux' && (await Promise.all(
        ['/.dockerenv', '/run/.containerenv'].map((path) => access(path).then(() => true, () => false)),
    )).some(Boolean),
    readFile: (path) => readFile(path, 'utf8'),
    clockTicks: () => {
        clockTicks ||= run('getconf', ['CLK_TCK'], { timeout: 1000, maxBuffer: 1024 })
            .then(({ stdout }) => Number(stdout.trim()));
        return clockTicks;
    },
    now: Date.now,
    processUptime: process.uptime,
};

/** PID 1 survives application/PM2 reloads, unlike the web worker's uptime. */
export function containerUptime(stat: string, uptime: string, ticksPerSecond: number) {
    // comm may contain spaces or ')', so splitting the entire stat is unsafe.
    const end = stat.lastIndexOf(')');
    if (end < 0 || !/^1\s+\(/.test(stat)) throw new Error('Invalid PID 1 stat');
    const startTicks = Number(stat.slice(end + 1).trim().split(/\s+/)[19]);
    const bootText = uptime.trim().split(/\s+/)[0];
    if (!/^\d+(?:\.\d+)?$/.test(bootText)) throw new Error('Invalid boot uptime');
    const bootSeconds = Number(bootText);
    if (!Number.isSafeInteger(startTicks) || startTicks < 0 || !Number.isFinite(bootSeconds) || bootSeconds < 0
        || !Number.isSafeInteger(ticksPerSecond) || ticksPerSecond <= 0) throw new Error('Invalid runtime counters');
    const seconds = bootSeconds - startTicks / ticksPerSecond;
    if (seconds < 0) throw new Error('Invalid process start time');
    return seconds;
}

export async function getRuntimeInfo(deps: RuntimeDependencies = defaults): Promise<RuntimeInfo> {
    const detected = await deps.isContainer().catch(() => false);
    let seconds: number | undefined;
    if (detected) {
        try {
            const [stat, uptime, ticks] = await Promise.all([
                deps.readFile('/proc/1/stat'), deps.readFile('/proc/uptime'), deps.clockTicks(),
            ]);
            seconds = containerUptime(stat, uptime, ticks);
        } catch { /* Restricted procfs: explicitly fall back to application uptime. */ }
    }
    const now = deps.now();
    const kind = seconds === undefined ? 'application' : 'container';
    seconds ??= Math.max(0, deps.processUptime());
    return {
        kind, startedAt: new Date(now - seconds * 1000).toISOString(),
        uptimeSeconds: seconds, sampledAt: new Date(now).toISOString(), containerDetected: detected,
    };
}
