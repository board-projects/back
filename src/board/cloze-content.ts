const blankPattern = /\[[^\]]*\]|\{\{[^}]*\}\}/g;

export const redactClozeAnswers = (content: string) => content.replace(blankPattern, '[ ]');

export const countClozeBlanks = (content: string) => content.match(blankPattern)?.length ?? 0;
