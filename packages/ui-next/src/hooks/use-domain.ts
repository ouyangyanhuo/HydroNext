import { useSessionStore } from '@/stores/session';

export function useDomain() {
    return useSessionStore((s) => s.ui.domain);
}

export function useDomainId() {
    return useSessionStore((s) => s.ui.domainId);
}
