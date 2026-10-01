import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveSubmissionContext } from '../src/components/editor/submission-context.ts';

test('contest submission and replay use document IDs rather than display PID or database _id', () => {
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

test('problem page and recorder share the context resolver and never read problem data from UiContext', () => {
    const page = readFileSync(new URL('../src/pages/problem_detail.tsx', import.meta.url), 'utf8');
    const recorder = readFileSync(new URL('../src/components/editor/scratchpad.tsx', import.meta.url), 'utf8');
    assert.match(page, /resolveSubmissionContext\(\{ pdoc, tdoc: args\.tdoc \}/);
    assert.match(recorder, /resolveSubmissionContext\(\{ pdoc: args\.pdoc, tdoc: args\.tdoc \}/);
    assert.match(recorder, /pid: submissionContext\.pid, tid: submissionContext\.tid/);
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
