import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const oldBrand = ['HNTOU', 'OJ'].join(' ');

test('welcome translations use HydroNext without changing their lookup key', () => {
    for (const language of ['en', 'zh', 'zh_TW', 'ja', 'ko']) {
        const source = readFileSync(new URL(`../locales/${language}.yaml`, import.meta.url), 'utf8');
        const locale = yaml.load(source);
        assert.equal(source.includes(oldBrand), false, language);
        assert.ok(locale['Welcome to Hydro'].includes('HydroNext'), language);
    }
});

test('legacy help, about settings and translations use the same product name and remain valid YAML', () => {
    for (const file of ['locales/en.yaml', 'locales/zh.yaml', 'locales/zh_TW.yaml', 'setting.yaml', 'templates/wiki_help.html']) {
        const source = readFileSync(new URL(`../../contest-settings/${file}`, import.meta.url), 'utf8');
        assert.equal(source.includes(oldBrand), false, file);
        assert.ok(source.includes('HydroNext'), file);
        if (file.endsWith('.yaml')) assert.ok(yaml.load(source));
    }
});
