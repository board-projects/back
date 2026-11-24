import { redactClozeAnswers } from './cloze-content';
import { publicStructuredQuestion } from './structured-question';
import type { BoardUpdate } from './board.protocol';

export function publicSnapshot(snapshot: BoardUpdate): BoardUpdate {
  return {
    ...snapshot,
    changes: snapshot.changes.map((change) => {
      const item = change.item;
      if (change.kind === 'questions' && item) {
        const structured = publicStructuredQuestion(item);
        if (structured) return { ...change, item: structured };
      }
      if (change.kind === 'questions' && Array.isArray(item?.options)) {
        const options = item.options as Array<{ id: string; text: string; correct?: boolean }>;
        const multiple = options.some((option) => option.correct !== undefined)
          ? options.filter((option) => option.correct).length > 1 : item.multiple === true;
        return { ...change, item: { ...item, multiple, options: options.map(({ id, text }) => ({ id, text })) } };
      }
      if (change.kind !== 'clozeTests' || typeof change.item?.content !== 'string') return change;
      const content = redactClozeAnswers(change.item.content);
      return { ...change, item: { ...change.item, content } };
    }),
  };
}
