'use client';

/**
 * Legacy knowledge-base manager kept intentionally unused.
 * The tenant-aware implementation lives at app/(dashboard)/dashboard/[clinicSlug]/knowledge-base/page.tsx
 * and is the only supported data source. This placeholder prevents mock data or simulated loading
 * from being displayed in the dashboard.
 */
export default function KnowledgeBaseManager() {
  return null;
}
