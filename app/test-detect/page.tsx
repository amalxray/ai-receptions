import DentalImageDetector from '@/components/DentalImageDetector';

export default function TestDetectPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-3xl font-bold mb-2 text-blue-800">🦷 اختبار كشف أشعة الأسنان (YOLOv8)</h1>
      <p className="mb-8 text-gray-600">هذه صفحة اختبار للتأكد من أن نموذج Roboflow متصل بالموقع ويعمل بشكل صحيح.</p>
      <DentalImageDetector />
    </div>
  );
}
