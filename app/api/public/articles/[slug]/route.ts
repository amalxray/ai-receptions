import { NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { getPublishedArticle, incrementArticleViews } from '@/lib/services/askContent';

/** GET /api/public/articles/[slug] — single published article (+view count). */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const rl = rateLimit(clientIp(req), 300);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  try {
    const slug = params.slug;
    if (!slug || slug.length > 150) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    const article = await getPublishedArticle(slug);
    if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await incrementArticleViews(String(article.id));
    return NextResponse.json({ data: article });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
