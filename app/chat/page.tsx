import { headers } from 'next/headers';
import ChatInterface from '../../components/chat/ChatInterface';
import ChatInterfaceV2 from '../../components/chat/ChatInterfaceV2';

export default function Page({ searchParams }: { searchParams?: { clinic?: string } }) {
  const clinic = searchParams?.clinic ?? 'demo';

  // ── Voice (Web Speech API) is TENANT-ONLY ──
  // {slug}.dentairec.com (www. excluded) OR {slug}.localhost (local dev) → V2 (voice).
  // Apex / www / plain localhost → the original ChatInterface (no voice, untouched).
  const host = (headers().get('host') ?? '').split(':')[0]; // strip :3001 in dev
  const isTenant =
    /^(?!www\.)[^.]+\.dentairec\.com$/.test(host) ||
    /^[^.]+\.localhost$/.test(host);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 rounded-lg bg-slate-800/60 px-6 py-4">
          <h1 className="text-2xl font-semibold text-slate-100">محادثة العيادة</h1>
          <p className="text-sm text-slate-300">تحدث مع موظفة الاستقبال الذكية للعيادة</p>
        </header>

        <main>
          {isTenant ? <ChatInterfaceV2 clinicId={clinic} /> : <ChatInterface clinicId={clinic} />}
        </main>
      </div>
    </div>
  );
}
