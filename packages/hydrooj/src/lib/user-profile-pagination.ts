export const ACCEPTED_PROBLEMS_PAGE_SIZE = 50;

export function paginateAcceptedProblems(problems: { docId: number, tag?: string[] }[], requestedPage = 1) {
    const total = problems.length;
    const pageCount = Math.max(1, Math.ceil(total / ACCEPTED_PROBLEMS_PAGE_SIZE));
    const page = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(pageCount, requestedPage)) : 1;
    const ordered = [...problems].sort((a, b) => a.docId - b.docId);
    const tagCounts = new Map<string, number>();
    for (const problem of ordered) {
        for (const tag of problem.tag || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    return {
        page,
        pageCount,
        pageSize: ACCEPTED_PROBLEMS_PAGE_SIZE,
        total,
        ids: ordered.slice((page - 1) * ACCEPTED_PROBLEMS_PAGE_SIZE, page * ACCEPTED_PROBLEMS_PAGE_SIZE).map((p) => p.docId),
        tags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count })),
    };
}
