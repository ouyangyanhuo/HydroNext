export { ActionIcon, Button, ButtonBase, UnstyledButton } from './components/common/button';
export { ConfirmDialog } from './components/common/confirm-dialog';
export { FormDialog } from './components/common/form-dialog';
export { PageHeader } from './components/common/page-header';
export { Paginator } from './components/common/paginator';
export { LongSelect, ShortSelect, TagMultiSelect } from './components/common/select';
export { registerEditorAddon } from './components/editor/addons';
export type { EditorAddon, EditorAddonContext, EditorAddonReceipt } from './components/editor/addons';
export { CodeEditor } from './components/editor/code-editor';
// Components
export { Link, type LinkProps } from './components/link';
export { UserAvatar } from './components/user/user-avatar';
export { UserLink } from './components/user/user-link';
// Context
export { type PageData, usePageData, useSetPageData, useUiContext, useUserContext } from './context/page-data';
export { type RouterState, useNavigate, useRouterState } from './context/router';
// Hooks
export { useBuildUrl } from './hooks/use-build-url';
export { useCurrentUser, useIsLoggedIn } from './hooks/use-current-user';
export { useDomain, useDomainId } from './hooks/use-domain';
export { useI18n } from './hooks/use-i18n';
export { useObjectUrl } from './hooks/use-object-url';

export {
  PERM, PRIV, useHasPerm, useHasPriv, usePermission,
} from './hooks/use-permission';
// Registry
export type {
  Interceptor, InterceptorEntry, InterceptorOptions,
  PageMetadata, PluginAPI, PluginDefinition, SlotName,
} from './registry';

export {
  after, before, defineSlot, intercept, patch, registerLayout, registerPage, replace, wrap,
} from './registry';
export { getUserExtensionFields, registerUserFields } from './registry/user-fields';
// Stores
export {
  useAppStore, useNotificationStore, useRouteStore, useSessionStore,
} from './stores';
export type { Notification, UiContext, UserContext } from './stores';
export { avatarPixelSize, getAvatarUrl } from './utils/avatar';

export { formatErrorMessage } from './utils/error';
export { goBackOrFallback } from './utils/history-back';

export { proctorAccessHeaders, registerProctorAccessResolver } from './utils/proctor';
export type { ProctorAccessRequest } from './utils/proctor';
export { formatUserName } from './utils/user-name';

export * as Mantine from '@mantine/core';
export * as MantineHooks from '@mantine/hooks';
export * as MantineNotifications from '@mantine/notifications';
// Shared dependencies
export { default as React } from 'react';
export { default as ReactDOM } from 'react-dom/client';
export { default as jsxRuntime } from 'react/jsx-runtime';
