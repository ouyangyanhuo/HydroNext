const fs = require('node:fs');
const path = require('node:path');

const root = process.env.HYDRO_CONFIG_ROOT || '/root/.hydro';
const defaults = ['ui-next', 'honor-frame', 'code-replay', 'client-updates', 'user-contributions', 'editor-paste-guard',
    'contest-enhancements', 'private-messages', 'proctor']
    .map((name) => `/opt/hydro-addons/${name}`);
const addons = process.env.HYDRO_ADDONS === undefined ? defaults : JSON.parse(process.env.HYDRO_ADDONS);
if (!Array.isArray(addons) || addons.some((addon) => typeof addon !== 'string' || !addon.trim())) {
    throw new Error('HYDRO_ADDONS must be a JSON array of non-empty addon paths.');
}
if (process.env.HYDRO_ADDONS !== undefined && !addons.some((addon) => (
    path.resolve(addon) === '/opt/hydro-addons/proctor' || addon === '@hydrooj/proctor'
))) {
    console.warn('[Hydro] Custom HYDRO_ADDONS does not include the default proctor addon. '
        + 'If proctoring is required, add /opt/hydro-addons/proctor (or your own provider path). '
        + 'Without a provider, protected contest operations and rankings remain blocked.');
}
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'addon.json'), JSON.stringify(addons));
