import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCodeTemplate } from '../src/components/editor/code-templates.ts';

test('loads templates for Hydro C and C++ language variants', () => {
    assert.match(getCodeTemplate('c') || '', /#include <stdio\.h>/);
    assert.match(getCodeTemplate('cc.cc20o2') || '', /#include <iostream>/);
});

test('loads Java and Rust templates', () => {
    assert.match(getCodeTemplate('java') || '', /public class Main/);
    assert.match(getCodeTemplate('rs') || '', /fn main\(\)/);
});

test('all C++ variants use the standard namespace', () => {
    for (const language of ['cc', 'cpp', 'c++', 'cc.cc98', 'cc.cc11', 'cc.cc17o2', 'cc.cc20o2', 'cc.cc23', 'cpp.17', 'c++.20', ' CPP ']) {
        const template = getCodeTemplate(language) || '';
        assert.match(template, /using namespace std;/, language);
        assert.match(template, /\n {4}cin\.tie\(nullptr\);/, language);
        assert.doesNotMatch(template, /std::/, language);
    }
    assert.doesNotMatch(getCodeTemplate('c') || '', /using namespace/);
});

test('does not guess a template for unsupported languages', () => {
    assert.equal(getCodeTemplate('py.py3'), undefined);
});

test('personal template takes priority, preserves whitespace, and empty values fall back to built-ins', () => {
    const personal = '  // custom\nint main() {}\n';
    assert.equal(getCodeTemplate('cc.cc20o2', personal), personal);
    assert.equal(getCodeTemplate('py.py3', personal), personal);
    for (const blank of ['', ' \n\t', null, {}, undefined]) {
        assert.equal(getCodeTemplate('cc', blank), getCodeTemplate('cc'));
    }
});
