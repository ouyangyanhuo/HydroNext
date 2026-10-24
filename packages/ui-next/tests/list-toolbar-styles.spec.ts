import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { test } from 'node:test';
import postcss from 'postcss';

const css = postcss.parse(readFileSync(new URL('../src/styles/tailwind.css', import.meta.url), 'utf8'));
const toolbars = ':is(.hydro-problem-toolbar, .hydro-list-toolbar, .hydro-contest-header-actions, .hydro-training-header-actions)';

function declarations(selector: string) {
    const values: Record<string, string> = {};
    css.walkRules((rule) => {
        if (rule.selector.replace(/\s+/g, ' ') !== selector) return;
        rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value; });
    });
    return values;
}

test('list toolbar fields and buttons share one explicit border-box height', () => {
    assert.equal(declarations(toolbars)['--hydro-toolbar-control-height'], 'calc(1.875rem * var(--mantine-scale, 1))');
    const controls = declarations(`${toolbars} :is(.mantine-Input-input, .mantine-Button-root)`);
    for (const property of ['height', 'min-height', 'max-height']) {
        assert.equal(controls[property], 'var(--hydro-toolbar-control-height)');
    }
    assert.equal(controls['box-sizing'], 'border-box');
    assert.equal(controls.transform, 'none');
    for (const page of ['problem_main', 'contest_main', 'training_main', 'manage_user']) {
        const source = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8');
        assert.match(source, /className="hydro-(problem-toolbar|list-toolbar|contest-header-actions|training-header-actions)"/);
    }
    const input = declarations(':is(.hydro-problem-toolbar, .hydro-list-toolbar) .mantine-Input-input');
    assert.equal(input.color, 'var(--hydro-text)');
    assert.ok(input['background-color'].includes('var(--hydro-primary-soft)'));
});

test('category modal rows have a permanent theme-based surface, independent of hover', () => {
    const row = declarations('.hydro-training-category-grid .hydro-training-category-item');
    assert.equal(row.background, 'color-mix(in srgb, var(--hydro-primary) 5%, var(--hydro-surface-raised))');
    assert.equal(row.border, '1px solid var(--hydro-border)');
    assert.equal(row.padding, '6px');
    const source = readFileSync(new URL('../src/pages/training_main.tsx', import.meta.url), 'utf8');
    assert.match(source, /className="hydro-training-category-item" data-selected=\{selected\}/);
    assert.match(source, /<SimpleGrid[^>]+className="hydro-training-category-grid"/);
});

test('record filter labels have translations in every supported locale', () => {
    for (const locale of ['en', 'zh', 'zh_TW', 'ja', 'ko']) {
        const dictionary = load(readFileSync(new URL(`../locales/${locale}.yaml`, import.meta.url), 'utf8')) as Record<string, string>;
        for (const key of ['By Language', 'By Status']) {
            assert.ok(dictionary[key]?.trim(), `${locale}: missing ${key}`);
            if (locale !== 'en') assert.notEqual(dictionary[key], key);
        }
    }
    const source = readFileSync(new URL('../src/pages/record_main.tsx', import.meta.url), 'utf8');
    assert.ok(source.includes("label={t('By Language')}"));
    assert.ok(source.includes("label={t('By Status')}"));
});

test('contest filter labels have translations in every supported locale and toolbars have embedded search', () => {
    for (const locale of ['en', 'zh', 'zh_TW', 'ja', 'ko']) {
        const dictionary = load(readFileSync(new URL(`../locales/${locale}.yaml`, import.meta.url), 'utf8')) as Record<string, string>;
        for (const key of ['All Categories', 'All Rules']) {
            assert.ok(dictionary[key]?.trim(), `${locale}: missing ${key}`);
            if (locale !== 'en') assert.notEqual(dictionary[key], key);
        }
    }
    for (const page of ['contest_main', 'training_main', 'problem_main', 'manage_user']) {
        const source = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8');
        assert.ok(source.includes('rightSectionPointerEvents="auto"'), `${page} should have embedded search trigger`);
    }
    const source = readFileSync(new URL('../src/pages/contest_main.tsx', import.meta.url), 'utf8');
    assert.ok(source.includes("label: t('All Categories')"));
    assert.ok(source.includes("label: t('All Rules')"));
    assert.ok(source.includes('className="hydro-contest-header-actions__search"'));
});
