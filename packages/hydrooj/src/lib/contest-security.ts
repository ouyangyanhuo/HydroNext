import { ForbiddenError } from '../error';
import type { ContestStatusDoc, RecordDoc, Tdoc } from '../interface';
import type { ConnectionHandler, Handler } from '../service/server';

export interface ContestAccessGrant { assert(): Promise<unknown> }
export interface ContestSubmissionLease {
    (): Promise<void>;
    assert(): Promise<void>;
}
export interface ContestSubmissionRequest {
    pid: number;
    lang: string;
    code: string;
    pretest: boolean;
    input: string[];
    filePath?: string;
}
export interface ContestSecurityProvider {
    checkConfig(tdoc: Tdoc | undefined, enabled: boolean): Promise<void>;
    requireAccess(handler: Handler, tdoc: Tdoc, pid?: string | number): Promise<void>;
    requireRecordAccess(handler: Handler | ConnectionHandler, tdoc: Tdoc, rdoc: RecordDoc): Promise<ContestAccessGrant | undefined>;
    reserveSubmission(handler: Handler, tdoc: Tdoc, request: ContestSubmissionRequest): Promise<ContestSubmissionLease>;
    rankingFilter(enabled: boolean, ended: boolean, durationHours?: number, now?: number, allowTeam?: boolean): Record<string, any>;
    teamStatus(status: ContestStatusDoc, users: Record<number, any>): { total: number, uploaded: number, pending: { uid: number, name: string }[] };
}

let provider: ContestSecurityProvider | undefined;
const unavailable = () => new ForbiddenError('Proctor service is unavailable. Contact the administrator.');
function requireProvider() {
    if (!provider) throw unavailable();
    return provider;
}

/** One authority per worker. Registration is owned by the addon's lifecycle. */
export function registerContestSecurity(value: ContestSecurityProvider) {
    if (provider) throw new Error('Contest security provider is already registered.');
    for (const key of ['checkConfig', 'requireAccess', 'requireRecordAccess', 'reserveSubmission', 'rankingFilter', 'teamStatus']) {
        if (typeof value?.[key] !== 'function') throw new Error(`Incomplete contest security provider: ${key}`);
    }
    provider = value;
    return () => { if (provider === value) provider = undefined; };
}

export function hasContestSecurity() { return !!provider; }

export async function checkContestSecurityConfig(tdoc: Tdoc | undefined, enabled: boolean) {
    if (tdoc && !!tdoc.proctorEnabled !== enabled && Date.now() >= tdoc.beginAt.getTime()) {
        throw new ForbiddenError('Proctor policy cannot change after the contest starts.');
    }
    if (enabled) await requireProvider().checkConfig(tdoc, enabled);
}

export async function requireContestAccess(handler: Handler, tdoc: Tdoc, pid?: string | number) {
    if (!tdoc?.proctorEnabled || Date.now() > tdoc.endAt.getTime()) return;
    const owner = requireProvider();
    await owner.requireAccess(handler, tdoc, pid);
    if (provider !== owner) throw unavailable();
}

export async function requireContestRecordAccess(handler: Handler | ConnectionHandler, tdoc: Tdoc, rdoc: RecordDoc) {
    if (!tdoc?.proctorEnabled || Date.now() >= tdoc.endAt.getTime()) return undefined;
    const owner = requireProvider();
    const grant = await owner.requireRecordAccess(handler, tdoc, rdoc);
    if (provider !== owner) throw unavailable();
    if (!grant) return undefined; // An explicit management exemption decided by the provider.
    return { async assert() {
        if (requireProvider() !== owner) throw unavailable();
        return grant.assert();
    } };
}

export async function reserveContestSubmission(handler: Handler, tdoc: Tdoc, request: ContestSubmissionRequest) {
    if (!tdoc?.proctorEnabled) return undefined;
    const owner = requireProvider();
    const lease = await owner.reserveSubmission(handler, tdoc, request);
    if (typeof lease !== 'function' || typeof lease.assert !== 'function') throw unavailable();
    if (provider !== owner) {
        await lease();
        throw unavailable();
    }
    return Object.assign(async () => lease(), { async assert() {
        if (requireProvider() !== owner) throw unavailable();
        await lease.assert();
    } });
}

export function contestSecurityRankingFilter(enabled: boolean, ended: boolean, durationHours = 0, now = Date.now(), allowTeam = false) {
    if (!enabled) return {};
    // An absent addon must never turn incomplete evidence into valid ranked results.
    const filter = requireProvider().rankingFilter(enabled, ended, durationHours, now, allowTeam);
    if (!filter || typeof filter !== 'object' || Array.isArray(filter) || !Object.keys(filter).length) throw unavailable();
    return filter;
}

export function contestSecurityTeamStatus(status: ContestStatusDoc, users: Record<number, any>) {
    return requireProvider().teamStatus(status, users);
}
