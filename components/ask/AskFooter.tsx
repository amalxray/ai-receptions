import Link from 'next/link';
import { Dock, DockIcon } from '@/components/ui/dock';

/** /ask footer — 4-column sitemap + social dock. */
export default function AskFooter() {
  const cols = [
    { title: 'المنصة', links: [['عن المنصة', '/ask/about'], ['تواصل معنا', '/ask/contact']] },
    { title: 'المحتوى', links: [['📝 المقالات', '/ask/articles'], ['💚 قصص النجاح', '/ask/stories'], ['💡 النصائح', '/ask/tips'], ['❓ الأسئلة الشائعة', '/ask/faq']] },
    { title: 'للمرضى', links: [['ابحث عن طبيب', '/ask'], ['📱 بطاقة QR', '/ask/qr']] },
    { title: 'قانوني', links: [['الخصوصية', '/ask/privacy'], ['الشروط', '/ask/terms']] },
  ];
  return (
    <footer className="border-t border-slate-800 bg-slate-950 pb-24 pt-12">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="mb-4 font-bold text-cyan-400">{c.title}</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              {c.links.map(([label, href]) => (
                <li key={href}><Link href={href} className="transition hover:text-white">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-10 hidden justify-center md:flex"><Dock><DockIcon><a href="/ask/qr" aria-label="QR">📱</a></DockIcon></Dock></div>
      <div className="mt-6 border-t border-slate-800 pt-6 text-center text-sm text-slate-500">AI-Receptions © — موظفة استقبال ذكية لكل عيادة</div>
    </footer>
  );
}
