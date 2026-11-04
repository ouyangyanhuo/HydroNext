import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { test } from 'node:test';
import { formatErrorMessage } from '../src/utils/error.ts';

function translator(language: string) {
    const dictionary = Object.assign({}, ...['../../hydrooj/locales', '../locales'].map((directory) => (
        load(readFileSync(new URL(`${directory}/${language}.yaml`, import.meta.url), 'utf8')) as Record<string, string>
    )));
    return (key: string) => dictionary[key] || key;
}

test('login errors translate the template before inserting the username', () => {
    const error = { message: 'Invalid password for user {0}.', params: ['admin123'] };
    assert.equal(formatErrorMessage(error, 'Login failed', translator('zh')), '用户 admin123 的密码错误。');
    assert.equal(formatErrorMessage(error, 'Login failed', translator('zh_TW')), '使用者 admin123 的密碼錯誤。');
    assert.equal(formatErrorMessage(error, 'Login failed', (key) => key), 'Invalid password for user admin123.');
});

test('other parameterized authentication errors use the same translations', () => {
    const t = translator('zh');
    assert.equal(formatErrorMessage({ message: 'User {0} not found.', params: ['admin123'] }, 'Failed', t), '用户 admin123 不存在。');
    assert.equal(formatErrorMessage({ message: 'Field {0} validation failed.', params: ['2FA'] }, 'Failed', t), '字段 2FA 验证失败。');
    assert.equal(formatErrorMessage({ message: "Passwords don't match." }, 'Failed', t), '验证密码不匹配。');
    assert.equal(formatErrorMessage(undefined, 'Verification failed', t), '验证失败');
});

test('password field validation errors format as human-readable incorrect password', () => {
    const t = translator('zh');
    assert.equal(formatErrorMessage({ message: 'Field {0} validation failed.', params: ['password'] }, 'Login failed', t), '密码错误');
    assert.equal(formatErrorMessage({ message: 'Field {0} validation failed.', params: ['password'] }, 'Login failed', translator('zh_TW')), '密碼錯誤');
    assert.equal(formatErrorMessage({ message: 'Field {0} validation failed.', params: ['password'] }, 'Login failed'), 'Incorrect password');
});

test('translation never changes usernames, even if they are translation keys or contain placeholders', () => {
    const seen: string[] = [];
    const t = (key: string) => {
        seen.push(key);
        return key === 'Login' ? '登录' : key === 'Invalid password for user {0}.' ? '用户 {0} 的密码错误。' : key;
    };
    assert.equal(formatErrorMessage({ message: 'Invalid password for user {0}.', params: ['Login'] }, 'Failed', t), '用户 Login 的密码错误。');
    assert.deepEqual(seen, ['Invalid password for user {0}.']);
    assert.equal(formatErrorMessage({ message: '{0}: {1}: {0}', params: ['admin{1}$&', 'reason'] }, 'Failed'), 'admin{1}$&: reason: admin{1}$&');
});

test('formatting remains backward compatible and safely handles absent translation/params', () => {
    assert.equal(formatErrorMessage({ message: 'Unknown {0}', params: [42] }, 'Failed'), 'Unknown 42');
    assert.equal(formatErrorMessage({ message: '{0} {1}', params: [false] }, 'Failed'), 'false {1}');
    assert.equal(formatErrorMessage(undefined, 'Failed', (key) => key === 'Failed' ? '失败' : key), '失败');
    assert.equal(formatErrorMessage(null, 'Failed'), 'Failed');
    assert.equal(formatErrorMessage({ message: '' }, 'Failed'), 'Failed');
    assert.equal(formatErrorMessage({ message: 'Original', params: {} as any }, 'Failed'), 'Original');
    assert.equal(formatErrorMessage({ message: '未知错误 {0}', params: ['原始参数'] }, 'Failed', translator('zh')), '未知错误 原始参数');
});

test('团队报名冲突指出具体成员及队伍或个人身份，队名重复显示中文原因', () => {
    const t = translator('zh');
    assert.equal(formatErrorMessage({ message: 'Team member {0} has already entered this contest with team {1}.',
        params: ['张三', 'D'] }, 'Failed', t), '该队伍中的成员 张三 已以“D”队参加本次比赛。');
    assert.equal(formatErrorMessage({ message: 'Team member {0} has already entered this contest individually.',
        params: ['张三'] }, 'Failed', t), '该队伍中的成员 张三 已以个人身份参加本次比赛。');
    assert.equal(formatErrorMessage({ message: 'A team named {0} already exists in this domain.',
        params: ['D'] }, 'Failed', t), '本域已存在名为“D”的队伍，请使用其他队名。');
});

test('rate limit errors format with human-readable operation names and i18n', () => {
    const error = {
        message: 'Too frequent operations of {0} (limit: {2} operations in {1} seconds).',
        params: ['user_login_id', 60, 5],
    };
    assert.equal(formatErrorMessage(error, 'Rate limited', translator('zh')), '登录操作过于频繁（限制：60 秒内最多 5 次）。');
    assert.equal(formatErrorMessage(error, 'Rate limited', translator('zh_TW')), '登入操作過於頻繁（限制：60 秒內最多 5 次）。');
    assert.equal(formatErrorMessage(error, 'Rate limited', translator('ko')), '로그인 작업이 너무 빈번합니다 (제한: 60초 내 5회).');
    assert.equal(
        formatErrorMessage(error, 'Rate limited', (key) => key),
        'Too frequent operations of Login (limit: 5 operations in 60 seconds).',
    );
    assert.equal(
        formatErrorMessage(error, 'Rate limited'),
        'Too frequent operations of Login (limit: 5 operations in 60 seconds).',
    );

    const mailError = {
        message: 'Too frequent operations of {0} (limit: {2} operations in {1} seconds).',
        params: ['send_mail', 60, 1],
    };
    assert.equal(formatErrorMessage(mailError, 'Rate limited', translator('zh')), '发送验证邮件操作过于频繁（限制：60 秒内最多 1 次）。');
    assert.equal(
        formatErrorMessage(mailError, 'Rate limited', (key) => key),
        'Too frequent operations of Send Verification Email (limit: 1 operations in 60 seconds).',
    );
});
