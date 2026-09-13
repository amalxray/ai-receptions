'use client';
import SimpleContentManager from '@/components/admin/SimpleContentManager';

export default function AdminFaqPage() {
  return (
    <SimpleContentManager
      title="الأسئلة الشائعة"
      subtitle="أسئلة وأجوبة تظهر في /ask."
      icon="❓"
      endpoint="/api/admin/faq"
      fields={[
        { key: 'question', label: 'السؤال', type: 'text', required: true },
        { key: 'answer', label: 'الجواب', type: 'textarea', required: true },
        { key: 'is_active', label: 'مفعّلة', type: 'checkbox' },
        { key: 'sort_order', label: 'الترتيب', type: 'number' },
      ]}
    />
  );
}
