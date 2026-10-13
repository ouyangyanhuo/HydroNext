export interface TrainingCategory { _id: string, [key: string]: any }

/** Keep new categories at the end and ignore stale order entries left by deletions. */
export function orderTrainingCategories<T extends TrainingCategory>(categories: T[], order: unknown): T[] {
    const remaining = new Map(categories.map((item) => [item._id, item]));
    const result: T[] = [];
    if (Array.isArray(order)) {
        for (const id of order) {
            if (!remaining.has(id)) continue;
            result.push(remaining.get(id));
            remaining.delete(id);
        }
    }
    return [...result, ...remaining.values()];
}

export function validateTrainingCategoryOrder(categories: TrainingCategory[], order: unknown, ids: string[], previousIds: string[]) {
    const current = orderTrainingCategories(categories, order).map((item) => item._id);
    if (previousIds.length !== current.length || previousIds.some((id, index) => id !== current[index])) {
        throw new Error('Training categories changed. Reload before sorting.');
    }
    const existing = new Set(current);
    if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((id) => !existing.has(id))) {
        throw new Error('Invalid training category order.');
    }
}
