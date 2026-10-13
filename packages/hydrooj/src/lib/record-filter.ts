import user from '../model/user';

/** Numeric usernames (such as student IDs) must not stop at a missing numeric UID. */
export async function resolveRecordUserIds(domainId: string, value: string): Promise<number[]> {
    const keyword = value.trim();
    if (!keyword) return [];
    if (/^-?\d+$/.test(keyword) && Number.isSafeInteger(Number(keyword))) {
        const udoc = await user.getById(domainId, Number(keyword));
        // Preserve UID semantics for existing links to a user's submissions.
        if (udoc) return [udoc._id];
    }
    const exact = await user.getByUname(domainId, keyword)
        || (keyword.includes('@') ? await user.getByEmail(domainId, keyword) : null);
    if (exact) return [exact._id];
    return user.getFuzzyIds(domainId, keyword);
}
