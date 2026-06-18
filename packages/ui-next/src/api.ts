// Components
export { Link, type LinkProps } from './components/link';

// Context
export { type PageData, usePageData, useSetPageData, useUiContext, useUserContext } from './context/page-data';
export { type RouterState, useNavigate, useRouterState } from './context/router';

// Hooks
export { useBuildUrl } from './hooks/use-build-url';
export { useI18n } from './hooks/use-i18n';
export { useCurrentUser, useIsLoggedIn } from './hooks/use-current-user';
export { usePermission, useHasPriv, PRIV } from './hooks/use-permission';
export { useDomain, useDomainId } from './hooks/use-domain';

// Stores
export { useSessionStore, useAppStore, useRouteStore, useNotificationStore } from './stores';
export type { UserContext, UiContext, Notification } from './stores';

// Registry
export type {
    Interceptor, InterceptorEntry, InterceptorOptions,
    PluginAPI, PluginDefinition,
    SlotName,
} from './registry';
export { defineSlot, intercept, before, after, patch, replace, wrap } from './registry';

// Shared dependencies
export { default as React } from 'react';
export { default as ReactDOM } from 'react-dom/client';
export { default as jsxRuntime } from 'react/jsx-runtime';
