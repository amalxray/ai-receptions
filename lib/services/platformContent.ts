/**
 * Platform /ask content admin — thin CRUD over the platform_* tables.
 * Every route that uses this is guarded by requirePlatformAdmin first.
 * Validation lives per-route (Zod); this helper keeps the DB access uniform.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function listRows(table: string, order = 'created_at'): Promise<unknown[]> {
  const { data, error } = await supabaseAdmin.from(table).select('*').order(order, { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRow(table: string, id: string): Promise<unknown | null> {
  const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function createRow(table: string, payload: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabaseAdmin.from(table).insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateRow(table: string, id: string, payload: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabaseAdmin.from(table).update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRow(table: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(table).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Simple Arabic-safe slugify (platform article slugs). */
export function slugify(input: string): string {
  const latin = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0640-\u06FF]/g, (m) => ''); // strip Arabic letters for ASCII slug
  const fallback = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  if (fallback.length >= 3) return fallback;
  // Arabic-only title → transliterate-free: use unicode hash suffix
  return `article-${(input.length + input.charCodeAt(0)).toString().padStart(4, '0')}`;
}
