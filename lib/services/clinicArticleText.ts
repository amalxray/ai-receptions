export function cleanClinicArticleTitle(title: string): string {
  return title.replace(/\*\*|__/g, '').trim();
}

export function stripClinicArticleMarkup(content: string): string {
  return content
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, value: string) => {
      const namedEntities: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
      };
      if (value[0] !== '#') return namedEntities[value.toLowerCase()] ?? entity;
      const codePoint = value[1].toLowerCase() === 'x'
        ? Number.parseInt(value.slice(2), 16)
        : Number.parseInt(value.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(/(?:\*\*|__|~~|`|^#{1,6}\s*)/gm, '')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function clinicArticleExcerpt(content: string | null): string {
  if (!content) return 'محتوى توعوي من العيادة.';
  const excerpt = stripClinicArticleMarkup(content).replace(/\s+/g, ' ').trim();
  if (!excerpt) return 'محتوى توعوي من العيادة.';
  return excerpt.length > 150 ? `${excerpt.slice(0, 150).trimEnd()}…` : excerpt;
}
