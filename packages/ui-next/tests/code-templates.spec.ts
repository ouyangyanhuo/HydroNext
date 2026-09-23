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

test('does not guess a template for unsupported languages', () => {
    assert.equal(getCodeTemplate('py.py3'), undefined);
});
