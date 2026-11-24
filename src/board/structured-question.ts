type RecordValue = Record<string, unknown>;
type Option = { id: string; text: string };
type Pair = { left: Option; right: Option };

const ESSAY_ANSWER_LIMIT = 10_000;

const isRecord = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const isText = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length <= maximum;
const isOption = (value: unknown): value is Option => isRecord(value) && isId(value.id) && isText(value.text, 2000);
const isPair = (value: unknown): value is Pair => isRecord(value) && isOption(value.left) && isOption(value.right);
const isUnitCoordinate = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;

function distinctOptions(options: Option[]): boolean {
  return new Set(options.map(({ id }) => id)).size === options.length;
}

export function validateStructuredQuestion(item: RecordValue): boolean {
  switch (item.kind) {
    case 'essay':
      return true;
    case 'matching': {
      const { pairs } = item;
      return Array.isArray(pairs) && pairs.length >= 2 && pairs.length <= 50 &&
        pairs.every(isPair) && distinctOptions(pairs.flatMap(({ left, right }) => [left, right]));
    }
    case 'ordering': {
      const { steps } = item;
      return Array.isArray(steps) && steps.length >= 2 && steps.length <= 50 &&
        steps.every(isOption) && distinctOptions(steps);
    }
    case 'image_spot': {
      const { target } = item;
      return isText(item.imageUrl, 2048) && isText(item.imageAlt, 300) &&
        (target === undefined || (isRecord(target) && isUnitCoordinate(target.x) && isUnitCoordinate(target.y) &&
          typeof target.radius === 'number' && target.radius >= 0.01 && target.radius <= 0.3));
    }
    default:
      return false;
  }
}

function publicOptions(options: Option[]) {
  return options.map(({ id, text }) => ({ id, text })).sort((a, b) => a.id.localeCompare(b.id));
}

export function publicStructuredQuestion(item: RecordValue): RecordValue | undefined {
  const { kind, id, x, y, width, height, label, prompt, textFormat } = item;
  const frame = { kind, id, x, y, width, height, label, prompt, ...(textFormat === undefined ? {} : { textFormat }) };
  switch (kind) {
    case 'essay':
      return frame;
    case 'matching': {
      const pairs = Array.isArray(item.pairs) ? item.pairs.filter(isPair) : undefined;
      return {
        ...frame,
        left: publicOptions(pairs?.map(({ left }) => left) ?? (Array.isArray(item.left) ? item.left.filter(isOption) : [])),
        right: publicOptions(pairs?.map(({ right }) => right) ?? (Array.isArray(item.right) ? item.right.filter(isOption) : [])),
      };
    }
    case 'ordering':
      return { ...frame, steps: publicOptions(Array.isArray(item.steps) ? item.steps.filter(isOption) : []) };
    case 'image_spot':
      return { ...frame, imageUrl: item.imageUrl, imageAlt: item.imageAlt };
    default:
      return undefined;
  }
}

export function validStructuredAnswer(item: RecordValue, answer: string[]): boolean | undefined {
  switch (item.kind) {
    case 'essay':
      return answer.length === 1 && isText(answer[0], ESSAY_ANSWER_LIMIT);
    case 'matching': {
      const pairs = Array.isArray(item.pairs) ? item.pairs.filter(isPair) : [];
      const left = new Set(pairs.map((pair) => pair.left.id));
      const right = new Set(pairs.map((pair) => pair.right.id));
      const usedLeft = new Set<string>();
      const usedRight = new Set<string>();
      return answer.every((entry) => {
        const [prompt, match, extra] = entry.split(':');
        if (extra !== undefined || !left.has(prompt) || !right.has(match) ||
            usedLeft.has(prompt) || usedRight.has(match)) return false;
        usedLeft.add(prompt);
        usedRight.add(match);
        return true;
      });
    }
    case 'ordering': {
      const ids = new Set((Array.isArray(item.steps) ? item.steps.filter(isOption) : []).map(({ id }) => id));
      return answer.length === ids.size && answer.every((id) => ids.delete(id));
    }
    case 'image_spot': {
      if (answer.length !== 1 || !/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?),(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/.test(answer[0])) return false;
      return answer[0].split(',').map(Number).every(isUnitCoordinate);
    }
    default:
      return undefined;
  }
}
