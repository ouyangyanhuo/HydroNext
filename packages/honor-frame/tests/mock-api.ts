/** Adapt isolated model fixtures to Hydro's public addon API. */
export function resolveAddonMock(name: string, mocks: Record<string, any>, fallback: (name: string) => any) {
    if (mocks[name] !== undefined) return mocks[name];
    const aliases: Record<string, string> = {
        './model': '../model/honor-frame', '../model': '../model/honor-frame',
        './lib/image': '../lib/honor-frame-image', './lib/user': '../lib/honor-frame-user',
        './lib/catalog': '../lib/honor-frame-catalog', './image': './honor-frame-image',
    };
    if (mocks[aliases[name]] !== undefined) return mocks[aliases[name]];
    if (name === 'hydrooj') {
        const account = mocks['../model/user'];
        return {
            ...mocks['../context'], ...mocks['../error'], ...mocks['../model/builtin'], ...mocks['../service/server'],
            UserModel: account ? { ...(account.default || account), _deleteUserCache: account.deleteUserCache } : undefined,
            StorageModel: mocks['../model/storage']?.default || mocks['../model/storage'],
            OplogModel: mocks['../model/oplog'], db: mocks['../service/db'],
        };
    }
    return fallback(name);
}
