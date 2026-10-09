import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    nextTrainingChapterId, normalizeTrainingProblemId, parseTrainingPlan,
    removeTrainingChapter, renameTrainingChapter, validateTrainingPlan,
} from '../src/utils/training-plan.ts';

const nodes = () => [
    { _id: 1, title: 'Basics', requireNids: [], pids: [1, 2], note: 'Retain metadata' },
    { _id: 9, title: 'Advanced', requireNids: [1], pids: [3, 4] },
];

test('chapter IDs normalize without flattening sections, problem order or metadata', () => {
    const parsed = parseTrainingPlan(JSON.stringify(nodes()));
    validateTrainingPlan(parsed);
    assert.deepEqual(parsed, nodes());
    assert.deepEqual(parsed[0].pids, [1, 2]);
    assert.equal(parsed[0].note, 'Retain metadata');
    const mixed = nodes().map((node) => ({ ...node, _id: String(node._id), requireNids: node.requireNids.map(String) }));
    assert.deepEqual(parseTrainingPlan(JSON.stringify(mixed)), nodes());
});

test('renaming a chapter updates prerequisite references and does not mutate the original plan', () => {
    const original = nodes();
    const updated = renameTrainingChapter(original, 0, 7);
    assert.equal(updated[0]._id, 7);
    assert.deepEqual(updated[1].requireNids, [7]);
    assert.deepEqual(updated[0].pids, [1, 2]);
    assert.equal(updated[0].note, 'Retain metadata');
    assert.deepEqual(original, nodes());
    for (const id of [9, 0, -1, 1.5, Number.NaN]) {
        assert.throws(() => renameTrainingChapter(original, 0, id), /unique positive integers/);
    }
});

test('removing a chapter cleans its references but never removes other chapters or problems', () => {
    const updated = removeTrainingChapter(nodes(), 0);
    assert.deepEqual(updated, [{ _id: 9, title: 'Advanced', requireNids: [], pids: [3, 4] }]);
    assert.equal(nextTrainingChapterId(nodes()), 2);
    assert.equal(nextTrainingChapterId([]), 1);
});

test('invalid raw JSON cannot crash select controls or silently replace the existing plan', () => {
    for (const value of ['invalid', '{}', '[null]', '[{"title":"Bad","pids":[]}]']) {
        assert.throws(() => parseTrainingPlan(value));
    }
    assert.throws(() => parseTrainingPlan(JSON.stringify([nodes()[0], { ...nodes()[1], _id: '1' }])), /unique positive integers/);
    assert.throws(() => parseTrainingPlan(JSON.stringify([{ ...nodes()[0], pids: [{}] }])));
});

test('save validation rejects empty chapters, missing references and cyclic prerequisites', () => {
    assert.throws(() => validateTrainingPlan([]), /at least one chapter/);
    assert.throws(() => validateTrainingPlan([{ ...nodes()[0], title: '' }]), /needs a title/);
    assert.throws(() => validateTrainingPlan([{ ...nodes()[0], pids: [] }]), /at least one problem/);
    assert.throws(() => validateTrainingPlan([{ ...nodes()[0], requireNids: [99] }]), /Invalid prerequisite/);
    assert.throws(() => validateTrainingPlan([{ ...nodes()[0], requireNids: [1] }]), /Invalid prerequisite/);
    assert.throws(() => validateTrainingPlan([{ ...nodes()[0], requireNids: [9] }, nodes()[1]]), /cannot contain cycles/);
    assert.equal(normalizeTrainingProblemId('42'), 42);
    assert.equal(normalizeTrainingProblemId('J0002'), 'J0002');
});
