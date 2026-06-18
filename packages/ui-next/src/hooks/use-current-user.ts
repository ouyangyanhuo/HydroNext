import { useSessionStore } from '@/stores/session';

export function useCurrentUser() {
  return useSessionStore((s) => s.user);
}

export function useIsLoggedIn() {
  return useSessionStore((s) => s.user._id > 0);
}
