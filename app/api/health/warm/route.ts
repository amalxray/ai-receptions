export const preferredRegion = 'icn1';
export const runtime = 'edge';

export async function GET() {
  return Response.json({ ok: true, t: Date.now() });
}
