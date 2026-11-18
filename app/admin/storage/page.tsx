import StorageUsageManager from '@/components/admin/StorageUsageManager';

export const dynamic = 'force-dynamic';

export default function AdminStoragePage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-amber-300">مراقبة المنصة</p>
        <h1 className="mt-1 text-2xl font-black text-white">استخدام التخزين</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          تعرض اللقطات اليومية استهلاك Storage على مستوى المشروع والمنشآت. حدود المنشآت اختيارية للتنبيه فقط ولا توقف الرفع.
        </p>
      </header>
      <StorageUsageManager />
    </div>
  );
}
