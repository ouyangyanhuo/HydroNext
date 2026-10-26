/// <reference types="vite/client" />

declare module 'virtual:hydro-plugins' {
    import type { PluginEntry } from './registry/plugin-loader';
    const plugins: PluginEntry[];
    export default plugins;
}
