import { NotFoundException } from '@nestjs/common';
import type { BoardChange, BoardUpdate } from './board.protocol';
import type { SheetLayout } from './entities/published-board.entity';

type PageSnapshot = { title: string; layout: SheetLayout; snapshot: BoardUpdate };
type Point = { x: number; y: number };

export function captureBoardPage(board: BoardUpdate, itemReference: string): PageSnapshot {
  const page = board.changes.find((change) => change.kind === 'sheets' && change.id === itemReference)?.item;
  if (!page) throw new NotFoundException('Page item not found');

  const { x, y, width, height, dots, title } = page as Point & SheetLayout & { title: string };
  const inside = (point: Point) =>
    point.x >= x && point.y >= y && point.x <= x + width && point.y <= y + height;
  const translate = (point: Point) => ({ x: point.x - x, y: point.y - y });

  const changes: BoardChange[] = [];
  const included = new Set<string>();
  for (const change of board.changes) {
    const item = change.item;
    if (!item || change.kind === 'connections' || change.kind === 'sheets') continue;

    if (change.kind === 'lines') {
      const from = item.from as Point;
      const to = item.to as Point;
      if (inside(from) && inside(to)) changes.push({ ...change, item: { ...item, from: translate(from), to: translate(to) } });
      continue;
    }

    const bounds = item as Point & { width?: number; height?: number };
    const right = bounds.x + (bounds.width ?? 260);
    const bottom = bounds.y + (bounds.height ?? 160);
    if (inside(bounds) && inside({ x: right, y: bottom })) {
      included.add(change.id);
      changes.push({ ...change, item: { ...item, ...translate(bounds) } });
    }
  }

  for (const change of board.changes) {
    if (change.kind !== 'connections' || !change.item) continue;
    const { sourceId, targetId } = change.item;
    if (included.has(sourceId as string) && included.has(targetId as string)) changes.push(change);
  }

  return { title: title.trim() || 'Untitled page', layout: { width, height, dots }, snapshot: { revision: board.revision, changes } };
}
