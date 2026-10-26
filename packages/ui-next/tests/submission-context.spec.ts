import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getProblemSubmitUrl, resolveSubmissionContext } from '../src/components/editor/submission-context.ts';
import { getProblemNavigationQuery, getRecordReturnQuery, getSubmissionRecordQuery } from '../src/utils/problem-navigation.ts';

test('contest submission payloads and replay use document IDs rather than display PID or database _id', () => {
    const data = { pdoc: { docId: 42, pid: 'J0002' }, tdoc: { docId: 'canonical-contest', _id: 'mongo-document' } };
    assert.deepEqual(resolveSubmissionContext(data, '?tid=canonical-contest', 'J0002'), {
        pid: 42, tid: 'canonical-contest',
    });
    assert.deepEqual(resolveSubmissionContext({ pdoc: data.pdoc }, '?tid=canonical-contest', 'J0002'), {
        pid: 42, tid: 'canonical-contest',
    });
    // URL tid is the route identifier, even if legacy data only contains a database _id.
    assert.equal(resolveSubmissionContext({ tdoc: { _id: 'mongo-document' } }, '?tid=canonical-contest').tid, 'canonical-contest');
});

test('ordinary problems do not acquire a contest ID and legacy fallbacks remain available', () => {
    assert.deepEqual(resolveSubmissionContext({ pdoc: { docId: 42, pid: 'J0002' } }, ''), { pid: 42, tid: undefined });
    assert.deepEqual(resolveSubmissionContext({}, '', 'J0002'), { pid: 'J0002', tid: undefined });
});

test('returning from a non-AC record preserves the visible submission route alias without changing replay or proof PID', () => {
    const tid = '1234567890abcdef12345678';
    const data = { pdoc: { docId: 42, pid: 'J0002' }, tdoc: { docId: tid } };
    const recordQuery = getSubmissionRecordQuery(`?tid=${tid}&mode=code`, data.tdoc, 'editor');
    const returned = getRecordReturnQuery(new URLSearchParams(recordQuery).toString(), false, data.tdoc)!;
    assert.equal(returned.mode, 'code');
    const query = getProblemNavigationQuery(new URLSearchParams(returned).toString(), data.tdoc);
    for (const prefix of ['', '/d/exam', '/d/system']) {
        for (const pid of ['42', 'J0002', '%E6%B5%8B%E8%AF%95']) {
            const path = `${prefix}/p/${pid}`;
            const url = getProblemSubmitUrl(path, query)!;
            // The native client derives this exact path from its current page URL.
            assert.equal(new URL(url, 'https://oj.example').pathname, `${path}/submit`);
            assert.equal(new URL(url, 'https://oj.example').searchParams.get('tid'), tid);
            assert.equal(new URL(url, 'https://oj.example').searchParams.has('mode'), false);
            assert.equal(resolveSubmissionContext(data, `?tid=${tid}`, pid).pid, 42);
        }
    }
    assert.equal(getProblemSubmitUrl('/d/exam/p/J0002/submit', query), `/d/exam/p/J0002/submit?tid=${tid}`);
    assert.equal(getProblemSubmitUrl('/p/submit', {}), '/p/submit/submit');
    for (const path of ['/record/123', '//evil.example/p/42', '/p/42/file/test', '/d/exam/contest/123']) {
        assert.equal(getProblemSubmitUrl(path, query), null);
    }
});

test('problem page and recorder share the context resolver and never read problem data from UiContext', () => {
    const page = readFileSync(new URL('../src/pages/problem_detail.tsx', import.meta.url), 'utf8');
    const recorder = readFileSync(new URL('../src/components/editor/scratchpad.tsx', import.meta.url), 'utf8');
    assert.match(page, /resolveSubmissionContext\(\{ pdoc, tdoc: args\.tdoc \}/);
    assert.match(recorder, /resolveSubmissionContext\(\{ pdoc: args\.pdoc, tdoc: args\.tdoc \}/);
    assert.match(page, /getProblemSubmitUrl\(window\.location\.pathname, submitQuery\)/);
    assert.match(recorder, /getProblemSubmitUrl\(window\.location\.pathname, submitQuery\)/);
    assert.match(recorder, /submitPid: submissionContext\.pid, tid: submissionContext\.tid/);
    assert.doesNotMatch(recorder, /ui\.(pdoc|tdoc)/);
});

test('topbar profile button has explicit inset, avatar spacing, and a bounded responsive name', () => {
    const source = readFileSync(new URL('../src/components/navigation/top-nav.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/styles/tailwind.css', import.meta.url), 'utf8');
    assert.match(source, /className="hydro-topbar-user-button"\s+px=\{10\}\s+py=\{6\}/);
    assert.match(css, /\.hydro-topbar-user-button\s*\{[^}]*display: inline-flex;[^}]*gap: 10px;[^}]*min-height: 44px;/);
    assert.match(css, /\.hydro-topbar-user-name\s*\{[^}]*max-width: 180px;[^}]*text-overflow: ellipsis;/);
    assert.match(css, /@media \(max-width: 639px\)\s*\{\s*\.hydro-topbar-user-name \{ display: none;/);
});
