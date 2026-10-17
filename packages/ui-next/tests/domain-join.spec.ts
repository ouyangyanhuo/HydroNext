import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('joining a domain requires exactly eight characters for both Continue and Enter', () => {
    let invitationCode = '';
    let stateIndex = 0;
    const destinations: string[] = [];
    const mocks: Record<string, any> = {
        react: {
            useMemo: (calculate: () => unknown) => calculate(),
            useState: (initial: unknown) => {
                const index = stateIndex++;
                return [index === 4 ? invitationCode : initial, (value: string) => { if (index === 4) invitationCode = value; }];
            },
        },
        '@mantine/core': Object.fromEntries(['Avatar', 'Card', 'Group', 'Modal', 'ScrollArea', 'Stack', 'Table', 'Text', 'TextInput']
            .map((name) => [name, name])),
        '@mantine/notifications': { notifications: {} },
        '@/components/common/button': { Button: 'Button' },
        '@/components/common/confirm-dialog': { ConfirmDialog: 'ConfirmDialog' },
        '@/components/common/invitation-code-input': { InvitationCodeInput: 'InvitationCodeInput' },
        '@/components/common/page-header': { PageHeader: 'PageHeader' },
        '@/components/link': { Link: 'Link' },
        '@/context/page-data': { usePageData: () => ({ args: {} }) },
        '@/hooks/use-build-url': { useBuildUrl: () => (_: string, __: unknown, { code }: { code: string }) => `/domain/join?code=${code}` },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/hooks/use-permission': { PRIV: {}, usePermission: () => ({ hasPriv: () => false }) },
        '@/stores/session': { useSessionStore: (select: (state: unknown) => unknown) => select({ user: {} }) },
        '@/utils/avatar': {},
        '@/utils/error': {},
        '@/utils/invitation-code': { isInvitationCodeComplete: (value: string) => /^[A-Z0-9]{8}$/.test(value) },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/pages/home_domain.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: { location: { assign: (url: string) => destinations.push(url) } },
        require: (name: string) => mocks[name] ?? require(name),
    });
    function render() {
        stateIndex = 0;
        const elements: any[] = [];
        const visit = (node: any) => {
            if (Array.isArray(node)) {
                for (const child of node) visit(child);
            } else if (node?.props) {
                elements.push(node);
                visit(node.props.children);
            }
        };
        visit(module.exports.default());
        return {
            input: elements.find((element) => element.type === 'InvitationCodeInput').props,
            button: elements.find((element) => element.type === 'Button' && element.props.children === 'Continue').props,
        };
    }
    for (const value of ['', 'ABC2345', 'ABC234567', 'ABC23456']) {
        render().input.onChange(value);
        const { input, button } = render();
        const valid = value.length === 8;
        assert.equal(button.disabled, !valid, value);
        const before = destinations.length;
        button.onClick();
        input.onSubmit();
        assert.equal(destinations.length - before, valid ? 2 : 0, value);
    }
    assert.ok(destinations.every((url) => url === '/domain/join?code=ABC23456'));
});
