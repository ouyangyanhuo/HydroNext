import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync, transformSync } from 'esbuild';
import { load } from 'js-yaml';
import { test } from 'node:test';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const module = { exports: {} as any };
const built = buildSync({
    entryPoints: [fileURLToPath(new URL('../src/utils/solution-permissions.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
});
runInNewContext(built.outputFiles[0].text, { module, exports: module.exports });
const { solutionPermissions } = module.exports;
const own = { owner: 2 };
const other = { owner: 3 };

test('logging in alone never grants solution operations', () => {
    for (const user of [{ _id: 0, perm: '-1' }, { _id: 2 }, { _id: 2, perm: 'bad' }]) {
        assert.ok(Object.values(solutionPermissions(user, own)).every((value) => value === false));
    }
});

test('self permissions only expose actions on owned solutions and replies', () => {
    const perm = (1n << 19n) | (1n << 21n) | (1n << 24n) | (1n << 26n);
    const user = { _id: 2, perm: `BigInt::${perm}` };
    for (const action of ['edit', 'delete', 'editReply', 'deleteReply']) {
        assert.equal(solutionPermissions(user, own)[action], true, action);
        assert.equal(solutionPermissions(user, other)[action], false, action);
    }
});

test('moderator permissions follow backend rules, including owner-specific checks', () => {
    const user = { _id: 2, perm: (1n << 18n) | (1n << 20n) | (1n << 25n) };
    assert.equal(solutionPermissions(user, other).edit, true);
    assert.equal(solutionPermissions(user, other).delete, true);
    assert.equal(solutionPermissions(user, own).edit, false);
    assert.equal(solutionPermissions(user, own).delete, false);
    assert.equal(solutionPermissions(user, own).deleteReply, true);
    assert.equal(solutionPermissions(user, other).deleteReply, true);
    assert.equal(solutionPermissions({ _id: 2, perm: -1n }, other).editReply, false);
});

test('creation, voting and replies are independent and respect a restricted scope', () => {
    for (const [action, bit] of [['create', 16n], ['vote', 17n], ['reply', 22n]] as const) {
        const result = solutionPermissions({ _id: 2, perm: 1n << bit });
        assert.equal(result[action], true);
        assert.equal(Object.values(result).filter(Boolean).length, 1);
        assert.equal(solutionPermissions({ _id: 2, perm: -1n, scope: 0n })[action], false);
    }
    assert.equal(solutionPermissions({ _id: 2, perm: 1n << 19n }, { owner: 3, maintainer: [2] }).edit, true);
});

function component(path: string, mocks: Record<string, any>) {
    const compiled = transformSync(read(path), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
    const result = { exports: {} as any };
    runInNewContext(compiled, {
        module: result, exports: result.exports,
        require: (id: string) => mocks[id] ?? require(id),
    });
    return result.exports;
}

test('confirmation dialog cannot be dismissed during a destructive request', () => {
    const { ConfirmDialog } = component('../src/components/common/confirm-dialog.tsx', {
        '@/components/common/button': { Button: 'button' },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => `translated:${key}` }) },
    });
    let closed = 0;
    const props = { opened: true, onClose: () => closed++, onConfirm() {}, title: 'Delete', message: '?' };
    const loading = ConfirmDialog({ ...props, loading: true });
    loading.props.onClose();
    assert.equal(closed, 0);
    assert.equal(loading.props.closeOnClickOutside, false);
    assert.equal(loading.props.closeOnEscape, false);
    assert.equal(loading.props.closeButtonProps.disabled, true);
    const [cancel, confirm] = loading.props.children[1].props.children;
    assert.equal(cancel.props.disabled, true);
    assert.equal(confirm.props.loading, true);
    assert.equal(cancel.props.children, 'translated:Cancel');
    const idle = ConfirmDialog({ ...props, loading: false });
    idle.props.onClose();
    assert.equal(closed, 1);
    assert.equal(idle.props.closeOnEscape, true);
});

test('forgot password renders administrator contact, without an email form', () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    const { createElement: h } = require('react');
    const Page = component('../src/pages/user_lostpass.tsx', {
        '@mantine/core': { Text: ({ children, role }: any) => h('p', { role }, children) },
        '@/components/auth/auth-panel': { AuthPanel: ({ children }: any) => h('main', null, children) },
        '@/components/common/button': { Button: ({ children }: any) => h('button', null, children) },
        '@/components/link': { Link: 'a' },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/stores/session': { useSessionStore: (select: any) => select({ ui: {} }) },
        '@/utils/error': { formatErrorMessage: (_error: unknown, fallback: string) => fallback },
    }).default;
    const markup = renderToStaticMarkup(h(Page));
    assert.match(markup, /Please contact the administrator/);
    assert.match(markup, /Back to Login/);
    assert.doesNotMatch(markup, /<form|<input/);
    for (const locale of ['en', 'zh', 'zh_TW', 'ja', 'ko']) {
        const dictionary = load(read(`../locales/${locale}.yaml`)) as Record<string, string>;
        assert.ok(dictionary['Please contact the administrator']);
        assert.ok(dictionary.Copied);
        if (locale === 'zh') assert.equal(dictionary['Please contact the administrator'], '请与管理员联系');
    }
});

