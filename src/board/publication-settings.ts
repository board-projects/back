export const examLevels = ['beginner', 'intermediate', 'advanced', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

export function validPublicationSettings(item: Record<string, unknown>) {
  return (item.visibility === undefined || item.visibility === 'private' || item.visibility === 'public') &&
    (item.topic === undefined || (typeof item.topic === 'string' && item.topic.length <= 80)) &&
    (item.level === undefined || item.level === '' || examLevels.includes(item.level as string)) &&
    (item.locale === undefined || item.locale === '' || (typeof item.locale === 'string' && /^[a-z]{2,3}(?:-[a-z]{2})?$/.test(item.locale)));
}
