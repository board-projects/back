const ITEM_KINDS = ['shapes', 'codeBlocks', 'clozeTests', 'connections', 'lines', 'sheets'] as const;
type ItemKind = typeof ITEM_KINDS[number];

export type BoardChange = { kind: ItemKind; id: string; item: Record<string, unknown> | null };

export type BoardPatch = { clientId: string; sequence: number; changes: BoardChange[] };
export type BoardUpdate = { revision: number; changes: BoardChange[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isBoardIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const number = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const coordinate = (value: unknown) => number(value, -1e7, 1e7);
const length = (value: unknown) => number(value, 1, 1e5);
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const color = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const port = (value: unknown) => ['top', 'right', 'bottom', 'left'].includes(value as string);
const point = (value: unknown) => isRecord(value) && coordinate(value.x) && coordinate(value.y);

function isItem(kind: ItemKind, id: string, item: unknown) {
  if (!isRecord(item) || item.id !== id) return false;

  if (kind === 'connections') {
    return isBoardIdentifier(item.sourceId) && isBoardIdentifier(item.targetId) &&
      item.sourceId !== item.targetId && port(item.sourcePort) && port(item.targetPort) &&
      (item.color === undefined || color(item.color)) &&
      (item.size === undefined || number(item.size, 1, 48)) &&
      (item.dashed === undefined || typeof item.dashed === 'boolean') &&
      (item.pattern === undefined || ['solid', 'dash', 'dot', 'dash-dot'].includes(item.pattern as string)) &&
      (item.route === undefined || ['straight', 'smooth', 'orthogonal', 'wave', 'zigzag'].includes(item.route as string)) &&
      (item.label === undefined || text(item.label, 80)) &&
      (item.arrow === undefined || typeof item.arrow === 'boolean');
  }

  if (kind === 'lines') {
    return point(item.from) && point(item.to) && color(item.color) && number(item.size, 1, 256) &&
      (item.strokeId === undefined || isBoardIdentifier(item.strokeId));
  }

  if (!coordinate(item.x) || !coordinate(item.y)) return false;
  if (kind === 'sheets') {
    return text(item.title, 80) &&
      Number.isInteger(item.width) && number(item.width, 240, 4096) &&
      Number.isInteger(item.height) && number(item.height, 240, 4096) &&
      typeof item.dots === 'boolean' && (item.backgroundColor === undefined || color(item.backgroundColor)) && ['px', 'mm', 'cm', 'in'].includes(item.unit as string);
  }
  if (kind === 'clozeTests') {
    return item.type === 'cloze_test' && text(item.title, 80) && text(item.content, 100_000) &&
      (item.width === undefined || length(item.width)) &&
      (item.height === undefined || length(item.height));
  }

  if (!length(item.width) || !length(item.height)) return false;
  return kind === 'shapes'
    ? ['rect', 'circle', 'star'].includes(item.type as string) && color(item.color)
    : text(item.code, 100_000);
}

export function parseBoardPatch(value: unknown): BoardPatch | null {
  if (!isRecord(value) || !isBoardIdentifier(value.clientId) ||
      typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
      !Array.isArray(value.changes) || !value.changes.length || value.changes.length > 128) return null;

  const changes = parseBoardChanges(value.changes);
  return changes ? { clientId: value.clientId, sequence: value.sequence, changes } : null;
}

export function parseBoardChanges(value: unknown): BoardChange[] | null {
  if (!Array.isArray(value)) return null;

  const changes: BoardChange[] = [];
  for (const change of value) {
    if (!isRecord(change) || !ITEM_KINDS.includes(change.kind as ItemKind) || !isBoardIdentifier(change.id)) return null;
    const kind = change.kind as ItemKind;
    if (change.item !== null && !isItem(kind, change.id, change.item)) return null;
    changes.push({ kind, id: change.id, item: change.item as Record<string, unknown> | null });
  }
  return changes;
}
