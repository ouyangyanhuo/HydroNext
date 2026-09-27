import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PERM } from '@hydrooj/common/permission';
import { canViewTrainingRecords, checkTrainingRecordAccess } from '../src/lib/training-record-access';

function principal(perm: bigint, scope = perm) {
    const user = { hasPerm: (required: bigint) => (perm & scope & required) === required };
    return {
        user,
        checkPerm(required: bigint) {
            if (!user.hasPerm(required)) throw new Error('Permission denied');
        },
    };
}

test('viewing records alone does not grant training record mode', () => {
    const handler = principal(PERM.PERM_VIEW_RECORD | PERM.PERM_VIEW_TRAINING);
    assert.equal(canViewTrainingRecords(handler.user), false);
    assert.throws(() => checkTrainingRecordAccess(handler), /Permission denied/);
});

test('own-training edit permission does not grant administrative record mode', () => {
    const handler = principal(PERM.PERM_EDIT_TRAINING_SELF | PERM.PERM_VIEW_RECORD);
    assert.equal(canViewTrainingRecords(handler.user), false);
    assert.throws(() => checkTrainingRecordAccess(handler), /Permission denied/);
});

test('training management alone cannot bypass record permissions', () => {
    const handler = principal(PERM.PERM_EDIT_TRAINING);
    assert.equal(canViewTrainingRecords(handler.user), false);
    assert.throws(() => checkTrainingRecordAccess(handler), /Permission denied/);
});

test('both permissions allow the mode, subject to the active domain scope', () => {
    const both = PERM.PERM_EDIT_TRAINING | PERM.PERM_VIEW_RECORD;
    const allowed = principal(both);
    assert.equal(canViewTrainingRecords(allowed.user), true);
    assert.doesNotThrow(() => checkTrainingRecordAccess(allowed));
    const restricted = principal(both, PERM.PERM_VIEW_RECORD);
    assert.equal(canViewTrainingRecords(restricted.user), false);
    assert.throws(() => checkTrainingRecordAccess(restricted), /Permission denied/);
});
