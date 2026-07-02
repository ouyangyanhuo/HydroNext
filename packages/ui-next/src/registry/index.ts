export { SlotErrorBoundary } from './error-boundary';
export { after, before, intercept, patch, replace, wrap } from './interceptors';
export { registerPage } from './page';
export { getPageMetadata } from './page-metadata';
export { installPlugin } from './plugin';
export type { PluginAPI, PluginDefinition } from './plugin';
export { defineSlot } from './slot';
export type {
  Interceptor, InterceptorEntry, InterceptorOptions, PageMetadata, SlotName,
} from './types';
