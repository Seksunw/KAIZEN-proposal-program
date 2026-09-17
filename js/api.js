// js/api.js — ทุก call ไป Supabase + snake_case⇄PascalCase ผ่านที่นี่เท่านั้น (§5.2)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=20260911z7';

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ★ subscribe ที่ตัว client จริงทันทีตั้งแต่โมดูลนี้ถูก evaluate (เร็วที่สุดเท่าที่ทำได้) แทนที่
// จะรอให้ app.js (คนละโมดูล โหลดผ่าน import graph ที่มี network round-trip ของตัวเอง) มา
// subscribe เอง — พิสูจน์แล้วว่า event 'PASSWORD_RECOVERY' (ยิงจาก detectSessionInUrl ตอนมี
// #access_token=...&type=recovery ใน URL) ยิงเร็วมากจน "หายไปเงียบๆ" ถ้า subscribe ช้าแม้แค่
// เสี้ยววินาที (ทดสอบสดยืนยันแล้ว: isolated test ที่ subscribe ภายใน script เดียวจับ event ได้
// เสมอ แต่ app.js ที่ subscribe หลัง import graph resolve กลับไม่เคยเห็น event นี้เลยสักครั้ง) —
// เก็บ event ล่าสุดไว้ replay ให้ callback ที่ subscribe ทีหลังผ่าน onAuthStateChange() ด้านล่าง
// (Spec.md §4.8 backlog Low #1)
let lastRecoveryEvent = null;
const authListeners = [];
client.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') lastRecoveryEvent = { event, session };
  authListeners.forEach((cb) => cb(event, session));
});

const toPascal = (s) => s.replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const toSnake  = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// jsonb ที่เป็น "map ตาม code/uuid" ไม่ใช่ schema คงที่ — คีย์ข้างในคงเดิมเสมอ (§5.2)
const PASSTHROUGH_KEYS = new Set(['Items', 'CommitteeWeights', 'Extra']);

export function dbToUI(row) {
  if (Array.isArray(row)) return row.map(dbToUI);
  if (row === null || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const pascalKey = toPascal(k);
    out[pascalKey] = PASSTHROUGH_KEYS.has(pascalKey) ? v : dbToUI(v);
  }
  return out;
}

export function uiToDB(obj) {
  if (Array.isArray(obj)) return obj.map(uiToDB);
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[toSnake(k)] = PASSTHROUGH_KEYS.has(k) ? v : uiToDB(v);
  }
  return out;
}

// ================================================================
// Auth
// ================================================================

