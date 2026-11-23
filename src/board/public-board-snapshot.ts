import type { BoardUpdate } from './board.protocol';

export function publicSnapshot(snapshot: BoardUpdate): BoardUpdate {
  return {
    ...snapshot,
    changes: snapshot.changes.map((change) => {
      if (change.kind === 'questions' && Array.isArray(change.item?.options)) {
        const options = change.item.options as Array<{ id: string; text: string; correct?: boolean }>;
        const multiple = options.some((option) => option.correct !== undefined)
          ? options.filter((option) => option.correct).length > 1 : change.item.multiple === true;
        return { ...change, item: { ...change.item, multiple, options: options.map(({ id, text }) => ({ id, text })) } };
      }
      if (change.kind !== 'clozeTests' || typeof change.item?.content !== 'string') return change;
      const content = change.item.content.replace(/\[[^\]]*\]|\{\{[^}]*\}\}/g, '[ ]');
      return { ...change, item: { ...change.item, content } };
    }),
  };
}
