export function buildHreflangLinks(canonicalUrl: string): Record<string, string> {
  return {
    ar: canonicalUrl,
    'x-default': canonicalUrl,
  };
}
