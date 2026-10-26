import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

function fixture() {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/lib/contest-security.ts', import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code;
    runInNewContext(code, { module, exports: module.exports, require: () => ({ ForbiddenError: Error }) });
    return module.exports;
}
const contest = { proctorEnabled: true, beginAt: new Date(Date.now() - 1000), endAt: new Date(Date.now() + 60000) };

test('missing contest security blocks protected reads, submissions, rankings and policy changes without affecting ordinary contests', async () => {
    const api = fixture();
    await assert.rejects(api.requireContestAccess({}, contest), /unavailable/);
    await assert.rejects(api.requireContestRecordAccess({}, contest, {}), /unavailable/);
    await assert.rejects(api.reserveContestSubmission({}, contest, {}), /unavailable/);
    assert.throws(() => api.contestSecurityRankingFilter(true, true), /unavailable/);
    await assert.rejects(api.checkContestSecurityConfig(contest, false), /cannot change/);
    await assert.rejects(api.checkContestSecurityConfig(undefined, true), /unavailable/);
    await api.requireContestAccess({}, { ...contest, proctorEnabled: false });
    assert.equal(await api.reserveContestSubmission({}, { ...contest, proctorEnabled: false }, {}), undefined);
    assert.deepEqual(Object.keys(api.contestSecurityRankingFilter(false, true)), []);
});

test('one complete provider owns authentication; unloading invalidates old socket grants and submission leases while allowing release', async () => {
    const api = fixture();
    let releases = 0;
    const lease = Object.assign(async () => { releases++; }, { assert: async () => {} });
    const provider = {
        checkConfig: async () => {}, requireAccess: async () => {}, teamStatus: () => ({}),
        requireRecordAccess: async () => ({ assert: async () => {} }),
        reserveSubmission: async () => lease, rankingFilter: () => ({ valid: true }),
    };
    assert.throws(() => api.registerContestSecurity({}), /Incomplete/);
    const dispose = api.registerContestSecurity(provider);
    assert.throws(() => api.registerContestSecurity(provider), /already registered/);
    const grant = await api.requireContestRecordAccess({}, contest, {});
    const active = await api.reserveContestSubmission({}, contest, {});
    await grant.assert();
    await active.assert();
    dispose();
    await assert.rejects(grant.assert(), /unavailable/);
    await assert.rejects(active.assert(), /unavailable/);
    await active();
    assert.equal(releases, 1);
    const removeReplacement = api.registerContestSecurity({ ...provider });
    await assert.rejects(grant.assert(), /unavailable/);
    dispose();
    assert.equal(api.hasContestSecurity(), true);
    removeReplacement();
    const removeBroken = api.registerContestSecurity({ ...provider, rankingFilter: () => undefined });
    assert.throws(() => api.contestSecurityRankingFilter(true, true), /unavailable/);
    removeBroken();
});
