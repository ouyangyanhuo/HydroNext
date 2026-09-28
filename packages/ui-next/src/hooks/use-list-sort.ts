import { useEffect } from 'react';
import { usePageData } from '@/context/page-data';
import { useNavigate, useRouterState } from '@/context/router';
import {
  isListSort, type ListKind, listSortUrl, readListSort, restoreListSortUrl, saveListSort,
} from '@/utils/list-sort';

export function useListSort(kind: ListKind) {
  const { args, url } = usePageData();
  const navigate = useNavigate();
  const { loading } = useRouterState();
  const value = isListSort(args.sort) ? args.sort : 'default';

  useEffect(() => {
    try {
      const target = restoreListSortUrl(window.location.href, readListSort(kind, window.localStorage));
      if (target) void navigate(target, { replace: true });
    } catch {
      // Accessing localStorage itself can throw in private or restricted contexts.
    }
  }, [kind, url, navigate]);

  const onChange = (next: string | null) => {
    if (!isListSort(next)) return;
    try {
      saveListSort(kind, next, window.localStorage);
    } catch {
      // Persistence is optional; navigation must still work.
    }
    if (next !== value) void navigate(listSortUrl(window.location.href, next));
  };

  return { value, onChange, disabled: loading };
}