test('solution and file operations use shared dialogs and domain-aware copy links', () => {
    const solution = read('../src/pages/problem_solution.tsx');
    const files = read('../src/pages/problem_files.tsx');
    for (const source of [solution, files]) {
        assert.doesNotMatch(source, /\b(?:alert|confirm)\(/);
        assert.match(source, /<ConfirmDialog/);
        assert.match(source, /if \(pending\.current\) return false/);
        assert.match(source, /notifications\.show/);
    }
    assert.match(solution, /buildUrl\('problem_solution_detail', \{ pid, sid \}\)/);
    assert.match(solution, /await copyCodeText\(url, document\)/);
    assert.match(solution, /permissions\.create && !sid/);
    assert.match(solution, /replyPermissions\.editReply/);
    assert.match(solution, /replyPermissions\.deleteReply/);
});

test('night containers and nested surfaces are opaque without changing light tokens', () => {
    const css = postcss.parse(read('../src/styles/tailwind.css'));
    let outer = false;
    let nested = false;
    css.walkRules((rule) => {
        if (!rule.selector.startsWith("[data-mantine-color-scheme='dark']")) return;
        const values: Record<string, string> = {};
        rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
        if (rule.selector.includes('.hydro-auth-card') && rule.selector.includes('.hydro-content-card')) {
            outer = true;
            assert.equal(values['background-color'], 'var(--hydro-surface-raised)');
            assert.equal(values['background-image'], 'none');
            assert.equal(values['backdrop-filter'], 'none');
        }
        if (rule.selector.includes('.hydro-solution-reply')) {
            nested = true;
            assert.equal(values['background-color'], 'var(--hydro-surface-muted)');
        }
    });
    assert.ok(outer && nested);
    const tokens = postcss.parse(read('../src/styles/tokens.css'));
    let surfaceCount = 0;
    tokens.walkRules((rule) => {
        rule.walkDecls(/^--hydro-glass-surface/, (decl) => {
            surfaceCount++;
            if (rule.selector.includes("'dark'")) assert.match(decl.value, /^var\(--hydro-surface/);
            else assert.match(decl.value, /^rgb\(/);
        });
    });
    assert.equal(surfaceCount, 6);
});

test('user profile facts layout uses single-row grid and ellipsis text truncation', () => {
    const css = postcss.parse(read('../src/styles/tailwind.css'));
    let factsGrid = false;
    let factCard = false;
    let factLabel = false;
    let factValue = false;
    let responsiveFacts = false;

    css.walkRules((rule) => {
        const values: Record<string, string> = {};
        rule.walkDecls((decl) => { values[decl.prop] = decl.value; });

        if (rule.selector === '.hydro-user-profile__facts' && rule.parent.type === 'root') {
            factsGrid = true;
            assert.equal(values.display, 'grid');
            assert.equal(values['grid-auto-flow'], 'column');
            assert.equal(values['grid-auto-columns'], 'minmax(0, 1fr)');
            assert.equal(values['overflow-x'], 'auto');
        }
        if (rule.selector.includes('.hydro-user-profile__fact')) {
            if (values.overflow === 'hidden' && values['min-width'] === '0') {
                factCard = true;
            }
        }
        if (rule.selector === '.hydro-user-profile__fact-label') {
            factLabel = true;
            assert.equal(values['white-space'], 'nowrap');
            assert.equal(values.overflow, 'hidden');
            assert.equal(values['text-overflow'], 'ellipsis');
        }
        if (rule.selector.includes('.hydro-user-profile__fact-value') && values['text-overflow'] === 'ellipsis') {
            factValue = true;
            assert.equal(values['white-space'], 'nowrap');
            assert.equal(values.overflow, 'hidden');
        }
    });

    css.walkAtRules('media', (atRule) => {
        if (atRule.params.includes('max-width: 700px')) {
            atRule.walkRules('.hydro-user-profile__facts', (rule) => {
                const values: Record<string, string> = {};
                rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
                responsiveFacts = true;
                assert.equal(values['grid-auto-columns'], 'minmax(100px, 1fr)');
            });
        }
    });

    assert.ok(factsGrid, 'facts grid selector not found or invalid');
    assert.ok(factCard, 'fact card selector not found or invalid');
    assert.ok(factLabel, 'fact label selector not found or invalid');
    assert.ok(factValue, 'fact value selector not found or invalid');
    assert.ok(responsiveFacts, 'responsive facts media query not found or invalid');

    const userDetailSource = read('../src/pages/user_detail.tsx');
    assert.match(userDetailSource, /className="hydro-user-profile__fact"/);
    assert.match(userDetailSource, /className="hydro-user-profile__fact-label"/);
    assert.match(userDetailSource, /className="hydro-user-profile__fact-value"/);
});

test('linked accounts card renders interactive placeholder when no other accounts exist', () => {
    const css = postcss.parse(read('../src/styles/tailwind.css'));
    let placeholderRule = false;
    let placeholderInteractiveRule = false;
    let placeholderIcon = false;
    let securityCardFlex = false;

    css.walkRules((rule) => {
        const values: Record<string, string> = {};
        rule.walkDecls((decl) => { values[decl.prop] = decl.value; });

        if (rule.selector === '.hydro-security-card' && rule.parent.type === 'root') {
            if (values.display === 'flex' && values['flex-direction'] === 'column') {
                securityCardFlex = true;
            }
        }
        if (rule.selector === '.hydro-security-placeholder' && rule.parent.type === 'root') {
            placeholderRule = true;
            assert.equal(values.display, 'flex');
            assert.equal(values.border, '1px dashed var(--hydro-border)');
        }
        if (rule.selector === '.hydro-security-placeholder--interactive') {
            placeholderInteractiveRule = true;
            assert.equal(values.cursor, 'pointer');
        }
        if (rule.selector === '.hydro-security-placeholder__icon') {
            placeholderIcon = true;
        }
    });

    assert.ok(securityCardFlex, 'hydro-security-card flex styles not found');
    assert.ok(placeholderRule, 'hydro-security-placeholder styles not found');
    assert.ok(placeholderInteractiveRule, 'hydro-security-placeholder--interactive styles not found');
    assert.ok(placeholderIcon, 'hydro-security-placeholder__icon styles not found');

    const source = read('../src/pages/home_security.tsx');
    assert.match(source, /className="hydro-security-placeholder hydro-security-placeholder--interactive"/);
    assert.match(source, /IconPencil/);
    assert.match(source, /hasOtherAccounts \?/);
    assert.match(source, /t\('Please click modify'\)/);
    assert.match(source, /t\('Click here to update your email address\.'\)/);
});

test('domain dashboard layout renders categorized panels, hero section and maintenance tools', () => {
    const css = postcss.parse(read('../src/styles/tailwind.css'));
    let dashboardClass = false;
    let panelCardClass = false;
    let panelCardIcon = false;
    let dangerCardClass = false;

    css.walkRules((rule) => {
        if (rule.selector === '.hydro-domain-dashboard') dashboardClass = true;
        if (rule.selector === '.hydro-domain-panel-card') panelCardClass = true;
        if (rule.selector === '.hydro-domain-panel-card__icon') panelCardIcon = true;
        if (rule.selector === '.hydro-domain-danger-card') dangerCardClass = true;
    });

    assert.ok(dashboardClass, '.hydro-domain-dashboard selector not found');
    assert.ok(panelCardClass, '.hydro-domain-panel-card selector not found');
    assert.ok(panelCardIcon, '.hydro-domain-panel-card__icon selector not found');
    assert.ok(dangerCardClass, '.hydro-domain-danger-card selector not found');

    const source = read('../src/pages/domain_dashboard.tsx');
    assert.match(source, /className="hydro-content-card hydro-domain-hero"/);
    assert.match(source, /className="hydro-domain-hero__avatar"/);
    assert.match(source, /t\('Properties'\)/);
    assert.match(source, /t\('Access Control'\)/);
    assert.match(source, /t\('Init Discussion Nodes'\)/);
    assert.match(source, /t\('Domain Settings'\)/);
    assert.match(source, /t\('Visibility and contests'\)/);
    assert.match(source, /t\('User Management'\)/);
    assert.match(source, /t\('Role Management'\)/);
    assert.match(source, /t\('Permissions'\)/);
    assert.match(source, /t\('Groups'\)/);
    assert.match(source, /canDeleteDomain/);
});
