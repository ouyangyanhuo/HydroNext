/** Preserve isolated frontend fixtures while exercising addon code through the public UI SDK. */
export function resolveUiAddonMock(name: string, mocks: Record<string, any>, fallback: (name: string) => any) {
    if (mocks[name] !== undefined) return mocks[name];
    if (name === '@hydrooj/ui-next') {
        return Object.assign({}, ...Object.entries(mocks)
            .filter(([key, value]) => (key.startsWith('@/') || key === './error') && value && typeof value === 'object')
            .map(([, value]) => value));
    }
    const local = name.replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, '');
    if (mocks[`@/${local}`] !== undefined) return mocks[`@/${local}`];
    return fallback(name);
}
