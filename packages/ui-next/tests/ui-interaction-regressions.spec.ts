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
    assert.match(source, /className="hydro-bulletin"/);
    assert.match(source, /className="hydro-bulletin__toggle"/);
    assert.match(source, /t\('Show less'\) : t\('Show more'\)/);
});

test('domain switcher renders refined select pill trigger and searchable dropdown', () => {
    const css = postcss.parse(read('../src/styles/tailwind.css'));
    let triggerClass = false;
    let menuItemActive = false;
    let menuListClass = false;

    css.walkRules((rule) => {
        if (rule.selector === '.hydro-domain-switcher-trigger') triggerClass = true;
        if (rule.selector === '.hydro-domain-menu-item--active') menuItemActive = true;
        if (rule.selector === '.hydro-domain-menu-list') menuListClass = true;
    });

    assert.ok(triggerClass, '.hydro-domain-switcher-trigger selector not found');
    assert.ok(menuItemActive, '.hydro-domain-menu-item--active selector not found');
    assert.ok(menuListClass, '.hydro-domain-menu-list selector not found');

    const source = read('../src/components/navigation/domain-switcher.tsx');
    assert.match(source, /className="hydro-domain-switcher-trigger"/);
    assert.match(source, /data-expanded=\{opened \|\| undefined\}/);
    assert.match(source, /className="hydro-domain-switcher-trigger__chevron"/);
    assert.match(source, /className="hydro-domain-menu-list flex flex-col gap-1/);
    assert.match(source, /t\('Switch Domain'\)/);
    assert.match(source, /t\('All Domains'\)/);
    assert.match(source, /IconCheck/);
    assert.match(source, /to="home_domain"/);
});

test('domain visibility settings render responsive boolean cards grid and contest mode toggle', () => {
    const css = postcss.parse(read('../src/styles/tailwind.css'));
    let checkboxCard = false;
    let checkboxCardChecked = false;
    let checkboxCardFeature = false;

    css.walkRules((rule) => {
        if (rule.selector === '.hydro-setting-checkbox-card') checkboxCard = true;
        if (rule.selector === '.hydro-setting-checkbox-card--checked') checkboxCardChecked = true;
        if (rule.selector === '.hydro-setting-checkbox-card--feature') checkboxCardFeature = true;
    });

    assert.ok(checkboxCard, '.hydro-setting-checkbox-card selector not found');
    assert.ok(checkboxCardChecked, '.hydro-setting-checkbox-card--checked selector not found');
    assert.ok(checkboxCardFeature, '.hydro-setting-checkbox-card--feature selector not found');

    const domainEditSource = read('../src/pages/domain_edit.tsx');
    assert.match(domainEditSource, /booleanGrid=\{visibility\}/);
    assert.match(domainEditSource, /VISIBILITY_ICONS/);
    assert.match(domainEditSource, /contestMode: IconFlame/);
    assert.match(domainEditSource, /'navigationHidden\.homepage': IconHome/);

    const settingsFormSource = read('../src/components/common/settings-form.tsx');
    assert.match(settingsFormSource, /grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3/);
    assert.match(settingsFormSource, /className="hydro-setting-checkbox-card__icon/);
    assert.match(settingsFormSource, /hydro-setting-checkbox-card hydro-setting-checkbox-card--feature/);
});

test('domain settings layout uses multi-column fields grid and TagMultiSelect for allowed submission languages', () => {
    const domainEditSource = read('../src/pages/domain_edit.tsx');
    assert.match(domainEditSource, /fieldsGrid=\{!visibility\}/);
    assert.match(domainEditSource, /DOMAIN_FIELD_ORDER = \['name', 'avatar', 'share', 'langs', 'bulletin'\]/);
    assert.match(domainEditSource, /setting\.key === 'avatar'\)\s*\{\s*return \{ \.\.\.setting, name: 'Domain icon', desc: '' \};/);
    assert.match(domainEditSource, /setting\.key === 'langs'\)\s*\{\s*return \{ \.\.\.setting, desc: '' \};/);

    const settingsFormSource = read('../src/components/common/settings-form.tsx');
    assert.match(settingsFormSource, /setting\.key === 'langs'/);
    assert.match(settingsFormSource, /<TagMultiSelect/);
    assert.match(settingsFormSource, /setting\.key === 'avatar'/);
    assert.match(settingsFormSource, /variant === 'grid' \|\| fieldsGrid/);
});

test('problems, contests, training and records page headers align with ranking title design without slogans', () => {
    const css = postcss.parse(read('../src/styles/tailwind.css'));
    let headerRule = false;
    let iconRule = false;
    let iconSvgRule = false;
    let titleRule = false;

    css.walkRules((rule) => {
        if (rule.selector.includes('.hydro-page-header') && rule.selector.includes('.ranking-page-header')) headerRule = true;
        if (rule.selector.includes('.hydro-page-icon') && rule.selector.includes('.ranking-page-icon')) {
            if (rule.selector.includes('svg')) iconSvgRule = true;
            else iconRule = true;
        }
        if (rule.selector.includes('.hydro-page-title') && rule.selector.includes('.ranking-page-title')) titleRule = true;
    });

    assert.ok(headerRule, '.hydro-page-header / .ranking-page-header selector found in tailwind.css');
    assert.ok(iconRule, '.hydro-page-icon / .ranking-page-icon selector found in tailwind.css');
    assert.ok(iconSvgRule, '.hydro-page-icon svg / .ranking-page-icon svg selector found in tailwind.css');
    assert.ok(titleRule, '.hydro-page-title / .ranking-page-title selector found in tailwind.css');

    const rankingSource = read('../src/pages/ranking.tsx');
    assert.match(rankingSource, /icon=\{<IconChartBar size=\{22\} stroke=\{2\} \/>\}|<IconChartBar size=\{22\} stroke=\{2\} \/>/);
    assert.doesNotMatch(rankingSource, /See every effort\. Grow through code\./);

    const problemSource = read('../src/pages/problem_main.tsx');
    assert.match(problemSource, /icon=\{<IconCode size=\{22\} stroke=\{2\} \/>\}/);
    assert.doesNotMatch(problemSource, /<PageHeader[^>]*description=/);
    assert.doesNotMatch(problemSource, /Explore challenges/);

    const contestSource = read('../src/pages/contest_main.tsx');
    assert.match(contestSource, /<PageHeader/);
    assert.match(contestSource, /icon=\{<IconTrophy size=\{22\} stroke=\{2\} \/>\}/);
    assert.doesNotMatch(contestSource, /<PageHeader[^>]*description=/);
    assert.doesNotMatch(contestSource, /Compete with peers/);

    const trainingSource = read('../src/pages/training_main.tsx');
    assert.match(trainingSource, /icon=\{<IconSchool size=\{22\} stroke=\{2\} \/>\}/);
    assert.doesNotMatch(trainingSource, /<PageHeader[^>]*description=/);
    assert.doesNotMatch(trainingSource, /Follow structured paths/);

    const recordSource = read('../src/pages/record_main.tsx');
    assert.match(recordSource, /icon=\{<IconHistory size=\{22\} stroke=\{2\} \/>\}/);
    assert.doesNotMatch(recordSource, /<PageHeader[^>]*description=/);
    assert.doesNotMatch(recordSource, /Track submission history/);

    let accentRule = false;
    let bgPrimary = false;
    let softGlow = false;
    css.walkRules((rule) => {
        if (rule.selector.includes('.hydro-page-title__accent')) {
            accentRule = true;
            rule.walkDecls((decl) => {
                if (decl.prop === 'background-color' && decl.value.includes('--hydro-primary')) bgPrimary = true;
                if (decl.prop === 'box-shadow' && decl.value.includes('--hydro-primary')) softGlow = true;
            });
        }
    });
    assert.ok(accentRule, '.hydro-page-title__accent selector found in tailwind.css');
    assert.ok(bgPrimary, 'title accent bar should use --hydro-primary (register button color)');
    assert.ok(softGlow, 'title accent bar should have refined subtle primary glow');

    const pageHeaderSource = read('../src/components/common/page-header.tsx');
    assert.match(pageHeaderSource, /className="hydro-page-title__accent"/);
    assert.match(rankingSource, /className="hydro-page-title__accent"/);
});

test('problem select-all is placed inside toolbar before search input and removed from list container', () => {
    const problemSource = read('../src/pages/problem_main.tsx');
    const toolbarIndex = problemSource.indexOf('className="hydro-problem-toolbar"');
    const selectAllIndex = problemSource.indexOf('className="hydro-problem-select-all"');
    const searchIndex = problemSource.indexOf("placeholder={t('Search problems...')}");
    const listIndex = problemSource.indexOf('className={`hydro-problem-list');

    assert.ok(toolbarIndex !== -1, 'hydro-problem-toolbar must exist');
    assert.ok(selectAllIndex !== -1, 'hydro-problem-select-all must exist');
    assert.ok(searchIndex !== -1, 'search input must exist');
    assert.ok(listIndex !== -1, 'hydro-problem-list must exist');

    assert.ok(selectAllIndex > toolbarIndex, 'select-all must be inside or after toolbar start');
    assert.ok(selectAllIndex < searchIndex, 'select-all must be placed before the search input');
    assert.ok(searchIndex < listIndex, 'search input must be before list');

    const listContent = problemSource.slice(listIndex);
    assert.doesNotMatch(listContent, /hydro-problem-select-all/);

    const tailwindCss = postcss.parse(read('../src/styles/tailwind.css'));
    let selectAllCentered = false;
    let labelCentered = false;
    tailwindCss.walkRules((rule) => {
        if (rule.selector === '.hydro-problem-select-all') {
            rule.walkDecls((decl) => {
                if (decl.prop === 'align-items' && decl.value === 'center') selectAllCentered = true;
            });
        }
        if (rule.selector === '.hydro-problem-select-all__label') {
            rule.walkDecls((decl) => {
                if (decl.prop === 'align-items' && decl.value === 'center') labelCentered = true;
            });
        }
    });
    assert.ok(selectAllCentered, '.hydro-problem-select-all must have align-items: center');
    assert.ok(labelCentered, '.hydro-problem-select-all__label must have align-items: center');
});

test('contest detail problem list button and problem links use primary accent color matching register button', () => {
    const contestDetailSource = read('../src/pages/contest_detail.tsx');
    const contestDetailCss = read('../src/pages/contest-detail.css');

    assert.match(
        contestDetailSource,
        /<Button[^>]*to="contest_problemlist"[^>]*variant="filled"/,
        'Problem list button in contest detail sidebar must use filled variant for primary accent color',
    );

    assert.match(
        contestDetailCss,
        /\.hydro-contest-problem-row__link\s*\{[^}]*color:\s*var\(--hydro-primary\)/,
        'Contest problem row links must use var(--hydro-primary)',
    );
});

test('domain visibility contest mode card layout shrinks to half with animated focus contest extra', () => {
    const domainEditSource = read('../src/pages/domain_edit.tsx');
    const settingsFormSource = read('../src/components/common/settings-form.tsx');
    const tailwindCssSource = read('../src/styles/tailwind.css');

    assert.match(
        domainEditSource,
        /setting_contest_mode:\s*\{\s*right:\s*\(\s*<LongSelect/,
        'domain_edit must configure setting_contest_mode with right LongSelect directly without outer card',
    );
    assert.doesNotMatch(
        domainEditSource,
        /hydro-setting-feature-extra-card/,
        'outer card wrapper around focus contest must be deleted',
    );
    assert.doesNotMatch(
        domainEditSource,
        /Contest mode takes priority/,
        'contest mode priority alert note must be removed',
    );

    assert.match(
        settingsFormSource,
        /hydro-feature-setting-card-wrap--half/,
        'settings-form must use hydro-feature-setting-card-wrap--half when contest mode is active',
    );
    assert.match(
        settingsFormSource,
        /hydro-feature-setting-card-wrap--full/,
        'settings-form must use hydro-feature-setting-card-wrap--full when contest mode is inactive',
    );
    assert.match(
        settingsFormSource,
        /hydro-feature-setting-extra--open/,
        'settings-form must apply hydro-feature-setting-extra--open to right-side options',
    );

    assert.match(
        tailwindCssSource,
        /@keyframes\s+hydro-feature-slide-in/,
        'tailwind.css must define hydro-feature-slide-in animation for focus contest panel',
    );
    assert.match(
        tailwindCssSource,
        /\.hydro-feature-setting-card-wrap \.hydro-setting-checkbox-card\s*\{[^}]*min-height:\s*100px;/,
        'tailwind.css must fix the card min-height to match opened state',
    );
});

test('contest proctor notice renders text reminders on left and status badge on right', () => {
    const noticeSource = read('../src/components/contest/contest-proctor-notice.tsx');

    assert.match(
        noticeSource,
        /border-l-4 border-l-indigo-500/,
        'proctor notice must be a Card with an indigo accent indicator',
    );
    assert.match(
        noticeSource,
        /<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">/,
        'proctor notice must use horizontal flex layout separating left and right',
    );
    assert.match(
        noticeSource,
        /t\('Use an up-to-date proctor client to submit\.'\)/,
        'left side must display proctor client submission reminder',
    );
    assert.match(
        noticeSource,
        /t\(\s*'Finish proctoring in the client and upload the encrypted final log\./,
        'left side must display proctor log upload reminder',
    );
    assert.match(
        noticeSource,
        /<Badge[^>]*color=\{badgeColor\}[^>]*variant="light"[^>]*size="lg"/,
        'right side must render a prominent status badge',
    );
});

test('all application pages unify content width to 1280px while code editor is exempt', () => {
    const problemSource = read('../src/pages/problem_main.tsx');
    const contestSource = read('../src/pages/contest_main.tsx');
    const trainingSource = read('../src/pages/training_main.tsx');
    const recordSource = read('../src/pages/record_main.tsx');
    const rankingSource = read('../src/pages/ranking.tsx');
    const problemDetailSource = read('../src/pages/problem_detail.tsx');
    const contestDetailSource = read('../src/pages/contest_detail.tsx');
    const problemSolutionSource = read('../src/pages/problem_solution.tsx');
    const problemFilesSource = read('../src/pages/problem_files.tsx');
    const problemStatsSource = read('../src/pages/problem_statistics.tsx');
    const problemEditSource = read('../src/pages/problem_edit.tsx');
    const problemConfigSource = read('../src/pages/problem_config.tsx');
    const contestEditSource = read('../src/pages/contest_edit.tsx');
    const contestManageSource = read('../src/pages/contest_manage.tsx');
    const scratchpadSource = read('../src/components/editor/scratchpad.tsx');

    assert.match(problemSource, /className="[^"]*hydro-problem-page[^"]*"/);
    assert.match(contestSource, /className="[^"]*hydro-contest-page[^"]*"/);
    assert.match(trainingSource, /className="[^"]*hydro-training-page[^"]*"/);
    assert.match(recordSource, /className="[^"]*hydro-record-page[^"]*"/);
    assert.match(rankingSource, /className="[^"]*ranking-page[^"]*"/);
    assert.match(problemDetailSource, /className="[^"]*hydro-problem-detail-page[^"]*"/);
    assert.match(contestDetailSource, /className="[^"]*hydro-contest-detail-page[^"]*"/);
    assert.match(problemSolutionSource, /className="[^"]*hydro-solution-page[^"]*"/);
    assert.match(problemFilesSource, /className="[^"]*hydro-problem-files-page[^"]*"/);
    assert.match(problemStatsSource, /className="[^"]*hydro-problem-statistics[^"]*"/);
    assert.match(problemEditSource, /className="[^"]*hydro-problem-edit-page[^"]*"/);
    assert.match(problemConfigSource, /className="[^"]*hydro-problem-config-page[^"]*"/);
    assert.match(contestEditSource, /className="[^"]*hydro-contest-edit-page[^"]*"/);
    assert.match(contestManageSource, /className="[^"]*hydro-contest-manage-page[^"]*"/);

    // Scratchpad (code editor) must be exempt from 1280px and keep full width
    assert.match(scratchpadSource, /width:\s*viewportWidth\s*\?\s*`\$\{viewportWidth\}px`\s*:\s*'100vw'/);
    assert.match(scratchpadSource, /maxWidth:\s*'100vw'/);

    const tailwindCss = postcss.parse(read('../src/styles/tailwind.css'));
    const rankingCss = postcss.parse(read('../src/pages/ranking.css'));

    const expectedClasses = [
        '.hydro-problem-page',
        '.hydro-contest-page',
        '.hydro-training-page',
        '.hydro-record-page',
        '.ranking-page',
        '.hydro-problem-detail-page',
        '.hydro-contest-detail-page',
        '.hydro-solution-page',
        '.hydro-problem-files-page',
        '.hydro-problem-statistics',
        '.hydro-problem-edit-page',
        '.hydro-problem-config-page',
        '.hydro-contest-edit-page',
        '.hydro-contest-manage-page',
        '.hydro-settings-page',
        '.hydro-security-page',
        '.hydro-user-profile',
        '.hydro-domain-dashboard',
        '.hydro-doc-page',
    ];

    const widths: Record<string, string> = {};

    tailwindCss.walkRules((rule) => {
        const selectors = rule.selector.split(',').map((s) => s.trim());
        for (const selector of selectors) {
            if (expectedClasses.includes(selector)) {
                rule.walkDecls('width', (decl) => {
                    widths[selector] = decl.value;
                });
            }
        }
    });

    rankingCss.walkRules((rule) => {
        if (rule.selector.trim() === '.ranking-page') {
            rule.walkDecls('width', (decl) => {
                widths['.ranking-page'] = decl.value;
            });
        }
    });

    for (const selector of expectedClasses) {
        assert.equal(widths[selector], 'min(100%, 1280px)', `${selector} must be unified to min(100%, 1280px)`);
    }
});
