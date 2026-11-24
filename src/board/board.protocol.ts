import { validPublicationSettings } from './publication-settings';
import { validateStructuredQuestion } from './structured-question';

const ITEM_KINDS = ['shapes', 'codeBlocks', 'clozeTests', 'connections', 'lines', 'sheets', 'tables', 'questions'] as const;
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

// Keep these wire limits aligned with the table editor.
function tableTracks(value: unknown, total: unknown): boolean {
  return Array.isArray(value) && value.length >= 1 && value.length <= 30 &&
    number(total, 24, 4000) &&
    value.every((size) => Number.isInteger(size) && number(size, 24, 4000)) &&
    value.reduce((sum: number, size: number) => sum + size, 0) === total;
}

function tableCellText(value: unknown, rows: number, columns: number): boolean {
  return value === undefined || (isRecord(value) && Object.entries(value).every(([key, content]) => {
    if (!/^(0|[1-9][0-9]?):(0|[1-9][0-9]?)$/.test(key)) return false;
    const [row, column] = key.split(':').map(Number);
    return row < rows && column < columns && text(content, 120);
  }));
}

function textRunFormat(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['bold', 'italic', 'underline'].every((key) => value[key] === undefined || typeof value[key] === 'boolean') &&
    (value.align === undefined || ['left', 'center', 'right'].includes(value.align as string)) &&
    (value.font === undefined || ['Arial', 'Georgia', 'Verdana', 'Courier New'].includes(value.font as string)) &&
    (value.size === undefined || [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64].includes(value.size as number)) &&
    (value.link === undefined || text(value.link, 2048));
}

function textRuns(value: unknown, length: number): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;

  let end = 0;
  for (const run of value) {
    if (!isRecord(run) || typeof run.start !== 'number' || typeof run.end !== 'number' ||
        !Number.isInteger(run.start) || !Number.isInteger(run.end) ||
        run.start < end || run.end <= run.start || run.end > length || !textRunFormat(run.format)) return false;
    end = run.end;
  }
  return true;
}

function tableCellRuns(value: unknown, cells: unknown): boolean {
  return value === undefined || (isRecord(value) && isRecord(cells) && Object.entries(value).every(([key, runs]) =>
    Object.hasOwn(cells, key) && typeof cells[key] === 'string' && textRuns(runs, cells[key].length)));
}

function isQuestion(item: Record<string, unknown>): boolean {
  if (!text(item.label, 80) || typeof item.prompt !== 'string' ||
      !number(item.width, 200, 4000) || !number(item.height, 160, 4000)) return false;
  if (item.kind !== undefined && item.kind !== 'true_false') return validateStructuredQuestion(item);
  if (!Array.isArray(item.options) || item.options.length < 2) return false;

  const ids = new Set<string>();
  for (const option of item.options) {
    if (!isRecord(option) || !isBoardIdentifier(option.id) || ids.has(option.id) ||
        typeof option.text !== 'string' || typeof option.correct !== 'boolean') return false;
    ids.add(option.id);
  }
  if (item.kind !== 'true_false') return true;
  return ids.size === 2 && ids.has('true') && ids.has('false') &&
    item.options.every(({ id, text }) => text === (id === 'true' ? 'True' : 'False')) &&
    item.options.filter(({ correct }) => correct).length === 1;
}

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
      (item.strokeId === undefined || isBoardIdentifier(item.strokeId)) &&
      (item.label === undefined || text(item.label, 80));
  }

  if (!coordinate(item.x) || !coordinate(item.y)) return false;
  if (kind === 'questions') return isQuestion(item);
  if (kind === 'tables') {
    return Array.isArray(item.rows) && Array.isArray(item.columns) &&
      tableTracks(item.rows, item.height) && tableTracks(item.columns, item.width) &&
      tableCellText(item.cells, item.rows.length, item.columns.length) && tableCellRuns(item.cellRuns, item.cells);
  }
  if (kind === 'sheets') {
    return validPublicationSettings(item) && text(item.title, 80) &&
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
    ? ['rect', 'circle', 'star', 'trapezoid', 'triangle', 'diamond'].includes(item.type as string) && color(item.color) &&
      (item.label === undefined || typeof item.label === 'string') &&
      textRuns(item.textRuns, typeof item.label === 'string' ? item.label.length : 0)
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
