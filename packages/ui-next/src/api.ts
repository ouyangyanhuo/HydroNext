// Components
export { Link, type LinkProps } from './components/link';

// Context
export { type PageData, usePageData, useSetPageData, useUiContext, useUserContext } from './context/page-data';
export { type RouterState, useNavigate, useRouterState } from './context/router';

// Hooks
export { useBuildUrl } from './hooks/use-build-url';
export { useCurrentUser, useIsLoggedIn } from './hooks/use-current-user';
export { useDomain, useDomainId } from './hooks/use-domain';
export { useI18n } from './hooks/use-i18n';
export {
  PERM, PRIV, useHasPerm, useHasPriv, usePermission,
} from './hooks/use-permission';

// Registry
export type {
  Interceptor, InterceptorEntry, InterceptorOptions,
  PageMetadata, PluginAPI, PluginDefinition, SlotName,
} from './registry';
export {
  after, before, defineSlot, intercept, patch, replace, wrap,
} from './registry';

// Stores
export {
  useAppStore, useNotificationStore, useRouteStore, useSessionStore,
} from './stores';
export type { Notification, UiContext, UserContext } from './stores';

// Shared dependencies
export { default as React } from 'react';
export { default as ReactDOM } from 'react-dom/client';
export { default as jsxRuntime } from 'react/jsx-runtime';
