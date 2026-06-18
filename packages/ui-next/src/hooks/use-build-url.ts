import { compile } from 'path-to-regexp';
import { useCallback } from 'react';
import { useUiContext } from '@/context/page-data';
import { useRouteMap } from './use-route-map';

export interface UrlParams {
    [key: string]: string | number;
}

export function useBuildUrl() {
    const routeMap = useRouteMap();
    const { domainId, domain } = useUiContext();

    const getPrefix = useCallback(
        (id?: string) => {
            id ||= domainId;
            const domainHost = Array.isArray(domain.host) ? domain.host : [domain.host];
            const currentHost = window.location.host;
            return id === (domainHost && domainHost.includes(currentHost) ? domainId : 'system')
                ? ''
                : `/d/${id}`;
        },
        [domainId, domain],
    );

    return useCallback(
        (name: string, params: UrlParams = {}, searchParams: Record<string, string> = {}): string => {
            const pattern = routeMap[name];
            if (!pattern) {
                console.warn(`[Hydro] Unknown route: ${name}`);
                return '#';
            }

            const { domainId: paramDomainId, ...rest } = params;
            // Convert all param values to strings for path-to-regexp
            const routeParams: Record<string, string> = {};
            for (const [k, v] of Object.entries(rest)) {
                routeParams[k] = String(v);
            }

            try {
                const prefix = getPrefix(paramDomainId as string | undefined);
                const path = compile(pattern)(routeParams);
                const search = new URLSearchParams(searchParams).toString();
                if (prefix) return `${prefix}${path}${search ? `?${search}` : ''}`;
                return `${path}${search ? `?${search}` : ''}`;
            } catch (e) {
                console.error(`[Hydro] Failed to build URL for route "${name}":`, e);
                return '#';
            }
        },
        [routeMap, getPrefix],
    );
}
