import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    getProblemNavigationQuery, getProblemNavigationSource, getRecordProblemQuery, getSubmissionRecordQuery, resolveProblemNavigation,
} from '../src/utils/problem-navigation.ts';

const tid = '1234567890abcdef12345678';
const routes = { problem_main: '/p', problem_detail: '/p/:pid', training_detail: '/training/:tid', contest_problemlist: '/contest/:tid/problems' };
const buildUrl = (route: string, params: Record<string, string | number> = {}, query: Record<string, string> = {}) => {
    const path = routes[route].replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key]));
    const search = new URLSearchParams(query).toString();
    return `/d/team${path}${search ? `?${search}` : ''}`;
};
const queryOf = (href: string) => new URL(href, 'https://oj.example').searchParams;

test('submit and record round trips preserve list, contest and training navigation without carrying arbitrary URLs', async () => {
    for (const search of [
        '?nav=list&page=3&q=category%3Agraph&sort=desc&lang=zh',
        `?nav=training&training=${tid}&chapter=2&page=3&uid=9&viewRecords=false&category=basics&sort=asc`,
        `?tid=${tid}&lang=en`,
    ]) {
        const problemQuery = getProblemNavigationQuery(search);
        const submitUrl = buildUrl('problem_detail', { pid: 42 }, problemQuery);
        const recordUrl = buildUrl('problem_detail', { pid: 42 }, getSubmissionRecordQuery(new URL(submitUrl, 'https://oj.example').search));
        const restored = getRecordProblemQuery(new URL(recordUrl, 'https://oj.example').search);
        assert.deepEqual(restored, problemQuery);
        assert.ok(getProblemNavigationSource({ search: new URLSearchParams(restored).toString(), buildUrl }) || restored.tid);
    }
    assert.deepEqual(getSubmissionRecordQuery(''), {});
    assert.deepEqual(getRecordProblemQuery(''), {});
    assert.deepEqual(getProblemNavigationQuery('?nav=list&page=2&redirect=https://evil.example&domainId=other&operation=delete'), {
        nav: 'list', page: '2',
    });
    assert.deepEqual(getRecordProblemQuery('?problemNav=https://evil.example'), {});
    assert.deepEqual(getRecordProblemQuery(`?problemNav=${encodeURIComponent('nav=list&page=2')}`, { docId: tid }), { tid });
    assert.deepEqual(getSubmissionRecordQuery('?nav=list&page=-1'), {});
});

test('list navigation follows server order across pages and preserves domain, filters, sort and language', async () => {
    const pages = [[{ docId: 8 }, { docId: 4 }], [{ docId: 2 }, { docId: 9 }]];
    const requests: string[] = [];
    const load = async (url: string) => {
        requests.push(url);
        return { pdocs: pages[Number(queryOf(url).get('page')) - 1], ppcount: 2 };
    };
    const options = { problem: { docId: 2 }, search: '?nav=list&page=2&q=category%3Agraph&sort=desc&lang=zh', buildUrl, load };
    const result = (await resolveProblemNavigation(options))!;
    assert.equal(result.previous?.pid, 4);
    assert.equal(result.next?.pid, 9);
    assert.equal(requests.length, 2);
    assert.equal(queryOf(result.previous!.href).get('page'), '1');
    assert.equal(queryOf(result.next!.href).get('page'), '2');
    for (const target of [result.previous!, result.next!]) {
        assert.ok(target.href.startsWith('/d/team/p/'));
        assert.equal(queryOf(target.href).get('q'), 'category:graph');
        assert.equal(queryOf(target.href).get('sort'), 'desc');
        assert.equal(queryOf(target.href).get('lang'), 'zh');
        assert.equal(queryOf(target.href).get('nav'), 'list');
    }
    const boundary = (await resolveProblemNavigation({ ...options, problem: { docId: 4 }, search: '?nav=list&page=1' }))!;
    assert.equal(boundary.next?.pid, 2);
    await assert.rejects(resolveProblemNavigation({ ...options, problem: { docId: 100 } }), /no longer in the source list/);
});

test('contest navigation uses contest order, preserves tid and disables boundaries without extra requests', async () => {
    const load = async () => assert.fail('Contest navigation must not fetch an unrelated problem list');
    const options = { problem: { docId: 1 }, contest: { _id: tid, pids: [8, 1, 4] }, search: '?tid=wrong&nav=list', buildUrl, load };
    const result = (await resolveProblemNavigation(options))!;
    assert.equal(result.previous?.pid, 8);
    assert.equal(result.next?.pid, 4);
    assert.equal(queryOf(result.next!.href).get('tid'), tid);
    assert.equal(queryOf(result.next!.href).has('nav'), false);
    assert.equal(result.sourceUrl, `/d/team/contest/${tid}/problems`);
    assert.equal((await resolveProblemNavigation({ ...options, problem: { docId: 8 } }))!.previous, null);
    assert.equal((await resolveProblemNavigation({ ...options, problem: { docId: 4 } }))!.next, null);
});

test('training navigation stays inside the specified chapter and excludes unavailable problems', async () => {
    const data = {
        tdoc: { dag: [{ _id: 1, pids: [8, 1] }, { _id: 2, pids: [1, 7, 4] }] },
        pdict: { 8: { docId: 8 }, 1: { docId: 1 }, 4: { docId: 4, pid: 'P4', title: 'Next' } }, nsdict: {},
    };
    const options = {
        problem: { docId: 1 }, search: `?nav=training&training=${tid}&chapter=2&page=3&uid=9&viewRecords=false&category=basics&sort=asc`, buildUrl,
        load: async (url: string) => {
            assert.ok(url.startsWith(`/d/team/training/${tid}?`));
            return data;
        },
    };
    const result = (await resolveProblemNavigation(options))!;
    assert.equal(result.previous, null);
    assert.equal(result.next?.pid, 'P4');
    assert.equal(queryOf(result.next!.href).get('chapter'), '2');
    assert.equal(queryOf(result.next!.href).get('training'), tid);
    assert.equal(queryOf(result.next!.href).get('viewRecords'), 'false');
    assert.equal(queryOf(result.sourceUrl).get('page'), '3');
    assert.equal(queryOf(result.sourceUrl).get('uid'), '9');
    assert.equal(queryOf(result.sourceUrl).get('category'), 'basics');
    assert.equal(queryOf(result.next!.href).get('sort'), 'asc');
    data.nsdict[2] = { isInvalid: true };
    await assert.rejects(resolveProblemNavigation(options), /no longer in the source list/);
    assert.equal(getProblemNavigationSource({ search: '?nav=training&training=https://evil.example/&chapter=2', buildUrl }), null);
    assert.equal(await resolveProblemNavigation({ ...options, search: '' }), null);
});
