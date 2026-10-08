'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

interface Prediction {
  x: number; y: number; width: number; height: number;
  confidence: number; class: string; class_id: number;
}

export default function DentalImageDetector() {
  const [image, setImage] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // نسبة حجم العرض الحالي إلى الأبعاد الأصلية للصورة (إحداثيات Roboflow بالبكسل الأصلي)
  const updateScale = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    setScale({
      x: img.clientWidth / img.naturalWidth,
      y: img.clientHeight / img.naturalHeight,
    });
  }, []);

  // إعادة الحساب عند تغيّر حجم الصورة المعروضة (تصغير النافذة، تغيّر التخطيط...)
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !image) return;
    updateScale();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }
    const observer = new ResizeObserver(updateScale);
    observer.observe(img);
    return () => observer.disconnect();
  }, [image, updateScale]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError(null); setPredictions([]);

    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/detect', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Detection failed');
      setPredictions(data.predictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      // السماح باختيار نفس الملف مرة أخرى
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getColor = (c: string) => {
    const colors: Record<string, string> = {
      'Crown': '#3b82f6', 'Filling': '#a855f7', 'Root Canal Treatment': '#ef4444',
      'Implant': '#10b981', 'impacted tooth': '#f59e0b', 'Missing teeth': '#6b7280'
    };
    return colors[c] || '#6b7280';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          📤 رفع صورة أشعة بانوراما
        </button>
        {loading && <span className="text-gray-600 animate-pulse">جاري التحليل بالذكاء الاصطناعي...</span>}
      </div>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">❌ {error}</div>}
      {image && (
        <div className="relative inline-block border rounded-lg overflow-hidden shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={image} alt="Dental X-Ray" onLoad={updateScale} className="block max-w-full h-auto" />
          {predictions.map((pred, i) => (
            <div key={i} className="absolute border-2 rounded pointer-events-none" style={{
              left: `${(pred.x - pred.width / 2) * scale.x}px`,
              top: `${(pred.y - pred.height / 2) * scale.y}px`,
              width: `${pred.width * scale.x}px`,
              height: `${pred.height * scale.y}px`,
              borderColor: getColor(pred.class),
              backgroundColor: `${getColor(pred.class)}20`
            }}>
              <div className="absolute top-0 left-0 px-1 py-0.5 text-[10px] leading-none text-white rounded-br font-bold whitespace-nowrap" style={{ backgroundColor: getColor(pred.class) }}>
                {pred.class} {(pred.confidence * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}
      {predictions.length > 0 && (
        <div className="p-4 bg-gray-50 rounded-lg border">
          <h3 className="font-bold mb-2 text-gray-800">📊 ملخص النتائج ({predictions.length} اكتشاف):</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(predictions.reduce((acc, p) => { acc[p.class] = (acc[p.class] || 0) + 1; return acc; }, {} as Record<string, number>)).map(([cls, count]) => (
              <div key={cls} className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getColor(cls) }} />
                <span className="text-sm font-medium">{cls}: {count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
