export const LIST_SORT_MODES = ['default', 'asc', 'desc', 'recent', 'oldest'] as const;
export type ListSortMode = typeof LIST_SORT_MODES[number];

export const PROBLEM_LIST_SORT = {
    default: { sort: 1, docId: 1 },
    asc: { sort: 1, docId: 1 },
    desc: { sort: -1, docId: -1 },
    recent: { _id: -1 },
    oldest: { _id: 1 },
} as const;

export const TRAINING_LIST_SORT = {
    default: { pin: -1, _id: -1 },
    asc: { title: 1, _id: 1 },
    desc: { title: -1, _id: -1 },
    recent: { _id: -1 },
    oldest: { _id: 1 },
} as const;
