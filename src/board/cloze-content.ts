const blankPattern = /\[[^\]]*\]|\{\{[^}]*\}\}/g;

export const redactClozeAnswers = (content: string) => content.replace(blankPattern, '[ ]');

export const countClozeBlanks = (content: string) => content.match(blankPattern)?.length ?? 0;

export function clozeAnswerKey(content: string): string[] {
  return Array.from(content.matchAll(blankPattern), ([blank]) =>
    blank.startsWith('{{') ? blank.slice(2, -2) : blank.slice(1, -1));
}
