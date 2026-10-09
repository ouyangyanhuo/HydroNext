export interface TrainingChapter {
  _id: number;
  title: string;
  requireNids: number[];
  pids: (number | string)[];
  [key: string]: unknown;
}

export function parseTrainingPlan(text: string): TrainingChapter[] {
  const nodes = JSON.parse(text);
  if (!Array.isArray(nodes) || nodes.some((node) => (
    !node || typeof node !== 'object' || typeof node.title !== 'string'
    || !Array.isArray(node.requireNids) || !Array.isArray(node.pids)
    || node.pids.some((pid: unknown) => typeof pid !== 'string' && typeof pid !== 'number')
  ))) throw new Error('Invalid training plan structure.');
  const chapters: TrainingChapter[] = nodes.map((node) => ({
    ...node, _id: Number(node._id), requireNids: [...new Set<number>(node.requireNids.map(Number))],
  }));
  if (new Set(chapters.map((node) => node._id)).size !== chapters.length
    || chapters.some((node) => !Number.isSafeInteger(node._id) || node._id <= 0)) {
    throw new Error('Chapter IDs must be unique positive integers.');
  }
  return chapters;
}

export function validateTrainingPlan(nodes: TrainingChapter[]) {
  if (!nodes.length) throw new Error('Add at least one chapter.');
  const ids = new Set(nodes.map((node) => node._id));
  if (ids.size !== nodes.length || nodes.some((node) => !Number.isSafeInteger(node._id) || node._id <= 0)) {
    throw new Error('Chapter IDs must be unique positive integers.');
  }
  for (const node of nodes) {
    if (!node.title.trim()) throw new Error('Each chapter needs a title.');
    if (!node.pids.length) throw new Error('Each chapter needs at least one problem.');
    if (node.pids.some((pid) => typeof pid !== 'string' && typeof pid !== 'number')) throw new Error('Invalid training plan structure.');
    if (node.requireNids.some((id) => !ids.has(id) || id === node._id)) throw new Error('Invalid prerequisite chapter.');
  }
  const visited = new Set<number>();
  const visiting = new Set<number>();
  const byId = new Map(nodes.map((node) => [node._id, node]));
  const visit = (id: number) => {
    if (visiting.has(id)) throw new Error('Chapter prerequisites cannot contain cycles.');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of byId.get(id)!.requireNids) visit(parent);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

export function renameTrainingChapter(nodes: TrainingChapter[], index: number, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0 || nodes.some((node, position) => position !== index && node._id === id)) {
    throw new Error('Chapter IDs must be unique positive integers.');
  }
  const oldId = nodes[index]._id;
  return nodes.map((node, position) => ({
    ...node,
    _id: position === index ? id : node._id,
    requireNids: node.requireNids.map((parent) => parent === oldId ? id : parent),
  }));
}

export function removeTrainingChapter(nodes: TrainingChapter[], index: number) {
  const id = nodes[index]._id;
  return nodes.filter((_, position) => position !== index).map((node) => ({
    ...node, requireNids: node.requireNids.filter((parent) => parent !== id),
  }));
}

export function nextTrainingChapterId(nodes: TrainingChapter[]) {
  const ids = new Set(nodes.map((node) => node._id));
  let id = 1;
  while (ids.has(id)) id++;
  return id;
}

export function normalizeTrainingProblemId(id: string) {
  return /^\d+$/.test(id) && Number.isSafeInteger(+id) ? +id : id;
}
