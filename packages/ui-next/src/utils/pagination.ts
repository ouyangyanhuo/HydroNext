interface PaginationUpdate {
  page: number;
  pageSize?: number;
}

export function buildPaginationUrl(
  input: string,
  update: PaginationUpdate,
  origin: string,
) {
  const url = new URL(input, origin);
  url.searchParams.set('page', String(update.page));
  if (update.pageSize) url.searchParams.set('pageSize', String(update.pageSize));
  return url.pathname + url.search;
}