export async function signUp({ email, password, employeeId, fullName, fullNameEn, department, plant, preferredLang }) {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        employee_id: employeeId,
        full_name: fullName,
        full_name_en: fullNameEn ?? null,
        department,
        plant,
        preferred_lang: preferredLang ?? 'th',
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

// ★ redirectTo ตั้งใจไม่ใส่ hash ของแอปเอง (#/reset-password) เพราะ Supabase เติม
// #access_token=...&type=recovery ต่อท้ายด้วยตัวเอง URL จะมีได้แค่ 1 fragment — ปล่อยให้
// Supabase คุม fragment เต็มๆ แล้วให้ app.js (onAuthStateChange event 'PASSWORD_RECOVERY')
// เป็นคนนำทางไปหน้า reset-password เอง (ดู Spec.md §4.8 backlog Low #1)
export async function requestPasswordReset(email) {
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

// ★ ส่ง event name ผ่านไปด้วย (เดิมทิ้งไป) — app.js ต้องแยกแยะ event 'PASSWORD_RECOVERY'
// ออกจาก sign-in ปกติ เพื่อพาไปหน้าตั้งรหัสผ่านใหม่แทนที่จะปล่อยเข้า dashboard เฉยๆ
export function onAuthStateChange(callback) {
  authListeners.push(callback);
  // ★ ถ้า PASSWORD_RECOVERY ยิงไปแล้วก่อนที่ callback นี้จะ subscribe ทัน (ปกติมากเพราะ app.js
  // subscribe ช้ากว่า client ถูกสร้างเสมอ) — replay ให้ทันที (async ผ่าน microtask เพื่อคงพฤติกรรม
  // เหมือน event ที่มาแบบ async ปกติ) แทนที่จะปล่อยให้หายไปเงียบๆ
  if (lastRecoveryEvent) {
    const { event, session } = lastRecoveryEvent;
    queueMicrotask(() => callback(event, session));
  }
  return {
    unsubscribe: () => {
      const i = authListeners.indexOf(callback);
      if (i >= 0) authListeners.splice(i, 1);
    },
  };
}

// ================================================================
// profiles
// ================================================================

export async function getMyProfile(userId) {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return dbToUI(data);
}

// ★ ชื่อเดิม updateMyProfile() ทำให้เข้าใจผิดว่าแก้ได้แค่โปรไฟล์ตัวเอง — ที่จริง userId เป็น
// พารามิเตอร์ธรรมดา ใช้ทั้งแก้โปรไฟล์ตัวเอง (profile.js, register.js) และแอดมินแก้โปรไฟล์คนอื่น
// (adminUsers.js) RLS (profiles_update_admin/profiles_update_own) เป็นตัวบังคับสิทธิ์จริงเสมอ ไม่ใช่
// ชื่อฟังก์ชัน (Spec.md §4.8 backlog Low #4)
export async function updateProfile(userId, uiPatch) {
  const patch = uiToDB(uiPatch);
  const { data, error } = await client.from('profiles').update(patch).eq('id', userId).select().single();
  if (error) throw error;
  return dbToUI(data);
}

// ไฟล์เดียวต่อคน ({user_id}/avatar ไม่มีนามสกุลต่อท้าย — เก็บ mime type ผ่าน contentType แทน)
// upsert:true ทับของเดิมอัตโนมัติ ไม่ต้องลบไฟล์เก่าก่อน
export async function uploadAvatar(userId, file) {
  const path = `${userId}/avatar`;
  const { error } = await client.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function getAvatarSignedUrl(storagePath) {
  const { data, error } = await client.storage.from('avatars').createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ================================================================
// kaizen_projects
// ================================================================

export async function getMyKaizenList(userId) {
  const { data, error } = await client
    .from('kaizen_projects').select('*').eq('owner_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return dbToUI(data);
}

// ★ server-side pagination จริง (Supabase .range(), ไม่ใช่ fetch ทั้งหมดมา slice ฝั่ง client) —
// ใช้กับ kaizenList.js เท่านั้น จุดอื่น (app.js badge, dashboard.js) ยังใช้ getMyKaizenList() เดิม
// เพราะต้องนับ/กรองจากลิสต์เต็มอยู่แล้ว (Spec.md §4.8 backlog Low #3) คืน total ต่อ status ทุกตัว
// มาด้วยในคำขอเดียว (นับแบบ head:true ไม่ดึงข้อมูลจริง) ให้ filter-chip โชว์ตัวเลขได้โดยไม่ต้อง
// ยิง query แยกต่อ chip
export async function getMyKaizenListPage({ userId, page = 0, pageSize = 20, statuses = null }) {
  let query = client.from('kaizen_projects').select('*', { count: 'exact' }).eq('owner_id', userId);
  if (statuses) query = query.in('status', statuses);
  const from = page * pageSize;
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error;
  return { rows: dbToUI(data), total: count ?? 0, hasMore: from + data.length < (count ?? 0) };
}

// นับจำนวนต่อ status ทั้งชุดในคำขอเดียว (ไม่ดึงข้อมูลจริง แค่ head request) — ใช้แสดงตัวเลขบน
// filter chip ของ kaizenList.js โดยไม่ต้อง fetch โครงการทั้งหมดมานับฝั่ง client
export async function getMyKaizenStatusCounts(userId) {
  const { count: total, error: e0 } = await client
    .from('kaizen_projects').select('*', { count: 'exact', head: true }).eq('owner_id', userId);
  if (e0) throw e0;
  const statusGroups = [
    ['need_revision', ['need_revision']],
    ['in_progress', ['submitted', 'in_progress']],
    ['pending', ['pending_review', 'scored', 'approved']],
    ['draft', ['draft']],
    ['published', ['published']],
  ];
  const counts = { all: total ?? 0 };
  await Promise.all(statusGroups.map(async ([key, statuses]) => {
    const { count, error } = await client
      .from('kaizen_projects').select('*', { count: 'exact', head: true }).eq('owner_id', userId).in('status', statuses);
    if (error) throw error;
    counts[key] = count ?? 0;
  }));
  return counts;
}

export async function getKaizenById(id) {
  const { data, error } = await client
    .from('kaizen_projects')
    .select('*, kaizen_attachments(*), kaizen_progress_updates(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return dbToUI(data);
}

// ★ ดึงหลาย id พร้อมกันครั้งเดียว (แทนวนเรียก getKaizenById ทีละตัว — N+1) ใช้ตอนต้อง resolve
// ชื่อ/รหัสโครงการหลายรายการพร้อมกัน เช่น adminAudit.js (Spec.md §4.8 finding M11)
export async function getKaizenByIds(ids) {
  if (ids.length === 0) return [];
  const { data, error } = await client.from('kaizen_projects').select('*').in('id', ids);
  if (error) throw error;
  return dbToUI(data);
}

export async function createKaizen(uiPatch) {
  const patch = uiToDB(uiPatch);
  const { data, error } = await client.from('kaizen_projects').insert(patch).select().single();
  if (error) throw error;
  return dbToUI(data);
}

export async function updateKaizen(id, uiPatch) {
  const patch = uiToDB(uiPatch);
  const { data, error } = await client.from('kaizen_projects').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return dbToUI(data);
}

export async function submitKaizen(kaizenId) {
  const { error } = await client.rpc('submit_kaizen', { p_kaizen_id: kaizenId });
  if (error) throw error;
}

// ================================================================
// kaizen_edit_grants — สิทธิ์แก้ไขชั่วคราวเฉพาะโครงการ (Group 7, Spec.md §4.8 backlog Low #7)
// ใช้เฉพาะกรณี need_revision ที่รอบปิด/ประกาศผลไปแล้ว เจ้าของแก้ไขปกติไม่ได้อีก — admin อนุมัติ
// ทีละโครงการผ่าน RPC เท่านั้น (ไม่ใช่ table insert ตรงๆ — RLS ของตารางนี้ปิดฝั่ง insert/update
// ไว้เฉพาะ admin แต่ RPC ยังต้อง validate precondition/เขียน audit_log ที่ table insert ตรงทำไม่ได้)
// ================================================================

export async function grantKaizenEditWindow({ kaizenId, reason, hours }) {
  const { data, error } = await client.rpc('grant_kaizen_edit_window', {
    p_kaizen_id: kaizenId, p_reason: reason, p_hours: hours,
  });
  if (error) throw error;
  return dbToUI(data);
}

export async function revokeKaizenEditGrant(grantId) {
  const { error } = await client.rpc('revoke_kaizen_edit_grant', { p_grant_id: grantId });
  if (error) throw error;
}

// ★ ใช้ทั้งฝั่ง admin (ดูประวัติ grant ทั้งหมดของโครงการ) และฝั่งเจ้าของ (เช็คว่ามี grant ที่ยัง
// ไม่หมดอายุอยู่ไหม เพื่อโชว์ banner ในฟอร์มแก้ไข) — RLS (keg_read_admin/keg_read_own) กรองให้เอง
export async function getKaizenEditGrants(kaizenId) {
  const { data, error } = await client
    .from('kaizen_edit_grants').select('*').eq('kaizen_id', kaizenId).order('granted_at', { ascending: false });
  if (error) throw error;
  return dbToUI(data);
}

export async function deleteKaizen(id) {
  const { data: attachments, error: attErr } = await client.from('kaizen_attachments').select('storage_path').eq('kaizen_id', id);
  if (attErr) throw attErr;
  if (attachments.length > 0) {
    const { error: rmErr } = await client.storage.from('kaizen-photos').remove(attachments.map((a) => a.storage_path));
    if (rmErr) throw rmErr;
  }
  // ★ ไม่มี .select() เดิม — ถ้า RLS (k_delete_own ต้อง status='draft', หรือ k_delete_admin)
  // บล็อกแถวนี้ PostgREST คืน 200 พร้อม 0 แถวเงียบๆ ไม่ error เลย ทำให้ผู้เรียกคิดว่าลบสำเร็จทั้งที่
  // จริงไม่ได้ลบ (เจอจากการทดสอบจริง — เรียก deleteKaizen() บนโครงการที่ไม่ใช่ draft ในฐานะเจ้าของ
  // ที่ไม่ใช่ admin แล้วดูเหมือนสำเร็จทั้งที่แถวยังอยู่) เหมือน finding M13 เดิมของ deletePeriod()
  // เป๊ะ — ปุ่ม "ลบร่าง" ใน UI จริงโผล่เฉพาะสถานะ draft ซึ่ง RLS อนุญาตอยู่แล้วเสมอจึงไม่เคยเจอผ่าน
  // UI ปกติ แต่ยังควรเช็คให้ถูกต้องเผื่อเรียกจากที่อื่นในอนาคต (Spec.md §4.8 backlog Low #7 side-fix)
  const { data, error } = await client.from('kaizen_projects').delete().eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('ลบโครงการนี้ไม่ได้ — ลบได้เฉพาะโครงการของตัวเองที่ยังเป็นร่างเท่านั้น');
  }
}

// ★ ต้องตรงกับ CHECK constraint ของ kaizen_attachments.mime_type ใน schema.sql เป๊ะ (Spec.md
// §4.8 backlog Low #5) — นามสกุลไฟล์ derive จาก mime_type ที่ whitelist ไว้แล้วเท่านั้น ไม่ใช่
// จาก file.name ดิบๆ ที่ผู้ใช้ควบคุมได้ (เดิม `file.name.split('.').pop()` เอาข้อความหลังจุด
// สุดท้ายมาต่อเป็นส่วนหนึ่งของ storage path ตรงๆ — ถ้าตั้งชื่อไฟล์ไม่มีจุดเลย เช่น "../evil"
// ตัว "extension" ที่ได้จะมี "/" ปนอยู่ กลายเป็นแทรก path segment แปลกปลอมเข้าไปใน storage path ได้)
const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// ★ crypto.randomUUID() มีให้ใช้เฉพาะใน secure context (https:// หรือ localhost) เท่านั้นตามสเปก
// เบราว์เซอร์ — ทดสอบจริงบนมือถือผ่าน LAN IP ตรงๆ ด้วย http:// (เช่น http://172.x.x.x:8123 ตอน
// ให้คนอื่นทดสอบข้ามเครื่อง ดู Spec.md เรื่อง local network testing) ได้ "crypto.randomUUID is
// not a function" ทันทีเพราะ browser ไม่เปิดฟังก์ชันนี้ให้นอก secure context เลย (2026-09-15) —
// ใช้แค่ตั้งชื่อไฟล์ใน storage path ให้ไม่ซ้ำกัน ไม่ใช่ security token จึง fallback เป็น
// Math.random()-based ได้อย่างปลอดภัยเมื่อไม่มี crypto.randomUUID
function generateFileId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function uploadAttachment({ kaizenId, phase, file, uploadedBy }) {
  const ext = MIME_TO_EXT[file.type];
  if (!ext) throw new Error('File must be one of: image/jpeg, image/png, image/webp, image/gif');
  const path = `${kaizenId}/${phase}/${generateFileId()}.${ext}`;

  const { error: upErr } = await client.storage.from('kaizen-photos').upload(path, file);
  if (upErr) throw upErr;

  const { data, error } = await client
    .from('kaizen_attachments')
    .insert({
      kaizen_id: kaizenId,
      phase,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: uploadedBy,
    })
    .select().single();
  if (error) {
    // ★ กันไฟล์ค้างใน storage แบบไม่มี DB row อ้างอิง (orphan) ถ้า insert ล้มเหลวหลังอัปโหลด
    // สำเร็จไปแล้ว — ลบไฟล์ที่เพิ่งอัปทิ้งก่อนโยน error ต่อ (Spec.md §4.8 finding M6)
    await client.storage.from('kaizen-photos').remove([path]);
    throw error;
  }
  return dbToUI(data);
}

export async function deleteAttachment(attachment) {
  const { error: rmErr } = await client.storage.from('kaizen-photos').remove([attachment.StoragePath]);
  if (rmErr) throw rmErr;
  const { error } = await client.from('kaizen_attachments').delete().eq('id', attachment.Id);
  if (error) throw error;
}

export async function getAttachmentSignedUrl(storagePath) {
  const { data, error } = await client.storage.from('kaizen-photos').createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ★ เดิมทำ insert kaizen_progress_updates แยกจาก updateKaizen(next_follow_up_date/status) เป็น
// 2 คำสั่งจากฝั่ง client — ถ้าคำสั่งแรกสำเร็จแต่คำสั่งที่สองพัง (เน็ตหลุด, ปิดแท็บกลางคัน) จะได้
// progress log ที่ไม่ตรงกับสถานะจริงของโครงการ ย้ายมาเป็น RPC เดียว (add_progress_update ใน
// schema.sql) ให้ Postgres รับประกัน atomicity แทน — CreatedBy ไม่ต้องส่งอีกต่อไป (RPC ใช้
// auth.uid() ของ caller ตรงๆ ฝั่ง server กันสวมรอย) (Spec.md §4.8 backlog Low #6)
export async function addProgressUpdate({ KaizenId, Note, Obstacles, NextFollowUpDate }) {
  const { data, error } = await client.rpc('add_progress_update', {
    p_kaizen_id: KaizenId,
    p_note: Note,
    p_obstacles: Obstacles,
    p_next_follow_up_date: NextFollowUpDate,
  });
  if (error) throw error;
  return dbToUI(data);
}

// ================================================================
// evaluation_periods
// ================================================================

export async function getOpenPeriod() {
  const { data, error } = await client.from('evaluation_periods').select('*').eq('status', 'open').maybeSingle();
  if (error) throw error;
  return dbToUI(data);
}

export async function getPeriods() {
  const { data, error } = await client
    .from('evaluation_periods').select('*').order('period_start', { ascending: false });
  if (error) throw error;
  return dbToUI(data);
}

// ★ server-side pagination จริง — ใช้กับตารางรอบทั้งหมดใน adminPeriods.js เท่านั้น จุดอื่น (badge
// ใน app.js, dashboard.js, ตัวเปรียบเทียบ Top 3 ข้ามรอบ) ยังใช้ getPeriods() เดิมเพราะต้องอ่านจาก
// ลิสต์เต็ม (Spec.md §4.8 backlog Low #3)
export async function getPeriodsPage({ page = 0, pageSize = 20 } = {}) {
  const from = page * pageSize;
  const { data, error, count } = await client
    .from('evaluation_periods').select('*', { count: 'exact' })
    .order('period_start', { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error;
  return { rows: dbToUI(data), total: count ?? 0, hasMore: from + data.length < (count ?? 0) };
}

export async function getPeriodById(id) {
  const { data, error } = await client.from('evaluation_periods').select('*').eq('id', id).single();
  if (error) throw error;
  return dbToUI(data);
}

export async function createPeriod(uiPatch) {
  const patch = uiToDB(uiPatch);
  const { data, error } = await client.from('evaluation_periods').insert(patch).select().single();
  if (error) throw error;
  return dbToUI(data);
}

export async function updatePeriod(id, uiPatch) {
  const patch = uiToDB(uiPatch);
  const { data, error } = await client.from('evaluation_periods').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return dbToUI(data);
}

export async function deletePeriod(id) {
  // ★ ไม่มี .select() เดิม — ถ้า RLS (ep_delete_admin, อนุญาตเฉพาะ status='draft') บล็อกแถวนี้
  // PostgREST คืน 200 พร้อม 0 แถวเงียบๆ ไม่ error เลย ทำให้ UI คิดว่าลบสำเร็จทั้งที่จริงไม่ได้ลบ
  // (Spec.md §4.8 finding M13) — เพิ่ม .select() แล้วเช็คว่ามีแถวคืนมาจริงก่อนถือว่าสำเร็จ
  const { data, error } = await client.from('evaluation_periods').delete().eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('ลบรอบนี้ไม่ได้ — ลบได้เฉพาะรอบที่ยังเป็นร่างเท่านั้น');
  }
}

export async function openPeriod(periodId) {
  const { error } = await client.rpc('open_period', { p_period_id: periodId });
  if (error) throw error;
}

export async function closePeriod(periodId) {
  const { error } = await client.rpc('close_period', { p_period_id: periodId });
  if (error) throw error;
}

export async function publishPeriod(periodId) {
  const { error } = await client.rpc('publish_period', { p_period_id: periodId });
  if (error) throw error;
}

// ================================================================
// committee review / scoring
// ================================================================

export async function getReviewQueue(periodId) {
  // select ขยายเพิ่ม kaizen_attachments(id) เพื่อนับจำนวนรูปในการ์ดคิวตรวจ (UI เท่านั้น
  // ไม่แก้ signature — MIGRATION.md ข้อ 7 อนุญาตเฉพาะจุดนี้)
  const { data, error } = await client
    .from('kaizen_projects').select('*, kaizen_attachments(id)').eq('period_id', periodId).eq('status', 'pending_review');
  if (error) throw error;
  return dbToUI(data);
}

export async function getMyScoresForPeriod(periodId, committeeUserId) {
  const { data, error } = await client
    .from('committee_scores').select('*')
    .eq('period_id', periodId).eq('committee_user_id', committeeUserId);
  if (error) throw error;
  return dbToUI(data);
}

export async function getOrCreateMyScore({ periodId, kaizenId, committeeUserId }) {
  const { data: existing, error: selErr } = await client
    .from('committee_scores').select('*')
    .eq('period_id', periodId).eq('kaizen_id', kaizenId).eq('committee_user_id', committeeUserId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return dbToUI(existing);

  const { data, error } = await client
    .from('committee_scores')
    .insert({ period_id: periodId, kaizen_id: kaizenId, committee_user_id: committeeUserId })
    .select().single();
  if (error) throw error;
  return dbToUI(data);
}

export async function saveScoreDraft(scoreId, uiPatch) {
  const patch = uiToDB(uiPatch); // { Items, OverallComment } → { items, overall_comment }
  const { data, error } = await client.from('committee_scores').update(patch).eq('id', scoreId).select().single();
  if (error) throw error;
  return dbToUI(data);
}

export async function submitScore(scoreId) {
  const { error } = await client.rpc('submit_score', { p_score_id: scoreId });
  if (error) throw error;
}

// ================================================================
// master_data
// ================================================================

export async function getCommitteeCandidates() {
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, employee_id, roles, is_active')
    .contains('roles', ['committee'])
    .eq('is_active', true);
  if (error) throw error;
  return dbToUI(data);
}

export async function getKaizenByPeriod(periodId) {
  const { data, error } = await client
    .from('kaizen_projects').select('*').eq('period_id', periodId).order('created_at');
  if (error) throw error;
  return dbToUI(data);
}

// ★ server-side pagination จริง — ใช้กับตารางโครงการใน adminPeriodDetail.js เท่านั้น จุดอื่น
// (adminPeriods.js: นับจำนวนต่อรอบ + เปรียบเทียบ Top 3 ข้ามรอบ) ยังใช้ getKaizenByPeriod() เดิม
// เพราะต้องประมวลผลจากลิสต์เต็มของแต่ละรอบอยู่แล้ว (Spec.md §4.8 backlog Low #3)
export async function getKaizenByPeriodPage({ periodId, page = 0, pageSize = 20, statuses = null } = {}) {
  let query = client.from('kaizen_projects').select('*', { count: 'exact' }).eq('period_id', periodId);
  if (statuses) query = query.in('status', statuses);
  const from = page * pageSize;
  const { data, error, count } = await query.order('created_at').range(from, from + pageSize - 1);
  if (error) throw error;
  return { rows: dbToUI(data), total: count ?? 0, hasMore: from + data.length < (count ?? 0) };
}

// นับจำนวนโครงการในรอบเดียว (head:true ไม่ดึงข้อมูลจริง) — ใช้แสดงคอลัมน์ "โครงการ" ในตาราง
// adminPeriods.js เฉพาะรอบที่กำลังแสดงอยู่หน้าปัจจุบัน แทนการ fetch ลิสต์เต็มของทุกรอบล่วงหน้า
export async function getKaizenCountByPeriod(periodId) {
  const { count, error } = await client
    .from('kaizen_projects').select('*', { count: 'exact', head: true }).eq('period_id', periodId);
  if (error) throw error;
  return count ?? 0;
}

export async function getAllProfiles() {
  const { data, error } = await client.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return dbToUI(data);
}

// ★ server-side pagination จริง — ใช้กับตาราง "บัญชีที่เปิดใช้งานแล้ว" ใน adminUsers.js เท่านั้น
// จุดอื่น (badge นับ pendingActivation ใน app.js, profileById map ใน adminPeriods.js) ยังใช้
// getAllProfiles() เดิมเพราะต้องอ่าน/นับจากลิสต์เต็ม (Spec.md §4.8 backlog Low #3)
// ★ ค้นหา 3 คอลัมน์พร้อมกัน (OR) ต้องผ่าน RPC search_profiles() ไม่ใช่ .or() string ที่ build เอง
// ฝั่ง client — ทดสอบสดพบว่า PostgREST parse .or() พังถ้าคำค้นมีอักขระสงวน (, ( ) .) แม้ escape
// ตามเอกสารแล้ว RPC นี้ผูกคำค้นเป็น bound parameter ปลอดภัยกว่าและไม่ต้อง escape เอง
// (migration_2026-09-12_search-profiles-rpc.sql, Spec.md §4.8 backlog Low #3)
export async function getProfilesPage({ page = 0, pageSize = 20, search = '', roleFilter = 'all', activeOnly = true } = {}) {
  const from = page * pageSize;
  const { data, error, count } = await client
    .rpc('search_profiles', { p_search: search.trim(), p_role_filter: roleFilter, p_active_only: activeOnly }, { count: 'exact' })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return { rows: dbToUI(data), total: count ?? 0, hasMore: from + data.length < (count ?? 0) };
}

export async function getMasterData(type) {
  const { data, error } = await client
    .from('master_data').select('*').eq('type', type).eq('is_active', true).order('sort_order');
  if (error) throw error;
  return dbToUI(data);
}

export async function getAllMasterData(type) {
  const { data, error } = await client
    .from('master_data').select('*').eq('type', type).order('sort_order');
  if (error) throw error;
  return dbToUI(data);
}

export async function createMasterDataRow(uiPatch) {
  const patch = uiToDB(uiPatch);
  const { data, error } = await client.from('master_data').insert(patch).select().single();
  if (error) throw error;
  return dbToUI(data);
}

export async function updateMasterDataRow(id, uiPatch) {
  const patch = uiToDB(uiPatch);
  const { data, error } = await client.from('master_data').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return dbToUI(data);
}

export async function getAuditLog(limit = 200) {
  const { data, error } = await client
    .from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return dbToUI(data);
}

// ================================================================
// quarterly_awards — ประกาศผล Top 3 รางวัลใหญ่ข้ามรอบ (Spec.md §2.11)
// ================================================================

export async function getQuarterlyAwards() {
  const { data, error } = await client
    .from('quarterly_awards').select('*').order('published_at', { ascending: false });
  if (error) throw error;
  return dbToUI(data);
}

export async function createQuarterlyAward(uiPatch) {
  const patch = uiToDB(uiPatch);
  const { data, error } = await client.from('quarterly_awards').insert(patch).select().single();
  if (error) throw error;
  return dbToUI(data);
}

export async function deleteQuarterlyAward(id) {
  const { error } = await client.from('quarterly_awards').delete().eq('id', id);
  if (error) throw error;
}

// ================================================================
// leaderboard / results (v_kaizen_results — เห็นเฉพาะ published, admin เห็น closed ด้วย)
// ================================================================

export async function getResults(periodId) {
  const { data, error } = await client
    .from('v_kaizen_results').select('*').eq('period_id', periodId).order('rank_overall');
  if (error) throw error;
  return dbToUI(data);
}

// ================================================================
// Feed — โครงการ KAIZEN ที่ "ส่งแล้ว" (submitted ขึ้นไป ไม่รวม draft) ของทุกคน (2026-09-15,
// แทนที่หน้า leaderboard เดิม) — ไม่โชว์คะแนน/อันดับเลย (นั่นยังอยู่ที่ getResults() ด้านบน คนละ
// policy คนละ view ไม่ถูกแตะ) เปิดด้วย RLS ใหม่ k_read_feed/ka_read_feed/profiles_read_feed
// (ดู migration_2026-09-15_kaizen-feed.sql) — ดึงรูปแนบมาด้วยในคำขอเดียวกันเลย (ka_read_feed),
// ชื่อ/รูปเจ้าของแยกคนละคำขอ (profiles_read_feed) เพราะ owner_id และ responsible_user_id ต่างก็
// ชี้ไป profiles ทั้งคู่ ทำให้ PostgREST embed ตรงๆ กำกวม (ต้องระบุชื่อ FK constraint เอง) — แยก
// query แล้ว map เองฝั่ง client ง่ายกว่าและไม่เปราะบางต่อการเปลี่ยนชื่อ constraint ทีหลัง
// ================================================================

export async function getFeedPage({ periodId = null, page = 0, pageSize = 20 } = {}) {
  let query = client
    .from('kaizen_projects')
    .select('*, kaizen_attachments(*)', { count: 'exact' })
    .neq('status', 'draft');
  if (periodId) query = query.eq('period_id', periodId);
  const from = page * pageSize;
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error;
  const rows = dbToUI(data);

  const ownerIds = [...new Set(rows.map((k) => k.OwnerId))];
  let owners = [];
  if (ownerIds.length > 0) {
    const { data: ownerRows, error: ownerErr } = await client
      .from('profiles').select('id, full_name, avatar_path').in('id', ownerIds);
    if (ownerErr) throw ownerErr;
    owners = dbToUI(ownerRows);
  }
  const ownerById = new Map(owners.map((o) => [o.Id, o]));
  for (const k of rows) k.Owner = ownerById.get(k.OwnerId) ?? null;

  return { rows, total: count ?? 0, hasMore: from + data.length < (count ?? 0) };
}

// ================================================================
// kaizen_likes — ปุ่ม Like บนหน้า Feed (2026-09-15) — เก็บจริง คนละเรื่องกับคะแนน/อันดับ
// ================================================================

// ดึง like ทั้งหมดของหลายโครงการพร้อมกันครั้งเดียว (กัน N+1 ตอนโหลดฟีดทีละหน้า) — นับจำนวน/
// เช็คว่า user ปัจจุบันไลค์ไว้หรือยังทำเองฝั่ง client จากแถวดิบ (จำนวนน้อยพอสำหรับ internal tool
// นี้ ไม่คุ้มที่จะเพิ่ม RPC/view แยกแค่เพื่อนับ)
export async function getLikesForKaizenIds(kaizenIds) {
  if (kaizenIds.length === 0) return [];
  const { data, error } = await client.from('kaizen_likes').select('kaizen_id, user_id').in('kaizen_id', kaizenIds);
  if (error) throw error;
  return dbToUI(data);
}

// upsert + ignoreDuplicates กันดับเบิลคลิก/เรียกซ้ำจากปุ่มไลค์ชนกับ primary key (kaizen_id,
// user_id) ไม่ต้องดัก error code 23505 เอง
export async function likeKaizen(kaizenId, userId) {
  const { error } = await client
    .from('kaizen_likes')
    .upsert({ kaizen_id: kaizenId, user_id: userId }, { onConflict: 'kaizen_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unlikeKaizen(kaizenId, userId) {
  const { error } = await client.from('kaizen_likes').delete().eq('kaizen_id', kaizenId).eq('user_id', userId);
  if (error) throw error;
}

export { client as supabase };
