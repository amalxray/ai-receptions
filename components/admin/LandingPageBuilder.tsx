'use client';

import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import HeroEditor from '@/components/admin/editors/HeroEditor';
import type { HeroContent } from '@/components/landing/Hero';
import FeaturesEditor, { type FeaturesContent } from '@/components/admin/editors/FeaturesEditor';
import FAQEditor from '@/components/admin/editors/FAQEditor';
import TestimonialsEditor from '@/components/admin/editors/TestimonialsEditor';
import PricingEditor from '@/components/admin/editors/PricingEditor';
import UrgencyBarEditor from '@/components/admin/editors/UrgencyBarEditor';
import LandingColorsEditor from '@/components/admin/editors/LandingColorsEditor';
import LandingSeoEditor from '@/components/admin/editors/LandingSeoEditor';

export type LandingPageSection = {
  section_key: string;
  label: string;
  content: Record<string, unknown> | null;
  updated_at: string | null;
};

function SortableSectionCard({ section, isSelected, onSelect }: { section: LandingPageSection; isSelected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.section_key });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rounded-2xl border p-4 shadow-sm transition ${
        isSelected ? 'border-violet-400 bg-violet-500/10' : 'border-slate-700 bg-slate-900/80'
      } ${isDragging ? 'opacity-70' : 'opacity-100'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onSelect} aria-pressed={isSelected} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
          <div>
            <div className="text-sm font-semibold text-white">{section.label}</div>
            <div className="mt-1 text-[11px] text-slate-400" dir="ltr">
              {section.section_key}
              {section.updated_at ? ' · modified' : ''}
            </div>
          </div>
        </button>
        <button type="button" aria-label={`اسحب لترتيب ${section.label}`} className="touch-none cursor-grab rounded-full border border-slate-600 px-2 py-1 text-[10px] font-medium text-slate-300 active:cursor-grabbing" {...attributes} {...listeners}>
          Drag
        </button>
      </div>
    </div>
  );
}

export default function LandingPageBuilder() {
  const [sections, setSections] = useState<LandingPageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadSections = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/landing-page');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل التحميل');
      setSections((json.data ?? []) as LandingPageSection[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSections();
  }, []);

  const orderedKeys = useMemo(() => sections.map((section) => section.section_key), [sections]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSections((current) => {
      const oldIndex = current.findIndex((item) => item.section_key === String(active.id));
      const newIndex = current.findIndex((item) => item.section_key === String(over.id));
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const saveOrder = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = { order: sections.map((section) => section.section_key) };
      const res = await fetch('/api/admin/landing-page', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? 'فشل حفظ الترتيب');
      setSuccess('تم حفظ ترتيب الأقسام بنجاح.');
      await loadSections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ الترتيب');
    } finally {
      setSaving(false);
    }
  };

  const selectedSection = sections.find((section) => section.section_key === selectedSectionKey) ?? null;

  const handleSectionSaved = (sectionKey: string, content: object) => {
    setSections((current) => current.map((section) => section.section_key === sectionKey
      ? { ...section, content: content as unknown as Record<string, unknown>, updated_at: new Date().toISOString() }
      : section));
  };

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">🌐 محرر ترتيب الصفحة الرئيسية</h2>
          <p className="mt-1 text-sm text-slate-400">
            اسحب الأقسام لأعلى أو لأسفل لتغيير ترتيب الصفحة الرئيسية، ثم احفظ الترتيب.
          </p>
        </div>

        <button
          type="button"
          onClick={saveOrder}
          disabled={saving || loading}
          className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'جارٍ الحفظ...' : '💾 حفظ الترتيب'}
        </button>
      </div>

      {loading && <p className="mt-5 text-sm text-slate-400">جارٍ تحميل الأقسام...</p>}

      {!loading && (
        <>
          {error && (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
          )}
          {success && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{success}</div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
              <div className="mt-5 space-y-3">
                {sections.map((section) => (
                  <SortableSectionCard
                    key={section.section_key}
                    section={section}
                    isSelected={selectedSectionKey === section.section_key}
                    onSelect={() => setSelectedSectionKey(section.section_key)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {selectedSection?.section_key === 'hero' && (
        <HeroEditor initialContent={selectedSection.content} onClose={() => setSelectedSectionKey(null)} onSaved={(content: HeroContent) => handleSectionSaved('hero', content)} />
      )}
      {selectedSection?.section_key === 'features' && (
        <FeaturesEditor initialContent={selectedSection.content} onClose={() => setSelectedSectionKey(null)} onSaved={(content: FeaturesContent) => handleSectionSaved('features', content)} />
      )}
      {selectedSection?.section_key === 'faq' && (
        <FAQEditor initialContent={selectedSection.content} onClose={() => setSelectedSectionKey(null)} onSaved={(content) => handleSectionSaved('faq', content)} />
      )}
      {selectedSection?.section_key === 'testimonials' && (
        <TestimonialsEditor initialContent={selectedSection.content} onClose={() => setSelectedSectionKey(null)} onSaved={(content) => handleSectionSaved('testimonials', content)} />
      )}
      {selectedSection?.section_key === 'pricing' && (
        <PricingEditor initialContent={selectedSection.content} onClose={() => setSelectedSectionKey(null)} onSaved={(content) => handleSectionSaved('pricing', content)} />
      )}
      {selectedSection?.section_key === 'urgency_bar' && (
        <UrgencyBarEditor initialContent={selectedSection.content} onClose={() => setSelectedSectionKey(null)} onSaved={(content) => handleSectionSaved('urgency_bar', content)} />
      )}
      {selectedSection?.section_key === 'colors' && (
        <LandingColorsEditor initialContent={selectedSection.content} onClose={() => setSelectedSectionKey(null)} onSaved={(content) => handleSectionSaved('colors', content)} />
      )}
      {selectedSection?.section_key === 'seo' && (
        <LandingSeoEditor initialContent={selectedSection.content} onClose={() => setSelectedSectionKey(null)} onSaved={(content) => handleSectionSaved('seo', content)} />
      )}
      {selectedSection && !['hero', 'features', 'faq', 'testimonials', 'pricing', 'urgency_bar', 'colors', 'seo'].includes(selectedSection.section_key) && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedSectionKey(null); }}>
          <section role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">{selectedSection.label}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">محرر هذا القسم غير متاح بعد. الأقسام المتاحة حاليًا تشمل Hero والمميزات والأسئلة الشائعة والآراء والأسعار والألوان وSEO.</p>
            <button type="button" onClick={() => setSelectedSectionKey(null)} className="mt-5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">إغلاق</button>
          </section>
        </div>
      )}
    </div>
  );
}
