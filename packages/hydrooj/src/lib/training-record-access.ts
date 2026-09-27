import { PERM } from '@hydrooj/common/permission';

export function canViewTrainingRecords(user: { hasPerm: (permission: bigint) => boolean }) {
    return user.hasPerm(PERM.PERM_EDIT_TRAINING | PERM.PERM_VIEW_RECORD);
}

export function checkTrainingRecordAccess(handler: { checkPerm: (permission: bigint) => void }) {
    // Separate checks keep the denied permission readable in the error message.
    handler.checkPerm(PERM.PERM_EDIT_TRAINING);
    handler.checkPerm(PERM.PERM_VIEW_RECORD);
}
