'use client';
import SimpleContentManager from '@/components/admin/SimpleContentManager';

export default function AdminTipsPage() {
  return (
    <SimpleContentManager
      title="نصائح الفم والأسنان"
      subtitle="نصائح يومية تظهر في /ask."
      icon="💡"
      endpoint="/api/admin/tips"
      fields={[
        { key: 'title', label: 'العنوان', type: 'text', required: true },
        { key: 'content', label: 'المحتوى', type: 'textarea', required: true },
        { key: 'icon', label: 'الأيقونة (emoji)', type: 'text', placeholder: '🦷' },
        { key: 'category', label: 'الفئة', type: 'text' },
        { key: 'is_active', label: 'مفعّلة', type: 'checkbox' },
        { key: 'sort_order', label: 'الترتيب', type: 'number' },
      ]}
    />
  );
}
