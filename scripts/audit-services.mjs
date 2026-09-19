/**
 * READ-ONLY forensic audit of the service catalogs — answers: were amal-clinic
 * services soft-deleted (deleted_at), deactivated (active=false) or HARD deleted?
 * NOTHING is written: only .select() calls below. Safe to re-run.
 *
 * Notes vs. the original snippet:
 *   - the audit table is `audit_logs` (NOT `audit_log`; see
 *     db/migrations/20260721_initial_schema.sql:164).
 *   - service_role key → RLS is bypassed, so soft-deleted rows ARE visible.
 *   - extra hard-delete evidence: orphan provider_services links, historical
 *     appointments that still carry a service NAME, and message/chat traces.
 *
 * Usage: node scripts/audit-services.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('BLOCKED: missing Supabase credentials in .env.local');
  process.exit(1);
}
const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
console.log(`Supabase host: ${host}  [READ-ONLY AUDIT — no writes]`);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const dump = (label, data, error) => {
  console.log(`\n=== ${label} ===`);
  if (error) { console.log(`ERROR: ${error.message}`); return; }
  if (Array.isArray(data)) {
    console.log(`عدد الصفوف: ${data.length}`);
    if (data.length === 0) console.log('(لا صفوف)');
    else console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data === null ? '(null)' : JSON.stringify(data, null, 2));
  }
};

// ── 1. كل clinic_services (بما فيها soft-deleted و معطّلة) ─────────────────
const cs = await sb.from('clinic_services').select('*').order('created_at', { ascending: false });
dump('1. كل صفوف clinic_services (كل العيادات، كل الحالات)', cs.data, cs.error);

// ── 2. imaging_services ───────────────────────────────────────────────────
const im = await sb.from('imaging_services').select('*').order('name');
dump('2. imaging_services', im.data, im.error);

// ── 3. كل العيادات ────────────────────────────────────────────────────────
const cl = await sb.from('clinics').select('id, name, slug, activity_type, created_at, updated_at, deleted_at').order('name');
dump('3. كل العيادات', cl.data, cl.error);

// ── 4. التوزيع حسب العيادة + كشف الأيتام ──────────────────────────────────
console.log('\n=== 4. توزيع الخدمات حسب العيادة ===');
const clinics = cl.data ?? [];
const services = cs.data ?? [];
const clinicIds = new Set(clinics.map((c) => c.id));
console.log('عيادة | slug | منشورة | معطّلة(active=false) | محذوفة(deleted_at) | المجموع');
for (const c of clinics) {
  const mine = services.filter((s) => s.clinic_id === c.id);
  const active = mine.filter((s) => !s.deleted_at && s.active !== false).length;
  const inactive = mine.filter((s) => !s.deleted_at && s.active === false).length;
  const soft = mine.filter((s) => s.deleted_at).length;
  console.log(`${c.name} | ${c.slug} | ${active} | ${inactive} | ${soft} | ${mine.length}`);
}
const orphans = services.filter((s) => !clinicIds.has(s.clinic_id));
console.log(`\nصفوف clinic_services لعيادة غير موجودة في clinics (clinic محذوف نهائياً؟): ${orphans.length}`);
if (orphans.length) console.log(JSON.stringify(orphans, null, 2));

// ── 5. audit_logs (الجدول الصحيح) ─────────────────────────────────────────
console.log('\n=== 5. audit_logs — آخر 50 حدثاً ===');
const al = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50);
dump('5a. audit_logs (آخر 50)', al.data, al.error);

console.log('\n=== 5b. audit_logs: أي حدث يخص «service» (تاريخ كامل، بلا ilike على jsonb) ===');
const alFiltered = await sb
  .from('audit_logs')
  .select('*')
  .or('action.ilike.%service%,resource.ilike.%service%,resource_type.ilike.%service%')
  .order('created_at', { ascending: false })
  .limit(200);
dump('5b. audit_logs الخاصة بالخدمات', alFiltered.data, alFiltered.error);

console.log('\n=== 5d. التوزيع الكامل لتاريخ audit_logs حسب نوع الحدث ===');
const alAll = await sb.from('audit_logs').select('id, action, resource, resource_type, clinic_id, created_at, details').order('created_at', { ascending: true });
if (alAll.error) {
  console.log(`ERROR: ${alAll.error.message}`);
} else {
  const rows = alAll.data ?? [];
  console.log(`إجمالي أحداث السجل: ${rows.length}  |  أقدم: ${rows[0]?.created_at ?? '-'}  |  أحدث: ${rows[rows.length - 1]?.created_at ?? '-'}`);
  const hist = new Map();
  for (const r of rows) hist.set(r.action, (hist.get(r.action) ?? 0) + 1);
  console.log('action | العدد');
  for (const [a, n] of [...hist.entries()].sort((x, y) => y[1] - x[1])) console.log(`${a} | ${n}`);
  const svc = rows.filter((r) => `${r.action} ${r.resource ?? ''} ${r.resource_type ?? ''}`.toLowerCase().includes('service') || JSON.stringify(r.details ?? {}).toLowerCase().includes('service'));
  console.log(`\nأحداث تذكر «service» في (action/resource/resource_type/details): ${svc.length}`);
  if (svc.length) console.log(JSON.stringify(svc, null, 2));
  const del = rows.filter((r) => r.action.toLowerCase().includes('delete') || r.action.toLowerCase().includes('remove'));
  console.log(`\nكل أحداث الحذف على الإطلاق: ${del.length}`);
  for (const r of del) console.log(`  ${r.created_at} | ${r.action} | clinic=${(r.clinic_id ?? '-').slice(0, 8)} | details=${JSON.stringify(r.details ?? {})}`);
}

console.log('\n=== 5c. audit_logs: أي حدث DELETE / remove / archive ===');
const alDel = await sb
  .from('audit_logs')
  .select('*')
  .or('action.ilike.%delete%,action.ilike.%remove%,action.ilike.%archive%')
  .order('created_at', { ascending: false })
  .limit(100);
dump('5c. audit_logs الخاصة بالحذف', alDel.data, alDel.error);

// ── 6. provider_services (روابط مزود↔خدمة) ────────────────────────────────
const ps = await sb.from('provider_services').select('*').order('created_at', { ascending: false });
dump('6. provider_services', ps.data, ps.error);

console.log('\n=== 6b. روابط يتيمة (FK طرفها مفقود → دليل حذف نهائي) ===');
const serviceIds = new Set(services.map((s) => s.id));
const psRows = ps.data ?? [];
const provAll = await sb.from('providers').select('id, clinic_id, name, deleted_at');
const providerIds = new Set((provAll.data ?? []).map((p) => p.id));
const orphanLinks = psRows.filter((r) => !serviceIds.has(r.service_id) || !providerIds.has(r.provider_id) || !clinicIds.has(r.clinic_id));
console.log(`إجمالي الروابط: ${psRows.length} | يتيمة: ${orphanLinks.length}`);
if (orphanLinks.length) console.log(JSON.stringify(orphanLinks, null, 2));

// ── 7. المواعيد التاريخية (aالنص service) — دليل على خدمات كانت موجودة ────
console.log('\n=== 7. appointments مجمّعة حسب اسم الخدمة (دليل تاريخي) ===');
const appt = await sb
  .from('appointments')
  .select('clinic_id, service, provider_id, status, created_at, scheduled_at')
  .order('created_at', { ascending: false });
if (appt.error) {
  console.log(`ERROR: ${appt.error.message}`);
} else {
  const rows = appt.data ?? [];
  console.log(`إجمالي المواعيد: ${rows.length}`);
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.clinic_id} :: ${r.service}`;
    const e = byKey.get(key) ?? { clinic_id: r.clinic_id, service: r.service, count: 0, first: r.created_at, last: r.created_at };
    e.count += 1;
    if (r.created_at < e.first) e.first = r.created_at;
    if (r.created_at > e.last) e.last = r.created_at;
    byKey.set(key, e);
  }
  console.log(JSON.stringify([...byKey.values()].sort((a, b) => b.count - a.count), null, 2));
}

// ── 8. آثار الخدمات المعروفة لـ amal-clinic في المحادثات ───────────────────
const AMAL_NAMES = ['فحص وتشخيص شامل', 'تنظيف وتلميع الأسنان', 'حشو تجميلي', 'علاج عصب', 'خلع أسنان', 'تقويم أسنان', 'زراعة أسنان'];
console.log('\n=== 8. آثار أسماء خدمات amal-clinic المعروفة في messages / conversations ===');
for (const name of AMAL_NAMES) {
  const m = await sb.from('messages').select('*', { count: 'exact', head: true }).ilike('content', `%${name}%`);
  console.log(`  «${name}»: ${m.error ? 'ERROR ' + m.error.message : m.count} رسالة`);
}
const cv = await sb.from('conversations').select('*', { count: 'exact', head: true });
console.log(`  إجمالي المحادثات: ${cv.error ? 'ERROR ' + cv.error.message : cv.count}`);

// ── 9. lab_services (كتالوج خدمة رابع) ────────────────────────────────────
const lab = await sb.from('lab_services').select('*').order('name');
dump('9. lab_services', lab.data, lab.error);

// ── 10. آثار سكربت البذرة لـ amal-clinic (هل نُفِّذ يوماً؟) ────────────────
const AMAL_ID = '873ce939-9a9e-41e8-a684-a220d845890f';
console.log('\n=== 10. آثار محتوى amal-clinic (provider/schedules/services/articles/testimonials/achievements/media) ===');
for (const t of ['providers', 'provider_schedules', 'provider_services', 'clinic_services', 'clinic_articles', 'clinic_testimonials', 'clinic_achievements', 'clinic_public_media']) {
  const r = await sb.from(t).select('*', { count: 'exact', head: true }).eq('clinic_id', AMAL_ID);
  console.log(`  ${t}: ${r.error ? 'ERROR ' + r.error.message : r.count}`);
}
console.log('\n[READ-ONLY] لم يُكتب أو يُحذف أي شيء.');
