'use client';
import SimpleContentManager from '@/components/admin/SimpleContentManager';

export default function AdminStoriesPage() {
  return (
    <SimpleContentManager
      title="قصص النجاح"
      subtitle="قصص مرضى حقيقيين — تظهر في صفحة /ask."
      icon="💚"
      endpoint="/api/admin/stories"
      fields={[
        { key: 'patient_name', label: 'اسم المريض', type: 'text', required: true },
        { key: 'patient_age', label: 'العمر', type: 'number' },
        { key: 'patient_city', label: 'المدينة', type: 'text' },
        { key: 'content', label: 'القصة', type: 'textarea', required: true },
        { key: 'image_url', label: 'رابط الصورة (اختياري)', type: 'text' },
        { key: 'rating', label: 'التقييم (1-5)', type: 'number' },
        { key: 'is_active', label: 'مفعّلة', type: 'checkbox' },
        { key: 'sort_order', label: 'الترتيب', type: 'number' },
      ]}
    />
  );
}
