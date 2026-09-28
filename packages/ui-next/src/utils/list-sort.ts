export const LIST_SORT_MODES = ['default', 'asc', 'desc', 'recent', 'oldest'] as const;
export type ListSortMode = typeof LIST_SORT_MODES[number];
export type ListKind = 'problem' | 'training';

export function isListSort(value: unknown): value is ListSortMode {
  return LIST_SORT_MODES.includes(value as ListSortMode);
}

export function readListSort(kind: ListKind, storage: Pick<Storage, 'getItem'>): ListSortMode {
  try {
    const value = storage.getItem(`hydro:list-sort:v1:${kind}`);
    return isListSort(value) ? value : 'default';
  } catch {
    return 'default';
  }
}

export function saveListSort(kind: ListKind, value: ListSortMode, storage: Pick<Storage, 'setItem'>) {
  try {
    storage.setItem(`hydro:list-sort:v1:${kind}`, value);
  } catch {
    // Sorting still works when the browser blocks persistent storage.
  }
}

export function listSortUrl(href: string, value: ListSortMode, resetPage = true) {
  const url = new URL(href);
  url.searchParams.set('sort', value);
  if (resetPage) url.searchParams.delete('page');
  return url.pathname + url.search + url.hash;
}

export function restoreListSortUrl(href: string, value: ListSortMode) {
  const url = new URL(href);
  if (url.searchParams.has('sort') || value === 'default') return null;
  return listSortUrl(href, value, false);
}
