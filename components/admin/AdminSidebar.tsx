'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Megaphone,
  Globe,
  GalleryHorizontalEnd,
  FileText,
  Sparkles,
  Lightbulb,
  HelpCircle,
  Palette,
  Settings,
  PanelRightClose,
  PanelRightOpen,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';

type AdminSidebarProps = {
  email: string;
  role: string;
};

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: 'الإدارة',
    items: [
      { href: '/admin', label: 'نظرة عامة', icon: LayoutDashboard },
      { href: '/admin/clinics', label: 'المؤسسات', icon: Building2 },
      { href: '/admin/users', label: 'المستخدمون', icon: Users },
      { href: '/admin/subscriptions', label: 'الاشتراكات', icon: CreditCard },
      { href: '/admin/notifications', label: 'الإشعارات', icon: Megaphone },
    ],
  },
  {
    title: 'محتوى المنصة',
    items: [
      { href: '/admin/landing-page', label: 'الصفحة الرئيسية', icon: Globe },
      { href: '/admin/gallery', label: 'المعرض', icon: GalleryHorizontalEnd },
    ],
  },
  {
    title: 'محتوى /ask',
    items: [
      { href: '/admin/articles', label: 'المقالات', icon: FileText },
      { href: '/admin/stories', label: 'قصص النجاح', icon: Sparkles },
      { href: '/admin/tips', label: 'النصائح', icon: Lightbulb },
      { href: '/admin/faq', label: 'الأسئلة الشائعة', icon: HelpCircle },
      { href: '/admin/ask', label: 'إعدادات /ask', icon: Palette },
    ],
  },
  {
    title: 'النظام',
    items: [{ href: '/admin/settings', label: 'الإعدادات', icon: Settings }],
  },
];

/** Marks the active route — exact match for the index, prefix match for nested. */
function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebar({ email, role }: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="mt-6 space-y-6">
      {NAV.map((group) => (
        <div key={group.title}>
          {!collapsed && (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/60">
              {group.title}
            </p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                    active
                      ? 'bg-gradient-to-l from-amber-500/20 to-transparent text-white ring-1 ring-inset ring-amber-400/40'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                  } ${collapsed ? 'justify-center' : ''}`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      active ? 'text-amber-300' : 'text-slate-500 group-hover:text-amber-200'
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const header = (
    <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-xl shadow-lg shadow-amber-900/30">
        👑
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">لوحة المالك</p>
          <p className="truncate text-xs text-slate-400">AI-Receptions</p>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className={`mt-6 border-t border-slate-800 pt-4 ${collapsed ? 'text-center' : ''}`}>
      {!collapsed && (
        <>
          <p className="truncate text-xs text-slate-400">{email}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-amber-200/70">{role}</p>
        </>
      )}
      <Link
        href="/"
        className={`mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-amber-400/60 hover:text-white ${
          collapsed ? 'justify-center' : 'w-full'
        }`}
      >
        <Globe className="h-3.5 w-3.5" />
        {!collapsed && <span>العودة للموقع</span>}
      </Link>
    </div>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-xl shadow-amber-900/40 lg:hidden"
        aria-label="فتح القائمة"
      >
        <Menu className="h-5 w-5" />
        القائمة
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 right-0 w-72 overflow-y-auto border-l border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              {header}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-700 text-slate-300"
                aria-label="إغلاق القائمة"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`sticky top-6 hidden h-[calc(100vh-3rem)] shrink-0 flex-col justify-between overflow-y-auto rounded-[2rem] border border-amber-500/20 bg-slate-900/70 p-4 backdrop-blur-xl transition-all duration-300 lg:flex ${
          collapsed ? 'w-[84px]' : 'w-[268px]'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            {header}
            {!collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-700 text-slate-400 transition hover:text-white"
                aria-label="طيّ القائمة"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            )}
          </div>
          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="mx-auto mt-3 grid h-8 w-8 place-items-center rounded-lg border border-slate-700 text-slate-400 transition hover:text-white"
              aria-label="توسيع القائمة"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          )}
          {nav}
        </div>
        {footer}
      </aside>
    </>
  );
}