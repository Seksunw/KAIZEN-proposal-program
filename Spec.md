# Spec.md — KAIZEN Proposal Program (MVP)
**Suntory Wellness** · ฉบับที่ 4 · อัปเดตล่าสุด 2026-09-11
> แทนที่โครงสร้างเดิม (Next.js/TypeScript, ~20 ตาราง) ด้วยสถาปัตยกรรม **MVP แบบเรียบง่าย**: vanilla HTML/JS + Supabase schema 8 ตาราง
> เอกสารต้นทาง `docs/01-architecture.md` ถึง `docs/04-project-structure.md` ยังเก็บไว้เป็น **full design reference** (ระยะยาว) — เอกสารนี้คือ scope ที่ตั้งใจ **สร้างจริงตอนนี้**

---

## 1. Architecture, Tech

### 1.1 แนวคิด
- **ไม่มี framework ฝั่ง frontend** — ไม่ใช้ Next.js / React / build step
- **ไม่มี custom backend server** — Supabase (Postgres + Auth + Storage) เป็น backend เดียว เข้าถึงตรงจากเบราว์เซอร์ด้วย anon key + RLS
- Logic เฉพาะที่ต้องข้าม RLS (เปิด/ปิดรอบ, ส่งคะแนน, คำนวณผล) อยู่ใน Postgres function (`security definer` RPC) เรียกผ่าน `supabase.rpc(...)`

### 1.2 Stack
| ชั้น | เลือกใช้ | หมายเหตุ |
|---|---|---|
| Markup/Style | HTML5 + CSS (ไฟล์เดียวหรือแบ่งตาม view) | ไม่ใช้ Tailwind/CSS framework ใน v1 (backlog ถ้าจำเป็น) |
| Client logic | Vanilla JavaScript (ES modules), ไม่มี TypeScript, ไม่มี bundler | โหลดตรงผ่าน `<script type="module" src="js/app.js">` |
| Routing | Hash-based client router เขียนเอง (`js/router.js`) | ดู §5.3 |
| DB/Auth/Storage | Supabase (PostgreSQL 15 + Auth + Storage) | schema เดียว `supabase/schema.sql` |
| DB client | `@supabase/supabase-js` (CDN `<script>`) | ไม่มี server-side rendering |
| i18n | Dictionary JS (`js/i18n.js`) สลับ TH/EN เอง | ไม่ใช้ next-intl |
| Criteria/enums คงที่ | JS constants (`js/constants.js`) | ไม่มี `criteria_versions` table ใน v1 |
| Hosting | Static hosting (เช่น Netlify/Vercel static หรือ GitHub Pages) + Supabase Cloud | ไม่มี server runtime ฝั่งแอป |
| Test | Manual smoke test ตาม §3 checklist (อัตโนมัติ = backlog) | |

### 1.3 ไฟล์หลักของโปรเจกต์ (เป้าหมาย)
```
kaizen-mvp/
├── index.html
├── css/style.css
├── js/
│   ├── app.js          # bootstrap: session, mount router, render #app
│   ├── router.js        # hash router — §5.3
│   ├── api.js           # ทุก call ไป Supabase + snake_case⇄PascalCase — §5.2
│   ├── i18n.js           # TH/EN dictionary + t()
│   ├── constants.js      # 7 criteria, score levels, statuses, roles (ค่าคงที่แทน DB table)
│   └── views/            # 1 ไฟล์ต่อหน้า: dashboard.js, kaizenForm.js, kaizenDetail.js,
│                          #   review.js, adminUsers.js, adminPeriods.js, ...
├── supabase/
│   └── schema.sql        # ตารางทั้งหมด + trigger + RLS + RPC — §5.1
└── Spec.md               # เอกสารนี้
```

*อ้างอิงย้อนกลับ (full design, ยังไม่ทำใน MVP):* `docs/01-architecture.md`, `docs/02-database-schema.md`, `docs/03-rls-policies.md`, `docs/04-project-structure.md`

---

## 2. Done — decisions made

### 2.1 กติกาธุรกิจ (มาจาก docs เดิม ยังใช้อยู่ ไม่เปลี่ยนแม้ตัด stack)
| # | ข้อสรุป |
|---|---|
| D1 | 7 เกณฑ์ให้คะแนน — Safety, Quality, Productivity, Cost, Apply, Gemba, Communication · ระดับ 1–5 · เต็ม 35 |
| D2 | Cost criterion: กรรมการให้คะแนนเอง 1–5 · ระบบแสดง Cost-saving Rank (1–5) เป็นคำแนะนำเท่านั้น |
| D3 | ภาษา TH + EN เท่านั้น |
| D4 | น้ำหนักกรรมการ **เฉพาะโหมด `person_weighted`** ใน v1 (role_weighted/equal_average → backlog) |
| D5 | สูตร `points(c) = raw_sum(c)/35 × weight_pct(c)` → `final = Σ points` เต็ม 100 · ต้องตรงกับ fixture Excel (แถวแรก = 50.8571) |
| D6 | งบประมาณ = ช่วงติ๊ก 6 ระดับ (band) |
| D7 | Cost saving/เดือน เป็นฟิลด์ใหม่ (optional) + หลักฐานถ้ากรอก > 0 |
| D8 | ไม่ migrate ข้อมูลเก่า · seed = ข้อมูลสมมติ 100% |

### 2.2 สถาปัตยกรรม (ตัดสินใจในรอบนี้ — 2026-09-07)
- ตัด Next.js/TypeScript ทิ้ง → **vanilla HTML/JS + Supabase ตรง** เพื่อลด scope และ build ได้เร็ว
- รวม schema จาก ~20 ตารางเหลือ **8 ตาราง**:
  - `master_data` แทน `plants` + `departments` + `committee_roles` + `budget_bands` + `cost_saving_bands` (แยกด้วยคอลัมน์ `type`)
  - `committee_scores` แทน `scores` + `score_items` (คะแนนรายเกณฑ์เก็บเป็น `items jsonb`)
  - `kaizen_projects` ดูดรวม `kaizen_categories` / `kaizen_impacts` / `kaizen_support_needs` / `kaizen_team_members` เป็นคอลัมน์ array/jsonb แทนตารางลูก
  - `evaluation_periods.committee_weights jsonb` แทน `period_committees` (เก็บ `{user_id: weight_pct}` ตรง ๆ เพราะ v1 มีแต่ `person_weighted`)
  - ตัด `criteria_versions/score_criteria/score_levels` → ย้ายไปเป็น JS constants (`js/constants.js`)
  - ตัด `committee_assignments` → v1: กรรมการ active ทุกคนในรอบเห็นและให้คะแนนได้ทุกโครงการที่ `pending_review` (ไม่มีการแบ่งงาน)
  - ตัด `translations/translation_jobs/translation_audit` → v1: ผู้ใช้กรอก EN เอง (ฟิลด์ `*_en` ในตารางเดียวกัน) ไม่มี automated MT
  - ตัด `kaizen_results/period_snapshots` เป็นตารางถาวร → คำนวณสดผ่าน **view** `v_kaizen_results` แทน (ดู §5.1) — trade-off: ผลลัพธ์ไม่ได้ frozen แบบ snapshot (บันทึกเป็น known limitation ใน §3)
  - ตัด `user_roles`/`kaizen_status_history` → `profiles.roles text[]` และ `audit_log` (generic) ครอบทั้งคู่
- ผลลัพธ์ 8 ตาราง: `profiles`, `master_data`, `evaluation_periods`, `kaizen_projects`, `kaizen_attachments`, `kaizen_progress_updates`, `committee_scores`, `audit_log`
- Data contract แบ่งชัดเจน: DB = `snake_case`, UI object ใน JS = `PascalCase` แปลงที่ชั้น `js/api.js` เท่านั้น (§5.2)

### 2.3 กติกาธุรกิจใหม่ — ส่งกรรมการให้คะแนนได้ก่อนงานเสร็จ (ตัดสินใจ 2026-09-08)

**โจทย์:** เดิม flow บังคับให้ `is_completed = true` ก่อนถึงจะเปลี่ยนสถานะเป็น `pending_review` ได้ (ปิดโครงการ + ส่งตรวจ เป็น action เดียวกัน) ผู้เสนอที่งานยังไม่เสร็จเลยส่งให้กรรมการให้คะแนนไม่ได้เลยจนกว่าจะเสร็จงานจริง

**มติ:** แยกเป็น **2 ปุ่มอิสระกัน** ที่ `kaizenProgress.js`:
- **"ส่งให้กรรมการให้คะแนน"** — เปลี่ยน `status → pending_review` เท่านั้น ไม่บังคับ `is_completed = true` กรรมการให้คะแนนจากข้อมูล ณ ตอนส่งได้เลย
- **"ทำเครื่องหมายว่าเสร็จแล้ว"** — ตั้ง `is_completed = true` + วันที่เสร็จ + รูปหลังทำ + cost saving อิสระจากสถานะให้คะแนน กดได้ทั้งก่อนและหลังส่งกรรมการ

เจ้าของโครงการยังอัปเดตความคืบหน้า/ทำเครื่องหมายเสร็จได้ต่อแม้สถานะเข้า `pending_review`/`scored`/`approved` แล้ว ตราบใดที่ `is_completed = false` — บังคับด้วย:
- `can_track_progress()` (function ใหม่, มิเรอร์ `can_write_kaizen()`) → เปิดสิทธิ์ update ให้เจ้าของกรณีนี้เพิ่มจาก `can_write_kaizen()` เดิม (draft/submitted/in_progress/need_revision เท่านั้น)
- `guard_kaizen_field_lock()` (trigger ใหม่, `before update`) → เมื่อ `status` เข้า `pending_review`/`scored`/`approved` แล้ว ล็อกไม่ให้แก้ไขคอลัมน์ใดๆ นอกเหนือ allow-list ที่เกี่ยวกับ progress (`is_completed, completion_date, next_follow_up_date, responsible_user_id, progress_pct, cost_saving_per_month, cost_saving_basis, confirmed_by_name, status, ...`) — กันไม่ให้แก้เนื้อหาหลัก (ชื่อ/ปัญหา/แนวทาง) หลังส่งกรรมการแล้ว
- `guard_kaizen_transition()` แก้จาก "ต้อง `is_completed=true` เสมอก่อนเข้า `pending_review`" → เหลือแค่เช็ค evidence เฉพาะตอนที่ `is_completed = true` จริง (ไม่บังคับกรณียังไม่เสร็จ)
- `guard_kaizen_completion()` (trigger ใหม่) → คุมแยกว่า ทุกครั้งที่ `is_completed` เปลี่ยนจาก false→true (ไม่ว่าจะเกิดตอนไหน) ต้องมีรูปหลังทำแนบอยู่แล้ว

**ผลกระทบ UI อื่น:** `kaizenDetail.js` (ปุ่ม "บันทึกความคืบหน้า" โชว์ต่อแม้ status ไปถึง pending_review/scored/approved ตราบใดที่ยังไม่เสร็จ), `reviewScore.js` (แจ้งเตือน "โครงการนี้ยังไม่เสร็จ — ให้คะแนนจากข้อมูล ณ ตอนนี้ได้เลย"), `reviewQueue.js` (badge "ยังไม่เสร็จ — อยู่ระหว่างดำเนินการ" ในคิวตรวจ)

**Dashboard สรุปยอดส่งต่อรอบ** (`adminPeriodDetail.js`) — เพิ่มการ์ด "สรุปการส่งโครงการ" (ส่งเข้ารอบทั้งหมด/รายบุคคล/กลุ่ม/เสร็จแล้ว/ยังดำเนินการ) + ตารางแยกตามโรงงาน ให้ admin เห็นภาพรวมว่าแต่ละรอบมีคนส่งเท่าไหร่ แยกกลุ่ม/เดี่ยว/โรงงาน/เสร็จหรือยัง

**Migration:** เขียน schema.sql ตรงแล้ว + สร้าง `supabase/migration_2026-09-08_early-review.sql` (idempotent, ใช้ `create or replace function`/`drop ... if exists` ทั้งหมด) สำหรับรันแพตช์นี้กับ Supabase project ที่มีอยู่แล้ว (ตรวจสอบแล้วว่ารันสำเร็จบน live project จริงเมื่อ 2026-09-08)

### 2.4 ระบบลบ/ปิดใช้งาน — audit + เพิ่มจุดที่ขาด (ตัดสินใจ 2026-09-09)

**Audit พบ (2026-09-09):** จุดเดียวที่ลบได้ครบวงจรผ่าน UI เดิมคือรูปแนบ (`kaizen_attachments`, ผ่าน `deleteAttachment()`) ทั้งที่ RLS เปิดสิทธิ์ลบไว้แล้วอีกหลายจุดโดยไม่มี UI เรียกใช้เลย (`k_delete_own` ของ `kaizen_projects` สถานะ draft, `ep_delete_admin` ของ `evaluation_periods` สถานะ draft, ฯลฯ) และ `profiles` ไม่มี delete policy เลย (มีแต่ toggle `is_active`)

**มติ — เพิ่ม 3 จุด** (ใช้ RLS/column ที่มีอยู่แล้วทั้งหมด ไม่ต้องแก้ schema):
1. **`kaizenList.js`** — ปุ่ม "ลบร่าง" เฉพาะโครงการสถานะ `draft` ของตัวเอง (`k_delete_own`) — `deleteKaizen()` ใหม่ใน `api.js` ลบรูปแนบใน storage ก่อนแล้วค่อยลบแถว DB
2. **`adminUsers.js`** — ปุ่ม "ปิดใช้งาน" (toggle `is_active=false` ผ่าน `updateProfile()` เดิม [เปลี่ยนชื่อจาก `updateMyProfile()` วันที่ 2026-09-12 — Spec.md §4.8 backlog Low #4], ใช้ policy `profiles_update_admin` เดิม) ซ่อนปุ่มนี้สำหรับบัญชีตัวเอง (กันแอดมินปิดใช้งานตัวเอง)
3. **`adminPeriods.js`** — ปุ่ม "ลบ" เฉพาะรอบสถานะ `draft` (`ep_delete_admin`) — `deletePeriod()` ใหม่ใน `api.js`

**มติ — ตั้งใจไม่เพิ่ม:** ลบ `kaizen_projects` ที่ไม่ใช่ draft (เสี่ยงทำลายประวัติโครงการที่ตัดสิน/ประกาศผลแล้ว แม้ RLS จะเปิดให้ admin ทำได้), ลบ `committee_scores`/`kaizen_progress_updates` ตรงๆ (ถ้าคะแนนผิดควรแก้ไข ไม่ใช่ลบ), ลบ `audit_log` (ต้องคงไว้เป็น audit trail เสมอ), hard-delete `master_data` (soft-delete `is_active` ที่มีอยู่แล้วปลอดภัยกว่า เพราะโครงการเก่าอาจอ้างอิง code เดิม)

**บั๊กที่เจอระหว่างทำและแก้แล้ว:** `onActivate()` เดิมใน `adminUsers.js` set `Roles: ['employee']` ทุกครั้งที่กด "เปิดใช้งาน" — ถ้าปิดใช้งานคนที่เป็นกรรมการ/แอดมินแล้วเปิดใช้งานใหม่ผ่านลิสต์ "รออนุมัติเข้าใช้งาน" จะเสีย role เดิมทั้งหมด (เพราะบัญชีที่ถูกปิดใช้งานกับบัญชีสมัครใหม่ใช้เงื่อนไขเดียวกัน `is_active=false`) แก้เป็น fallback `Roles: ['employee']` เฉพาะกรณีที่ยังไม่มี role มาก่อนจริงๆ — ทดสอบ round-trip แล้ว (ปิด→เปิดใช้งานใหม่ role กรรมการ+committee role ยังอยู่ครบ)

### 2.5 Mobile UI redesign — navigation, animation, responsive tables, overflow audit (ตัดสินใจ 2026-09-10)

**โจทย์:** พนักงานส่วนใหญ่ใช้แอปนี้ผ่านมือถือเป็นหลัก (admin ยังใช้เดสก์ท็อปเป็นหลัก) แต่ mobile chrome เดิม (<760px) คือ sidebar ทั้งแท่งพลิกเป็นแถบบนสุดที่บีบโลโก้+เมนูไอคอนเลื่อนแนวนอน+ปุ่มผู้ใช้ไว้แถวเดียว ใช้นิ้วโป้งลำบาก และตารางข้อมูล (`.data-table`) ล้นขอบจอเพราะแค่ scroll แนวนอนโดยไม่มี hint ทำให้ badge สถานะ/คอลัมน์ท้ายโดนตัดขาดจากสายตา

**มติ 1 — Bottom tab bar + drawer แทน sidebar-as-topbar บนมือถือ** (ไม่แตะ desktop sidebar เลย):
- เมนูหลัก (dashboard/kaizen/review/leaderboard ตาม role) → `#mobile-tabbar` แถบล่างคงที่ (fixed), ปุ่มสุดท้าย "เมนู" เปิด `#mobile-drawer` แบบ bottom-sheet เก็บเมนู admin (periods/master/users/audit) + user info + lang toggle + logout
- Breakpoint เดิม 760px, role-based visibility logic เดิมไม่เปลี่ยน — `js/app.js`'s `renderChrome()` แตกเป็น `primaryItems`/`adminItems` สอง array ป้อนทั้ง desktop `#sidebar-nav` (output เหมือนเดิมทุกตัวอักษร) และ mobile chrome ใหม่พร้อมกัน
- Accessibility ครบ: `aria-expanded`, `inert`+`aria-hidden` ตอนปิด, คืน focus ตอนปิด drawer, Escape/click-outside-to-close (mirror `openLightbox`/`closeLightbox` เดิม)
- ผลข้างเคียงที่กันไว้ล่วงหน้า: `.wizard-actions`/`.sticky-actions { bottom:0 }` เดิมจะไปซ้อนใต้ bottom-tabbar พอดี → เพิ่ม `bottom: calc(var(--mobile-tabbar-h) + env(safe-area-inset-bottom))` เฉพาะใน media query มือถือ + เพิ่ม `main#app` padding-bottom ให้พอสำหรับทั้งสองชั้น

**มติ 2 — Animation แบบ CSS-only** (ไม่เพิ่ม library ใหม่): page-fade เข้าใหม่ทุกครั้งที่เปลี่ยนหน้า (`#app > * { animation: pageFadeIn }` — ใช้ได้เพราะทุก view ทำ `container.innerHTML = ...` สร้าง element ใหม่อยู่แล้ว ไม่ต้องแก้ `router.js`), drawer slide-up+fade, `button:active { transform:scale(0.96) }` ทั่วระบบ, lightbox fade-in อย่างเดียว (ปิดยัง instant เหมือนเดิม) — ทั้งหมดเคารพ `prefers-reduced-motion: reduce` (ปิด animation แต่คง end-state)

**มติ 3 — ตาราง (`.data-table`) แปลงเป็น card 1 คอลัมน์บนมือถือแทน horizontal-scroll** (เปลี่ยนใจจากแผนเดิมใน draft แรกที่ตั้งใจ "ไม่แตะ" เพราะเจอ overflow บั๊กจริงจากการทดสอบ — ดูรายละเอียด): markup `<table>/<tr>/<td>` และ JS event wiring เดิมไม่แตะเลย ใช้ `@media (max-width:760px)` สั่ง `display:block` บน table/tbody/tr/td, ซ่อน `<thead>`, ทำให้ `<tr>` เป็นการ์ดขอบมน มี margin, `<td>` เรียงแนวตั้งพร้อม `overflow-wrap:anywhere`, `<td>` ว่าง (`:empty`) ซ่อนไปเลย, `select`/`input` ในตารางเป็น `width:100%`, ย้าย dirty/attention/mine row tint จากระดับ `<td>` ไปทั้ง `<tr>` แทน (การ์ดจะได้สีทั้งใบ ไม่ใช่แถบสีแยกตามคอลัมน์) — ครอบคลุมทุกหน้าที่ใช้ `.data-table`: `adminUsers.js`, `adminMaster.js`, `adminPeriods.js`, `kaizenList.js`, `leaderboard.js`

**มติ 4 — audit overflow ทุกหน้าทุก role หลังพบบั๊กซ้ำๆ** (คำสั่ง "เช็คทุกๆหน้า ของทุกๆ rolls" 2026-09-10): พบ pattern เดิมซ้ำหลายครั้ง — flex/grid item ไม่มี `min-width:0` ทำให้ text ยาวไม่มีช่องว่าง (ชื่อโครงการ, อีเมล, ข้อความเกณฑ์ให้คะแนน) ดันแถวกว้างกว่า viewport, และ grid หลายจุด (`.two-col`, `.auth-shell`) ใช้ `minmax(340px,1fr)` โดยไม่มี mobile override ที่ยุบเหลือ `1fr` (มีแค่ `.detail-cols` ที่แก้ถูกไว้แต่แรก) แก้จุดที่พบทั้งหมดแบบ root-cause (ไม่ใช้ `overflow-x:hidden` ปิดบัง) — ดูรายละเอียดไฟล์/class ที่แก้ที่ §4.4

**Cache-busting gotcha ที่เจอระหว่างทำ:** `css/style.css`/`js/app.js` ใน `index.html` ใช้ query-string คงที่ (`?v=YYYYMMDD`) ไม่ใช่ dynamic hash ต่างจาก view import ที่ cache-bust ด้วย `?v=${Date.now()}` ใน `router.js` เอง — เวลาแก้ `style.css`/`app.js` ต่อจากที่เคย bump เลขไปแล้วในวันเดียวกัน **ต้อง bump เลขซ้ำอีกรอบ** (เช่น `20260910` → `20260910b` → `20260910c`) ไม่งั้น browser ที่เคย fetch URL เดิมไปแล้วจะไม่เห็นการแก้ไขรอบหลังเลย แม้โค้ดจะถูกต้องแล้วก็ตาม (เจอปัญหานี้จริงระหว่าง session นี้ — ผู้ใช้รายงานว่า "ยังขึ้น version เดิม" ทั้งที่ CSS แก้ไปแล้ว) — เช่นเดียวกัน `js/app.js` เอง import `i18n.js` แบบ static ด้วย version string คงที่ (`import ... from './i18n.js?v=...'`) เวลาแก้ `i18n.js` ต้อง bump version ใน import line นั้นด้วย ไม่ใช่แค่ตัว `i18n.js` เอง

**มติ 5 — ปุ่ม "+" เสนอ KAIZEN ใหม่กลางแถบ + icon-only style (2026-09-10 บ่ายแก่)** — ผู้ใช้ส่งภาพตัวอย่าง bottom nav ของ Instagram (ไอคอนล้วนไม่มี label, ปุ่ม "+" กลางแถบมีกรอบเหลี่ยมมนล้อม, ไอคอนสุดท้ายเป็นรูปโปรไฟล์) แล้วขอปรับ `#mobile-tabbar` ให้เป็นสไตล์นี้ — ถามผู้ใช้ก่อนว่าปุ่ม "+" ที่เห็นในภาพจะแค่ปรับสไตล์ (ยังกดเข้า "เมนู"/"โครงการของฉัน" เดิม) หรือเป็นฟีเจอร์ใหม่จริงสำหรับสร้างโครงการ — ผู้ใช้ยืนยันว่าอยากได้ปุ่ม "+" เป็นฟีเจอร์ใหม่จริงสำหรับ "เสนอ KAIZEN ใหม่" (`#/kaizen/new`)
- **Label ของ `.tabbar-link` ซ่อนด้วย CSS `clip`/sr-only แทนการลบออกจาก markup** — ยังอ่านได้ผ่าน screen reader/accessibility tree เหมือนเดิม (ตรวจสอบผ่าน `take_snapshot` แล้วว่า accessible name ยังถูกต้องแม้ label หายไปจากตา)
- **ปุ่ม "+"** — แทรกกลาง `primaryItems` ที่ตำแหน่ง `Math.ceil(primaryItems.length/2)` (ปรับ index อัตโนมัติตามจำนวนเมนูหลักของแต่ละ role ให้อยู่ค่อนกลางแถบเสมอ) แสดงเฉพาะ role ที่สร้างโครงการได้จริง (ตอนเขียนตอนนี้คือ `employee`/`admin` เท่านั้น — **ต่อมาวันที่ 2026-09-11 เปิดให้ `committee` สร้างโครงการได้ด้วยเช่นกัน ดู §2.8** — เงื่อนไขจึงกลายเป็น `employee || committee || admin` แล้ว ปุ่มนี้โผล่ให้กรรมการล้วนด้วย)
- **ไอคอนสุดท้าย ("เมนู")** — เปลี่ยนจากไอคอนแฮมเบอร์เกอร์เป็น avatar ตัวอักษรย่อชื่อผู้ใช้ (`initials()` เดิมจาก `js/ui.js`) mirror รูปโปรไฟล์ท้ายแถบของ Instagram — ฟังก์ชันเดิมไม่เปลี่ยน (ยังกดเปิด drawer เหมือนเดิม, `aria-label` คงไว้ให้ screen reader อ่านว่า "เมนู")
- Reuse `tabLink()` เดิมทั้งหมด (เพิ่มแค่ param `extraClass` ให้ปุ่ม "+" ได้ class `.tabbar-create` สำหรับสไตล์กรอบ) ไม่มี component ใหม่แยก, ไม่กระทบ desktop sidebar (`navLink()`/`#sidebar-nav`) หรือ drawer list (`#mobile-drawer-nav` ยังใช้ label ตัวหนังสือปกติ เพราะเป็น menu list ไม่ใช่ icon bar)

**มติ 6 — ย้าย "ตรวจให้คะแนน" จากแถบล่างไปไว้ใน "เมนู" ให้เหลือ 5 ปุ่มพอดี (2026-09-10 เย็น)** — หลังเพิ่มปุ่ม "+" แล้วแถบล่างของ role ที่มีครบ (admin หรือ employee+committee) มีถึง 6 ปุ่ม (แดชบอร์ด/โครงการของฉัน/+/ตรวจให้คะแนน/ผลการประเมิน/เมนู) แน่นเกินไปสำหรับนิ้วโป้ง — ผู้ใช้เลือกย้าย "ตรวจให้คะแนน" ออกไปอยู่ใน drawer แทน (ถามเป็นตัวเลือกชัดเจนก่อนว่าจะย้ายอันไหน เพราะข้อความต้นฉบับพิมพ์ไม่ครบ)
- `renderMobileChrome()` กรอง `primaryItems` (ที่ desktop render ไปแล้วแบบเดิมทุกตัวอักษรก่อนหน้านี้) แยกเป็น `tabbarItems` (ตัด `#/review` ออก) กับ `drawerExtraItems` (เอาเฉพาะ `#/review`) — เฉพาะฝั่งมือถือเท่านั้น ไม่กระทบ `adminItems`/desktop sidebar เลย
- `#mobile-drawer-nav` render จาก `[...drawerExtraItems, ...adminItems]` แทนที่จะเป็น `adminItems` เดี่ยวๆ — กรรมการที่ไม่ใช่ admin (ก่อนหน้านี้ drawer ของกลุ่มนี้ว่างเปล่าไม่มีลิงก์เลยเพราะ `adminItems` เป็น `[]`) ตอนนี้เห็น "ตรวจให้คะแนน" ใน drawer แทน
- ผลลัพธ์ตาม role (ตรวจด้วย logic trace เพราะไม่มีบัญชีทดสอบ committee/admin ให้ล็อกอินสด — รอผู้ใช้ยืนยันซ้ำด้วยบัญชีจริง): admin/employee+committee → แถบล่าง 5 ปุ่ม (แดชบอร์ด, โครงการของฉัน, +, ผลการประเมิน, เมนู), committee ล้วน → แถบล่าง 3 ปุ่ม (แดชบอร์ด, ผลการประเมิน, เมนู) + "ตรวจให้คะแนน" ใน drawer, employee ล้วน → ไม่เปลี่ยนแปลง (ไม่เคยมี "ตรวจให้คะแนน" อยู่แล้ว)

### 2.7 รูปโปรไฟล์ (avatar) — สมัครสมาชิก + แสดงทั้งระบบ (ตัดสินใจ 2026-09-10 ค่ำ)

**โจทย์:** ผู้ใช้ถามว่าเพิ่มรูปตอนลงทะเบียนได้ไหม — ตรวจโค้ดพบว่า `profiles.avatar_path` มีคอลัมน์เตรียมไว้ตั้งแต่ schema แรกแล้ว (comment เดิมบอกตรงๆ ว่า "ยังไม่มี bucket/policy ของตัวเอง — เพิ่มทีหลัง") แต่ทั้งแอประบบยังไม่มีจุดไหนโชว์รูปจริงเลย ใช้ตัวย่อชื่อ (`initials()`) ล้วน — ถามผู้ใช้ก่อนว่าจะทำแค่ "เก็บรูปตอนสมัคร" หรือ "เต็มรูปแบบ" (โชว์รูปจริงแทนตัวย่อชื่อทุกจุดที่มีอยู่) ผู้ใช้เลือกเต็มรูปแบบ

**สถาปัตยกรรม:**
- **Storage bucket ใหม่ `avatars`** (private, ไม่ public) — path convention `{user_id}/avatar` **ไฟล์เดียวต่อคน ไม่มีนามสกุลต่อท้าย** (ต่างจาก `kaizen-photos` ที่มีหลายไฟล์/โครงการ ใช้ uuid+ext) อัปโหลดทับด้วย `upsert:true` เก็บ mime type ผ่าน `contentType` แทนการพึ่งนามสกุลไฟล์ — ไม่ต้องลบไฟล์เก่าก่อนอัปโหลดใหม่ ไม่มีไฟล์กำพร้าสะสม
- **RLS ต่างจาก kaizen-photos ตรงที่ read policy เปิดกว้างกว่า**: `avatars_read` ให้ `authenticated` ทุกคนอ่านได้ (ไม่ใช่แค่เจ้าของ) เพราะ avatar ต้องโชว์ให้คนอื่นเห็นด้วย (adminUsers.js, adminAudit.js) — insert/update/delete จำกัดด้วย `(storage.foldername(name))[1] = auth.uid()::text` (โฟลเดอร์ต้องตรงกับ user id ตัวเอง)
- ยืนยันด้วยการทดสอบสดว่า **session พร้อมใช้งานทันทีหลัง `signUp()`** (ไม่ต้องรอ confirm email สำหรับ Supabase project นี้) จึง upload avatar ในขั้นตอนเดียวกับการสมัครได้เลย ไม่ต้องแยกเป็น step ทีหลัง
- ยืนยันด้วยการอ่าน `guard_profile_fields()` trigger เดิมว่า `avatar_path` ไม่อยู่ใน allow-list ที่บล็อกการแก้ไขตัวเอง (บล็อกแค่ `employee_id/department/plant/roles/committee_role/is_active`) — ผู้ใช้ที่เพิ่งสมัคร (`is_active=false`) แก้ `avatar_path` ตัวเองได้ทันทีตาม `profiles_update_self` policy เดิม ไม่ต้องแก้ RLS เพิ่ม
- `js/api.js`: `uploadAvatar(userId, file)`, `getAvatarSignedUrl(path)` (signed URL 1 ชม. — pattern เดียวกับ `getAttachmentSignedUrl` ของ kaizen-photos)
- `js/ui.js`: ย้าย `resizeImage()` (ย่อรูป+ลบ EXIF/GPS ผ่าน canvas) จากที่เคยเป็น local function ใน `kaizenForm.js` มาเป็น shared export — ใช้ร่วมกันทั้งรูปโครงการและรูปโปรไฟล์แล้ว; เพิ่ม `hydrateAvatars(root, getSignedUrl)` ใหม่ — **progressive enhancement**: markup เดิมยังคง render ตัวย่อชื่อผ่าน `escapeHtml(initials(...))` เหมือนทุกที่ในระบบ แค่เพิ่ม attribute `data-avatar-path` ตอนมี `AvatarPath` แล้วเรียกฟังก์ชันนี้หลัง render เพื่อสลับเป็น `<img>` — ถ้ารูปโหลดไม่สำเร็จ (signed url หมดอายุ/network) ตัวย่อชื่อเดิมยังอยู่เป็น fallback อัตโนมัติ ไม่ต้องเขียน error state แยก; รับ `getSignedUrl` เป็น param (dependency injection) กัน `ui.js` ผูกกับ `api.js` ตรงๆ ตามสถาปัตยกรรมเดิมที่ `ui.js` import แค่ `constants.js`
- จุดที่โชว์รูปจริงได้ (มี `profiles` row อ้างอิงตรง): `js/app.js` (sidebar-user + bottom-tabbar avatar), `js/views/adminUsers.js` (การ์ดรออนุมัติ + แถวตาราง), `js/views/adminAudit.js` (avatar คนทำรายการ — เพิ่ม `avatarPathOf()` คู่กับ `nameOf()` เดิม), `js/views/kaizenForm.js` (การ์ดผู้เสนอขั้น 1)
- **จุดที่ตั้งใจ "ไม่" แก้ — ยังโชว์ตัวย่อชื่อเหมือนเดิม**: `kaizenDetail.js`/`reviewScore.js` ส่วนรายชื่อทีมงาน (`team_members`) เพราะ field นี้เป็น **jsonb snapshot ของชื่อ ณ ตอนส่งโครงการ** (`{employee_id, full_name}`) ไม่ได้ join กับ `profiles` จริง จึงไม่มี `avatar_path` ให้ใช้ — ต้อง query เพิ่มด้วย `employee_id` ถึงจะได้ (ทำได้ในอนาคตถ้าต้องการ แต่ไม่อยู่ใน scope รอบนี้)
- `js/views/register.js`: เพิ่มช่องเลือกรูปโปรไฟล์ (ไม่บังคับ, ปุ่ม + preview วงกลม, placeholder เป็นไอคอนคนตอนยังไม่เลือก) — อัปโหลดเป็น **best-effort หลัง `signUp()` สำเร็จ** ห่อด้วย try/catch แยกจาก flow สมัครหลัก: อัปโหลดรูปไม่สำเร็จไม่บล็อกการสมัคร (ทดสอบแล้วจริงตอน bucket ยังไม่มี — ได้ 400 `NoSuchBucket` จาก Storage API แต่หน้าสมัครยัง success/redirect ปกติ ไม่มี error โผล่ให้ผู้ใช้เห็นเลย)

**Migration:** ไฟล์ `supabase/migration_2026-09-10_avatars.sql` ใหม่ (เพิ่ม bucket + 4 policies เท่านั้น ไม่ต้อง `alter table` เพราะคอลัมน์มีอยู่แล้ว) — **ยังไม่ได้รันบน live Supabase project** ต้องรันก่อนฟีเจอร์นี้จะทำงานได้จริง (ตอนนี้ทดสอบแล้วว่า client-side โค้ดถูกต้องทั้งหมด รอแค่ bucket)

**ทดสอบแล้ว (2026-09-10):** สมัครสมาชิกจริงพร้อมแนบรูป (ผ่าน `upload_file` บน `<input type="file">` ที่ซ่อนไว้) → เห็น preview วงกลมเปลี่ยนเป็นรูปที่เลือกทันที → submit → เครือข่ายยืนยันตรงตามคาด: `POST storage/v1/object/avatars/{id}/avatar` → `400 NoSuchBucket` (เพราะยังไม่รัน migration) → สมัครสำเร็จปกติ ไม่มี error โผล่ (best-effort ทำงานถูกต้อง) → redirect ไป login ตามปกติ; ตรวจ request body ยืนยันว่า `resizeImage()` แปลงไฟล์เป็น JPEG ก่อนอัปโหลดจริง; ตรวจ `js/ui.js`/`js/api.js`/`js/views/kaizenForm.js` โหลดผ่าน dynamic import ไม่มี syntax/resolve error หลังย้าย `resizeImage` เป็น shared export — **ยังไม่ได้ทดสอบภาพจริงแสดงผลในระบบ** (ต้องรอรัน migration ก่อน ถึงจะมีบัญชีที่มี `avatar_path` จริงให้ตรวจ `hydrateAvatars()` end-to-end)

### 2.8 กรรมการสร้าง/เห็นโครงการ KAIZEN ได้เหมือนพนักงาน (ตัดสินใจ 2026-09-11)

**โจทย์:** ผู้ใช้ต้องการให้กรรมการ (committee) มีสิทธิ์เห็น/สร้างโครงการ KAIZEN ของตัวเองได้เหมือนพนักงาน — ตรวจโค้ดพบว่า RLS ทุก policy ของ `kaizen_projects` (`k_insert_own`/`k_update_own`/`can_write_kaizen`/`can_track_progress`) เช็คแค่ `owner_id = auth.uid()` และสถานะ ไม่เคยผูกกับ `roles` เลย — ข้อจำกัด "เฉพาะพนักงาน" เดิมเป็นแค่ที่ `router.js` (route guard) และเช็ค role ใน UI (`canPropose`/`canCreate`) เท่านั้น จึงแก้ได้โดยไม่ต้องแตะ schema/RLS เลย

**มติ — เพิ่ม `committee` เข้าเงื่อนไขเดิมทุกจุดที่เคยเช็คแค่ `employee`/`admin`:**
- `js/router.js`: `#/kaizen/new`, `#/kaizen/:id/edit`, `#/kaizen/:id/progress` เพิ่ม role `committee`
- `js/app.js`: badge `needRevision` ในฟังก์ชัน `computeBadges()`, เมนู "โครงการของฉัน" ใน `primaryItems`, ปุ่ม "+" กลางแถบมือถือ (`canCreate` ใน `renderMobileChrome()`)
- `js/views/dashboard.js`: `canPropose`
- `js/views/kaizenList.js`: `canCreate`
- `kaizenDetail.js`/`kaizenProgress.js`/`kaizenForm.js` ไม่ต้องแก้ — ใช้เช็คความเป็นเจ้าของ (`isOwner`/`owner_id`) อยู่แล้ว ไม่เคยเช็ค role ตรงๆ

**ผลข้างเคียงที่พบและแก้ทันที — กรรมการให้คะแนนโครงการตัวเอง:** `getReviewQueue()`/`getOrCreateMyScore()`/`cs_insert_self` ไม่เคยกันเจ้าของโครงการออกจากการให้คะแนนโครงการตัวเองเลย (ไม่เคยเป็นปัญหาจริงมาก่อนเพราะกรรมการมักไม่ใช่คนส่งโครงการ) — พอเปิดให้กรรมการสร้างโครงการได้แล้ว ความเสี่ยงนี้จะเกิดขึ้นจริงบ่อยขึ้น ถามผู้ใช้ก่อนว่าจะกันระดับไหน — **เลือก "โชว์แต่ปิดปุ่มให้คะแนน" (UI-level เท่านั้น ไม่แก้ RLS/RPC)**:
- `js/views/reviewQueue.js`: การ์ดโครงการของตัวเองในคิว โชว์ label "โครงการของคุณเอง" + ปุ่ม disabled "ให้คะแนนไม่ได้" แทนปุ่มให้คะแนนปกติ
- `js/views/reviewScore.js`: เช็ค `kaizen.OwnerId === session.user.id` **ก่อน** เรียก `getOrCreateMyScore()` (กันไม่ให้สร้างแถว draft score ค้างสำหรับโครงการตัวเอง) — ถ้าตรงเงื่อนไข โชว์ `stateCard` อธิบายเหตุผลแทนฟอร์มให้คะแนน พร้อมปุ่มกลับไปคิวตรวจ — กันเส้นทาง "พิมพ์ URL ตรง" ที่ปุ่ม disabled ในคิวเข้าไม่ถึง
- **หมายเหตุ:** เป็นการกันระดับ UI เท่านั้นตามที่ผู้ใช้เลือก — RLS/`cs_insert_self`/`submit_score` RPC ยังไม่มีการกันระดับ backend เลย (ทำได้ในอนาคตถ้าต้องการความเข้มงวดกว่านี้ — ยังไม่อยู่ใน scope รอบนี้)

**ทดสอบแล้ว (2026-09-11):** บัญชี employee-only เดิม (ไม่มี committee role) ทดสอบ regression ผ่าน browser จริง — เมนู/ปุ่มสร้างโครงการ, route `#/kaizen/new` ยังใช้งานได้ปกติทุกอย่างเหมือนก่อนแก้ (การเพิ่ม `committee` เป็น additive ไม่กระทบ employee-only) — **ยังไม่ได้ทดสอบสดด้วยบัญชี committee ล้วน** (ไม่มีบัญชีทดสอบที่มี committee role ให้ล็อกอิน) ตรวจด้วย logic trace แทนว่าเงื่อนไข role ทุกจุดครอบคลุมถูกต้อง

### 2.9 ยกน้ำหนักกรรมการที่ให้คะแนนโครงการตัวเองไม่ได้ไปให้ role Director (ตัดสินใจ 2026-09-11)

**โจทย์ต่อเนื่องจาก §2.8:** พอกรรมการสร้างโครงการของตัวเองได้แล้ว และถูกกันไม่ให้ให้คะแนนโครงการตัวเอง (conflict of interest) — น้ำหนักคะแนนส่วนของกรรมการคนนั้น (เช่น 20%) จะหายไปจากการคำนวณ `weighted_score` ของโครงการนั้นโดยเฉพาะ ทำให้คะแนนเต็มของโครงการนั้นไปไม่ถึง 100 แม้กรรมการที่เหลือให้เต็มทุกคน — ผู้ใช้ให้มติว่ายกน้ำหนักส่วนที่หายไปนี้ไปเพิ่มให้กรรมการที่มี committee_role = **Director** แทนโดยอัตโนมัติ

**กลไก — ปรับที่ `v_kaizen_results` (DB view) เท่านั้น ไม่แตะ `evaluation_periods.committee_weights` จริง:**
- ฟังก์ชันใหม่ `committee_weight_for_kaizen(period_id, kaizen_owner_id, committee_user_id)` คำนวณ "น้ำหนักที่ใช้จริง" ต่อโครงการหนึ่งอัน: เริ่มจากน้ำหนักฐานของกรรมการคนนั้นจาก `committee_weights` แล้วเช็คว่าเจ้าของโครงการเป็นกรรมการของรอบเดียวกันหรือไม่ — ถ้าใช่ ยกน้ำหนักของเจ้าของไปให้กรรมการที่มี `committee_role='director'` ของรอบนั้น (ไม่นับตัวเจ้าของเองแม้เจ้าของจะเป็น director ก็ตาม) หารเฉลี่ยถ้ามี director มากกว่า 1 คน
- `v_kaizen_results.weighted_score`/`rank_overall` เปลี่ยนจากอ่าน `committee_weights` ตรงๆ มาเรียกฟังก์ชันนี้แทน — เฉพาะโครงการที่เจ้าของเป็นกรรมการของรอบเดียวกันเท่านั้นที่ผลจะต่างจากเดิม โครงการอื่นคำนวณเหมือนเดิมทุกอย่าง
- **ไม่แก้ค่า `committee_weights` ที่เก็บไว้จริง** — หน้าตั้งน้ำหนักกรรมการ (`adminPeriodDetail.js`) และเงื่อนไข "ผลรวมต้อง 100%" ตอนเปิดรอบ (`open_period()`) ยังคงเดิมทุกอย่าง เพราะเป็นแค่การปรับตอนคำนวณคะแนนต่อโครงการ ไม่ใช่แก้ข้อมูล assignment ของรอบ

**Edge case ที่ตั้งใจไม่จัดการ (น้ำหนักจะหายไปเหมือนเดิม ไม่ยกให้ใคร) — ต้องรู้ไว้:**
1. ถ้ารอบนั้นไม่มีใครมี committee_role = director เลย (หรือ director ไม่ได้ถูกใส่เป็นกรรมการของรอบนั้น) — ไม่มีคนรับน้ำหนักที่ยกมา
2. ถ้าเจ้าของโครงการ**คือ** director ของรอบนั้นเอง — ไม่ยกน้ำหนักให้ตัวเอง (กันไม่ให้ตัวเองรับน้ำหนักตัวเองที่ยกมา) และไม่มี director คนอื่นให้ยกไปแทนในกรณีนี้

ทั้งสองเคสนี้ไม่ถือเป็นบั๊ก แต่เป็นพฤติกรรม fallback ที่ตั้งใจ (เหมือนพฤติกรรมก่อนแก้ฟีเจอร์นี้) — ถ้าในทางปฏิบัติเกิดขึ้นบ่อย (เช่น director เป็นคนที่มักส่งโครงการเองด้วย) ค่อยกลับมาคุยเพิ่มเติมได้

**ไฟล์ที่แก้:**
- `supabase/schema.sql` — เพิ่มฟังก์ชัน `committee_weight_for_kaizen()`, แก้ `v_kaizen_results` ให้เรียกใช้แทนการอ่าน `committee_weights` ตรงๆ
- `supabase/migration_2026-09-11_director-weight-redistribution.sql` (ใหม่) — diff สำหรับ project ที่มีอยู่แล้ว (`create or replace function`/`create or replace view`, idempotent)
- **ไม่มีการแก้ JS/UI ใดๆ เลย** — `leaderboard.js`/`adminPeriodDetail.js` อ่านผล `weighted_score`/`rank_overall` จาก view เดิมอยู่แล้วผ่าน `getResults()` ค่าที่ได้จะถูกต้องอัตโนมัติทันทีที่รัน migration โดยไม่ต้องแก้โค้ด client เลย

**สถานะ:** เขียน SQL แล้ว ตรวจ syntax/logic ด้วยมือ (ไม่มี local Postgres/Docker ให้รันทดสอบจริงในเครื่องนี้) — **ยังไม่ได้รันบน live Supabase project และยังไม่ได้ทดสอบด้วยข้อมูลจริง** ต้องรัน `migration_2026-09-11_director-weight-redistribution.sql` ก่อน แล้วทดสอบจริง: ตั้ง period ที่มีกรรมการ (รวม director) คนหนึ่งเป็นเจ้าของโครงการด้วย ให้คะแนนจากกรรมการที่เหลือครบ แล้วเทียบ `weighted_score` ที่ leaderboard/adminPeriodDetail กับค่าที่คำนวณมือว่าน้ำหนักถูกยกไปให้ director ถูกต้องจริง

### 2.11 ประกาศผล Top 3 รางวัลใหญ่บน dashboard (ตัดสินใจ 2026-09-11 ค่ำ)

**โจทย์ต่อเนื่องจากเครื่องมือเปรียบเทียบ Top 3 ข้ามรอบใน B15:** เครื่องมือเดิมเป็นแค่ admin เปิดดูเองในเบราว์เซอร์ตัวเอง ไม่มีทางที่พนักงานทั่วไปจะเห็นผลลัพธ์เลย — ถามผู้ใช้ว่าจะให้พนักงานเห็นผลไหม ผู้ใช้เลือกให้ขึ้น banner บน dashboard

**สถาปัตยกรรม:** เพิ่มตารางใหม่ `quarterly_awards` (id, label, period_ids jsonb, winners jsonb, published_at, created_by) — **ตั้งใจ snapshot ข้อมูลตอนประกาศ ไม่คำนวณสดเหมือน `v_kaizen_results`** เพื่อกันผลที่ประกาศไปแล้วเปลี่ยนย้อนหลังถ้ามีคนแก้ไขข้อมูลโครงการ/โปรไฟล์ทีหลัง (คนละ trade-off กับ leaderboard ปกติที่ยอมรับการคำนวณสดตาม B5 — อันนี้คือ "ประกาศทางการ" ควร freeze) — `winners` jsonb เก็บ `KaizenId`/`Rank`/`WeightedScore` **พร้อมชื่อ/โครงการ ณ ตอนประกาศ** (`OwnerName`/`OwnerEmployeeId`/`KaizenTitle`/`KaizenCode`) ไปด้วยเลย ไม่ใช่แค่ id — กัน dashboard.js ต้อง query เพิ่มตอนโชว์ banner และกันชื่อเปลี่ยนไปตามข้อมูลปัจจุบันถ้ามีคนแก้ทีหลัง

RLS: อ่านได้ทุกคนที่ login แล้ว (`using (true)` — เป็นประกาศสาธารณะ) เขียน/ลบเฉพาะ admin ไม่มี update policy (แก้ไม่ได้ ผิดแล้วต้องลบแล้วประกาศใหม่ ตรงไปตรงมากว่า)

**ไฟล์ที่แก้:**
- `supabase/schema.sql` — เพิ่มตาราง `quarterly_awards` + RLS (`qa_read`/`qa_insert_admin`/`qa_delete_admin`)
- `supabase/migration_2026-09-11_quarterly-awards.sql` (ใหม่) — diff สำหรับ project ที่มีอยู่แล้ว
- `js/api.js` — เพิ่ม `getQuarterlyAwards()`, `createQuarterlyAward()`, `deleteQuarterlyAward()`
- `js/views/adminPeriods.js` — ต่อจากผลเปรียบเทียบ Top 3 เดิม (B15) เพิ่มช่องตั้งชื่อประกาศ + ปุ่ม "ประกาศผลรางวัลนี้" + list "ประวัติรางวัลที่ประกาศแล้ว" พร้อมปุ่มลบ (admin จัดการเองได้ถ้าประกาศผิด)
- `js/views/dashboard.js` — ดึงรางวัลล่าสุด (`getQuarterlyAwards()[0]`) มาโชว์เป็นการ์ด banner สีเน้นด้านบนสุดของหน้า (เหนือ "ต้องทำก่อน") ถ้ามี — ไม่มีก็ไม่โชว์อะไรเลย ไม่บล็อกหน้าถ้า query ล้มเหลว (bucket/table ยังไม่มีตอนทดสอบก็ไม่กระทบหน้าอื่น)

**บั๊กที่เจอระหว่างทดสอบและแก้แล้ว:** ตอน edit `dashboard.js` ครั้งแรกเผลอทิ้ง fragment เก่า (`` ` ``, `return;`, `}`) ค้างไว้หลังจุดที่แก้ ทำให้ template literal เปิดค้างไปกิน syntax ส่วนที่เหลือของไฟล์แบบเงียบๆ (`node --check` ผ่านปกติเพราะ backtick ที่ค้างไปจับคู่กับ backtick อื่นในไฟล์พอดี ไม่ error แต่ runtime พัง) — เจอจาก `Uncaught (in promise)` ตอนทดสอบสดใน browser และหน้า dashboard ว่างเปล่า แก้โดยลบ fragment ที่ค้างทิ้ง ทดสอบซ้ำแล้วหน้าโหลดปกติ — เตือนตัวเองว่า `node --check` ไม่พอสำหรับ template-literal bug ประเภทนี้ ต้องทดสอบ runtime จริงด้วยเสมอ

**ทดสอบแล้ว (2026-09-11):** โหลด dashboard ด้วยบัญชี employee จริงหลังแก้บั๊กแล้ว — ไม่มี console error, หน้าโหลดครบทุก section ปกติ, banner ไม่โชว์ (ถูกต้อง เพราะยังไม่ได้รัน migration ตารางยังไม่มี ตกไป catch แล้วแค่ไม่แสดงอะไร) — `adminPeriods.js` โหลดผ่าน dynamic import ไม่มี error

**ยังไม่ได้ทดสอบ (รอรัน migration + ต้องมีบัญชี admin):** รัน `migration_2026-09-11_quarterly-awards.sql` แล้วประกาศรางวัลจริงจากหน้า admin ว่าขึ้น banner บน dashboard ถูกต้องตามที่ตั้งใจ, ลบประกาศแล้ว banner หายไปจริง

**บั๊กจริงที่เจอเพิ่มหลัง deploy (2026-09-11, จากผู้ใช้จริงบน iOS Simulator ไม่ใช่ระหว่าง dev):** ผู้ใช้เปิด dashboard ใน Simulator แล้วเจอหน้าว่างเปล่าสนิท (แม้แต่ header ก็ไม่ขึ้น) — เช็ค console ผ่าน Safari Web Inspector เจอ `SyntaxError: Importing binding name 'getQuarterlyAwards' is not found` ที่ `router.js:108` สาเหตุคือ **`js/views/*.js` ทุกไฟล์ import `../api.js`/`../ui.js`/`../i18n.js`/`../router.js`/`../constants.js`/`../config.js` โดยไม่มี cache-busting query string เลยมาตั้งแต่ต้น** (ต่างจาก `app.js` เองที่ cache-bust ทุก import ของตัวเองแล้ว) — `router.js`'s `?v=${Date.now()}` ทำให้ตัว view module (เช่น `dashboard.js`) โหลดสดเสมอ แต่ไฟล์ที่ view นั้น import ต่อ (เช่น `api.js`) อาจยังเป็นก้อนที่ browser cache ไว้จากก่อนหน้า — พอ `api.js` มีการเพิ่ม export ใหม่ (`getQuarterlyAwards` ของฟีเจอร์นี้) แต่ browser ของผู้ใช้ยังถือ `api.js` เวอร์ชันเก่าที่ไม่มี export นี้อยู่ การ import ของ `dashboard.js` เวอร์ชันใหม่จึงล้มเหลวทันที (ทั้งที่ตัว `dashboard.js` เองโหลดสดถูกต้องแล้ว)

**แก้แบบระบบ ไม่ใช่แค่จุดเดียว:** เพิ่ม `?v=20260911` ให้ทุก cross-module import ที่เคยไม่มี — ทุกไฟล์ใน `js/views/*.js` (65 จุด, แก้ด้วย `sed` เพราะ pattern เหมือนกันหมด) รวมถึง `ui.js`→`constants.js` และ `api.js`→`config.js` ที่พลาดจุดเดิมเหมือนกัน — ใช้ version tag เดียวกันทั้งหมดเพื่อให้ bump ทีเดียวจำง่าย (ดู CLAUDE.md อัปเดตกติกานี้ไว้แล้ว) ทดสอบยืนยันผ่าน `list_network_requests` ว่าทุกไฟล์ (`api.js`/`ui.js`/`i18n.js`/`router.js`/`constants.js`/`config.js`) โหลดด้วย URL ที่มี `?v=20260911` จริง และ dashboard โหลดสำเร็จไม่มี error อีก

**บั๊ก infra จริงอีกจุด (2026-09-11) — avatars bucket "มีแถวในตาราง แต่ Storage service ไม่รู้จัก":** หลังผู้ใช้ยืนยันว่ารัน `migration_2026-09-10_avatars.sql` แล้ว ทดสอบสมัครสมาชิกจริงพร้อมรูปกลับยังไม่มี `avatar_path` ถูกบันทึก — สืบไปเจอว่า `client.storage.from('avatars').upload(...)` คืน error **"Bucket not found"** ทั้งที่ `getAvatarSignedUrl()` (อ่าน) คืน "Object not found" (แปลว่า bucket มีอยู่) — พิสูจน์เพิ่มด้วยการ upload ไปที่ `kaizen-photos` (bucket เดิมที่ใช้งานได้ปกติ) ด้วย path มั่ว ได้ error "new row violates row-level security policy" (ผ่าน RLS check ไปแล้ว ถูกต้องตามที่ควร) ต่างจาก avatars ที่ค้างอยู่ก่อนถึงชั้น RLS เลย — สรุปว่า **`insert into storage.buckets` ตรงๆ ผ่าน SQL สร้างแถวในตาราง Postgres ได้ แต่ Storage service ของ Supabase (คนละ service กับ Postgres โดยตรง) ไม่ได้ sync/รู้จัก bucket นั้นสำหรับ endpoint upload** (อ่าน/sign ผ่านได้เพราะ check คนละชั้น) — ยืนยันจาก Supabase Dashboard → Storage: bucket `avatars` ไม่ปรากฏในลิสต์เลยทั้งที่มีแถวในตาราง และ Policies tab ของ bucket นี้ก็โชว์ "No policies created yet" (ทั้งที่ migration สร้าง policy ไว้แล้ว) แก้โดยให้ผู้ใช้**สร้าง bucket ผ่านหน้า Dashboard โดยตรง** (Storage → New bucket → ตั้งชื่อ `avatars`, private) แล้วรัน SQL policy ส่วนที่เหลือ (`avatars_read/insert/update/delete`) ซ้ำอีกครั้ง — หลังจากนั้นอัปโหลดสำเร็จและแสดงผลถูกต้องทันที **บทเรียน: สร้าง Storage bucket ใหม่ในโปรเจกต์นี้ทีหลัง ควรสร้างผ่าน Dashboard/Storage API เสมอ ไม่ควร `insert into storage.buckets` ตรงๆ ผ่าน SQL editor อีก แม้จะดูเหมือนทำงานได้ (แถวถูกสร้างจริง) เพราะ Storage service อาจไม่ sync ตาม**

### 2.12 นำ design tokens จาก apple.design.md มาปรับ UI (ตัดสินใจ 2026-09-11)

**โจทย์:** ผู้ใช้ส่งไฟล์ `apple.design.md` (DESIGN.md spec ของ apple.com — สี/ตัวอักษร/radius/shadow/component ของเว็บการตลาด Apple) ขอให้เอามาปรับ UI ของแอป — ไฟล์นี้ออกแบบมาสำหรับเว็บโชว์สินค้า (photography-first, tile เต็มจอสลับสีอ่อน/เข้ม, hero รูปสินค้า) ซึ่ง**ไม่เข้ากับโครงสร้างแอปธุรกิจของเรา** (ฟอร์ม/ตาราง/dashboard, sidebar+bottom-tabbar ที่เพิ่งสร้างทั้งวัน) — ถามผู้ใช้ก่อนเรื่องขอบเขต เลือก **"ดึงแค่ token มาปรับ"** (สี/ตัวอักษร/radius/shadow) ไม่แตะโครงสร้างหน้า/layout

**Token ที่นำมาปรับใน `css/style.css` `:root`:**
- `--primary`: `#047857` (เขียว) → `#0066cc` (Apple Action Blue) — **เฉพาะสี action** (ปุ่ม/ลิงก์/focus) เท่านั้น **ไม่แตะสีสถานะ** (`--danger`/`--warning`/`--info`/`--violet`/`--st-*`/`--brand`) เพราะเป็นคนละหน้าที่ (semantic status ไม่ใช่ interactive accent) — `--primary-hover`/`--primary-soft`/`--primary-line` คำนวณเฉดน้ำเงินใหม่ตามให้เข้าชุด
- `--radius-sm/--radius/--radius-lg`: `3/4/5px` → `6/8/14px` (ปรับมนขึ้นตามความรู้สึก Apple แม้จะย้อนกับที่เคยตั้งใจ "ให้มนน้อยกว่าเดิม" ไว้ก่อนหน้านี้ — เป็นการเปลี่ยนทิศทางดีไซน์ที่ตั้งใจตามคำขอรอบนี้)
- เพิ่ม `--radius-pill: 9999px` ใหม่ — ใช้กับ base `button {}` (ครอบคลุมปุ่มหลัก/`.secondary`/`.ghost`/`.danger`/`.icon-btn`/`.is-sm` ทั้งหมดเพราะไม่มีใครประกาศ `border-radius` ทับเอง) ได้ปุ่มทรง pill แบบ Apple ทันที — `.icon-btn` (44×44 สี่เหลี่ยม) กลายเป็นวงกลมสมบูรณ์พอดี ตรงกับ `button-icon-circular` ของ Apple โดยบังเอิญ — **`.chip`/`.filter-chip`/`.pick` ไม่กระทบ** เพราะมี `border-radius` ของตัวเองอยู่แล้ว (เป็น selection control ไม่ใช่ action button ตั้งใจแยกจากกัน)
- `button:active` scale: `0.96` → `0.95` ให้ตรงตาม apple.design.md เป๊ะ
- `--shadow-sm`/`--shadow` ไม่แก้ (ของเดิมเบา 0.05 alpha อยู่แล้ว ตรงกับหลัก "แทบไม่มี shadow" ของ Apple อยู่แล้ว)

**ตั้งใจไม่แตะ (เกินขอบเขต "token" หรือเสี่ยงเกินไป):**
- **Font-family**: ไม่เปลี่ยนเป็น SF Pro/Inter เพราะฟอนต์เหล่านี้ไม่มีตัวอักษรไทย ข้อความส่วนใหญ่ในแอปเป็นภาษาไทย เปลี่ยนไปจะทำให้ font fallback ผสมกันดูแปลก — คง `Sarabun` เป็นฟอนต์เดียวของทั้งแอปเหมือนเดิม
- **Body font-size**: ไม่ปรับจาก 15px → 17px (ตามที่ apple.design.md ระบุ) เพราะเสี่ยงทำให้ layout ที่เพิ่งแก้ overflow บนมือถือไปทั้งวัน (การ์ด/ตารางที่ปรับความกว้างพอดีกับ font-size ปัจจุบัน) ล้นซ้ำ
- **font-weight 500 → 600** (apple.design.md บอกว่า weight 500 ไม่มีในระบบ Apple): พบ 16 จุดที่ใช้ 500 ในแอปเรา ส่วนใหญ่จับคู่กับสี `--muted`/`--muted-2` (ข้อความรอง) — เปลี่ยนเป็น 600 แบบเหมารวมเสี่ยงทำให้ข้อความรองหนักเกินไปแย่งความสำคัญจากหัวข้อจริง ต้องดูทีละจุดเป็นรายกรณี ไม่ใช่แค่ token — ยังไม่ทำ รอถ้าต้องการให้ทำต่อ
- **Layout/component ใหม่แบบ Apple** (tile เต็มจอสลับสี, hero รูปสินค้า, two-row nav ดำ): ไม่ทำเลยตามขอบเขตที่ยืนยันไว้ — ไม่เข้ากับแอปธุรกิจนี้

**ทดสอบแล้ว (2026-09-11):** ตรวจสดด้วยบัญชีจริงหลายหน้า (dashboard, โครงการของฉัน, หน้า 403, login, จัดการผู้ใช้) ยืนยันว่า: ปุ่มหลัก/secondary เป็นสีฟ้า/ทรง pill ถูกต้อง, `.icon-btn` เป็นวงกลม, `.filter-chip`/`.chip` ยังคงไม่ใช่ pill ตามที่ตั้งใจ (แยกจาก action button), สีสถานะ (badge อนุมัติ/ตีกลับ ฯลฯ) ไม่เปลี่ยนสี ยังคงเดิมถูกต้อง, ไม่มี console error, การ์ด/ตารางไม่ล้น (viewport เดิม)

---

### 2.13 กฎการออกแบบ UI มือถือ — ป้องกันบั๊กความกว้าง/ระยะขอบไม่เท่ากันซ้ำ (สรุปจากบั๊กจริงที่เจอ 2026-09-11)

ผู้ใช้เจอบั๊ก "ช่องกรอกข้อมูลกว้างไม่เท่ากัน" ในหน้าเดียวกัน 3 รอบติดต่อกันวันเดียว (ดู `js/views/adminPeriods.js`/`adminUsers.js` ใน §4.4) ทั้งที่แต่ละจุดสาเหตุต่างกัน — สรุปเป็นกฎกันพลาดซ้ำสำหรับงาน UI มือถือครั้งต่อไป (ทั้งที่ทำโดย Claude Code หรือคนอื่น):

1. **ห้าม hardcode `style="max-width:...px"` หรือ `style="width:...px"` บน text/search/email input โดยไม่คิดถึงมือถือ** — ถ้าจำเป็นต้องแคบกว่าปกติบนเดสก์ท็อป (เช่น วางข้างปุ่ม/chip) ให้ประกาศเป็น class กลางใน `css/style.css` (ตัวอย่าง: `.field-narrow`) แล้วเพิ่ม override เป็น `max-width:none` ใน `@media (max-width:760px)` เดิมเสมอ — ไม่ใช้ inline style ตรงๆ เพราะแก้เฉพาะจุดทีหลังยาก และมองไม่เห็นว่ามี override อยู่ที่ไหนบ้าง ข้อยกเว้นที่ตั้งใจปล่อยแคบทุกขนาดจอ: ช่องตัวเลขสั้นๆ ที่ความหมายไม่ต้องการความกว้าง (เช่น `%` น้ำหนักกรรมการ, sort order) — ไม่ใช่ text ทั่วไป
2. **ห้ามวาง `.field-row` (grid 2 คอลัมน์ `auto-fit minmax(200px,1fr)`) ไว้ใน container ที่ถูกจำกัดความกว้างด้วย inline `max-width` แคบ** (เช่น `<div style="max-width:480px">`) — คำนวณก่อนใช้เสมอ: 200+200+gap(14) = 414px ถ้า container กว้างกว่านี้ (เช่น 480px) auto-fit จะ**ไม่ยุบเป็น 1 คอลัมน์**บนมือถือ ทำให้ 2 ฟิลด์นั้นแคบกว่าฟิลด์เต็มความกว้างข้างเคียงในฟอร์มเดียวกันอย่างเห็นได้ชัด — ใช้ `.field-row` ได้ปกติเมื่อ (ก) container กว้างพอที่ auto-fit จะยุบเป็น 1 คอลัมน์จริงที่ 375-430px (ต้องวัดจริง ไม่ใช่เดา) หรือ (ข) ทั้ง 2 ฟิลด์ในคู่นั้น "จับคู่กันเองตามธรรมชาติ" อยู่แล้วโดยไม่มีฟิลด์เต็มความกว้างอื่นในกลุ่มเดียวกันมาเทียบ (เช่น แผนก/โรงงาน ใน `kaizenForm.js`, วันเริ่ม/วันเสร็จ — ปล่อยผ่านได้เพราะดูเป็นคู่ที่ตั้งใจ ไม่ใช่ความผิดพลาด)
3. **`input[type="date"]`/`input[type="datetime-local"]` ต้องมี `-webkit-appearance:none` เสมอ** (เพิ่มเป็น base rule ใน `css/style.css` แล้วตั้งแต่ 2026-09-11) — เหตุผล: iOS Safari เรนเดอร์ native chrome ของช่องวันที่/เวลาต่างจาก text input แม้ CSS `width` คำนวณออกมาเท่ากันเป๊ะก็ตาม (ยืนยันจริงจากผู้ใช้บน simulator แม้ Chrome DevTools วัดว่าเท่ากัน)
4. **ข้อจำกัดสำคัญของการทดสอบผ่าน Chrome DevTools MCP: มันคือ Chromium ไม่ใช่ WebKit** — ใช้วัด `getBoundingClientRect()`/overflow ได้แม่นสำหรับ layout ทั่วไป (แนะนำให้ทำเป็นมาตรฐานแทนดู screenshot ด้วยตาอย่างเดียว) แต่**จับบั๊กที่เกิดเฉพาะ native form control ของ WebKit ไม่ได้เลย** (ข้อ 3 คือตัวอย่างจริง) — ทุกครั้งที่แก้/เพิ่ม `<input type="date">`, `type="time"`, `type="file"`, หรือ component ที่พึ่ง native UI ของเบราว์เซอร์ ต้องขอให้ผู้ใช้ยืนยันบน iOS Safari/simulator จริงเสมอ ห้ามสรุปว่า "ผ่านแล้ว" จากผลทดสอบ Chrome DevTools อย่างเดียว
5. **มาตรฐานระยะขอบซ้าย-ขวาที่ถูกต้องในระบบนี้ (มือถือ, `max-width:760px`) มี 2 ชั้นเท่านั้น**: (ก) หน้าในแอปหลักผ่าน `.page-body` = 16px จากขอบจอ (ข) การ์ดที่แปลงจาก `.data-table` มี padding ซ้อนอีกชั้น (14px) รวมเป็น ~30px จากขอบจอ — ทั้งสองนี้คือมาตรฐานที่ถูกต้องแล้วเพราะมาจาก CSS class เดียวที่ทุกหน้าใช้ร่วมกัน (ไม่ต้องแก้) หน้า login/register นับแยกต่างหาก (43px, `.auth-shell`) เพราะเป็นการ์ดกลางจอคนละ layout กับ shell หลัก ไม่ใช่บั๊ก — **สัญญาณเตือนว่าเป็นบั๊กจริง**: มีช่องกรอกข้อความ (ไม่ใช่ checkbox/ตัวเลขสั้น) ที่แคบกว่าช่องอื่นในกลุ่ม/container เดียวกันโดยไม่มีเหตุผลจับคู่ตามข้อ 2(ข)
6. **Checklist ก่อนส่งงาน UI มือถือทุกครั้ง**: (1) grep หา `style="max-width:` และ `style="width:` ใน view file ที่แก้ ตรวจทุกจุดตามข้อ 1-2 (2) วัด `getBoundingClientRect()` ของทุก input/select/textarea ในหน้าที่แก้ เทียบว่า width/left/right ตรงกับ sibling หรือไม่ ถ้าไม่ตรงต้องอธิบายได้ว่าทำไม (3) รัน overflow check (`scrollWidth === clientWidth`) (4) bump cache-busting `?v=` ใน `index.html` ถ้าแก้ `css/style.css`/`js/app.js` (ดู CLAUDE.md) (5) ถ้าแตะ native form control (date/time/file) ให้ผู้ใช้ยืนยันบน iOS Safari จริงก่อนปิดงาน

---

## 3. Todo — backlog

สิ่งที่ตัดออกจาก v1 โดยตั้งใจ (ทำภายหลังถ้าจำเป็นจริง — อ้างอิง full design ใน `docs/01-04`):

| # | รายการ | เหตุผลที่เลื่อน |
|---|---|---|
| B1 | Criteria versioning (`criteria_versions`, lock ย้อนหลัง) | v1 เกณฑ์คงที่ ยังไม่มีความจำเป็นต้องแก้เกณฑ์กลางรอบ |
| B2 | Automated translation (`translations` + provider interface + review queue) | ผู้ใช้กรอก EN เองพอสำหรับ MVP |
| B3 | Committee assignment แยกตามโรงงาน (`committee_assignments`) | v1 ให้กรรมการ active ทุกคนเห็นทุกโครงการ |
| B4 | Weighting mode `role_weighted` / `equal_average` | v1 ใช้ `person_weighted` อย่างเดียว |
| B5 | `period_snapshots` (frozen jsonb ตอนปิด/ประกาศผล) | v1 คำนวณสดผ่าน view — **ความเสี่ยง:** ถ้ามีคนแก้ `committee_weights` หลังปิดรอบ ผลลัพธ์ในอดีตจะเปลี่ยนตาม ต้อง lock `evaluation_periods` row (`is_locked` guard) ก่อน production จริง |
| B6 | Full audit trail ทุกตาราง (ตอนนี้ `audit_log` บันทึกเฉพาะ action สำคัญ: submit, score submit, period close/publish) | ลด complexity ของ trigger |
| B7 | Notifications (in-app/email) | ยังไม่มี Edge Function สำหรับ cron/email |
| B8 | Export CSV/XLSX | ต้องมี Edge Function หรือ client-side lib เพิ่ม |
| B9 | Image optimization (thumbnail, strip EXIF GPS) | ต้องมี Edge Function; v1 จำกัดขนาดไฟล์ที่ client (`MAX_UPLOAD_MB`) เท่านั้น |
| B10 | Full RLS test matrix (pgTAP 28 เคส แบบ `docs/03`) | v1 ทดสอบ manual ตาม checklist §3.1 |
| B11 | Admin UI ขั้นสูง (bulk actions, invite flow) | v1: Admin แก้ทีละแถวพอ |

### 3.1 Manual smoke-test checklist (ใช้แทน automated test ใน v1)
- [x] Employee A สร้าง draft, submit ไม่ได้ถ้าไม่มีรูป before — ทดสอบ 2026-09-07: ข้ามอัปโหลดรูป before แล้วกด submit ขึ้น error "At least one BEFORE photo is required" ตามที่ `guard_kaizen_transition` กำหนดไว้ สถานะไม่ขยับจาก draft
- [x] Employee A เห็นเฉพาะ KAIZEN ตัวเอง + ที่ published — ทดสอบ 2026-09-07 ด้วย 2 บัญชีจริง: query `kaizen_projects` แบบไม่กรองจาก account ที่ไม่ใช่เจ้าของ เห็นแค่ 2 แถว (published + scored ที่ตัวเองเป็นกรรมการ) ไม่มี draft ของคนอื่นเล็ดลอดมาเลย
- [x] Committee เห็นเฉพาะคะแนนตัวเอง ไม่เห็นของกรรมการคนอื่น — ทดสอบ 2026-09-07 ด้วย 2 บัญชีจริง: query `committee_scores` แบบไม่กรอง เห็นแค่ 1 แถว (ของตัวเอง)
- [x] Employee ไม่เห็น `kaizen_results` จนกว่ารอบจะ `published` — ยืนยันระหว่าง manual test (เห็น "ยังไม่มีผลประกาศ" จนกว่าจะกด publish)
- [x] `close_period()` คำนวณ weighted_score ตรงกับ fixture Excel (ชีท "Scoring  2nd" แถวแรก = 50.8571) — ตรวจตรงกัน (50.857142857142854)
- [x] Anon (ไม่ login) เรียก table/RPC ใด ๆ ไม่ได้เลย — curl ตรงผ่าน anon key ครบทุกตาราง/RPC/storage ยกเว้น `master_data` (ตั้งใจเปิดไว้)

### 3.2 Smoke test — ส่งกรรมการก่อนเสร็จงาน + ระบบลบ/ปิดใช้งาน (2026-09-08 ถึง 2026-09-09)
- [x] สร้างโครงการทดสอบใหม่ (สถานะ "ยังดำเนินการอยู่"), submit, กด "ส่งให้กรรมการให้คะแนน" — ทดสอบ 2026-09-08: `status` เปลี่ยน `submitted → pending_review` สำเร็จ, `is_completed` ยังเป็น `false` (ตรวจจาก response body ตรง ไม่ผ่าน UI) ยืนยันว่า `guard_kaizen_transition()` ที่แก้ไม่บังคับ `is_completed=true` อีกต่อไป
- [x] หลังส่งกรรมการแล้ว เจ้าของยังกดปุ่ม "บันทึกความคืบหน้า"/"ทำเครื่องหมายว่าเสร็จแล้ว" ได้ต่อ — ทดสอบ 2026-09-08: `kaizenDetail.js` โชว์ปุ่มต่อ, `kaizenProgress.js` ทั้ง 2 ส่วนใช้งานได้ปกติแม้ status = `pending_review`
- [x] โครงการที่ยังไม่เสร็จโผล่ในคิวตรวจของกรรมการทันทีที่ส่ง พร้อม badge "ยังไม่เสร็จ" — ทดสอบ 2026-09-08: เห็นใน `reviewQueue.js` ทันที, ตัวหาร "ให้คะแนนแล้ว x/y" นับรวมถูกต้อง
- [x] หน้าให้คะแนน (`reviewScore.js`) โชว์คำเตือนโครงการยังไม่เสร็จ — ทดสอบ 2026-09-08: เห็นข้อความ "โครงการนี้ยังไม่เสร็จ (อยู่ระหว่างดำเนินการ) — ให้คะแนนจากข้อมูล ณ ตอนนี้ได้เลย ..." ถูกต้อง
- [x] Dashboard สรุปการส่งโครงการต่อรอบ (`adminPeriodDetail.js`) ตัวเลขตรงกับข้อมูลจริง — ทดสอบ 2026-09-08: ส่งโครงการทดสอบเพิ่ม 1 โครงการ เลขรวม/แยกโรงงาน/เสร็จ-ไม่เสร็จ อัปเดตถูกต้องทั้งหมด
- [x] ลบร่าง KAIZEN ของตัวเอง (`kaizenList.js`) — ทดสอบ 2026-09-09: ลบสำเร็จ ตัวนับ "ทั้งหมด"/"ร่าง" ลดลงถูกต้อง แถวหายจากลิสต์ทันที
- [x] ลบรอบร่าง (`adminPeriods.js`) — ทดสอบ 2026-09-09: สร้างรอบทดสอบสถานะ draft แล้วลบสำเร็จ, ปุ่ม "ลบ" ไม่โผล่ให้รอบที่ไม่ใช่ draft (เปิดรับ/ประกาศผลแล้ว)
- [x] ปิดใช้งาน/เปิดใช้งานบัญชีผู้ใช้ใหม่ (`adminUsers.js`) รวมถึง edge case role หาย — ทดสอบ 2026-09-09 ด้วยบัญชีทดสอบที่สมัครขึ้นมาใหม่: ปิดใช้งานสำเร็จ (ย้ายไปลิสต์ "รออนุมัติ"), ปุ่ม "ปิดใช้งาน" ไม่โผล่ให้บัญชีตัวเอง, ทดสอบ round-trip ปิด→เปิดใช้งานใหม่กรณีมี role กรรมการ+committee role อยู่ก่อน ยืนยันว่า role ไม่หายหลังแก้บั๊ก `onActivate()`

### 3.3 Smoke test — Mobile UI redesign + overflow audit (2026-09-10)
- [x] Bottom tab bar + drawer แสดงรายการถูกต้องตาม role, badge ตัวเลขถูกต้อง, กด "เมนู" เปิด/ปิด drawer ได้ครบ (Escape/คลิกนอก/ปุ่มปิด), ลิงก์ใน drawer นำทางแล้ว drawer ปิดเอง — ทดสอบผ่าน Chrome DevTools MCP ที่ 375px/430px + iOS Simulator จริง
- [x] Desktop 1440px sidebar เดิมไม่เปลี่ยนแม้แต่พิกเซลเดียว — เทียบ screenshot ก่อน/หลัง
- [x] `.wizard-actions`/`.sticky-actions` ไม่โดน bottom-tabbar บัง (kaizenForm, reviewScore) — ทดสอบจริงด้วยบัญชีทดสอบเดินผ่าน wizard
- [x] `.data-table` แปลงเป็น card 1 คอลัมน์ถูกต้องบนมือถือ (adminUsers.js, kaizenList.js) — ทดสอบด้วย DOM-injection ตรงกับ markup จริง ยืนยันไม่มี overflow, badge สถานะไม่หาย, desktop 1440px ไม่เปลี่ยน
- [x] Cache-busting: bump `css/style.css?v=...` แล้วยืนยันด้วย `list_network_requests`/`curl` ว่า URL ใหม่ตอบ 200 จริง หลังเจอปัญหา browser ค้าง cache ของเวอร์ชันเก่า (ดู §2.5)
- [x] Overflow audit ทุกหน้าทุก role ที่ 375px ด้วยบัญชีจริงที่มีข้อมูล (dashboard: `.two-col` ยุบเหลือ 1 คอลัมน์ถูกต้อง วัดด้วย `getBoundingClientRect()` ตรง ไม่มี element ล้น viewport เลยสักตัว) — **ยืนยันด้วยตาจริงครบทุกหน้า admin/committee แล้ว (2026-09-11)**: ผู้ใช้ล็อกอินด้วยบัญชี admin จริงบนมือถือผ่าน Safari iOS (LAN IP แทน localhost) เห็น `dashboard.js`/`adminPeriods.js` จาก screenshot จริง ไม่มี overflow ต่อด้วยผมเองล็อกอินบัญชีเดียวกันผ่าน Chrome DevTools MCP (~485px, ต่ำกว่า breakpoint 760px) เก็บ `getBoundingClientRect()` ของทุก element ทั้งหน้า ยืนยัน `scrollWidth === viewportWidth` (0 element ล้นจอ) ที่ `adminUsers.js`, `adminMaster.js`, `reviewQueue.js`, `reviewScore.js` (รวมทั้งการ์ด score-option 7 เกณฑ์และแถวสรุปคะแนน) ครบทุกหน้าที่เหลือจาก static-analysis เดิม

### 3.4 แนวคิดจากการพูดคุย — ✅ implement ครบแล้วทั้ง 4 ข้อ (คุยไว้ 2026-09-11, ทำเสร็จวันเดียวกัน)

ต่างจาก B1-B11 ด้านบน (ของที่ตัดออกจาก v1 ตั้งแต่ต้นโปรเจกต์) — รายการนี้คือไอเดียฟีเจอร์ใหม่ที่คุยกันระหว่างใช้งานจริง **ตอนนี้ implement ครบทั้ง B12-B15 แล้ว** ดูรายละเอียดไฟล์ที่แก้/สถานะทดสอบจริงที่ §4.6 (คงตารางเดิมไว้ด้านล่างเป็นบริบทการตัดสินใจ)

| # | รายการ | สถานะ/ทิศทางที่คุยไว้ | ความเสี่ยง |
|---|---|---|---|
| B12 | Dashboard section "โครงการของฉันในรอบนี้" โชว์กล่องว่างค้างไว้สำหรับบัญชีกรรมการล้วน (ไม่มี role employee/admin) เพราะเช็คแค่ `canPropose` ตอนโชว์ปุ่ม ไม่เช็คทั้ง section | แนะนำ: ซ่อนทั้ง section ถ้า `!canPropose` แทนที่จะโชว์กล่องว่าง — priority ต่ำ (คงไม่ค่อยมีบัญชี "กรรมการล้วน" จริงในทางปฏิบัติ) | **ต่ำมาก** — แก้จุดเดียวใน `dashboard.js` ไม่กระทบ employee/admin |
| B13 | โครงการที่ยังไม่เสร็จ (`is_completed=false`) ถูกให้คะแนน+จัดอันดับปนกับโครงการที่เสร็จแล้วใน leaderboard เดียวกัน — ไม่แฟร์กับคนที่ทำเสร็จจริง | แนะนำ: เฉพาะโครงการ `is_completed=true` เท่านั้นที่มีสิทธิ์ติดอันดับ/ได้รางวัลตอนรอบนั้น ส่วนที่ยังไม่เสร็จเก็บคะแนนไว้เป็น feedback อย่างเดียว ไม่นับเข้าอันดับ — ต้องคุยเพิ่มเรื่อง cutoff (ต้องเสร็จก่อน admin ปิดรอบถึงจะนับ) ก่อนเริ่มทำ | **กลาง-สูง** — ต้องแก้ `v_kaizen_results` (view คำนวณสด ไม่มี snapshot ตาม B5) เปลี่ยนเงื่อนไขกรองแล้ว **รอบที่ publish ไปแล้วจะเปลี่ยนอันดับย้อนหลังทันที** คนที่เคยติดอันดับอาจหลุดถ้ายังไม่กด "เสร็จแล้ว" ตอนนั้น — ต้องตัดสินใจก่อนว่าใช้กับรอบใหม่เท่านั้นหรือยอมรับผลย้อนหลัง |
| B14 | `kaizenProgress.js` ส่วน "บันทึกความคืบหน้า" ซับซ้อนเกินจำเป็น (% แบบ step 25/50/60/75/90/100 + โน้ต + ติดขัด + วันติดตามถัดไป + timeline ประวัติ) ทั้งที่ทุกคนดูจริงแค่ "กำลังทำ/เสร็จแล้ว" | แนะนำ: ตัดเหลือ toggle 2 สถานะ "กำลังดำเนินการ/เสร็จแล้ว" + โน้ตอิสระ (ไม่บังคับ) ตัด % step และ timeline ประวัติละเอียดทิ้ง — ปุ่ม "ส่งให้กรรมการ"/"ทำเครื่องหมายเสร็จ" (§2.3) ยังคงแยกกันไว้เหมือนเดิม | **กลาง** — กระทบ flow ที่มีข้อมูลจริงอยู่แล้ว (`kaizen_progress_updates` มีประวัติ % บันทึกไว้แล้วจากการทดสอบ) ต้องคิดเรื่อง backward-compat ของการแสดงผลข้อมูลเก่า — คงคอลัมน์เดิมไว้ได้ ไม่ต้องลบ |
| B15 | ระบบรางวัล 2 ระดับที่ยังไม่มีในระบบเลย: (1) ส่งโครงการรายเดือนได้เงินรางวัลเล็กแน่ๆ (20 บาท/คน ไม่ต้องรอคะแนน) (2) ทุก 3 เดือนมีรางวัลใหญ่ให้ top 3 คะแนนสูงสุด | แนะนำ: (1) เพิ่มตารางรายชื่อผู้ส่งโครงการ (ไม่ใช่ draft) ในหน้า `adminPeriodDetail.js` ต่อจากการ์ดสรุปที่มีอยู่ — ไม่ต้องแก้ schema (2) เพิ่มเครื่องมือใหม่ใน `adminPeriods.js` ให้ admin เลือก 3 รอบที่ publish แล้วเอง (ไม่ผูก concept "ไตรมาส" ในระบบ) แล้วรวมผลจาก `v_kaizen_results` ของ 3 รอบมาจัดอันดับ top 3 — ไม่ต้องแก้ schema เช่นกัน (คะแนน normalize 0-100 อยู่แล้ว เทียบข้ามรอบได้ตรงๆ) — ผู้ใช้ยืนยันแล้วว่า**ไม่ต้องมี ledger เก็บว่าจ่ายเงินจริงหรือยัง** แค่โชว์รายชื่อผู้มีสิทธิ์พอ (จ่ายจริงทำนอกระบบผ่าน HR/บัญชี) | **ต่ำ** เดี่ยวๆ (หน้าใหม่ล้วน ไม่แตะของเดิม) — **แต่ผูกกับ B13 โดยตรง**: ถ้าทำ Top 3 (B15) ก่อนทำ B13 มีโอกาสจริงที่โครงการยังไม่เสร็จได้รางวัลใหญ่ไปเลย ควรทำ B13 ก่อนหรือพร้อมกัน ไม่ควรทำ B15 เดี่ยวๆ ก่อน |

**ลำดับความเสี่ยงจากต่ำไปสูง:** B12 < B15 < B14 < B13 — แนะนำเริ่มจาก B12/B15 ก่อน (ปลอดภัย) ส่วน B13 ต้องคุยเรื่อง cutoff/ผลย้อนหลังให้จบก่อนแตะโค้ดจริง และควรทำก่อนหรือพร้อมกับ B15 เสมอ

---

## 4. Current state

**สถานะ (2026-09-07): MVP ทำงานครบ loop แล้ว + checklist §3.1 ผ่านครบ 6/6 ข้อ** — ทดสอบผ่าน browser จริงตั้งแต่ login → เสนอ KAIZEN → submit → อัปเดตความคืบหน้า → ส่งตรวจ → กรรมการให้คะแนน → auto-scored → Admin อนุมัติ → ปิดรอบ → ประกาศผล → เห็นผลใน leaderboard ครบทุกขั้น รวมถึงทดสอบ multi-account isolation จริงด้วย 2 บัญชีแยกกัน และ negative-case gate (submit ไม่มีรูป before) — ดูรายละเอียดที่ §3.1

- **โค้ด:** มีครบทุกไฟล์ตาม §1.3 — `index.html`, `css/style.css`, `js/{app,router,api,i18n,constants,config}.js`, `js/views/*.js` (ทุก route มี implementation จริง ไม่มี stub เหลือ), `supabase/schema.sql`, `supabase/seed.sql` (ข้อมูลสมมติสำหรับ dev/test ตาม D8)
- **Supabase project:** สร้างแล้ว เชื่อมต่อแล้ว (`js/config.js` มีค่าจริง, ไฟล์นี้ gitignored — ดู `js/config.js.example`) — รัน `schema.sql` + `seed.sql` แล้วบน project จริง
- **ความต่างจากที่ร่างไว้ใน §5.1 เดิม (แก้ระหว่าง implement จริง — ดูคอมเมนต์ในไฟล์สำหรับเหตุผลเต็ม):**
  - `v_kaizen_results`: เปลี่ยนเป็น `security_invoker = false` + gate การมองเห็นด้วย `period.status` เอง (ของเดิม `security_invoker = true` จะทำให้ employee/committee เห็นผลเป็น 0 แถวเสมอ เพราะโดน RLS ของ `committee_scores` บล็อก)
  - `master_data`: เปิด `select` ให้ `anon` ด้วย (นอกจาก `authenticated`) เพราะหน้า register ต้องโชว์ dropdown แผนก/โรงงานก่อนผู้ใช้ login
  - ไม่มี route `/admin/kaizen` แยกต่างหาก (ไม่ได้อยู่ใน ROUTES ตาม §5.3) — การอนุมัติ/ตีกลับ KAIZEN ที่ `scored` รวมไว้ในหน้า `adminPeriodDetail.js` แทน
  - `kaizenForm.js` ไม่มี autosave ทุก 20 วิ — บันทึกร่างเกิดตอนกด "ถัดไป" แต่ละขั้นแทน (resumable ได้จริงตั้งแต่ขั้น 2 เพราะ `title` เป็น NOT NULL จึงสร้างแถวจริงก่อนหน้านั้นไม่ได้)
  - ไม่มี trigger sync `kaizen_progress_updates → kaizen_projects` อัตโนมัติ — `kaizenProgress.js` เขียน `progress_pct`/`next_follow_up_date`/`status` (submitted→in_progress) เองฝั่ง client คู่กับการ insert progress update
- **ตรวจผ่านแล้ว:**
  - D5 (สูตรคะแนนตรงกับ fixture `KAIZEN Proposal Program.xlsx`) — เทียบกับชีท "Scoring  2nd" แถวแรก (project ID 980011) ตรงกันเป๊ะ: Σ(raw_sum/35 × weight_pct) = 50.857142857142854 = 50.8571
  - Anon block: ทดสอบด้วย curl ตรงผ่าน anon key (ไม่มี session) ครบทุกตาราง (`profiles`,`evaluation_periods`,`kaizen_projects`,`kaizen_attachments`,`kaizen_progress_updates`,`committee_scores`,`audit_log`), view `v_kaizen_results`, RPC ทั้ง 5 ตัว, และ storage bucket `kaizen-photos` — บล็อกหมด (401 permission denied) ยกเว้น `master_data` select ที่ตั้งใจเปิดไว้ (ดูหมายเหตุด้านบน)
  - "กรรมการเห็นเฉพาะคะแนนตัวเอง" + "Employee เห็นเฉพาะ KAIZEN ตัวเอง + ที่ published" — ทดสอบด้วย 2 บัญชีจริง (สมัครบัญชีที่ 2, ตั้งเป็น committee ผ่าน adminUsers.js, สร้างรอบใหม่ใส่กรรมการ 2 คนคนละ 50%) แล้ว query ตรงจาก browser console ของบัญชีที่ 2 แบบไม่ใส่เงื่อนไขกรองเลย: `committee_scores` เห็นแค่ 1 แถว (ของตัวเอง), `kaizen_projects` เห็นแค่ 2 แถว (published + ที่ตัวเองเป็นกรรมการอยู่) ไม่มี draft ของบัญชีอื่นเล็ดลอดมาเลย — ยืนยันว่า RLS กันไว้จริงระดับ query ไม่ใช่แค่ UI ไม่แสดง
  - "submit ไม่ได้ถ้าไม่มีรูป before" — ข้ามอัปโหลดรูป before แล้วกด submit ขึ้น error "At least one BEFORE photo is required" ตามที่ตั้งใจ สถานะไม่ขยับจาก draft
- **ยังไม่ได้ตรวจ:** ไม่มี — checklist §3.1 ผ่านครบ 6/6 ข้อแล้ว
- ไม่มี CI/CD, ไม่มี environment แยก dev/prod ในตอนนี้ (ตั้งค่าเดียวใน `js/config.js`) — git repo init ไว้แล้วแต่ยังไม่มี commit

### 4.1 UI redesign (design handoff) — เสร็จครบทุกไฟล์ (2026-09-07 ถึง 2026-09-08)

MVP ใช้งานได้ครบแล้วจาก §4 → ปรับ UI ทั้งหมดตาม **design handoff** ที่ `UI dev/design_handoff_kaizen_ui/` (`CLAUDE_CODE_PROMPT.md`, `README.md`, `MIGRATION.md`, `style.css` พร้อมใช้, `reference/KAIZEN UI.dc.html` เป็น comparison tool) — กฎ: ไม่เปลี่ยน stack/field name/enum, ห้ามแตะ `api.js`/`router.js`/schema ยกเว้น 2 จุดที่อนุญาตชัดเจน (query `?from=` ตอน redirect ไป 403, และ select ของ `getReviewQueue` ขยายเพิ่ม `kaizen_attachments(id)`)

**ทำครบทั้งหมดแล้ว:**
- `css/style.css` แทนทั้งไฟล์ + เพิ่มเอง 2 rule ที่ไฟล์ต้นทางอ้างถึงแต่ไม่ได้นิยามมาให้ (`.detail-cols` สำหรับ kaizenDetail, `.rank-num`/`.is-top` สำหรับ leaderboard)
- `index.html` — font JetBrains Mono, โลโก้ Suntory Wellness
- `js/ui.js` (ใหม่) — helper กลาง 11 ฟังก์ชัน ใช้ทุก view แล้ว
- **ทุก view ทั้ง 17 ไฟล์** เขียนใหม่ตาม MIGRATION.md ครบ: `dashboard.js`, `kaizenList.js`, `kaizenForm.js` (step rail กดได้ + char-count live + chip + dropzone drag&drop + **เพิ่มการย่อรูป/ลบ EXIF-GPS จริงด้วย canvas ก่อนอัปโหลด** เพื่อให้ note ในหน้าไม่โกหกผู้ใช้), `kaizenDetail.js` (photo-pair + timeline), `kaizenProgress.js` (ปุ่ม % + checklist ปิดโครงการ), `reviewQueue.js` (การ์ดแทนตาราง), `reviewScore.js` (accordion เลื่อนอัตโนมัติ), `leaderboard.js`, `login.js`+`register.js` (auth-shell 2 คอลัมน์), `adminPeriods.js`, `adminPeriodDetail.js` (stepper + checklist เงื่อนไขปิด/ประกาศผลจริง), `adminUsers.js` (รออนุมัติแยกบน + dirtyRows), `adminMaster.js` (ฟิลด์ตามชนิดแทน JSON ดิบ), `adminAudit.js` (ประโยค + จัดกลุ่มวัน), `forbidden.js`+`notFound.js`
- `js/app.js` ครบ: nav badge count (คำนวณครั้งเดียวตอน session โหลด ไม่ผูก hashchange), avatar initials + `roleLabel()`, ลิงก์ leaderboard หารอบ published ล่าสุดเอง
- `js/router.js` แก้ 1 จุดตามที่อนุญาต: ส่ง `?from=` ตอน redirect ไป `#/403`
- i18n: เพิ่ม key ครบตามตาราง empty states + state cards, ลบ `dashboard_no_data` ออกแล้ว (grep ไม่เจอที่เรียกใช้แล้วจริง)
- เกณฑ์ตรวจอัตโนมัติผ่านหมด: `grep prefers-color-scheme css/` ไม่เจอ, `grep dashboard_no_data js/` ไม่เจอการเรียกใช้, syntax check ผ่านทุกไฟล์

**ตัดทอน/ปรับจาก reference โดยตั้งใจ (ทุกจุดคือกันไม่ให้ UI อ้างความสามารถที่ระบบทำจริงไม่ได้):**
- Tab "ทั้งโรงงาน" บน dashboard เป็น disabled ถาวร — ต้องแก้ RLS ถึงจะทำได้จริง อยู่นอก scope
- ไม่มี caption/ตัวเลขใต้รูปใน kaizenDetail — ฟอร์มอัปโหลดไม่มีช่องกรอก caption และเพิ่มไม่ได้โดยไม่แตะ `api.js`
- kaizenList.js ไม่แสดง "จำนวนกรรมการที่ให้คะแนนแล้ว" — RLS บล็อกกรรมการไม่ให้เห็นแถวคนอื่นอยู่แล้ว (ตรงเจตนารมณ์เดิม)
- ไม่มีลิงก์ "ลืมรหัสผ่าน" และไม่มีปุ่ม export บน leaderboard — ไม่มี flow/endpoint จริงรองรับ (กันปุ่มที่กดแล้วไม่เกิดอะไร)
- ตัวเลข "5 กรรมการ / 27 โครงการ" ในหน้า login เป็นตัวอย่างสมมติใน mockup — โชว์แค่ "7 เกณฑ์" ที่จริงเสมอ (ตัวอื่น anon ดึงไม่ได้จาก RLS)
- adminPeriodDetail: เงื่อนไขปิดรอบตีความเป็น "น้ำหนัก 100% + คะแนนครบ" เป็น hard blocker, deadline/การตัดสินค้างเป็นแค่ข้อมูลประกอบ (สเปกเดิมไม่ชัดว่าบล็อกทั้ง 4 ข้อไหม)
- `.stepper` โชว์ 'scoring' เป็นขั้นหนึ่งตาม `PERIOD_STATUSES` เสมอ ทั้งที่ v1 ไม่มี RPC ใดพาเข้าสถานะนี้จริง (เป็น dead state ตามที่บันทึกไว้ใน schema.sql)

**อัปเดต 2026-09-08:** ทดสอบจริงในเบราว์เซอร์แล้ว (Chrome DevTools MCP) ครบทุกหน้าหลัก ทั้ง desktop และ responsive ที่ 390px — พบและแก้บั๊กจริงหลายจุดระหว่างทดสอบ (ดูรายละเอียดเชิงลึกในคอมเมนต์โค้ด `css/style.css`/`js/views/*.js` แต่ละจุด): เลขคะแนน "ให้คะแนนแล้ว x/y" ตัวหารผิด, `.wizard.steps` เลขซ้ำ (CSS selector ผิด), sidebar ไม่ซ่อนตอน logout, ตารางมือถือไม่มี hint ว่าเลื่อนได้, ฟิลด์ Min/Max/Rank ใน adminMaster.js จัดวางผิดเพราะ `class="field-label"` ถูกเอาไปห่อ label+input ผิดวิธี — กติกาที่จับได้ระหว่างนี้: `label { display:flex; flex-direction:column }` เป็น global rule ที่ทำให้ component ที่ต้องการ layout แนวนอนต้องประกาศ `flex-direction:row` เอง ไม่งั้นจะเรียงตัวผิด (root cause ของบั๊กหลายจุด)

### 4.2 กติกาธุรกิจ "ส่งกรรมการก่อนเสร็จงาน" + Dashboard สรุปยอดส่ง (2026-09-08)

ดูมติเต็มที่ §2.3 — สรุปสถานะ: implement ครบ + รัน migration บน live Supabase project แล้ว + สโมกเทสต์ end-to-end ผ่านครบ (ดู checklist §3.2) ไฟล์ที่แก้: `supabase/schema.sql` + `supabase/migration_2026-09-08_early-review.sql` (ใหม่), `js/views/kaizenProgress.js` (เขียนใหม่ทั้งไฟล์ — แยก 2 ปุ่ม), `js/views/kaizenDetail.js`, `js/views/reviewScore.js`, `js/views/reviewQueue.js`, `js/views/adminPeriodDetail.js` (เพิ่มการ์ดสรุปการส่งโครงการ)

**หน้ารายการรอบ (`adminPeriods.js`) ปรับ layout เพิ่มเติม (2026-09-08):** ตารางรอบทั้งหมดเป็นเต็มความกว้างจอ (เดิมอยู่ใน layout 2 คอลัมน์คู่กับฟอร์มสร้างรอบใหม่) fix ความสูงไว้พอดี 4 แถว (`.periods-table { max-height: 234px; overflow-y: auto }`) เกินกว่านั้นเลื่อนดูเอง ฟอร์ม "สร้างรอบใหม่" ย้ายมาอยู่ใต้ตาราง ชิดซ้าย จำกัดความกว้างไม่ให้ยืดเต็มจอ

### 4.3 ระบบลบ/ปิดใช้งาน (2026-09-09)

ดูมติเต็มที่ §2.4 — สรุปสถานะ: implement ครบ 3 จุด + ทดสอบ end-to-end ด้วยข้อมูลทดสอบที่สร้างเองแล้วลบ/ปิดใช้งานทิ้งเรียบร้อย ไม่กระทบข้อมูลจริง (ดู checklist §3.2) ไฟล์ที่แก้: `js/api.js` (เพิ่ม `deleteKaizen()`, `deletePeriod()`), `js/views/kaizenList.js`, `js/views/adminUsers.js` (เพิ่มรับ `session` param เพื่อกันปิดใช้งานตัวเอง + แก้บั๊ก `onActivate()` reset role), `js/views/adminPeriods.js` — ไม่มีการแก้ `supabase/schema.sql`/RLS เพิ่มเติม เพราะ policy ที่ใช้มีอยู่แล้วทั้งหมด

### 4.4 Mobile UI redesign — navigation, animation, responsive tables, overflow audit (2026-09-10)

ดูมติเต็มที่ §2.5 — สรุปสถานะ: implement ครบทุกส่วน + ทดสอบตาม checklist §3.3 (ส่วน admin/committee-only ยังเป็น static-analysis ไม่ใช่ live test — ดูหมายเหตุใน §3.3)

**ไฟล์ที่แก้ (นำทาง + animation, 2026-09-10 รอบเช้า):**
- `index.html` — เพิ่ม `#mobile-tabbar`, `#mobile-drawer-backdrop`, `#mobile-drawer` (element ใหม่ล้วน ไม่ชนของเดิม), cache-bust query string บน `css/style.css`/`js/app.js`
- `js/app.js` — แตก `renderChrome()` เป็น `primaryItems`/`adminItems`, เพิ่ม `renderMobileChrome()`, `openDrawer()`/`closeDrawer()`
- `js/i18n.js` — เพิ่ม key `nav_more`
- `css/style.css` — เพิ่ม mobile-chrome CSS ทั้งหมดในกรอบ `@media (max-width:760px)` เดิม + reset นอก media query กัน id ใหม่โผล่ผิดที่ + keyframe animation (`pageFadeIn`, `lightboxIn`) + ต่อยอด `prefers-reduced-motion` block เดิม

**ไฟล์ที่แก้ (ตาราง → card มือถือ, 2026-09-10 รอบกลางวัน):**
- `css/style.css` — เพิ่ม block `.data-table` → card ใน `@media (max-width:760px)` เดิม (ดู §2.5 มติ 3), เพิ่ม `.data-table.is-wide { min-width:760px }` แทน inline style เดิม
- `js/views/adminUsers.js` — เปลี่ยน `<table style="min-width:760px">` → `<table class="data-table is-wide">`

**ไฟล์ที่แก้ (overflow audit ทุกหน้าทุก role, 2026-09-10 รอบบ่าย — ดู §2.5 มติ 4):**
- `css/style.css`: `.two-col`/`.auth-shell` เพิ่ม `grid-template-columns:1fr` ใน mobile media query เดิม (จุดล้นหนักสุด กระทบ dashboard.js/kaizenProgress.js/reviewScore.js/login.js/register.js ทุกไฟล์พร้อมกันเพราะ shared class), `.hstack > * { min-width:0 }` (แก้รวมทุกจุดที่ใช้ `.hstack` — kaizenDetail.js/reviewScore.js team-member rows), `.breadcrumb` เพิ่ม `flex-wrap`+`overflow-wrap:anywhere` (แก้ breadcrumb ชื่อโครงการยาวใน kaizenDetail.js/kaizenProgress.js/reviewScore.js พร้อมกัน), `.score-option span:not(.lv)`, `.def-grid dd`, `.review-summary > div`, `.task-row .task-title`/`.task-meta`/`.task-tags > *` — ทั้งหมดเพิ่ม `min-width:0`/`overflow-wrap:anywhere`
- `js/views/dashboard.js` — tab-button row เพิ่ม `flex-wrap:wrap`
- `js/views/kaizenForm.js` — step 1 การ์ดข้อมูลพนักงาน เพิ่ม `min-width:0` ที่ text wrapper (raw flex div ไม่ได้ใช้ `.hstack`)
- ตรวจแล้วไม่มีบั๊ก overflow แยกต่างหาก (พอ `.data-table` fix มีผลก็ครบ ไม่ต้องแก้ไฟล์เพิ่ม): `adminMaster.js`, `adminPeriods.js`, `adminAudit.js`, `adminPeriodDetail.js`, `leaderboard.js`
- พบแต่ตั้งใจไม่แก้ (cosmetic, ไม่ใช่ overflow): `adminMaster.js` checkbox `f-active` ยืดเต็มการ์ดเพราะ CSS specificity ของ `.data-table td input{width:100%}`, `adminPeriodDetail.js` `.member-row` weight-input ยืดเต็มแถวเพราะ specificity เดียวกัน — ทั้งสองจุดมี `flex-wrap`/การ์ดแยกกันอยู่แล้วจึงไม่ทำให้หน้าล้น เป็นแค่ความสวยงามที่ผิดคาด

**ไฟล์ที่แก้ (ปุ่ม "+" เสนอ KAIZEN ใหม่ + icon-only tabbar, 2026-09-10 บ่ายแก่ — ดู §2.5 มติ 5):**
- `js/app.js` — เพิ่ม `ICONS.plus`, `tabLink()` รับ param `extraClass` เพิ่ม, `renderMobileChrome()` แทรกปุ่ม "+" กลาง `primaryItems` (เฉพาะ role สร้างโครงการได้) + เปลี่ยนไอคอนปุ่ม "เมนู" เป็น avatar initials
- `js/i18n.js` — เพิ่ม key `nav_new_kaizen` (TH/EN)
- `css/style.css` — `.tabbar-label` เปลี่ยนเป็น sr-only (clip), เพิ่ม `.tabbar-create`/`.tabbar-avatar`, ขยาย `.tabbar-icon` จาก 22px → 24px
- ทดสอบสดที่ 375px ด้วยบัญชีจริง: ปุ่ม "+" นำไปหน้า `#/kaizen/new` ถูกต้อง, ปุ่ม avatar เปิด drawer ได้ปกติ, accessible name ของทุกปุ่มยังถูกต้องแม้ label หายไปจากตา (ตรวจผ่าน accessibility snapshot), desktop 1440px sidebar ไม่เปลี่ยนแม้แต่พิกเซลเดียว

**บั๊กเพิ่มเติมที่ผู้ใช้เจอเองระหว่างใช้งานจริงบนมือถือ (2026-09-11), แก้ครบแล้วทั้ง 3 จุด:**
- `js/views/adminPeriods.js` (ฟอร์ม "สร้างรอบใหม่") — "วันเริ่มรอบ"/"วันสิ้นสุดรอบ" เดิมอยู่ใน `.field-row` (grid 2 คอลัมน์) ทำให้แคบเหลือ 220px ในขณะที่ช่องอื่นในฟอร์มเดียวกันกว้าง 453px เพราะ wrapper ของฟอร์มนี้ถูกจำกัด `max-width:480px` ไว้ ทำให้ 2 คอลัมน์ยังยัดพอดี — แก้โดยเอาออกจาก `.field-row` ให้เรียงเต็มความกว้างเหมือนช่องอื่น (ยืนยันด้วย `getBoundingClientRect()` ว่ากว้างเท่ากัน 453px ทั้ง 6 ช่องแล้ว)
- `js/views/adminUsers.js` (ช่องค้นหา) + `js/views/adminPeriods.js` (ช่อง "ชื่อประกาศ") — เดิม hardcode `style="max-width:260px"`/`280px` ทำให้แคบกว่าช่องอื่นในหน้าเดียวกัน — แก้โดยเพิ่ม class กลาง `.field-narrow` ใน `css/style.css` (คงความแคบไว้บนเดสก์ท็อป เพราะอยู่ข้างปุ่ม/chip ตั้งใจ แต่ยืดเต็มความกว้างมาตรฐานใน `@media max-width:760px`)
- `input[type="date"]`/`input[type="datetime-local"]` ทั้งแอป — พบว่า iOS Safari เรนเดอร์ native chrome ของ date input ไม่เท่ากับ text input แม้ CSS width เท่ากัน (ตรวจสอบด้วย Chrome DevTools แล้วว่าเท่ากันเป๊ะ แต่ผู้ใช้ยืนยันว่ายังไม่เท่ากันจริงบน iOS Safari) — แก้ด้วย `-webkit-appearance:none` บังคับให้ใช้กล่องเดียวกับ input ทั่วไป ทดสอบยืนยันจากผู้ใช้แล้วว่าเท่ากันจริง (2026-09-11)
- ระหว่างแก้พบว่าลืม bump cache-busting `?v=` ของ `css/style.css` ใน `index.html` หลังแก้ CSS (ตามกฎที่ CLAUDE.md เตือนไว้) — bump เป็น `20260911d` แล้ว
- ตรวจ overflow/ความกว้างช่องกรอกครบทุก route ในระบบ (18 หน้า) ด้วย `getBoundingClientRect()` จริง หลังแก้ 3 บั๊กข้างบน — ไม่พบจุดอื่นเพิ่มเติม

**Dashboard cleanup — ตัดปุ่ม "เสนอ KAIZEN ใหม่" ที่ซ้ำกัน (2026-09-11 ค่ำ):** ผู้ใช้ให้ความเห็นว่าปุ่มสร้างโครงการดูรกเกินไป — ตรวจพบว่า `js/views/dashboard.js` มีปุ่มนี้ซ้ำถึง 2 จุดในหน้าเดียว (เงื่อนไข `canPropose` ครอบคลุมทุก role ในระบบ จึงเห็นเหมือนกันทุกคน): (1) ปุ่มใน empty-state ของ section "โครงการของฉันในรอบนี้" ตอนยังไม่มีโครงการ (2) การ์ดโปรโมท "มีปัญหาหน้างานที่อยากปรับปรุงไหม?" ที่โชว์เสมอไม่ว่าจะมีโครงการแล้วหรือยัง — รวมกับปุ่ม "+" กลางแถบ tabbar (persistent chrome ทุกหน้า) เท่ากับสูงสุด 3 ปุ่มพร้อมกันสำหรับคนที่ยังไม่มีโครงการเลย ตัดสินใจ**เอาออกทั้ง 2 จุดในหน้า dashboard ทิ้ง เหลือปุ่ม "+" บน tabbar เป็นทางเข้าเดียว**: ลบปุ่มใน empty-state (เหลือแค่ข้อความ) และลบการ์ดโปรโมททั้งการ์ด (ไม่ใช่แค่ปุ่ม เพราะข้อความไม่มีประโยชน์ถ้าไม่มีปุ่มกดต่อ) — ทดสอบสดยืนยันแล้วว่า dashboard ไม่มีปุ่มซ้ำอีก ไม่มี console error, `canPropose` ยังใช้งานอยู่ 2 จุดอื่น (ซ่อน/โชว์ tab-switcher และทั้ง section) จึงไม่ใช่ dead code

**Popup รายละเอียดเกณฑ์การตัดสิน 7 ข้อ ในหน้า login/register (2026-09-11 ค่ำ):** ผู้ใช้ขอให้กดชื่อเกณฑ์ในบล็อก "ตัดสินจาก 7 เกณฑ์" (login.js/register.js) แล้วเปิด popup พื้นหลังจางแสดงรายละเอียด rubric เต็ม 5 ระดับของเกณฑ์นั้น — ยืนยันขอบเขตเฉพาะ 2 หน้านี้เท่านั้น (ไม่ใช่ `reviewScore.js`/`kaizenForm.js`)
- `js/ui.js` — `criteriaTags()` เปลี่ยนจาก `<span>` เป็น `<button>` มี `data-criterion-code`, เพิ่ม `wireCriteriaTags(container)`/`openCriteriaDetail(code)`/`closeCriteriaDetail()` ใหม่ (ดึงข้อความจาก `SCORE_LEVELS`/`CRITERIA` ใน `constants.js` ที่มีอยู่แล้ว — ตัวเดียวกับที่ `reviewScore.js` ใช้ตอนกรรมการให้คะแนนจริง ไม่มี API/schema ใหม่) — import เพิ่ม `getLang` จาก `i18n.js` เพื่อสลับ TH/EN ให้ popup อัตโนมัติ
- `css/style.css` — เพิ่ม `.info-modal-backdrop`/`.info-modal`/`.info-modal-close`/`.info-modal-levels` (มี fade+slide animation แบบเดียวกับ `.lightbox` เดิม ครอบคลุมใน `prefers-reduced-motion` block ด้วย), `.score-option.is-static` (reuse หน้าตา `.score-option` เดิมแต่ปิด cursor/hover เพราะเป็นแค่รายการอ่านอย่างเดียวไม่ใช่ตัวเลือกให้กด), แก้ `.criteria-tag` ให้ยังคงหน้าตาชิปสีฟ้าอ่อนเดิมหลังเปลี่ยนเป็น `<button>` (ต้อง reset `min-height`/`:hover` ที่สืบมาจาก base `button{}` ทับ ไม่งั้นจะกลายเป็นปุ่มสีฟ้าทึบสูง 44px ตาม design token ใหม่จาก §2.12)
- `js/views/login.js`, `js/views/register.js` — เรียก `wireCriteriaTags(container)` หลัง render
- ทดสอบสดผ่าน Chrome DevTools MCP ทั้ง 2 หน้า: กดแต่ละชิปเปิด popup ถูกต้อง (เช่น "คุณภาพ" โชว์ครบ 5 ระดับ), ปิดได้ทั้งปุ่ม X/คลิกพื้นหลัง/กด Escape, ไม่มี overflow, ไม่มี console error — ระหว่างทางลืม bump cache-busting `?v=` ของ `css/style.css` ใน `index.html` อีกครั้ง (ตามรูปแบบเดิมที่เพิ่งเขียนกฎไว้ใน §2.13) แก้เป็น `20260911e` แล้ว, และ bump cross-module import tag ที่ `ui.js`/ทุกไฟล์ที่ import `ui.js` เป็น `20260911e` ตามกฎ CLAUDE.md (แก้ `ui.js`)

**บั๊ก: ทำเครื่องหมาย "เสร็จแล้ว" ที่ขั้น 4 ของฟอร์มเสนอ KAIZEN ใหม่พังเสมอ (2026-09-11 ค่ำ, พบจากผู้ใช้ทดสอบจริง):** กด "ทำเสร็จแล้ว" ที่ขั้น 4 ("แผนงาน") แล้วกด "ถัดไป" ขึ้น error ดิบจาก DB "At least one AFTER photo is required to mark a project completed" ผู้ใช้รายงานว่าเจอซ้ำแม้กด "ย้อนกลับ" แล้วลองใหม่
- **สาเหตุ:** `guard_kaizen_completion()` trigger (schema.sql) ปฏิเสธ `is_completed=true` ถ้ายังไม่มี attachment phase='after' เลย — ถูกต้องตามเจตนา แต่รูปอัปโหลดได้ที่ **ขั้น 5** ซึ่งอยู่ "หลัง" ขั้น 4 ในลำดับ wizard ทำให้ผู้ใช้ที่กด "ทำเสร็จแล้ว" ตอนแรกเจอที่ขั้น 4 (ก่อนเคยไปขั้น 5 เลย) เซฟไม่ผ่านแน่นอนเสมอ 100% — และเพราะ transaction ทั้งก้อนถูก rollback ตอน exception, `state.draft.IsCompleted` ในหน่วยความจำฝั่ง client ไม่ถูก reset กลับเป็น false ทำให้ทุกครั้งที่กด "ถัดไป" ซ้ำ (ไม่ว่าจะย้อนไปขั้นไหนมาก่อน) ส่ง patch เดิมไปชน exception เดิมซ้ำไปเรื่อยๆ จนกว่าจะกลับไปขั้น 4 แล้วกดปุ่ม "ยังดำเนินการอยู่" เพื่อ reset เอง (ไม่มี UI ไหนบอกวิธีแก้เลย)
- **แก้ (รอบแรก, ผิด):** เพิ่ม validation บล็อกไว้ที่ `stepIssues(4)` เอง — ทำให้เลือก "เสร็จแล้ว" แล้ว**ไปขั้น 5 ไม่ได้เลย** (บล็อกตัวเองไม่ให้ไปอัปโหลดรูปที่จะมาแก้ปัญหา วนตันไม่มีทางออก) ผู้ใช้ทดสอบแล้วทักท้วงกลับมาทันที
- **แก้ (รอบสอง, ถูกต้อง):** ย้าย logic ไป 2 จุด — (1) `buildPatch()` (`js/views/kaizenForm.js`): ถ้า `IsCompleted=true` แต่ยังไม่มี attachment phase `after` เลย จะ**ส่ง `is_completed:false` ไป DB แทนเงียบๆ** ก่อน (ไม่บล็อก ไม่ error) ส่วน UI ยังโชว์ "เสร็จแล้ว" ตามที่ผู้ใช้เลือกไว้ตลอดเพราะอ่านจาก `draft.IsCompleted` ในหน่วยความจำ ไม่ใช่ค่าที่ persist จริง — ทำให้ไปขั้น 5 ได้ปกติเสมอไม่ว่าจะเลือกอะไรไว้ที่ขั้น 4 (2) `stepIssues(5)`: เพิ่มเช็คใหม่ ถ้า `IsCompleted=true` แต่ไม่มีรูป after ยัง**ไปขั้น 6 ไม่ได้** (บล็อกที่นี่แทน เพราะขั้น 5 คือที่ที่อัปโหลดรูปได้จริง สมเหตุสมผลกว่า) — พอมีรูป after แล้ว patch ครั้งถัดไปจะส่ง `true` ให้เองอัตโนมัติไม่ต้องทำอะไรเพิ่ม
- ทดสอบสดผ่าน Chrome DevTools MCP ครบทั้ง flow: (1) เลือก "เสร็จแล้ว" ที่ขั้น 4 โดยไม่มีรูป after → กด "ถัดไป" **ไปขั้น 5 ได้ปกติ** (ต่างจากรอบแรกที่บล็อกผิด) ตรวจ request body ยืนยันว่า DB ได้รับ `is_completed:false` จริง (2) กด "ไปขั้น 6" ทั้งที่ยังไม่มีรูป after → บล็อกถูกจุดพร้อมข้อความแนะนำ (3) อัปโหลดรูป before+after ที่ขั้น 5 แล้วกด "ถัดไป" อีกครั้ง → ไปขั้น 6 ได้ปกติ, ตรวจ network request ยืนยันว่ารอบนี้ DB ได้รับ+บันทึก `is_completed:true` จริง (response body ยืนยัน) — ลบโครงการทดสอบทั้ง 2 ตัว (สถานะ draft ลบเองได้ตาม RLS) ทิ้งหลังทดสอบเสร็จแล้ว
- หมายเหตุ: ระหว่างทดสอบเจอ `POST .../auth/v1/token?grant_type=refresh_token` ตอบ 400 ครั้งเดียวกลางๆ การทดสอบ — เป็นผลจากการเปิด 2 browser context คนละหน้าต่างของ Chrome DevTools MCP ที่ login ด้วยบัญชีเดียวกันพร้อมกันมาทั้งวัน ทำให้ refresh token ชนกัน (rotating token ถูกใช้ไปแล้วจากอีก context) ไม่เกี่ยวกับบั๊กนี้และไม่ใช่สิ่งที่ผู้ใช้จริงจะเจอ (คนละ session/browser กัน)

**รวม "ส่งโครงการ" กับ "ส่งให้กรรมการให้คะแนน" เป็นปุ่มเดียว (2026-09-11 ค่ำ, ตามคำขอผู้ใช้):** เดิม (ตาม §2.3) 2 ขั้นตอนนี้ตั้งใจแยกอิสระกัน — กด "ยืนยันส่งโครงการ" ที่ขั้น 6 ของฟอร์มเสนอ KAIZEN ทำให้ status แค่ `submitted` เท่านั้น ต้องไปหน้า `kaizenProgress.js` กดปุ่ม "ส่งให้กรรมการให้คะแนน" แยกต่างหากอีกทีถึงจะเป็น `pending_review` (สถานะเดียวที่กรรมการเห็นใน `reviewQueue.js`) — ผู้ใช้ทดสอบจริงพบว่าพนักงานกด "ส่งโครงการ" แล้วคิดว่าจบแล้ว แต่กรรมการไม่เห็นหัวข้อเลยเพราะไม่รู้ต้องไปกดปุ่มที่สองต่อ ขอให้รวมเป็นปุ่มเดียว
- `js/views/kaizenForm.js` `onSubmit()` — หลัง `submitKaizen()` (draft→submitted) สำเร็จ เรียก `updateKaizen(id, {Status:'pending_review'})` ต่อทันทีในการกดครั้งเดียว — `submitted→pending_review` เป็น transition ที่ `guard_kaizen_transition()` อนุญาตอยู่แล้วและไม่มี gate เพิ่มเพราะ `is_completed` เป็น false เสมอตอนเพิ่งสร้างใหม่ (ไม่กระทบ gate ที่เช็คเฉพาะตอน `is_completed=true`)
- เพิ่มข้อความเตือนที่ขั้น 6 ก่อนปุ่ม "ยืนยันส่งโครงการ" บอกชัดว่ากดแล้วเข้าคิวกรรมการทันที+ล็อกแก้ไขชื่อ/ปัญหา/แนวทาง (ยังอัปเดตความคืบหน้า/ทำเครื่องหมายเสร็จได้ต่อที่หน้ารายละเอียด) — เพราะผลกระทบตอนนี้ทันทีกว่าเดิม (เดิมมีช่วง `submitted` เป็น buffer ให้แก้ไขได้ก่อนค่อยส่งจริง)
- **ปุ่ม "ส่งให้กรรมการให้คะแนน" ใน `kaizenProgress.js` ยังคงอยู่ไม่ได้ลบ** — ไว้ใช้กับโครงการเก่าที่ค้างอยู่ที่ `submitted`/`in_progress` จากก่อนการแก้ครั้งนี้ (ส่งไปแล้วแต่ยังไม่เคยเข้าคิว) หรือกรณีอื่นที่ยังต้องการ flow แยก 2 ขั้นตอนอยู่
- ทดสอบสดผ่าน Chrome DevTools MCP ครบ: สร้างโครงการใหม่จนจบขั้น 6 กด "ยืนยันส่งโครงการ" ครั้งเดียว → `kaizenDetail.js` โชว์สถานะ "รอตรวจให้คะแนน" ทันที (ไม่ผ่าน `submitted` ให้เห็น) และเช็ค `#/review` (คิวตรวจกรรมการ) เจอหัวข้อนั้นทันทีโดยไม่ต้องทำอะไรเพิ่ม — ยืนยันว่าแก้ปัญหาที่รายงานมาตรงจุด
- **ข้อมูลค้างจากก่อนแก้ (พบและซ่อมแล้ว 2026-09-11):** โครงการ "สร้างแอพ" (`KZN-2026-0007`, บัญชี `test2@suntorywellness.co.th`) ถูกส่งไปตอน browser ยังโหลดโค้ดเวอร์ชันก่อนแก้อยู่ ค้างที่ `status=submitted` ทั้งที่ข้อมูลอื่นครบ (มีรูปก่อน/หลังทำ, วันที่เสร็จ, `is_completed=true`) — ตรวจสอบเงื่อนไข gate ทั้งหมดผ่านครบแล้วจึงขยับสถานะเป็น `pending_review` ตรงๆ ผ่านสิทธิ์ admin (`k_update_admin` RLS policy, เทียบเท่ากดปุ่ม "ส่งให้กรรมการให้คะแนน" เอง) ยืนยันแล้วว่าขึ้นในคิวตรวจของกรรมการถูกต้อง — เป็น one-time data fix เฉพาะโครงการนี้ ไม่ใช่การแก้โค้ดเพิ่ม
- **ยืนยันซ้ำด้วยบัญชี test1 จริง (ไม่ใช่บัญชี admin):** หลัง data fix ผู้ใช้เช็คใน simulator แล้วยังไม่เห็นการเปลี่ยนแปลง ทั้งที่บอกว่า clear history แล้ว — ผมล็อกอินด้วยบัญชี `test1@suntorywellness.co.th` (กรรมการล้วน ไม่ใช่ admin) ตรงๆ ผ่าน Chrome DevTools MCP ตรวจ network request จริงยืนยันว่า API คืนโครงการทั้ง 2 ตัวถูกต้อง 100% และ UI render "สร้างแอพ" พร้อมปุ่ม "ให้คะแนน 7 เกณฑ์" ถูกต้อง สรุปว่าฝั่งข้อมูล/RLS/โค้ดถูกต้องสมบูรณ์แล้ว ปัญหาที่เหลือเป็นแคช iOS Safari ล้วนๆ — **"Clear History" ในแอป Safari เองไม่ล้าง Website Data/Cache Storage จริง** ต้องใช้ Settings > Safari > Clear History and Website Data ถึงจะเห็นผล (ผู้ใช้ยืนยันว่าทำแบบนี้แล้วเห็นถูกต้อง) — จดไว้เป็นขั้นตอน troubleshoot มาตรฐานเวลาเจอ "แก้แล้วแต่ยังเหมือนเดิม" บน iOS ครั้งต่อไป
- **มี 3 บัญชีทดสอบมาตรฐานแล้ว (แจ้งโดยผู้ใช้ 2026-09-11):** `test1@suntorywellness.co.th` (กรรมการ), `test2@suntorywellness.co.th` (พนักงาน), `seksun_wongyang@suntorywellness.co.th` (admin) — รหัสผ่านไม่เก็บในไฟล์นี้ (เก็บใน Claude memory ที่เป็น local ไม่ push ขึ้น git แทน) ผู้ใช้ขอให้ใช้ 3 บัญชีนี้ทดสอบตลอดไป ไม่ต้องสร้างบัญชีทดสอบใหม่อีก

**ยุบการ์ดยาวให้เหลือ 2-3 บรรทัด — leaderboard + โครงการของฉัน (2026-09-11 ค่ำ, ตามคำขอผู้ใช้):** การ์ดมือถือของ `.data-table` เดิม stack ทุก `<td>` เป็นคนละบรรทัดเสมอ ทำให้การ์ดที่มีหลายคอลัมน์ (leaderboard: อันดับ/โครงการ/โรงงาน/คะแนน, kaizenList: ชื่อ/badge/วันที่) สูงถึง 5 บรรทัดโดยไม่จำเป็น
- `js/views/leaderboard.js` — เพิ่ม class `lb-rank`/`lb-project`/`lb-plant`/`lb-score` ให้แต่ละ `<td>` และ class `lb-table` บน `<table>` (ไม่แตะโครงสร้าง `<td>` เดิม แค่ติด class เพิ่ม)
- `js/views/kaizenList.js` — รวมรหัสโครงการ+ contextLine เป็นบรรทัดเดียว (`code · ctx`) ในเซลล์เดียวกันแทนที่จะเป็นคนละ `<div>` (มีผลทั้งเดสก์ท็อป+มือถือ เพราะเป็นแค่รวมข้อความเดิมสองบรรทัดเป็นบรรทัดเดียว ไม่ได้ลบข้อมูล), เพิ่ม class `kl-title`/`kl-badge`/`kl-date`/`kl-actions`, เพิ่ม class `kl-table` บน `<table>`
- `css/style.css` (ในกรอบ `@media max-width:760px` เดิม) — ใช้ `display:grid` กำหนด `grid-row`/`grid-column` ให้แต่ละ td ตรงๆ (ไม่สนใจลำดับใน HTML): `.lb-table` ให้อันดับ+โครงการ+คะแนนอยู่แถวเดียวกัน (คะแนนชิดขวา) แล้วโรงงานอยู่แถวถัดมาใต้ชื่อโครงการ (รวม 3 บรรทัด: ชื่อ/รหัส/โรงงาน) `.kl-table` ให้ badge+วันที่อยู่แถวเดียวกัน (badge ซ้าย วันที่ขวา) ใต้ชื่อโครงการ (รวม 3 บรรทัด: ชื่อ/รหัส·สถานะ/badge+วันที่)
- การ์ด "รางวัลใหญ่" (ที่ผู้ใช้แนบมาเป็นตัวอย่างที่ 3) **ไม่ได้แก้** เพราะตรวจแล้วอยู่ที่ 2-3 บรรทัดอยู่แล้วโดยไม่มีข้อความซ้อนทับ (`.hstack` เดิมมี `flex-wrap:wrap` รองรับชื่อยาวอยู่แล้ว)
- ทดสอบสดผ่าน Chrome DevTools MCP ครบทั้ง 2 หน้า ด้วยทั้งบัญชี test1 และ seksun_wongyang: leaderboard เหลือ 3 บรรทัด (ชื่อ/รหัส/โรงงาน, อันดับ+คะแนนชิดกับบรรทัดชื่อ), kaizenList เหลือ 3 บรรทัด (ชื่อ/รหัส·สถานะ/badge+วันที่) ไม่มีข้อความซ้อนทับ ไม่มี overflow, ไม่มี console error — bump cache-busting `style.css` เป็น `20260911f`

### 4.5 รูปโปรไฟล์ (avatar) — สมัครสมาชิก + แสดงทั้งระบบ (2026-09-10 ค่ำ)

ดูมติเต็มที่ §2.7 — สรุปสถานะ: **implement client-side ครบแล้ว แต่ยังใช้งานจริงไม่ได้จนกว่าจะรัน migration** เพราะ storage bucket `avatars` ยังไม่ถูกสร้างบน live Supabase project

**ต้องทำก่อนใช้งานได้จริง:** รัน `supabase/migration_2026-09-10_avatars.sql` ใน Supabase SQL editor ของ project จริง (ปลอดภัย รันซ้ำได้ ไม่กระทบข้อมูลเดิม — เพิ่ม bucket + 4 policies เท่านั้น)

**ไฟล์ที่แก้:**
- `supabase/schema.sql` — เพิ่ม bucket `avatars` + 4 policies (read/insert/update/delete) ต่อจาก `kaizen-photos` เดิม, ลบ comment เก่าที่บอกว่า "ยังไม่มี bucket" ออก
- `supabase/migration_2026-09-10_avatars.sql` (ใหม่) — diff สำหรับ project ที่มีอยู่แล้ว
- `js/api.js` — เพิ่ม `uploadAvatar(userId, file)`, `getAvatarSignedUrl(path)`
- `js/ui.js` — ย้าย `resizeImage()` มาจาก `kaizenForm.js` (ใช้ร่วมกันแล้ว), เพิ่ม `hydrateAvatars(root, getSignedUrl)`
- `js/views/register.js` — เพิ่มช่องเลือกรูปโปรไฟล์ (ไม่บังคับ) + orchestration หลัง `signUp()` แบบ best-effort
- `js/app.js` — sidebar-user + tabbar-avatar รองรับ `data-avatar-path` + เรียก `hydrateAvatars()` ท้าย `renderChrome()`
- `js/views/adminUsers.js` — การ์ดรออนุมัติ + แถวตารางรองรับ `data-avatar-path` + เรียก `hydrateAvatars()` ท้าย `renderRows()`
- `js/views/adminAudit.js` — เพิ่ม `avatarPathOf()`, แถวเหตุการณ์รองรับ `data-avatar-path` + เรียก `hydrateAvatars()` ท้าย `renderPage()`
- `js/views/kaizenForm.js` — การ์ดผู้เสนอขั้น 1 รองรับ `data-avatar-path`, ลบ `resizeImage()` local function ออก (import จาก `ui.js` แทน) + เรียก `hydrateAvatars()` ท้าย `renderStep()`

**ทดสอบแล้ว (2026-09-10, ก่อนรัน migration):** สมัครสมาชิกพร้อมแนบรูปจริงผ่านเบราว์เซอร์ (upload file บน `<input type="file">`) → preview วงกลมเปลี่ยนเป็นรูปทันที → submit → ยืนยันผ่าน network request ว่า resize เป็น JPEG ก่อนอัปโหลดจริง, `POST storage/v1/object/avatars/{id}/avatar` ตอบ `400 NoSuchBucket` ตามคาด (ยังไม่มี bucket) แต่การสมัครยัง success/redirect ปกติไม่มี error รั่วให้ผู้ใช้เห็นเลย (best-effort ทำงานถูกต้อง) → ยืนยัน `js/ui.js`/`js/api.js`/`js/views/kaizenForm.js` โหลดผ่าน dynamic import ไม่มี syntax/resolve error หลัง refactor `resizeImage`

**ยังไม่ได้ทดสอบ (รอรัน migration):** อัปโหลดสำเร็จจริง, `hydrateAvatars()` แสดงรูปจริงแทนตัวย่อชื่อ, การแสดงผลใน adminUsers.js/adminAudit.js/sidebar/tabbar/kaizenForm ด้วยบัญชีที่มี `avatar_path` จริง

### 4.6 ทำ backlog B12-B15 จาก §3.4 (2026-09-11)

ดูรายละเอียดที่มา/ทิศทางที่คุยไว้เต็มที่ §3.4 — implement ครบทั้ง 4 ข้อแล้ว (B13 เลือก "รอบใหม่เท่านั้น" ตามที่ยืนยันไว้ ไม่กระทบรอบที่ publish ไปแล้ว)

**B12 — ซ่อน section "โครงการของฉัน" บน dashboard สำหรับบัญชีที่ `!canPropose`:**
- `js/views/dashboard.js` — ซ่อนทั้ง tab-switcher ("ของฉัน"/"ทั้งโรงงาน"/"รอบก่อนหน้า") และ section "โครงการของฉันในรอบนี้" ถ้า `!canPropose` (กรรมการล้วนที่ไม่มี role employee/admin) — `.two-col` เหลือแค่คอลัมน์ "ผลรอบที่ประกาศแล้ว" อันเดียว grid จัดการให้อัตโนมัติ
- ทดสอบ regression ผ่านบัญชี employee จริง (canPropose=true) — section ยังโชว์ปกติทุกอย่างเหมือนเดิม ไม่มี console error

**B13 — โครงการที่ยังไม่เสร็จไม่ติดอันดับ (รอบใหม่เท่านั้น):**
- `supabase/schema.sql` — เพิ่มคอลัมน์ `evaluation_periods.rank_requires_completion boolean not null default true`, แก้ `v_kaizen_results.rank_overall` ให้เป็น `null` สำหรับโครงการ `is_completed=false` ในรอบที่ flag นี้เป็น true (weighted_score ยังคำนวณให้ดูเป็น feedback ปกติ)
- `supabase/migration_2026-09-11_rank-requires-completion.sql` (ใหม่) — เพิ่มคอลัมน์ด้วย `default false` ก่อน (รอบเดิมทุกรอบ = พฤติกรรมเดิมเป๊ะ) แล้วค่อยเปลี่ยน default เป็น `true` ทีหลัง ให้มีผลเฉพาะรอบที่สร้างใหม่หลังจากนี้ — **รันบน live project แล้ว** (ผู้ใช้รันเองผ่าน Supabase SQL Editor, 2026-09-11: "Success. No rows returned")
- `js/views/leaderboard.js` — แก้ sort (`RankOverall === null` ไปท้ายสุด, เรียงตามคะแนนแทน), แก้ `isTop` guard (`null <= 3` เป็น `true` ใน JS โดย default เป็นบั๊กที่ต้องกันไว้ก่อน), โชว์ "ยังไม่เสร็จ — ไม่นับอันดับ" แทนเลขอันดับ
- `js/views/dashboard.js` — การ์ด "ผลรอบที่ประกาศแล้ว" แก้ให้โชว์ข้อความเดียวกันแทน `อันดับ null จาก N` ที่จะเกิดขึ้นถ้าไม่แก้
- ทดสอบสดที่รอบเก่า (`2026-10`, สร้างก่อน migration) ยืนยันว่า RankOverall ยังเป็นเลขปกติไม่ใช่ null (พฤติกรรมเดิมไม่เปลี่ยน) — **ยังไม่ได้ทดสอบ rank=null ของจริง** (ต้องมีรอบใหม่ที่สร้างหลัง migration + โครงการที่ยังไม่เสร็จมีคะแนนแล้ว ซึ่งยังไม่มีข้อมูลจริงแบบนี้ตอนนี้)

**B14 — ลดความซับซ้อน "บันทึกความคืบหน้า" (kaizenProgress.js):**
- ตัดตัวเลือก % แบบ step (25/50/60/75/90/100) ออกทั้งหมด เหลือแค่ "รายละเอียด (ทำอะไรไปแล้ว)"/"ติดขัด"/"วันติดตามครั้งถัดไป" — **ไม่ได้แตะ** `NextFollowUpDate`/`Obstacles` เพราะยังใช้จริงที่อื่น (overdue-tracking ใน `kaizenList.js`, required field ตอนส่งขั้น 4 ของ `kaizenForm.js`) ไม่เกี่ยวกับ % ที่ซับซ้อนเกินจำเป็นตามที่คุยไว้
- ประวัติความคืบหน้า (ทั้งใน `kaizenProgress.js` และ `kaizenDetail.js`) ตัด badge `%` ออกจากทุกแถว เหลือแค่วันที่ + โน้ต
- ไม่แก้ schema เลย (`kaizen_progress_updates.progress_pct`/`kaizen_projects.progress_pct` ยังอยู่ครบ แค่หยุดเขียน/แสดงผลเชิงรุก ข้อมูลเก่าไม่หาย)
- ลบการแสดงผล `${ProgressPct}%` ที่เหลือทุกจุด: `kaizenList.js` (subtitle สถานะ), `kaizenDetail.js` (ป้ายสถานะ), `dashboard.js` (แถวโครงการ)
- **ทดสอบสดครบ end-to-end จริง** (สร้างโครงการทดสอบผ่าน API ตรง, submit, เปิดหน้า progress, บันทึกความคืบหน้าโดยไม่มี %) — UI ไม่มี % picker เหลือแล้ว, ประวัติแสดงวันที่+โน้ตถูกต้องไม่มี badge %, สถานะเปลี่ยนเป็น "กำลังดำเนินการ" ไม่มี % ต่อท้ายทั้งใน `kaizenList.js`/`kaizenDetail.js`, ไม่มี console error ตลอดทาง — โครงการทดสอบ (id `df33bc57-f234-4bf9-8965-b43c1bad12e4`, ชื่อ "QA test B14 progress simplification") ที่ค้างอยู่ในฐานข้อมูลจริงหลังทดสอบถูก**ลบออกแล้ว** (ผู้ใช้รัน `delete from kaizen_projects where id = 'df33bc57-...'` เองผ่าน Supabase SQL Editor, 2026-09-11: "Success. No rows returned" — cascade ลบ `kaizen_progress_updates`/`kaizen_attachments`/`committee_scores` ที่เกี่ยวข้องไปด้วยตาม `on delete cascade`)

**B15 — เครื่องมือรางวัล 2 ระดับ (ไม่มี ledger):**
- `js/views/adminPeriodDetail.js` — เพิ่ม section "รายชื่อผู้มีสิทธิ์รับเงินรางวัลส่งโครงการ" (ชื่อ/รหัสพนักงาน/แผนก/รหัสโครงการ/วันที่ส่ง) ต่อจากการ์ดสรุปเดิม — ดึงจาก `getKaizenByPeriod()`+`getAllProfiles()` ที่มีอยู่แล้ว ไม่ต้องเพิ่ม API/schema ใหม่
- `js/views/adminPeriods.js` — เพิ่ม checkbox เลือกรอบ (เฉพาะ published/closed) ในตารางรอบทั้งหมด + ปุ่ม "เปรียบเทียบ Top 3 ข้ามรอบ" — ดึง `getResults()` ของทุกรอบที่เลือกมารวมกัน กรองเอาเฉพาะ `RankOverall !== null` (เคารพกติกา B13 อัตโนมัติ) เรียงคะแนนสูงสุด 3 อันดับ แสดงชื่อ/โครงการ/รอบที่มา/คะแนน
- ไม่มีการแก้ schema/API ใหม่เลยตามที่ประเมินไว้ — ใช้ `getResults()`/`getKaizenByPeriod()`/`getAllProfiles()` เดิมทั้งหมด
- **ทดสอบสดครบแล้ว (2026-09-11, บัญชี admin จริงผ่าน Chrome DevTools MCP จำลองมือถือ ~485px)**: หน้า "เปรียบเทียบ Top 3 ข้ามรอบ" ใน `adminPeriods.js` เรนเดอร์ถูกต้อง (ปุ่ม pill, การ์ด "ประวัติรางวัลที่ประกาศแล้ว" พร้อมปุ่ม "ลบประกาศ" จัดวางไม่ล้นจอ, ยืนยันด้วย `getBoundingClientRect()` ว่าไม่มี element ล้น viewport เลย), การ์ดรางวัลใหญ่บน `dashboard.js` (§2.11) แสดงชื่อ+คะแนนถูกต้องแม้ข้อความยาว — **กดทดสอบ logic จริงครบทั้ง 3 ปุ่ม**: (1) ติ๊กเลือก 1 รอบ (`2026-10`, มีแค่รอบเดียวที่ published อยู่ตอนนี้) กด "เปรียบเทียบ" คำนวณ Top 3 ถูกต้อง (2) กรอกชื่อ+กด "ประกาศผลรางวัลนี้" สร้างประกาศใหม่สำเร็จ ยืนยันว่า banner บน `dashboard.js` อัปเดตเป็นประกาศล่าสุดจริง (3) กด "ลบประกาศ" ของประกาศทดสอบที่สร้างไว้ ยืนยันว่า banner หายไปและ dashboard กลับไปโชว์ประกาศก่อนหน้า ("รอบที่ 1") ถูกต้อง — เก็บ "รอบที่ 1" ไว้ตามที่ผู้ใช้ขอ (ไม่ใช่ข้อมูลทดสอบที่ต้องลบ)

### 4.7 หน้า "โปรไฟล์ของฉัน" — ใหม่ทั้งหน้า (2026-09-12)

ผู้ใช้ส่ง mockup หน้าโปรไฟล์แนวสี hero gradient + avatar วงกลม + สถิติ 3 การ์ด + list ตั้งค่าบัญชี ขอให้ทำแบบนี้ในแอป KAIZEN — ปรับสีจากม่วง/ชมพูในต้นแบบเป็นโทนฟ้าของแอป (ไม่ใช่ full redesign)

- **Route ใหม่** `#/profile` (`js/router.js`), view ใหม่ `js/views/profile.js` — ทุก role เข้าได้ (employee/committee/admin)
- **เนื้อหา**: hero gradient (`var(--primary)` → `var(--primary-hover)`) มี avatar วงกลมใหญ่ (`.avatar.is-xl`, ใหม่) + ปุ่มดินสอเปลี่ยนรูปทับมุมขวาล่าง, ชื่อ, badge role ทุกอัน (พนักงาน/กรรมการ/ผู้ดูแลระบบ) — สถิติ 3 การ์ด: โครงการที่เสนอ (นับจาก `getMyKaizenList()` ที่ status ≠ draft), ประกาศผลแล้ว (status = published), คะแนนล่าสุด (ไล่หา `getResults()` ของรอบ published ล่าสุดที่มีโครงการตัวเอง — เอาลอจิกเดียวกับ `dashboard.js`'s `myLatestResult`) — ท้ายหน้า: อีเมล/รหัสพนักงาน/แผนก-โรงงาน (แปลง code→label ผ่าน `getMasterData()` แล้ว ไม่ใช่ code ดิบ)/สลับภาษา/ออกจากระบบ
- **เปลี่ยนรูปโปรไฟล์**: reuse `resizeImage()`+`uploadAvatar()`+`updateProfile()` เดิมจาก register.js เป๊ะ ไม่เขียน upload logic ใหม่ (ฟังก์ชันนี้ชื่อ `updateMyProfile()` มาก่อน เปลี่ยนชื่อ 2026-09-12 — Spec.md §4.8 backlog Low #4)
- **เข้าถึงหน้านี้**: กดที่ avatar+ชื่อในกล่องผู้ใช้ (`#sidebar-user` เดสก์ท็อป, `#mobile-drawer-user` มือถือ) — เดิมเป็น `<div>` เฉยๆ ไม่คลิกได้ ครอบด้วย `<a href="#/profile">` ใหม่ (`.sidebar-user-link`, ต้องประกาศ `flex-direction:row` ตรงๆ ตามกฎเดิมของโปรเจกต์เรื่อง label/link ที่สืบ `column` มาจาก global `label{}`)
- **ปัญหาที่เจอระหว่างทำและแก้แล้ว**:
  1. `.profile-settings-row.is-button` (ปุ่ม "ภาษา"/"ออกจากระบบ" ที่ทำเป็น `<button>` ให้กดได้) สืบ `color:#fff` มาจาก base `button{}` rule เพราะไม่ได้ประกาศ `color` เอง ทำให้ตัวหนังสือค่า (เช่น "ไทย") กลายเป็นสีขาวมองไม่เห็นบนพื้นขาว — แก้ด้วยประกาศ `color: var(--text)` ตรงๆ
  2. กดลิงก์โปรไฟล์จาก `#mobile-drawer-user` แล้ว drawer ไม่ปิดตามไปด้วย (ต่างจากลิงก์ใน `#mobile-drawer-nav` ที่มี event delegation ปิด drawer อยู่แล้ว) — เพิ่ม delegation แบบเดียวกันให้ `#mobile-drawer-user` ด้วย
  3. ต้องอัปเดต avatar ที่ sidebar/drawer/tabbar ทันทีหลังเปลี่ยนรูป โดยไม่ reload ทั้งหน้า แต่ `profile.js` (view ที่ import แบบ dynamic คนละ URL/version กับ `app.js` ที่โหลดจาก `index.html` ตรงๆ) import `app.js` ตรงๆ ไม่ได้ (จะกลายเป็นคนละ module instance, `cachedSession` ในนั้นไม่ใช่ตัวที่ระบบใช้จริง) — แก้ด้วย `CustomEvent('kaizen:profile-updated')` ยิงจาก `profile.js` แล้วให้ `app.js` (singleton ตัวจริง) ฟังแล้ว refresh session+chrome เอง แทนการ import ข้าม module
- ทดสอบสดผ่าน Chrome DevTools MCP ครบทั้งมือถือ (~485px) และเดสก์ท็อป (1440px): อัปโหลดรูปจริงสำเร็จ เห็นรูปอัปเดตทันทีทั้งใน hero, sidebar, และ bottom tabbar โดยไม่ reload, กดลิงก์จาก drawer แล้ว drawer ปิดถูกต้อง, สลับภาษาแล้วค่าเปลี่ยนถูกต้อง, แผนก/โรงงานโชว์เป็นชื่อไทยไม่ใช่ code ดิบ, ไม่มี overflow, ไม่มี console error

**ล้างข้อมูลทดสอบทั้งหมดตามคำขอผู้ใช้ เพื่อทดสอบ flow เองตั้งแต่ต้น (2026-09-12):** ผู้ใช้ขอ "clear ประวัติการ submit ทั้งหมด" — ตรวจสอบรายการ (9 โครงการ) กับผู้ใช้ก่อนลบทุกครั้งตามหลัก "การกระทำที่ย้อนกลับไม่ได้ต้องขอยืนยันก่อน"
- ลบ `kaizen_projects` ทั้ง 9 แถวผ่าน REST API ด้วยสิทธิ์ admin (`k_delete_admin` RLS) — cascade ลบ `kaizen_attachments`/`kaizen_progress_updates`/`committee_scores` ที่ผูกอยู่ไปด้วยอัตโนมัติ (ตรวจสอบยืนยันว่าทั้ง 4 ตารางเหลือ 0 แถวพอดี)
- ผู้ใช้ขอลบ `evaluation_periods` ต่อด้วย — **พบว่าลบผ่าน RLS ปกติไม่ได้**: `ep_delete_admin` policy อนุญาตลบเฉพาะ `status='draft'` เท่านั้น (แม้เป็น admin ก็ตาม) และ `guard_period_status` trigger บังคับให้สถานะเดินทางเดียว `draft→open→closed→published` ไม่มีทางย้อนกลับมา draft ได้เลย ทั้ง 2 รอบที่มีอยู่ (`published`, `open`) จึงล็อกไม่ให้ลบโดยตั้งใจ (กันข้อมูลประวัติหาย) — อธิบายให้ผู้ใช้ทราบและให้ SQL `delete from evaluation_periods where id in (...)` ไปรันเองผ่าน Supabase SQL Editor (สิทธิ์ postgres/service role bypass RLS ได้ ซึ่งผมไม่มี) แทนที่จะพยายามข้ามกฎเอง — ตรวจสอบก่อนให้ SQL ว่าไม่มีตารางไหนอ้างอิง `evaluation_periods` อยู่แล้ว (ไม่ชน FK)
- ผู้ใช้รันสำเร็จ ("Success. No rows returned") ยืนยันว่า `evaluation_periods` เหลือ 0 แถว, dashboard ขึ้น "ไม่มีรอบประเมินที่เปิดอยู่ตอนนี้" และหน้า "รอบการประเมิน" ขึ้น empty state ถูกต้อง ไม่มี console error — ระบบพร้อมให้ผู้ใช้ทดสอบ flow สร้างรอบ→ส่งโครงการ→ให้คะแนน→ปิด/ประกาศผล ด้วยตัวเองตั้งแต่ศูนย์

**บั๊ก: แก้ไขข้อมูลหลักใน `adminMaster.js` แล้ว "บันทึกการเปลี่ยนแปลง" กลับไปเป็นค่าเดิมเสมอ — เจอทุก type ไม่ใช่แค่โรงงาน (2026-09-12):** ผู้ใช้รายงานว่าแก้ไขชื่อโรงงานไม่ได้ — ทดสอบจริงพบว่า **แก้ได้และกด "บันทึก" ได้ปกติ แต่ค่าที่บันทึกจริงเป็นค่าเดิมก่อนแก้เสมอ ไม่ใช่ค่าที่เพิ่งพิมพ์** (ตรวจสอบยืนยันจาก network request จริง — payload ที่ส่งไป DB เป็นค่าเก่าตลอด)
- **สาเหตุ:** `onSaveAll()` เรียก `state.saving = true; renderPage();` เป็นบรรทัดแรกเพื่อโชว์สถานะ "กำลังบันทึก..." บนปุ่ม — แต่ `renderPage()` สร้าง `<tr>` ทุกแถวใหม่ทั้งหมดจาก `rowsByType` (ข้อมูลเดิมที่ยังไม่ได้แก้ใน state) ทำให้ input ที่ผู้ใช้เพิ่งพิมพ์แก้ไขไว้ **ถูกรีเซ็ตกลับเป็นค่าเดิมทันที** ก่อนที่ for-loop ข้างล่างจะทันได้อ่านค่าจาก `row.querySelector(...).value` เลยอ่านได้ค่าเดิม (bug เดียวกับที่คอมเมนต์เดิมในไฟล์เตือนไว้แล้วสำหรับ `markRowDirty()` แต่ `onSaveAll()` เขียนพลาดจุดเดียวกันซ้ำ) — กระทบทุก type ที่หน้านี้จัดการ (แผนก/โรงงาน/ตำแหน่งกรรมการ/ช่วงงบประมาณ/ช่วง cost saving) ไม่ใช่แค่โรงงาน
- **แก้:** อ่านค่าจาก input ของทุกแถวที่ dirty เก็บไว้ในตัวแปร `pending` **ก่อน** เรียก `renderPage()` เสมอ แล้วค่อยใช้ค่าที่เก็บไว้นั้นยิง `updateMasterDataRow()` แทนที่จะอ่านจาก DOM สดหลัง render ใหม่ไปแล้ว
- ทดสอบสดยืนยันด้วย network request จริง (ก่อนแก้: payload เป็นค่าเดิมเสมอ, หลังแก้: payload เป็นค่าที่พิมพ์จริง และ DB บันทึกค่าใหม่ถูกต้อง) — ทดสอบผ่านช่องชื่อโรงงาน (ตามที่ผู้ใช้รายงาน) แล้ว restore ค่าทดสอบกลับเป็นเดิมหลังยืนยันบั๊กแล้ว ("โรงงาน 1")
- **ส่วน "ลบ" ที่ผู้ใช้ถามด้วย: ไม่ใช่บั๊ก แต่เป็นข้อจำกัดที่ตั้งใจไว้ตาม MVP scope** — หน้านี้ไม่มีปุ่มลบแถว master_data เลยสักที่ (ทุก type) มีแค่ checkbox "Active" ให้ปิดใช้งานแทนการลบถาวร แม้ RLS (`md_delete_admin`) จะอนุญาตให้ admin ลบได้จริงก็ตาม — ยังไม่ได้ทำ UI รองรับ (backlog B11 "Admin UI ขั้นสูง" ในมุมนี้)

**ตรวจสอบ + อัปเดตชื่อตำแหน่งกรรมการ (`master_data` type `committee_role`) ให้ตรงกับไฟล์อ้างอิง `KAIZEN Proposal Program score criteria.xlsx` (2026-09-12):**
- ตรวจ rubric ข้อความ 5 ระดับทั้ง 6 เกณฑ์ (Safety/Quality/Productivity/Apply/Gemba/Communication) ใน `js/constants.js` (`SCORE_LEVELS`) เทียบกับ Excel ทีละคำ — **ตรงกัน 100% ทั้ง 30 รายการ** ไม่ต้องแก้อะไร
- ชื่อตำแหน่งกรรมการใน seed เดิมไม่ตรงกับ Excel แล้ว (องค์กรเปลี่ยนตำแหน่งจริง — ผู้ใช้ยืนยัน: "ตอนนี้ไม่มี Head of PD แล้ว เป็น Director / ส่วน Director เป็น asst director") — ก่อนแก้ พบว่า `committee_weight_for_kaizen()` (SQL function ใน `schema.sql`, ใช้ทำ self-scoring weight redistribution ตาม §2.9) hardcode `where pr.committee_role = 'director'` ไว้ตรงๆ — เตือนผู้ใช้เรื่องความเสี่ยงนี้ก่อนแก้ และตรวจสอบ (`grep`) ยืนยันว่าอีก 4 code (`head_of_pd`/`plant_mgr`/`hr_mgr`/`mt_ut_mgr`) ไม่มีที่ไหน hardcode อ้างอิงเลย
- **แก้แล้ว** (PATCH ตรงผ่าน REST API, ยืนยันด้วย reload หน้า `adminMaster.js` จริงว่าค่าตรง): 
  - `head_of_pd` → code เปลี่ยนเป็น `production_director` (ปลอดภัย ไม่มีที่อ้างอิง), label "ผู้อำนวยการฝ่ายผลิต"/"Production Director"
  - `director` → **คง code เดิม `director` ไว้ตามเดิมโดยตั้งใจ** (ไม่ rename เพราะจะทำให้ `committee_weight_for_kaizen()` พังเงียบๆ ถ้าไม่แก้ SQL migration คู่กัน ซึ่งผู้ใช้ไม่ได้ยืนยันให้ทำ) แก้แค่ label เป็น "ผู้ช่วยผู้อำนวยการ"/"Asst Director" (ตรง Excel เป๊ะ แก้จาก "Assistant Director" ที่เคยตั้งไว้ผิด)
  - `plant_mgr`→`plant_manager`, `hr_mgr`→`hr_manager`, `mt_ut_mgr`→`mt_ut_manager` (ทั้งหมด rename code ปลอดภัย ไม่มีที่อ้างอิง), label EN ปรับตาม casing ใน Excel เป๊ะ ("Plant manager"/"HR manager"/"MT/UT manager") — label TH เดิมตรงอยู่แล้วไม่ต้องแก้
- **ยังไม่ทำ**: SQL migration เปลี่ยน `committee_weight_for_kaizen()` ให้อ้าง code ใหม่ — ถ้าในอนาคตต้องการ rename `code='director'` จริงๆ (เช่นเป็น `asst_director`) ต้องแก้ function นี้คู่กันเสมอ ไม่งั้น self-scoring weight redistribution จะเงียบหายไป

### 4.8 ตรวจสอบระบบแบบ End-to-End (Critical/High/Medium/Low) — เริ่มแก้ไข (2026-09-12)

ผู้ใช้ขอให้ตรวจทั้งระบบ (frontend/API/DB/RLS/auth/background flow) หา bug, ช่องโหว่สิทธิ์/ข้อมูล, business logic ผิด, edge case, UX, performance และ test ที่ขาด — ใช้ 4 subagent คู่ขนานตรวจแยกส่วน (auth, kaizen submission/IDOR, evaluation periods, security/perf/CTA sweep) ร่วมกับตรวจ RLS/trigger/RPC/view ทั้งหมดใน `schema.sql` และไฟล์ view หลักโดยตรงเอง แล้ว verify finding สำคัญด้วยการอ่านโค้ดจริง/ทดสอบสดก่อนสรุป (ไม่เชื่อ agent เฉยๆ)

**สรุป finding ทั้งหมดที่ยืนยันแล้วว่าเป็นปัญหาจริง (ไม่ใช่ false positive) แบ่งตามระดับ:**

**Critical:**
- **C1 — Stored XSS ผ่านชื่อไฟล์แนบ** (`kaizen_attachments.file_name` → `openLightbox()`/thumbnail grid ใน `kaizenDetail.js`/`reviewScore.js`) เพราะ `escapeHtml()` ไม่ escape `"` ปลอดภัยแค่ใน text content ไม่ปลอดภัยใน attribute — ยืนยันด้วยการทดสอบสดจริงทั้งก่อน/หลังแก้ (payload `onerror=`/`onload=` หลุดออกจาก attribute จริงก่อนแก้, ถูกกักไว้ในค่า attribute ปกติหลังแก้)
- **C2 — `v_kaizen_results` ไม่กรอง `kaizen_projects.status`** โครงการที่ admin ตีกลับ (need_revision) หลังให้คะแนนครบ หรือค้างที่ scored/pending_review ยังโผล่ในผลลัพธ์/leaderboard/เปรียบเทียบ Top-3 (เงินรางวัลจริงตาม §3 B15) ทั้งที่ไม่เคยอนุมัติ
- **C3 — โครงการของกรรมการที่เป็นเจ้าของเองอาจติดค้างที่ `pending_review` ตลอดกาล** เกต `→scored` (`guard_kaizen_transition`/`submit_score()`) ต้องการให้ทุกคนใน roster ของ `committee_weights` ส่งคะแนนครบ **รวมเจ้าของโครงการเองด้วยถ้าเขาเป็นกรรมการรอบนั้น** แต่ UI (ตาม §2.8/§2.9) บล็อกไม่ให้เขาให้คะแนนตัวเองถาวร — แม้ admin ก็บังคับสถานะนี้ตรงๆ ไม่ได้ (bypass เฉพาะ target `approved`/`need_revision`/`published`เท่านั้น ไม่รวม `scored`) **ต้องตัดสินใจเรื่อง business rule ก่อนแก้ — รอผู้ใช้เลือกแนวทาง**

**High:**
- **H1 — สถานะ `need_revision` ไม่มีทางแก้แล้วส่งใหม่ได้จริง** `kaizenForm.js`'s `isDraftStatus` เป็น false เมื่อ status เป็น need_revision ทำให้ step 6 ไม่มีปุ่มส่ง มีแต่ข้อความตายตัว "ถูกส่งไปแล้ว" — ไม่มีจุดไหน set status กลับ draft/in_progress เลย ยืนยันตรงจากโค้ด `kaizenForm.js:296,318-319`
- **H2 — คะแนนกรรมการที่ "submitted" แล้วยังแก้ไขได้จนกว่ารอบจะปิด** (`cs_update_self` เช็คแค่ `is_locked=false` ไม่เช็ค `status='draft'`) ขัดกับข้อความ UI "ส่งแล้วแก้ไขไม่ได้อีก" — **มีคำถามเรื่อง business rule ว่าอันไหนคือพฤติกรรมที่ต้องการจริง (comment ในสคีมาเดิมบอกว่าตั้งใจให้แก้ได้ตลอด)**
- **H3 — เปิดรอบอาจใช้น้ำหนักกรรมการที่ยังไม่ได้บันทึกจริง** `adminPeriodDetail.js`'s `onOpen()` ไม่เรียก `onSaveWeights()` ก่อน ยืนยันตรงจากโค้ด
- **H4 — โครงการที่ยังไม่ได้อนุมัติก่อนประกาศผลรอบค้างถาวร** `publish_period()` ย้ายเฉพาะ `approved→published`, `close_period()` ไม่เช็ค completeness ฝั่ง server (แค่ client) — **มีคำถามเรื่อง business rule ว่าจะบังคับเข้มขึ้นแค่ไหน**

**Medium (14 รายการ):** CTA ซ้ำใน `kaizenList.js` (M2), "อันดับ null" ใน `kaizenDetail.js:106` (M1), แก้น้ำหนักกรรมการตอนรอบเปิดไม่เช็ค sum=100% (M3), ฟอร์มไม่ re-validate รอบเปิด/deadline ตอนแก้ไข (M4), เข้าหน้าแก้ไขโครงการคนอื่นได้แม้เขียนจริงจะถูกบล็อก (M5), ไฟล์แนบอาจค้างใน storage/ไม่จำกัดขนาด-ประเภท (M6), error message ดิบไม่แปล (M7), สมัครซ้ำโชว์ error ดิบ/เดา email ได้ (M8), admin ถอด role ตัวเองได้ไม่มีกันล็อกตัวเอง (M9), ไม่มีระบบลืมรหัสผ่าน (M10), `adminAudit.js` N+1 ~200 query (M11), race UI เล็กน้อยที่ปุ่มเปิด/ปิด/ประกาศผล (M12), `deletePeriod()` เงียบเมื่อถูก RLS บล็อก (M13), ไม่เช็ค `period_start ≤ period_end` (M14)

**Low (10 รายการ) — ✅ แก้ครบแล้วทั้งหมด ดู Round 4 ด้านล่าง:** ไม่มีช่องยืนยันรหัสผ่าน+password policy อ่อน, STATUS_LABEL ซ้ำ 3 ที่, ชื่อฟังก์ชัน `updateMyProfile()` ทำให้เข้าใจผิด, ไม่มี pagination หลายจุด (เสี่ยงต่ำมากในสเกลนี้), `mime_type` ไม่มี CHECK constraint, นามสกุลไฟล์ไม่ sanitize, คำนวณวันเลยกำหนดคลาดเคลื่อนได้ ±1 วันจาก timezone, บันทึกความคืบหน้า+อัปเดต kaizen ไม่ atomic, `submission_deadline` ผูกกับ timezone เครื่อง admin, need_revision แก้ไขไม่ได้เลยถ้ารอบปิดไปแล้ว

**สิ่งที่ตรวจแล้วว่าปลอดภัย/ถูกต้อง (ไม่ใช่บั๊ก):** role escalation ทุกเส้นทาง (สมัคร/แก้โปรไฟล์เอง) ถูกกันไว้ที่ `guard_profile_fields()`/`handle_new_user()` แล้ว, route/RLS gating หน้า admin ถูกต้อง, ไม่มี secret รั่วในโค้ด, ไม่มี `console.log` ข้อมูลอ่อนไหว, double-click ที่ปุ่มส่ง/เปิด-ปิด-ประกาศผลรอบปลอดภัยจริงเพราะ DB lock, storage RLS ทั้ง 2 bucket ป้องกัน path คนอื่นได้จริง, rubric คะแนนตรงกับ Excel 100% (ตรวจไปแล้วก่อนหน้า)

**Round 1 — แก้ไข Critical ที่ไม่ต้องตัดสินใจเรื่อง business rule (2026-09-12):**
- **C1 แก้แล้ว:** เพิ่ม `escapeAttr()` เป็น shared export ใน `js/ui.js` (escape `"` เพิ่มจาก `escapeHtml()`), ใช้แทนที่ `openLightbox()` (`ui.js`), thumbnail grid ใน `kaizenDetail.js:143` และ `reviewScore.js:184` — bump cache-bust tag ทุกจุดที่ import ไฟล์เหล่านี้ (`20260911g`→`20260911i`) ตามกติกา CLAUDE.md — **ทดสอบสดยืนยันแล้ว**: ยิง payload `x" onerror="window.__xss_fired=true"` ผ่าน `openLightbox()` จริงในเบราว์เซอร์ ก่อนแก้ทำให้เกิด attribute `onerror` จริงบน `<img>` (พิสูจน์ช่องโหว่มีจริง), หลังแก้ payload ถูกกักในค่า attribute ปกติ ไม่มี `onerror` หลุดออกมาเลย ทดสอบ regression ด้วยชื่อไฟล์ปกติ (ภาษาไทย) ว่ายังแสดงผลถูกต้อง — **ยังไม่ได้ทดสอบผ่านหน้าจริงที่มีข้อมูล kaizen/attachment จริง** เพราะข้อมูลทดสอบถูกล้างไปแล้วก่อนหน้านี้ในเซสชันนี้ (ทดสอบที่ระดับฟังก์ชัน/DOM ตรงแทน ซึ่งเป็นจุดที่บั๊กอยู่จริง)
- **C2 เขียนแก้แล้ว รอผู้ใช้รัน migration:** เพิ่ม `and k.status in ('approved','published')` ใน `v_kaizen_results` (`supabase/schema.sql` แก้ตรงแล้ว, สร้าง `supabase/migration_2026-09-12_results-status-filter.sql` สำหรับรันบน live project) — ปลอดภัยที่จะรันตอนนี้เพราะไม่มี `kaizen_projects`/`evaluation_periods` เหลืออยู่เลย (ผู้ใช้ล้างไปแล้วก่อนหน้า) ไม่กระทบผลลัพธ์ที่เคยประกาศไปแล้ว
- **C3 ยังไม่แก้ — รอผู้ใช้ตัดสินใจ** เพราะกระทบ business rule โดยตรง (จะยกเว้น roster requirement ยังไง ระหว่างเจ้าของโครงการที่เป็นกรรมการด้วย)

**Round 1 ต่อ — ผู้ใช้ตัดสินใจ C3 แล้ว (2026-09-12):** เลือก "ยกเว้นเจ้าของออกจาก roster ที่ต้องส่งคะแนนสำหรับโครงการของตัวเอง" (ตัวเลือกที่แนะนำ) — แก้ `guard_kaizen_transition()`'s เกต `→scored` และ `submit_score()`'s `v_all_submitted` ทั้งคู่ให้กรอง `committee_id <> owner_id::text` ออกจาก roster ที่ต้องเช็คก่อนนับว่า "ครบ" (ยังต้องให้คะแนนโครงการคนอื่นในรอบเดียวกันตามปกติ — ยกเว้นเฉพาะโครงการของตัวเองเท่านั้น) — สร้าง `supabase/migration_2026-09-12_owner-scoring-deadlock-fix.sql`
- **Edge case ที่ยอมรับไว้ตรงๆ (คล้าย §2.9):** ถ้ารอบมีกรรมการแค่คนเดียวคือเจ้าของโครงการเอง โครงการจะเข้า `'scored'` ทันทีโดยไม่มีใครให้คะแนนจริงเลย — known limitation ไม่ได้แก้เพิ่ม

**ผู้ใช้รัน migration ทั้ง 2 ไฟล์ (C2 + C3) บน live project แล้ว (2026-09-12) — ทดสอบสด end-to-end ยืนยันทั้งคู่ทำงานถูกต้อง:**
สร้างรอบทดสอบจริงผ่าน REST API ตรง (คีย์ `sb-...-auth-token` ของ 3 บัญชีทดสอบ) จำลองสถานการณ์เป้าหมายเป๊ะ: รอบ `C3TEST-01` มีกรรมการ 2 คน (admin/seksun_wongyang + test1) น้ำหนักคนละ 50% — สร้างโครงการ A เป็นเจ้าของโดย **admin เอง** (ซึ่งเป็นกรรมการของรอบนี้ด้วย) และโครงการ B เป็นเจ้าของโดย test2 (พนักงานธรรมดา ไม่ใช่กรรมการ) ผ่านคิวส่ง→pending_review ทั้งคู่
- **C3 ยืนยันสำเร็จ:** หลัง **test1 คนเดียว** (ไม่ใช่ admin) ให้คะแนนโครงการ A ครบ 7 เกณฑ์แล้วส่ง — โครงการ A เปลี่ยนเป็น `'scored'` ทันทีอัตโนมัติ (ก่อนแก้จะค้างที่ `pending_review` ตลอดไปเพราะต้องรอ admin ให้คะแนนตัวเองซึ่งเป็นไปไม่ได้) ส่วนโครงการ B (ไม่ใช่ของกรรมการ) ยังต้องรอทั้ง test1 และ admin ให้คะแนนครบทั้งคู่ก่อนถึงจะเข้า `'scored'` เหมือนเดิมทุกประการ (ทดสอบยืนยันว่า flow ปกติไม่กระทบ)
- **C2 ยืนยันสำเร็จ:** admin อนุมัติโครงการ B (`approved`) แต่ตีกลับโครงการ A (`need_revision`) หลังให้คะแนนครบแล้ว จากนั้นปิด+ประกาศผลรอบ — query `v_kaizen_results` ด้วยสิทธิ์ test2 (พนักงานธรรมดา, จำลองมุมมองสาธารณะหลังประกาศผล) คืนกลับมา **เฉพาะโครงการ B (approved→published) เท่านั้น โครงการ A ที่ถูกตีกลับไม่ปรากฏเลย** ตรงตามที่ตั้งใจแก้เป๊ะ
- ล้างข้อมูลทดสอบแล้ว: ลบไฟล์แนบใน storage + `kaizen_projects` ทั้ง 2 แถว (cascade ลบ `kaizen_attachments`/`committee_scores` ที่เกี่ยวข้องอัตโนมัติ) เหลือแค่รอบทดสอบ `C3TEST-01` ที่ผู้ใช้ต้องลบเองผ่าน SQL Editor (สถานะ `published` แล้ว `ep_delete_admin` policy ไม่อนุญาตให้ลบผ่าน RLS ปกติ เหมือนที่เจอมาก่อนหน้านี้ในเซสชัน)

**สรุป Critical ทั้ง 3 ข้อ: แก้และทดสอบสดยืนยันครบทุกข้อแล้ว — พร้อมไปต่อ High**

### Round 2 — High (2026-09-12)

ผู้ใช้ตัดสินใจ 2 จุดที่กระทบ business rule ก่อนเริ่มแก้:
- **H2:** เลือก "ให้สามารถแก้ไขคะแนนได้จนกว่าจะปิดรอบ" — คงพฤติกรรมเดิม (RLS อนุญาตอยู่แล้ว) แต่ทำให้ UI **รองรับการแก้ไขจริง** แทนที่จะแค่แก้ข้อความ (เดิม UI ล็อกฟอร์มทั้งหมดทันทีที่ส่งคะแนน ทั้งที่ RLS ยังให้แก้ได้จนกว่ารอบจะปิด)
- **H4:** เลือกตัวเลือกที่แนะนำ — เพิ่มปุ่ม admin "ประกาศรายตัว" สำหรับโครงการตกค้าง **และ** บังคับเช็ค completeness ที่ `close_period()` ฝั่ง server ด้วย

**แก้แล้ว + ทดสอบสด end-to-end ผ่านหน้าจริง (ไม่ใช่ยิง API ตรง) ยืนยันทั้ง 4 ข้อทำงานถูกต้อง:**

- **H1** (`js/views/kaizenForm.js`): เพิ่มการดึง `openPeriod` ในโหมดแก้ไขเมื่อ status เป็น `need_revision`, แก้ `isDraftStatus` ให้รวม `need_revision` (เปิดปุ่มส่ง step 6), และใน `onSubmit()` เพิ่มการย้าย `Status: 'draft'` + `PeriodId` เป็นรอบที่เปิดอยู่ปัจจุบันก่อนเรียก `submitKaizen()` — **ทดสอบสดผ่าน UI จริง**: สร้างโครงการ ส่ง ตีกลับ (need_revision) ด้วยบัญชี test2 แล้วแก้ไขผ่านฟอร์มจริงจนถึง step 6 กดยืนยันส่ง — โครงการเปลี่ยนเป็น `pending_review` สำเร็จ, `period_id` ชี้ไปที่รอบที่เปิดอยู่ปัจจุบันถูกต้อง, `submitted_at` รีเฟรชใหม่
  - **หมายเหตุ (พบระหว่างแก้ ยังไม่ได้แก้):** ถ้าโครงการถูกตีกลับ (need_revision) *หลังจาก* รอบเดิมปิดไปแล้ว (เป็นไปได้จริงเพราะ admin ตัดสิน scored→need_revision ได้ไม่ว่าจะช่วงไหน) เจ้าของจะแก้ไข/บันทึกร่างอะไรในฟอร์มไม่ได้เลยแม้แต่ก่อนถึงขั้นส่ง เพราะ `k_update_own` RLS เช็ค `period_status_of(period_id) in ('draft','open','scoring')` จาก period_id **เดิม** (ที่ปิดไปแล้ว) เป็นการล็อกที่ RLS โดยตรง แก้ไม่ได้ด้วยโค้ด JS ฝั่งเดียว ต้องแก้ policy ซึ่งกระทบ security boundary — ยังไม่ได้ทำในรอบนี้ ต้องคุยเพิ่มว่าจะยกเว้น `need_revision` ออกจากเงื่อนไข period-status หรือไม่
- **H2** (`js/views/reviewScore.js`): เพิ่ม `state.isLocked` (จาก `score.IsLocked`) แยกจาก `state.isSubmitted` — ฟอร์ม/radio ยังโต้ตอบได้ตราบใดที่ `!isLocked` แม้ส่งไปแล้ว, ปุ่มเปลี่ยนจาก "ส่งคะแนน" เป็น "บันทึกการแก้ไขคะแนน" (เรียก `saveScoreDraft()` เดิม ไม่ต้องเรียก `submitScore()` ซ้ำเพราะ RPC ปฏิเสธถ้า status เป็น submitted แล้ว), ข้อความ "ส่งแล้วแก้ไขไม่ได้อีก" แก้เป็น "ส่งแล้วยังแก้ไขต่อได้จนกว่ารอบนี้จะปิด" — **ทดสอบสดผ่าน UI จริง**: test1 ให้คะแนนครบ 7 เกณฑ์ + ส่ง → กลับเข้าหน้าเดิม ยืนยัน radio ยังกดได้ไม่ล็อก มีปุ่ม "บันทึกการแก้ไขคะแนน" → เปลี่ยนคะแนนข้อ Safety จาก 4→2 แล้วกดบันทึก → ตรวจ DB ตรงยืนยัน `items.safety=2`, `raw_sum` sync ใหม่ถูกต้อง (28→26), `status` ยังเป็น `submitted` (ไม่ต้องส่งซ้ำ), `is_locked=false`
- **H3** (`js/views/adminPeriodDetail.js`): `onOpen()` เรียก `updatePeriod(period.Id, {CommitteeWeights: state.weights})` ก่อนเรียก `openPeriod()` เสมอ — **ทดสอบสดผ่าน UI จริง**: พิมพ์น้ำหนักกรรมการ 100% ในฟอร์มโดย**ไม่กด**"บันทึกน้ำหนัก"ก่อน แล้วกด "เปิดรอบ" ตรงๆ → ยืนยัน DB มีทั้ง `status='open'` และ `committee_weights` ตรงกับที่พิมพ์ในฟอร์ม (ก่อนแก้จะยังเป็นค่าเดิม `{}` และ RPC จะ reject ด้วย "At least one committee member with a weight is required")
- **H4** (`supabase/schema.sql` — `close_period()`, `js/views/adminPeriodDetail.js`): เพิ่มเช็ค `count(*) from kaizen_projects where period_id=X and status='pending_review'` ใน `close_period()` ก่อนอนุญาตปิดรอบ (raise exception ถ้า >0) + เพิ่มปุ่ม "ประกาศรายตัว" สำหรับโครงการที่ยัง `approved` อยู่หลังจากรอบ `published` ไปแล้ว (เรียก `updateKaizen(id,{Status:'published'})` ตรง ซึ่ง `k_update_admin`/`guard_kaizen_transition`'s admin-bypass อนุญาตอยู่แล้วไม่ว่า period จะสถานะไหน) — สร้าง `supabase/migration_2026-09-12_close-period-completeness-check.sql`
  - **ผู้ใช้รัน migration แล้ว (2026-09-12) — ทดสอบสดผ่าน UI จริงยืนยันทั้ง 2 กลไกทำงานถูกต้อง**: (1) สร้างโครงการค้างที่ `pending_review` ในรอบ H1H2TEST-01 (เปิดอยู่) แล้วเรียก `close_period()` ตรง — **ถูกปฏิเสธถูกต้อง** ด้วยข้อความ `"Cannot close: 1 project(s) still pending committee review"` พอให้คะแนนจนโครงการเข้า `'scored'` แล้วเรียกซ้ำ — **สำเร็จ** (2) จำลอง straggler จริง: ประกาศผลรอบ (`publish_period()`) ทั้งที่โครงการยังเป็น `'scored'` (ไม่ได้ตัดสิน) → ยืนยันโครงการค้างที่ `scored` ต่อไป (ไม่ถูกดันเป็น published อัตโนมัติ) → เข้าหน้า `adminPeriodDetail.js` จริง กด "อนุมัติ" (เปลี่ยนเป็น approved) → ปุ่ม **"ประกาศรายตัว" ปรากฏขึ้นจริงตามเงื่อนไข** → กดปุ่ม ยืนยัน confirm dialog ผ่าน `handle_dialog` → ยืนยัน DB: `status='published'`, `published_at` ถูกตั้งค่าใหม่ถูกต้อง

**สรุป High ทั้ง 4 ข้อ: แก้และทดสอบสดยืนยันผ่าน UI จริงครบทุกข้อแล้ว — ไม่มี Critical/High ค้างอยู่ (ยกเว้นหมายเหตุ H1's RLS edge case ด้านบนที่ยังไม่ตัดสินใจว่าจะแก้)**

**ข้อมูลทดสอบที่ต้องลบผ่าน SQL Editor** (ทุกอันไม่ใช่ `draft` แล้ว ลบผ่าน RLS ปกติไม่ได้):
```sql
delete from evaluation_periods where code in ('C3TEST-01', 'H3TEST-01', 'H1H2TEST-01');
```
(ตรวจสอบแล้วว่าไม่มี `kaizen_projects`/`committee_scores` เหลืออยู่ในทั้ง 3 รอบนี้ — ลบข้อมูลทดสอบที่เกี่ยวข้องระหว่างทดสอบไปหมดแล้ว ปลอดภัยที่จะลบรอบทิ้งได้เลย)

### Round 3 — Medium ทั้ง 14 ข้อ (2026-09-12)

แก้เป็น 7 กลุ่มตามลำดับผลกระทบ business logic/data correctness/ผู้ใช้จำนวนมากก่อน ทดสอบสดผ่านหน้าจริงยืนยันทุกข้อ (ไม่ใช่แค่ตรวจโค้ด) ก่อนแก้กลุ่มถัดไป:

**กลุ่ม 1 — ความถูกต้องของข้อมูลรอบประเมิน (M3, M14):** `adminPeriodDetail.js` เพิ่ม warning banner เมื่อ sum น้ำหนักกรรมการ ≠ 100% บนรอบที่ไม่ใช่ draft (ทดสอบ: ลบกรรมการจนเหลือ 0% แล้วบันทึกในรอบที่เปิดอยู่ เห็น warning ถูกต้อง) — `adminPeriods.js` เพิ่มเช็ควันสิ้นสุด ≥ วันเริ่ม และ deadline ≥ วันเริ่ม ตอนสร้างรอบ (ทดสอบ: กรอกย้อนกลับ ถูกบล็อกด้วยข้อความชัดเจน)

**กลุ่ม 2 — ความถูกต้องของการแสดงผล (M1, M2):** `kaizenDetail.js` แก้ "อันดับ null" เป็น "ยังไม่เสร็จ — ไม่นับอันดับ" (บั๊กเดียวกับที่แก้ไปแล้วใน dashboard.js/leaderboard.js ตาม B13 แต่พลาดจุดนี้) — `kaizenList.js` ลบปุ่ม "เสนอ KAIZEN ใหม่" ทั้ง 2 จุด (header action + empty-state) เหลือจุดเดียวคือปุ่ม "+" กลาง bottom tab bar ตามกติกา (ทดสอบยืนยันทั้งคู่ผ่านหน้าจริง)

**กลุ่ม 3 — ความทนทานของฟอร์มแก้ไข KAIZEN (M4, M5):** `kaizenForm.js` เพิ่มเช็ค ownership ก่อน render ฟอร์มแก้ไข (ยกเว้น admin ที่ RLS อนุญาตเขียนจริง) + ดึง `openPeriod` ในโหมดแก้ไขทุกกรณีที่ยังส่งได้ (draft/need_revision) ไม่ใช่แค่ตอนสร้างใหม่ (ทดสอบ: test1 เปิดฟอร์มแก้ไขโครงการคนอื่น ได้หน้า "ไม่มีสิทธิ์แก้ไขโครงการนี้" ถูกต้อง)

**กลุ่ม 4 — สุขอนามัยไฟล์แนบ (M6):** `api.js`'s `uploadAttachment()` ลบไฟล์ที่เพิ่งอัปทิ้งถ้า DB insert ล้มเหลวหลังอัปโหลดสำเร็จ (กัน orphan) + `kaizenForm.js`/`kaizenProgress.js` เช็ค `file.type.startsWith('image/')` ก่อนอัปโหลด (ทดสอบ: อัปไฟล์ .txt ถูกบล็อกก่อนถึง storage, จำลอง DB insert ล้มเหลว [ยิง phase ผิด CHECK constraint] ยืนยันไฟล์ที่อัปไปแล้วถูกลบออกจาก storage อัตโนมัติ 0 orphan เหลือ) — ~~ยังไม่ได้ทำ: ตั้ง `file_size_limit`/`allowed_mime_types` ที่ตัว bucket `kaizen-photos` เอง ต้องทำผ่าน Supabase Dashboard → Storage เท่านั้น~~ **✅ ทำแล้ว 2026-09-14** (20MB + `image/jpeg,image/png,image/webp,image/gif` — ดู Round 5 §4.8)

**กลุ่ม 5 — แปล error message เป็นไทย (M7):** เพิ่ม `translateError()` ใน `js/ui.js` (map ~28 ข้อความจาก trigger/RPC ที่เจอบ่อย, คืน `null` ถ้าไม่รู้จักให้ fallback อัตโนมัติ) ใช้แทนที่ `err.message` ตรงๆ ใน 13 ไฟล์ view (39 จุด) ทั้งหมด

**กลุ่ม 6 — auth/admin ops safety (M8, M9, M13):** `register.js` ครอบข้อความ error จาก unique-constraint (email/employee_id ซ้ำ) ด้วยข้อความกลางเดียวกันเสมอ กัน user enumeration — `adminUsers.js` disable chip "ผู้ดูแลระบบ" ของแถวตัวเอง + เช็คซ้ำใน `onSave()` กันแอดมินถอด role admin ตัวเองจนล็อกตัวเองออกจากระบบ (ทดสอบ: chip ตัวเอง disabled พร้อม tooltip, แถวคนอื่นยังกดได้ปกติ) — `api.js`'s `deletePeriod()` เพิ่ม `.select()` แล้วเช็คว่ามีแถวคืนจริงก่อนถือว่าสำเร็จ แทนที่จะเงียบเมื่อ RLS บล็อก (ทดสอบ: เรียกลบรอบที่ไม่ใช่ draft ได้ error ไทยชัดเจน, ลบรอบ draft จริงยังสำเร็จปกติ)

**กลุ่ม 7 — admin UX/perf polish (M11, M12):** เพิ่ม `getKaizenByIds()` ใน `api.js` (ดึงหลาย id พร้อมกันด้วย `.in()`) แทนที่ลูป `getKaizenById()` ทีละตัวใน `adminAudit.js` (เดิมสูงสุด ~200 คำขอพร้อมกัน — ทดสอบยืนยันจาก network request เหลือ query เดียว) — `adminPeriodDetail.js` เพิ่ม `state.actionSaving` กันกดซ้ำที่ปุ่มเปิด/ปิด/ประกาศผลรอบ (ทดสอบ: ดับเบิลคลิกปุ่ม "เปิดรอบ" เร็วๆ ยืนยันมี RPC call เดียวจริง)

**ไฟล์ที่เปลี่ยนทั้งหมดในรอบ Medium:** `js/ui.js`, `js/api.js`, `js/views/adminPeriodDetail.js`, `js/views/adminPeriods.js`, `js/views/kaizenDetail.js`, `js/views/kaizenList.js`, `js/views/kaizenForm.js`, `js/views/kaizenProgress.js`, `js/views/register.js`, `js/views/adminUsers.js`, `js/views/adminAudit.js`, และอีก 8 ไฟล์ view ที่ได้ import `translateError` (M7)

**ความเสี่ยงคงเหลือหลังรอบ Medium:** ต่ำมากทุกข้อ — ไม่มี regression พบระหว่างทดสอบสดทั้ง 7 กลุ่ม ยกเว้นงานที่ต้องทำนอกโค้ด 1 อย่าง (bucket limit ผ่าน Dashboard, กลุ่ม 4)

**สรุป: ไม่มี Critical/High/Medium ค้างอยู่แล้ว — เหลือแค่ Low (backlog, ยังไม่แก้ตามที่ตกลง) และ 1 หมายเหตุ RLS edge case จาก H1 ที่รอการตัดสินใจ**

---

### Round 4 — Low ทั้ง 7 กลุ่ม (2026-09-12)

แก้ทีละกลุ่มตามลำดับที่ผู้ใช้กำหนด ทดสอบสดผ่านหน้าจริง/API โดยตรงยืนยันทุกข้อก่อนแก้กลุ่มถัดไป (ไม่ใช่แค่ตรวจโค้ด) — สร้าง/ลบข้อมูลทดสอบเองทุกครั้งเพื่อจำลอง edge case จริง

**กลุ่ม 1 — Auth/UX:** เพิ่มช่องยืนยันรหัสผ่าน + password policy (min 8 ตัวอักษร, live hint) ใน `register.js`/`resetPassword.js` — เพิ่มระบบ "ลืมรหัสผ่าน" เต็มรูปแบบ (`forgotPassword.js`, `resetPassword.js` ใหม่, route `#/forgot-password`/`#/reset-password`) ใช้ Supabase `resetPasswordForEmail`/`updateUser` — **บั๊ก root-cause ที่พบระหว่างทำ**: event `PASSWORD_RECOVERY` จาก `detectSessionInUrl` ยิงเร็วมากจนหายไปเงียบๆ ถ้า subscribe ช้าแม้เสี้ยววินาที (จริงเสมอสำหรับ `app.js` ที่ subscribe หลัง ES module import graph resolve) — แก้โดยย้าย subscribe ไปที่ `api.js`'s module-top-level พร้อม cache/replay event ล่าสุด ทดสอบยืนยัน: ขอลิงก์รีเซ็ตไม่ enumerate email, ลิงก์หมดอายุแสดงข้อความชัดเจน, เข้าหน้าตรงๆ โดยไม่ผ่านลิงก์ถูกบล็อกถูกต้อง (ผ่าน `sessionStorage` flag แยกจาก raw session truthiness)

**กลุ่ม 2 — Date/Time:** นิยาม `SYSTEM_TIMEZONE='Asia/Bangkok'` กลางใน `constants.js` — แก้ `kaizenList.js`/`kaizenForm.js`'s overdue-day calc จากเทียบ `new Date(dateOnlyString)` (ตีความเป็นเที่ยงคืน UTC เสมอ = 7 โมงเช้าไทย ผิดได้ถึง 7 ชม.) เป็นเทียบ calendar date ล้วนๆ ผ่าน `todayInSystemTz()`/`daysBetweenDateStrings()` ใหม่ใน `ui.js` — `thaiDate()`/`thaiDateTime()` ผูก `timeZone` แล้ว ไม่พึ่ง timezone เครื่องผู้ใช้ — หน้า admin แสดง "(เวลาไทย ICT, UTC+7)" ชัดเจนที่ deadline ทุกจุด + `datetime-local` input แปลงเป็น UTC ด้วย offset +07:00 ตายตัว ทดสอบ: boundary ตรงเป๊ะ (ครบกำหนดวันนี้=ไม่เลยกำหนด, เลย 1/3 วัน=ถูกต้อง), cross-timezone (รันด้วย `TZ=America/Los_Angeles` ผลไม่เปลี่ยน)

**กลุ่ม 3 — Performance/Pagination:** เพิ่ม server-side pagination จริง (`.range()`+`count:'exact'`) ให้ `getMyKaizenListPage`, `getProfilesPage`, `getKaizenByPeriodPage`, `getPeriodsPage` พร้อม "โหลดเพิ่ม" ใน `kaizenList.js`/`adminUsers.js`/`adminPeriods.js`/`adminPeriodDetail.js` (ฟังก์ชันเดิมไม่ paginate ยังอยู่สำหรับจุดที่ต้องอ่านข้อมูลเต็ม เช่น badge/สรุปยอด) — **บั๊กที่พบ**: ลอง build `.or()` filter string เองฝั่ง client ก่อน แต่ PostgREST parse ไม่ผ่านถ้าคำค้นมีอักขระ `, ( ) .` แก้โดยย้ายเป็น SQL function `search_profiles()` (bind parameter ปลอดภัยกว่า) — ทดสอบ: สร้าง 25 โครงการจริงยืนยัน "โหลดเพิ่ม" ถูกต้อง, ค้นหาด้วยอักขระพิเศษไม่ error

**กลุ่ม 4 — Code Quality:** `dashboard.js`'s `STATUS_LABEL` ดึงจาก `KAIZEN_STATUS_LABELS` (constants.js) แทน hardcode ซ้ำ ยกเว้น `submitted` ที่ตั้งใจ override (มีคอมเมนต์อธิบาย ไม่ใช่ duplicate โดยไม่ตั้งใจ) — `kaizenList.js` ตรวจแล้วไม่มี duplicate จริง (ใช้ `statusBadge()` อยู่แล้ว) — เปลี่ยนชื่อ `updateMyProfile()` → `updateProfile()` ครบทุก call site + เอกสาร — **พบบั๊กเครื่องมือ**: `sed` แบบ `\b` word-boundary ใช้ไม่ได้บน macOS BSD `sed` (สาเหตุจริงของปัญหา "sed loop ล้มเหลว" ต้นๆ เซสชัน) แก้โดยใช้ plain substring replace แทน

**กลุ่ม 5 — File/DB Validation:** เพิ่ม CHECK constraint `kaizen_attachments_mime_type_allowed` จำกัด `mime_type` เหลือ `image/jpeg|png|webp|gif` (ตัด svg ออกเพราะแฝง script ได้) — **บั๊กที่พบและแก้**: `uploadAttachment()` เดิมหานามสกุลไฟล์จาก `file.name.split('.').pop()` ดิบๆ ถ้าตั้งชื่อไฟล์ไม่มีจุด (เช่น `"../../../evil"`) จะได้ "นามสกุล" ที่มี `/` ปน กลายเป็น path injection ใน storage path ได้ — แก้โดย derive นามสกุลจาก mime_type ที่ whitelist ไว้แล้วแทน ทดสอบ: อัปโหลดไฟล์ชื่อ path-traversal ได้ path ปลอดภัยเป็น `uuid.jpg` ปกติ, ยืนยัน DB constraint ปฏิเสธ mime_type แปลกแม้ข้าม client check ไปเรียก API ตรง

**กลุ่ม 6 — Atomicity:** รวม `kaizenProgress.js`'s onSaveProgress() (เดิม insert progress update + update kaizen_projects เป็น 2 คำสั่งแยก) เป็น RPC เดียว `add_progress_update()` (security definer, ใช้ `can_track_progress()` ตัวเดียวกับ RLS, `created_by` จาก `auth.uid()` ไม่รับจาก client) ทดสอบ: happy path ถูกต้อง, ส่ง `note=null` (ขัด NOT NULL) ยืนยัน rollback ทั้งหมด (สถานะ/next_follow_up_date ไม่เปลี่ยนแม้แต่นิดเดียว), user อื่นพยายามแก้ถูกบล็อกที่ authorization gate ก่อน insert ใดๆ

**กลุ่ม 7 — need_revision หลังรอบปิด (ซับซ้อนที่สุด):** สร้างตาราง `kaizen_edit_grants` (ใคร/เมื่อไหร่/หมดอายุเมื่อไหร่/เหตุผล/เพิกถอนได้) + RLS policy `k_update_own` เพิ่มเงื่อนไข "หรือมี grant ที่ยังไม่หมดอายุ" ต่อจากเงื่อนไขเดิม (ไม่เปิดกว้างตามสถานะ) + RPC `grant_kaizen_edit_window()`/`revoke_kaizen_edit_grant()` (admin เท่านั้น, บังคับ precondition "ติดจริง" เท่านั้น, จำกัด 1-168 ชม., audit log) — UI: `adminPeriodDetail.js` ต้องกรอกเหตุผล+เลือกเวลา+ยืนยันอีกครั้ง (กันกดพลาด) พร้อมปุ่มเพิกถอนทันที, `kaizenForm.js` แสดงข้อความบล็อกชัดเจน/banner ตามสถานะ grant จำลองสถานการณ์จริงครบวงจร (ส่ง→ให้คะแนน→ตีกลับ→ปิดรอบ) ทดสอบ: user อื่นแก้ไม่ได้แม้ grant active, grant หมดอายุ/ถูกเพิกถอนบล็อกทันที, precondition ทุกจุด (non-admin, เหตุผลว่าง, ชั่วโมงนอกช่วง, สถานะผิด, รอบยังเปิด, grant ซ้อน) — **พบบั๊กเพิ่มเติมระหว่างทำความสะอาดข้อมูลทดสอบ**: `deleteKaizen()` ไม่เช็คว่าลบสำเร็จจริง (เหมือน M13 เดิมของ `deletePeriod()` เป๊ะ แต่ไม่เคยแก้) ไม่มีทางเกิดผ่าน UI จริงเพราะปุ่ม "ลบร่าง" โผล่เฉพาะสถานะ draft ที่ RLS อนุญาตเสมอ — แก้ตามที่ผู้ใช้ขอ (เพิ่ม `.select()` + เช็คแถวว่าง)

**Migration ใหม่ที่รันแล้วในรอบนี้:** `migration_2026-09-12_search-profiles-rpc.sql`, `migration_2026-09-12_attachment-mime-type-check.sql`, `migration_2026-09-12_atomic-progress-update.sql`, `migration_2026-09-12_kaizen-edit-grants.sql` (ทั้งหมด fold เข้า `schema.sql` แล้ว)

**ไฟล์ที่เปลี่ยนทั้งหมดในรอบ Low:** `js/api.js`, `js/ui.js`, `js/constants.js`, `js/router.js`, `js/app.js`, `js/i18n.js`, `js/views/login.js`, `js/views/register.js`, `js/views/forgotPassword.js` (ใหม่), `js/views/resetPassword.js` (ใหม่), `js/views/kaizenList.js`, `js/views/kaizenForm.js`, `js/views/kaizenProgress.js`, `js/views/dashboard.js`, `js/views/adminUsers.js`, `js/views/adminPeriods.js`, `js/views/adminPeriodDetail.js`, `supabase/schema.sql`

**ความเสี่ยงคงเหลือ:** ต่ำ — ไม่มี regression พบระหว่างทดสอบสดทุกกลุ่ม รวม final regression ครอบคลุม login/submit/revision/upload/score/close/publish/leaderboard ทั้ง 3 role (employee/committee/admin) หมายเหตุเดียว: `onComplete()` ใน `kaizenProgress.js` (อัปโหลดรูปหลังทำ + อัปเดต IsCompleted) ยังเป็น 2 ขั้นตอนแยกเหมือนเดิม ไม่ได้อยู่ในขอบเขตกลุ่ม 6 ที่ขอ (เจาะจง "progress-save + สถานะ" เท่านั้น) และความเสี่ยง/impact ต่ำกว่ามาก

**สรุป: backlog Low ปิดครบทั้ง 7 กลุ่มตามที่ตกลง ไม่มี Critical/High/Medium/Low ค้างอยู่ในระบบแล้ว (ยกเว้นรายการ cleanup ข้อมูลทดสอบที่ระบุแยกไว้ท้ายสุด ซึ่งไม่ใช่บั๊ก แค่ข้อมูลทดสอบตกค้าง)**

---

### Round 5 — Housekeeping + หน้า Welcome + พบช่องว่างเรื่องภาษาของเนื้อหา KAIZEN (2026-09-14)

**Housekeeping ปิดท้าย backlog Low:**
- ตั้ง `file_size_limit` (20MB) + `allowed_mime_types` (`image/jpeg,image/png,image/webp,image/gif`) ที่ตัว bucket `kaizen-photos` เองผ่าน Supabase Dashboard → Storage แล้ว (ปิดชั้นป้องกันสุดท้ายของ Group 5 — client check + DB CHECK constraint + bucket เอง) — ทดสอบยิงตรงเข้า storage ข้ามทุกชั้นของแอป ยืนยัน: ไฟล์ผิดประเภทถูกปฏิเสธ (`mime type text/plain is not supported`), ไฟล์เกิน 20MB ถูกปฏิเสธ (`The object exceeded the maximum allowed size`), ไฟล์ถูกต้องอัปโหลดสำเร็จปกติ
- ลบข้อมูลทดสอบตกค้างทั้งหมด: evaluation_periods 6 รอบ (C3TEST-01, H3TEST-01, H1H2TEST-01, M3TEST-01, M5TEST-01, G7TEST-02), บัญชี QA ทดสอบ 3 บัญชี (ผ่าน Supabase Dashboard → Authentication — 1 บัญชีลบไม่ได้ตอนแรกเพราะมี `audit_log` 3 แถวอ้างอิงอยู่ [foreign key], ลบ audit_log ทั้ง 3 แถวนั้นก่อนแล้วลบ user สำเร็จ)
- **พบบั๊กเพิ่มเติมระหว่างทำความสะอาด**: `deleteKaizen()` ไม่เช็คว่าลบสำเร็จจริง (เหมือน M13 เดิมของ `deletePeriod()` เป๊ะ แต่ไม่เคยแก้ตอนนั้น) — พิสูจน์ได้จริง: เรียกบนโครงการที่ไม่ใช่ draft ในฐานะเจ้าของ (ไม่ใช่ admin) ดูเหมือนสำเร็จทั้งที่ RLS บล็อกเงียบๆ ไม่มีทางเกิดผ่าน UI จริง (ปุ่ม "ลบร่าง" โผล่เฉพาะสถานะ draft ที่ RLS อนุญาตอยู่แล้วเสมอ) แก้แล้วตามแบบ M13 (เพิ่ม `.select()` + เช็คแถวว่างก่อนถือว่าสำเร็จ) ทดสอบยืนยัน: ลบ draft ปกติยังสำเร็จ, ลบโครงการที่ไม่ใช่ draft ในฐานะเจ้าของได้ error ไทยชัดเจนแทนเงียบ

**หน้า Welcome ใหม่ + จำกัดจุดเลือกภาษาให้เหลือจุดเดียว:**
- สร้าง `js/views/welcome.js` — หน้าต้อนรับก่อนล็อกอิน (route `#/welcome`, public) ดีไซน์: โลโก้ Suntory Wellness ในการ์ดขาวลอยบน blob gradient ม่วง-ฟ้า (โทนสีเดิมของระบบ) + หัวข้อ + ปุ่ม "สร้างบัญชี" (ไป `#/register`) + ลิงก์ "เข้าสู่ระบบ" (ไป `#/login`) — แก้ `router.js`: hash ว่างตอนยังไม่ล็อกอินพาไป `#/welcome` แทนที่จะเด้งไป `#/dashboard` แล้วโดนบล็อกไป `#/login` ต่ออีกที (ถ้าล็อกอินอยู่แล้วยังไปตรงหน้า dashboard เหมือนเดิม, เข้า `#/welcome` ตรงๆ ทั้งที่ล็อกอินอยู่ก็เด้งไป dashboard)
- เพิ่มปุ่มสลับภาษา (TH/EN) ที่ 4 หน้า auth (login/register/forgot-password/reset-password) + หน้า welcome ก่อน แล้ว**พบบั๊กจริงจากการทดสอบเอง**: กลไกสลับภาษาทำงานโดย `navigate(location.hash)` ซ้ำหน้าเดิมทั้งหน้าเพื่อให้เนื้อหาเปลี่ยนภาษา แต่นี่รีเซ็ต state ในหน่วยความจำของหน้าปัจจุบันทิ้งหมดโดยไม่มีคำเตือน — ทดสอบยืนยัน 2 เคสจริง: (1) ฟอร์ม "เสนอ KAIZEN ใหม่" กรอกชื่อโครงการ+เลือกหมวดหมู่ที่ขั้น 2 แล้วกดสลับภาษา → เด้งกลับขั้น 1 ข้อมูลหายหมด (2) หน้า "จัดการผู้ใช้" พิมพ์คำค้นหาแล้วกดสลับภาษา → คำค้นหาหายทันที — ไม่กระทบข้อมูลใน DB (แค่ state ฝั่ง client) แต่เป็นความเสี่ยงจริงที่ผู้ใช้เจอได้บ่อย
- **ตัดสินใจ (ผู้ใช้)**: จำกัดจุดเลือกภาษาให้เหลือแค่หน้า **welcome** จุดเดียว เอาปุ่มออกจากอีก 4 หน้า auth และออกจาก sidebar/mobile-drawer หลังล็อกอินทั้งหมด (ทางแก้ที่เลือกคือตัดจุดที่ทำให้เกิดบั๊กออกไปเลย แทนที่จะแก้กลไกให้ปลอดภัย) — ค่าที่เลือกไว้ที่ welcome (localStorage เดิม) ยังใช้ได้ทุกหน้าถัดไปตามปกติ แค่ไม่มีปุ่มให้กดเปลี่ยนอีก ทดสอบยืนยัน: ปุ่มหายจากทั้ง 5 จุดที่ต้องเอาออก, เลือก EN ที่ welcome แล้วไป register (ไม่มีปุ่มแล้ว) ยังแสดงผลอังกฤษถูกต้อง (title + criteria tags), logout button ไม่กระทบ

**พบช่องว่างสำคัญ (ยังไม่ได้แก้ — รอผู้ใช้ตัดสินใจ): เนื้อหา KAIZEN ไม่มีการแปลภาษาเลย**
- ระหว่างคุยกันพบว่า: `kaizen_projects` มีคอลัมน์ `title_en`/`problem_description_en`/`improvement_approach_en` อยู่ในตารางจริง แต่ (1) ฟอร์มเสนอ KAIZEN **ไม่มีช่องกรอกภาษาอังกฤษเลยแม้แต่ช่องเดียว** (มีแค่ placeholder ว่างในโค้ด `kaizenForm.js` ไม่เคยถูกใช้งานจริง) และ (2) หน้าที่กรรมการอ่าน/ให้คะแนน (`kaizenDetail.js`, `reviewScore.js`) **ไม่เคยดึงฟิลด์ EN มาแสดงเลยแม้แต่จุดเดียว** อ่านฟิลด์ไทยตรงๆ เสมอไม่สนภาษา UI ที่เลือกไว้ — ผลคือกรรมการที่อ่านไทยไม่ออกให้คะแนนโครงการไม่ได้เลยในทางปฏิบัติ (การสลับภาษา UI ช่วยแค่เมนู/ป้ายทั่วไป ไม่ช่วยเนื้อหาจริง)
- **แนวทางที่คุยกันไว้ (ยังไม่ implement)**: เพิ่มระบบแปลอัตโนมัติด้วย Claude API (ตอนพนักงานกดส่ง KAIZEN → เรียก Supabase Edge Function แปล title/problem_description/improvement_approach เก็บลงคอลัมน์ `_en` ที่มีอยู่แล้ว → หน้ารีวิวโชว์ฟิลด์ EN เมื่อ UI เป็นอังกฤษ, fallback เป็นไทยถ้ายังไม่มีคำแปล) เทียบกับทางเลือกให้พนักงานกรอกเอง 2 ภาษา (ปฏิเสธไปแล้วเพราะพนักงานส่วนใหญ่ไม่เก่งอังกฤษ เสี่ยงช่องว่างเปล่าหรือแปลผิดความหมาย) — **ผู้ใช้ยังไม่ได้ตัดสินใจขั้นสุดท้ายเรื่อง translation provider** (เทียบ Claude API/Google Cloud Translation/Azure/OpenAI ไว้แล้ว) และต้องสมัคร API key เอง (บัญชี/บัตรเครดิตของผู้ใช้ ไม่ใช่สิ่งที่ทำแทนได้) — **ยังไม่มีโค้ดใดๆ ถูกเขียนสำหรับเรื่องนี้** เป็นแค่การตกลง requirement/design เบื้องต้นเท่านั้น

**ไฟล์ที่เปลี่ยนในรอบนี้:** `js/api.js` (deleteKaizen fix), `js/router.js` (welcome route + default-hash logic), `js/app.js` (เอาปุ่มสลับภาษาออกจาก sidebar/drawer), `js/i18n.js` (welcome_* keys), `js/ui.js` (authLangSwitchHtml/wireAuthLangSwitch — ยังเก็บไว้ใช้ที่ welcome.js จุดเดียว), `js/views/welcome.js` (ใหม่), `js/views/login.js`/`register.js`/`forgotPassword.js`/`resetPassword.js` (เอาปุ่มสลับภาษาออก), `css/style.css` (`.welcome-*`, `.auth-lang-switch`)

---

### Round 6 — ทดสอบ registration flow → พบช่องโหว่ RLS จริง: บัญชีที่ยังไม่อนุมัติเขียนข้อมูลได้ (2026-09-14/15)

**ทดสอบ end-to-end การสมัครบัญชีใหม่:** ฟอร์ม validate/สมัคร/บันทึก `profiles` (`IsActive: false` ตาม default)/หน้า dashboard โชว์ข้อความบล็อก/admin เห็นในคิว "รออนุมัติ" กดอนุมัติได้/ล็อกอินใช้งานได้หลังอนุมัติ — ทำงานถูกต้องทุกจุด

**พบช่องโหว่จริง (ยืนยันด้วยการยิง API ตรง ไม่ใช่แค่อ่านโค้ด):** บัญชีที่ `IsActive: false` (รออนุมัติ หรือถูก admin ปิดใช้งานทีหลัง) ยังสามารถ **สร้างโครงการ KAIZEN แบบร่าง (`kaizen_projects` insert) และเรียก RPC `submit_kaizen()` ได้ปกติทุกประการ** ข้อความ "บัญชีของคุณยังไม่ถูกเปิดใช้งาน" ที่ `dashboard.js` เป็นแค่ UI cosmetic — RLS จริง (`k_insert_own`, `k_update_own`, helper functions `can_write_kaizen()`/`can_track_progress()`) และ RPC `submit_kaizen()` ไม่เคยเช็ค `is_active` เลยแม้แต่จุดเดียว (ต่างจาก `is_admin()`/`is_committee()` ที่เช็คมาตั้งแต่ต้น) — ขัดกับหลักการของโปรเจกต์เองที่ว่า RLS คือด่านความปลอดภัยจริง ไม่ใช่ UI

**ทางแก้:** เพิ่มฟังก์ชัน `is_active_user()` (สไตล์เดียวกับ `is_admin()`/`is_committee()`) แล้วเสียบเข้าทุกเส้นทางเขียนของเจ้าของโครงการ: `k_insert_own`, `k_update_own`, `can_write_kaizen()`, `can_track_progress()` (ครอบคลุม `kaizen_attachments` + storage bucket policies ที่ใช้ 2 helper นี้อยู่แล้วโดยอัตโนมัติ), และเช็คตรงๆ ซ้ำอีกชั้นใน `submit_kaizen()` เพราะฟังก์ชันนี้เป็น `security definer` ซึ่งข้าม RLS ของตารางไปเลยแม้จะตั้ง `force row level security` ไว้ก็ตาม (ต้องเช็คเองในตัวฟังก์ชัน แก้แค่ policy ไม่พอ) — **ตั้งใจไม่แตะ**: read policies ใดๆ (บัญชีที่ถูกปิดใช้งานทีหลังยังควรอ่านประวัติโครงการเก่าของตัวเองได้ตามปกติ) และ `k_delete_own` (ลบร่างตัวเองไม่ใช่การกระทำในฐานะสมาชิก active แบบเดียวกับ insert/update/submit)

**ทดสอบยืนยันหลังแก้ (`migration_2026-09-15_inactive-account-write-block.sql` รันบน project จริงแล้ว):** ใช้ client แยกอิสระ (ไม่ผ่าน `app.js`/`api.js` ที่ share instance กับหน้าเว็บที่เปิดค้างไว้ กันผลทดสอบเพี้ยนจาก state เก่าที่ค้างอยู่) ยืนยันครบ: บัญชี `is_active=false` insert draft ถูก RLS ปฏิเสธ (`new row violates row-level security policy`), เรียก `submit_kaizen()` ได้ error ไทยชัดเจนแทน, แก้ไข (`update`) โครงการที่ตัวเองเป็นเจ้าของขณะถูกปิดใช้งานถูกบล็อก (`.single()` คืน "Cannot coerce the result to a single JSON object" = 0 แถวถูกแก้จริง) — และ regression check บัญชีปกติที่ `is_active=true` (test1/test2) ยังสร้าง/แก้โครงการได้ตามปกติไม่กระทบ

**ไฟล์ที่เปลี่ยนในรอบนี้:** `supabase/schema.sql` (เพิ่ม `is_active_user()`, แก้ `k_insert_own`/`k_update_own`/`can_write_kaizen()`/`can_track_progress()`/`submit_kaizen()`), `supabase/migration_2026-09-15_inactive-account-write-block.sql` (ใหม่ — diff สำหรับ project ที่มีอยู่แล้ว, รันแล้ว)

**พบเพิ่มระหว่างคุยกัน — bug ล็อกอินต้องกรอกซ้ำ 2 รอบถึงจะเข้าได้:** ผู้ใช้รายงานว่ากรอก email/password กด "เข้าสู่ระบบ" ครั้งแรกแล้วเหมือนไม่มีอะไรเกิดขึ้น ต้องกรอกใหม่รอบสองถึงจะเข้า dashboard ได้จริง — root cause เป็น race condition ใน `js/app.js`: `login.js` เรียก `signIn()` เสร็จแล้ว `navigate('#/dashboard')` ทันที แต่ `cachedSession` ที่ router ใช้เช็คสิทธิ์ถูกเติมโดย `onAuthStateChange` listener ซึ่งเป็น async callback แยกที่ไม่ผูกกับ promise ของ `signIn()` เลย — router เช็คสิทธิ์เร็วกว่า listener จะดึงโปรไฟล์เสร็จ เห็น session เป็น null ทั้งที่ล็อกอินสำเร็จจริง เลยเด้งกลับ `#/login` ทันที (กรอกรอบสองผ่านเพราะรอบแรก listener เติม cache เสร็จพอดีแล้ว) — แก้โดยให้ `getCurrentSession()` เช็ค auth session จริงสดทุกครั้งที่ cache ยังว่าง แทนที่จะเชื่อ cache เฉยๆ ปิด race ที่ต้นเหตุจุดเดียว ไม่ต้องแก้ทุกหน้าที่เรียก signIn แล้ว navigate ทันที ทดสอบยืนยันด้วย 2 บัญชีคนละ role กดเข้าสู่ระบบครั้งเดียวเข้า dashboard ได้ทันที — ไฟล์ที่เปลี่ยน: `js/app.js` (bump `index.html` เป็น `?v=20260911h`)

**พบเพิ่มอีกจุด — มือถือถ่ายรูปแล้วแนบไม่ติด:** ผู้ใช้รายงานว่าถ่ายภาพผ่านมือถือแล้วอัปโหลดไม่ได้ในฟอร์มเสนอ KAIZEN ขั้น 5 (แนบรูป) — สาเหตุคือรูปที่ถ่ายจากกล้อง (โดยเฉพาะ iPhone ที่ default เป็น HEIC/HEIF) ถูกเช็คปฏิเสธถูกต้องอยู่แล้วที่ `kaizenForm.js` (ตรงตาม allowlist JPEG/PNG/WEBP/GIF ที่ DB บังคับ) แต่กล่อง error (`#form-error`) อยู่ล่างสุดหลัง 4 ส่วนรูป (ก่อนทำ/ระหว่างทำ/หลังทำ/หลักฐานอื่นๆ) โดยไม่มีการเลื่อนจอให้เห็น — บนมือถือแนบรูปที่ dropzone แรกบนสุดแล้วโดนปฏิเสธ ข้อความจะอยู่นอกจอเงียบๆ ดูเหมือน "แนบไม่ติดเฉยๆ ไม่มี error" ทั้งที่จริงมีข้อความอยู่ — แก้ 2 จุด: (1) เพิ่มข้อความเฉพาะกรณี HEIC/HEIF บอกวิธีแก้ที่ตั้งค่ากล้องมือถือ แทนข้อความทั่วไป (2) ย้าย `scrollIntoView` ของกล่อง error จากใน `renderErrorBox()` (เรียกตอน `#step-body` ยังว่างเปล่า ก่อน `renderStep5()` เติมเนื้อหาจริง ทำให้เลื่อนตอนหน้ายังสั้นแล้วไม่เลื่อนซ้ำตอนหน้ายาวขึ้นทีหลัง) มาไว้ท้ายสุดของ `renderStep()` หลังเลย์เอาต์นิ่งแล้ว ทดสอบยืนยันบน viewport มือถือ (390×844) ด้วยไฟล์ `.heic` จริง: ข้อความเฉพาะ HEIC ขึ้นถูกต้องและเลื่อนจอมาให้เห็นอัตโนมัติ — ไฟล์ที่เปลี่ยน: `js/views/kaizenForm.js` (ไม่ต้อง bump tag ใดๆ — เป็น view file ที่ router.js cache-bust อัตโนมัติทุกครั้งอยู่แล้ว)

**พบสาเหตุจริงอีกจุดของปัญหาแนบรูปมือถือ — `crypto.randomUUID is not a function`:** ผู้ใช้ทดสอบผ่าน LAN IP ตรงๆ (`http://172.90.90.62:8123` ตามที่ตั้งไว้ให้คนอื่นทดสอบข้ามเครื่อง) เจอ error นี้ตอนอัปโหลดรูป — root cause: `crypto.randomUUID()` (ใช้ตั้งชื่อไฟล์ไม่ซ้ำกันใน storage path ที่ `js/api.js` `uploadAttachment()`) เป็น API ที่ browser เปิดให้เฉพาะ **secure context** เท่านั้นตามสเปก (https:// หรือ localhost/127.0.0.1) — `http://<LAN IP>` ไม่นับเป็น secure context เลย ฟังก์ชันนี้เลยหายไปตรงๆ ยืนยันสดว่า `window.isSecureContext` เป็น `false` และ `crypto.randomUUID` เป็น `undefined` จริงบน origin นั้น (เกิดกับ**ทุกไฟล์ทุกประเภท** ไม่ใช่แค่ HEIC ต่างจากบั๊กก่อนหน้า) — สำคัญเพราะกระทบการใช้งานจริงทุกครั้งที่ deploy/ทดสอบผ่าน HTTP ธรรมดาที่ไม่ใช่ localhost แก้โดยเพิ่ม `generateFileId()` ใน `js/api.js`: ใช้ `crypto.randomUUID()` เมื่อมี ไม่งั้น fallback เป็น UUID v4 แบบ `Math.random()` (ปลอดภัยพอเพราะใช้แค่ตั้งชื่อไฟล์ ไม่ใช่ security token) ทดสอบยืนยันจริงบน `http://172.90.90.62:8123` (ยืนยันว่าไม่ใช่ secure context ก่อน): อัปโหลดรูป PNG สำเร็จ ได้ signed URL ใช้งานได้ปกติ — ไฟล์ที่เปลี่ยน: `js/api.js` (bump shared cross-module tag ทั้งโปรเจกต์ `20260911z` → `20260911z2`)

---

### Round 7 — แทนที่ leaderboard ด้วยหน้า "Feed" โครงการทั้งหมด (2026-09-15)

**จุดเริ่ม:** ผู้ใช้เห็น mobile tabbar เหลือ 4 ปุ่ม (คาดว่าควรมี 5) ยืนยันว่าเป็นพฤติกรรมเดิมที่ตั้งใจไว้ — leaderboard tab โผล่เฉพาะมีรอบที่ "ประกาศผลแล้ว" เท่านั้น (ระบบเพิ่งล้างข้อมูลทดสอบไปเลยไม่มีรอบไหนประกาศผลเลย) แทนที่จะรอ/อธิบายซ้ำ ผู้ใช้ขอเปลี่ยน design แทน: **ให้หน้า "ผลการประเมิน" (leaderboard) เป็นหน้า Feed แบบ social feed** ให้ทุกคนเห็นโครงการที่ส่งแล้วของทุกคนได้เสมอ กรองตามรอบได้ ไม่ต้องรอประกาศผล

**ขอบเขตที่ตกลงกัน (ถามผู้ใช้ก่อนทำ):**
- แสดงเฉพาะโครงการสถานะ submitted ขึ้นไป (ไม่รวม draft)
- **ไม่โชว์คะแนน/อันดับใดๆ ในหน้านี้เลย** — โชว์แค่ข้อมูลพื้นฐาน (รูป/ปัญหา/แนวทาง/สถานะ/เจ้าของ)
- แทนที่หน้า leaderboard เดิมไปเลย ไม่แยกหน้าใหม่คู่กัน

**RLS (schema.sql + `migration_2026-09-15_kaizen-feed.sql`):** เดิมพนักงานเห็นได้แค่โครงการตัวเอง + โครงการที่ published เท่านั้น (`k_read_own`/`k_read_published`/`k_read_committee`) เพิ่ม 4 policy ใหม่แบบ additive (ไม่แทนที่อะไรเดิม, ไม่แตะ `can_read_kaizen()`/`kaizen_progress_updates`/`committee_scores`/`v_kaizen_results` เลยแม้แต่จุดเดียว — คะแนน/บันทึกความคืบหน้ายังเป็นข้อมูลภายในเหมือนเดิมทุกประการ):
- `k_read_feed` (kaizen_projects): `status <> 'draft'`
- `ka_read_feed` (kaizen_attachments): เปิดดูรูปของโครงการที่ไม่ใช่ draft
- `profiles_read_feed` (profiles): เปิดดูชื่อ/รูปโปรไฟล์เจ้าของโครงการที่ไม่ใช่ draft
- `kaizen_photos_read_feed` (storage.objects) — **พบระหว่างทดสอบสด**: 3 ข้อบนเปิดแค่แถวเมทาดาต้า `kaizen_attachments` แต่ไฟล์รูปจริงใน storage bucket เป็นคนละ RLS (`storage.objects`) แยกกันเสมอ ต้องเปิดเพิ่มอีกจุดไม่งั้น signed URL ของรูปคนอื่นได้ 400 ทั้งที่แถว attachment อ่านได้แล้ว — เจอบั๊กนี้จริงระหว่างทดสอบ แก้แล้ว รันเป็น statement แยกเพราะ 3 policy แรกรันไปก่อนหน้าแล้ว

**ทดสอบยืนยัน (สร้างโครงการทดสอบข้ามบัญชีจริง — admin สร้าง+ส่ง, เช็คว่า test2/employee ธรรมดาเห็นไหม):**
- test2 เห็นโครงการของ admin ที่ส่งแล้วในหน้า Feed ครบ (รูป/ชื่อเจ้าของ/ปัญหา/แนวทาง/สถานะ) ✅
- ยิง query ตรงเช็ค `committee_scores`/`kaizen_progress_updates`/`v_kaizen_results` ของโครงการเดียวกัน — คืน 0 แถวทั้งหมด (ไม่รั่วจริง) ✅
- สร้างโครงการสถานะ draft แยกทดสอบ — บัญชีอื่นมองไม่เห็นเลย (RLS บล็อกจริง ไม่ใช่แค่ UI ซ่อน) ✅
- Regression: หน้า dashboard.js "ผลรอบที่ประกาศแล้ว" (โชว์คะแนนของตัวเอง) เปลี่ยนลิงก์ "ดูตารางอันดับเต็ม" → "ดูโครงการทั้งหมดในรอบนี้" ไป `#/feed?period=<code>` แทน (คะแนนส่วนนี้ยังอยู่ใน widget เดิม ไม่ถูกย้าย)
- Mobile tabbar: ตอนนี้ 5 ปุ่มคงที่ทุก role เสมอ (dashboard/kaizen/+/feed/avatar-เมนู) ไม่มีเงื่อนไข "ต้องรอประกาศผล" อีกต่อไป — แก้ปัญหา "4 ปุ่ม" ที่ผู้ใช้ถามถึงไปในตัว

**ไฟล์ที่เปลี่ยน:** `supabase/schema.sql` (4 policy ใหม่), `supabase/migration_2026-09-15_kaizen-feed.sql` (ใหม่, รันแล้ว), `js/api.js` (เพิ่ม `getFeedPage()`, bump tag `z2`→`z3`), `js/router.js` (`#/leaderboard/:periodCode` → `#/feed`), `js/views/kaizenFeed.js` (ใหม่ แทนที่ `js/views/leaderboard.js` ที่ลบทิ้ง), `js/views/dashboard.js` (แก้ลิงก์), `js/app.js` (เอาเงื่อนไข `latestPublishedPeriodCode` ออก, ลบ badge computation ที่ไม่ใช้แล้ว, เปลี่ยนไอคอน/label), `js/i18n.js` (`nav_leaderboard`→`nav_feed`, เพิ่ม `empty_feed`), `css/style.css` (`.feed-*`, ลบ `.lb-*`/`.is-mine` ที่ตายแล้วจาก leaderboard เดิม, bump `index.html` เป็น `?v=20260911l`)

**ปรับ UX การ์ด Feed ตามฟีดแบ็ก (ยังวันเดียวกัน):** ย้ายชื่อ/รูปเจ้าของขึ้นเหนือรูป, เอา status badge ออกจากการ์ด, ลดระยะ padding บน-ล่างจนเท่ากับระยะข้างของรูป (0px ทั้งคู่), ตัดข้อความ "แนวทาง" ออกจากการ์ดเหลือแค่ชื่อ+ปัญหา, เพิ่มคลิกได้ทั้งการ์ด (ยกเว้นรูปที่เปิด lightbox เอง กับลิงก์ชื่อ) นำทางไปหน้ารายละเอียดเต็ม

**สรุป/ยืนยัน logic กับผู้ใช้ + เพิ่มกฎสำคัญ — ไม่เห็นคะแนนแม้ประกาศผลแล้วถ้าเข้าผ่าน feed:** ผู้ใช้ยืนยัน "โครงการของฉัน" (`#/kaizen`) เห็นแค่ของตัวเอง ส่วน Feed เห็นของทุกคนที่ส่งแล้วแต่ไม่เห็นสถานะ/คะแนน และคลิกดูรายละเอียดใครก็ได้ — ระหว่างคุยพบว่ากฎเดิม (ซ่อนสถานะ + คะแนนเฉพาะตอนรอบยังไม่ประกาศผล) ยังไม่พอ เพราะ `v_kaizen_results` เปิดให้ทุกคนอ่านได้ตามกฎเดิมของระบบทันทีที่รอบ**ประกาศผลแล้ว** (เหมือนพฤติกรรม leaderboard เดิม) ผู้ใช้ยืนยันชัดเจนว่าไม่ต้องการแบบนั้น — **ไม่ว่าประกาศผลหรือยัง คนที่ไม่ใช่เจ้าของ/admin ต้องไม่เห็นคะแนนเลยถ้าเข้าทางหน้ารายละเอียดที่มาจาก feed** (การประกาศผลจริงจะทำผ่านช่องทางอื่นแทน — ดูหัวข้อถัดไป) แก้โดยเพิ่มเงื่อนไข `canSeeStatus = isOwner || isAdmin` ใน `kaizenDetail.js` แล้วใช้เงื่อนไขเดียวกันคุม **ทั้ง** status badge **และ** การ query `v_kaizen_results` เอง (ไม่ query เลยถ้าไม่ใช่เจ้าของ/admin ไม่ใช่แค่ซ่อนตอน render) ทดสอบยืนยันผ่าน network log จริง: บัญชีอื่น (พนักงาน/กรรมการที่ไม่เกี่ยวข้อง) เปิดดูโครงการคนอื่นแล้ว **ไม่มี request ไป `v_kaizen_results` เกิดขึ้นเลย** เทียบกับก่อนแก้ที่ยังเห็น request นี้อยู่ (แค่ผลลัพธ์ไม่ถูกโชว์) — ปิดช่องโหว่ตั้งแต่ชั้น query ไม่ใช่แค่ชั้น UI

**บริบทเพิ่มเติมจากผู้ใช้ (ยังไม่ต้องทำอะไรตอนนี้ แค่บันทึกไว้):** ระบบการประกาศผลจริงที่วางแผนไว้มี 2 ระดับ — (1) **รายเดือน**: ประกาศ 5 โครงการคะแนนสูงสุดของเดือนนั้น (ยังไม่มีในระบบ — ต่างจาก B12 เดิมที่เป็นรางวัลเล็กแบบ "ส่งก็ได้" ไม่อิงคะแนน) (2) **รายไตรมาส** (ทุก 3 เดือน): รางวัลใหญ่ 3 รางวัลคะแนนสูงสุดข้ามรอบ — ส่วนนี้**มีอยู่แล้ว** คือฟีเจอร์ `quarterly_awards`/B15 ที่ทำไปตั้งแต่ 2026-09-11 (ตาราง snapshot ผล + หน้า `adminPeriods.js` ประกาศได้) ยังไม่ได้คุยกันต่อว่าจะ implement "รายเดือน Top 5" เมื่อไหร่/อย่างไร

---

### Round 8 — ปรับ UX การ์ด Feed ต่อ, เพิ่มปุ่ม Like, ปรับหน้า Dashboard (2026-09-15)

**ปรับการ์ด Feed ต่อจาก Round 7 (ทำทีละจุดตามฟีดแบ็กสด):**
- ทดลอง fix ความสูงการ์ดเท่ากับ max-width (640×640 สี่เหลี่ยมจัตุรัส) พร้อม line-clamp ชื่อ/ข้อความ — **ผู้ใช้ปฏิเสธ** ("ไม่เอา ย้อนกลับไปค่าเดิม") จึงย้อนกลับเป็นความสูงยืดตามเนื้อหาเหมือนเดิมทั้งหมด (บทเรียน: ไม่ใช่ทุก "ปรับให้เท่ากัน" จะหมายถึง fix ขนาดตายตัว)
- ย่อข้อความ "ปัญหา" เหลือ 2 บรรทัดด้วย `-webkit-line-clamp` (เหตุผลผู้ใช้: คลิกเข้าไปดูเต็มได้อยู่แล้ว) — ไม่แตะความสูงการ์ดโดยรวม
- ย้ายวันที่จากบรรทัดเดียวกับแผนก/โรงงาน (ในส่วนหัว) ไปไว้บรรทัดสุดท้ายใต้ "ปัญหา" แทน

**เพิ่มปุ่ม Like บนการ์ด Feed — เก็บจริงใน Supabase (ผู้ใช้เลือกไว้ ไม่ใช่แค่ UI toggle):**
- ตาราง `kaizen_likes` ใหม่ (`kaizen_id`+`user_id` เป็น primary key คู่ กันไลค์ซ้ำในตัวเอง) + RLS 3 policy (`kl_read`/`kl_insert_own`/`kl_delete_own`, เงื่อนไขเดียวกับ `k_read_feed` คือเห็น/ไลค์ได้เฉพาะโครงการที่ไม่ใช่ draft) — ดู `migration_2026-09-15_kaizen-likes.sql`
- `js/api.js`: `getLikesForKaizenIds()` (ดึงทั้งหน้าในคำขอเดียว กัน N+1), `likeKaizen()`/`unlikeKaizen()` (upsert + ignoreDuplicates กันดับเบิลคลิกชน primary key)
- ปุ่ม heart มุมขวาล่างของรูป (พื้นหลังโปร่งแสงดำ), toggle outline↔solid แดงพร้อม pop animation ตามสไตล์ CSS ที่ผู้ใช้ส่งมา, อัปเดต optimistic (ไม่รอ round-trip, ไม่ re-render ทั้งการ์ดกัน animation สะดุด), แยก event ออกจาก "คลิกทั้งการ์ดนำทาง" ที่ทำไว้ก่อนหน้า
- ไอคอนหัวใจรอบแรกเขียนมือเอง ผู้ใช้ทักว่า "แหว่งๆ" ไม่สมมาตร → เปลี่ยนเป็น path มาตรฐาน (Material Design heart) แทน
- ทดสอบยืนยัน: ไลค์แต่ละโครงการไม่ปนกันข้ามโครงการ/ข้ามคน, กดที่ปุ่มไม่เด้งไปหน้ารายละเอียด, ค่าคงอยู่ข้ามการ reload จริง (พบว่ามีการทดสอบจริงคู่ขนานจากผู้ใช้เองผ่าน simulator ระหว่างที่ทดสอบ ไม่ใช่บั๊ก)

**ปรับหน้า Dashboard (`js/views/dashboard.js`):**
- เปลี่ยนส่วน "รอบการประเมินที่เปิดอยู่" จาก `.page-header` (แถบหัวมาตรฐาน) เป็น `.card` (กรอบ/มุมโค้ง)
- เอาปุ่ม tab "ของฉัน/ทั้งโรงงาน/รอบก่อนหน้า" ออก (ปุ่ม "ทั้งโรงงาน" เป็น disabled ค้างมานานแล้ว ไม่เคย implement) — เหลือแค่โหมดเดียวคือรอบที่เปิดอยู่ปัจจุบัน พ่วงลบโค้ดที่ใช้เฉพาะ tab นี้ที่กลายเป็น dead code ไปด้วย: `state.tab`, `tabButton()`, การคำนวณ `previousPeriod`, `periodForTab` branching ใน `renderRowList()`, click-wiring `[data-tab]`
- **หมายเหตุ**: ส่วน "โครงการของฉันในรอบนี้" (คอลัมน์ซ้ายคู่กับ "ผลรอบที่ประกาศแล้ว") ผู้ใช้ขอให้ "พักไว้ก่อน ยังไม่เอาออกตอนนี้" — ยังไม่ได้ทำ เหลือเป็นงานค้างของหน้านี้
- eyebrow "รอบการประเมินที่เปิดอยู่": ขยายขนาดเท่ากับตัวหนังสือ "วันก่อนปิดรับ" (13.5px) + สีเขียว + glow + pulse animation (`periodEyebrowPulse` 1.8s) — ใช้ class ใหม่ `.period-eyebrow` แยกจาก `.eyebrow` เดิมโดยตั้งใจ (ไม่แก้ `.eyebrow` ตรงๆ เพราะ class นั้นใช้ร่วมกับ `pageHeader()` ใน `ui.js`/`kaizenForm.js` ทุกหน้า จะกระทบทั้งแอปโดยไม่ตั้งใจ) มี `prefers-reduced-motion` fallback (ปิด animation คง glow แบบนิ่งไว้)

**ไฟล์ที่เปลี่ยน:** `supabase/schema.sql` (ตาราง `kaizen_likes` + RLS), `supabase/migration_2026-09-15_kaizen-likes.sql` (ใหม่, รันแล้ว), `js/api.js` (เพิ่ม like functions, bump tag `z3`→`z4`), `js/views/kaizenFeed.js` (like button, line-clamp, ย้ายวันที่, คลิกทั้งการ์ด), `js/views/kaizenDetail.js` (`canSeeStatus` gate คุมทั้ง status badge และ `getResults()` query), `js/views/dashboard.js` (การ์ด period banner, ลบปุ่ม tab + dead code), `css/style.css` (`.like-btn`/`.period-eyebrow`/`likePop`/`periodEyebrowPulse`, bump `index.html` เป็น `?v=20260911w`)

---

### Round 9 — ปรับหน้า Welcome + สลับปุ่มเลือกภาษาเป็น pill toggle (2026-09-15)

**ปรับวงกลมพื้นหลังโลโก้ (`.welcome-blob`) ทีละจุดตามฟีดแบ็กสด:**
- เพิ่ม glow แบบ pulse animation รอบวงกลม สีเริ่มจาก `--brand` (#1F7791) → ผู้ใช้ขอเปลี่ยนเป็น **ฟ้าอ่อน** `rgba(125,211,252,...)` แทน
- เปลี่ยนพื้นวงกลมจาก gradient ม่วง-ฟ้าเดิม เป็น **สีขาวล้วน** ให้กลืนกับการ์ดโลโก้
- เอา border-radius/box-shadow ของ `.welcome-blob-card` ออกทั้งหมด (ผู้ใช้ขอ "ไม่เอาเส้นขอบ ลบเงาออกด้วย") ให้โลโก้ลอยบนพื้นขาวไร้กรอบไร้เงา
- ขยายโลโก้จาก 150px → **168px** — คำนวณ+วัดพิกัดจริงยืนยันว่ามุมกล่อง (รูป+padding) ยังอยู่ในวงกลม 220px เส้นผ่านศูนย์กลาง เหลือระยะขอบจริง ~5px ทุกมุม ไม่ล้น

**เปลี่ยนปุ่มสลับภาษาจากปุ่มเดี่ยว (`.auth-lang-switch` เดิม) เป็น pill toggle 2 ช่อง (TH/EN):**
- ใช้ CSS ที่ผู้ใช้ส่งมา (Uiverse.io by Pradeepsaranbishnoi) ตัดจาก 3 แท็บเหลือ 2, ไม่เอา notification badge — เพิ่ม class ใหม่ `.lang-switch`/`.lang-switch-tab`/`.lang-switch-glider` แยกจาก `.auth-lang-switch` เดิม (ยังใช้ `.auth-lang-switch` คุมแค่ position:fixed มุมขวาบนเหมือนเดิม)
- แก้ `authLangSwitchHtml()`/`wireAuthLangSwitch()` ใน `ui.js` เป็น radio+label 2 คู่ + glider แทนปุ่มเดี่ยวเดิม
- **พบบั๊กจริงระหว่างทดสอบ**: `.lang-switch` ที่เพิ่มใหม่ตั้ง `position: relative` ตามต้นฉบับ Uiverse ไปชนกับ `.auth-lang-switch` เดิมที่ตั้ง `position: fixed` ไว้ — source order ทำให้ `relative` ชนะ ปุ่มเลยหลุด layout กลายเป็น block เต็มความกว้างจอ (วัดได้จริง 485px แทนที่จะเป็น ~107px) แก้โดยตัด `position` ออกจาก `.lang-switch` เอง ปล่อยให้ `.auth-lang-switch` คุมอย่างเดียว
- ปรับตามฟีดแบ็กต่อเนื่อง: เอา `box-shadow` ของกล่องออก (2 รอบ — ผู้ใช้ขอเอาออกทั้งกรอบและเงา), ลองเปลี่ยนพื้นหลังกล่องให้กลืนกับพื้นหลังหน้า (`var(--bg)`) แล้ว**ผู้ใช้ปฏิเสธ** สั่งกลับเป็นสีขาวเดิม
- เพิ่ม fade out/in ให้เนื้อหาหน้า (ไม่ใช่ตัวปุ่ม) ตอนสลับภาษา: fade out เนื้อหาเดิม 150ms ก่อนเปลี่ยนเนื้อหา ส่วน fade-in ของเนื้อหาใหม่ได้มาฟรีจาก `#app > * { animation: pageFadeIn }` ที่มีอยู่แล้วทั้งระบบ
- ปรับความเร็ว animation ของตัวปุ่มเองให้ช้าลง 35% ตามที่ขอ: สีตัวหนังสือ 0.15s→0.2s, glider เลื่อน 0.25s→0.34s
- ปรับลำดับเวลาเพิ่ม: ผู้ใช้ขอให้ animation ของปุ่มเล่นจบก่อนแล้วค่อยเปลี่ยนหน้า (เดิมเล่นพร้อมกัน) — เพิ่ม wait 340ms (เท่าความยาว glider transition) ก่อนเริ่ม fade เนื้อหา รวมเวลาจากคลิกถึงเปลี่ยนเนื้อหา = 490ms ยืนยันด้วย `MutationObserver` จับ timing จริงตรงตามที่ตั้งไว้ (ไม่ใช่แค่ดูด้วยตา เพราะเร็วเกินจับด้วยสกรีนช็อตธรรมดา)
- ขนาดจริงที่วัดได้: กล่องรวม 107.2×47.2px, แผ่นไฮไลท์ (glider) 44×28px

**ไฟล์ที่เปลี่ยน:** `css/style.css` (`.welcome-blob`/`.welcome-blob-card`/`.lang-switch*`/`welcomeBlobPulse`, bump `index.html` เป็น `?v=20260911z8` ผ่านหลายรอบ), `js/ui.js` (`authLangSwitchHtml()`/`wireAuthLangSwitch()` ใหม่ทั้งหมด, bump tag shared `z4`→`z5`), `js/views/welcome.js` (fade timing + รอ animation ปุ่มจบก่อน)

---

### Round 10 — Dashboard cleanup + kaizenForm mobile redesign (ขั้นตอน/toggle switch/ร่างอัตโนมัติ) (2026-09-16)

**Dashboard/Profile — เก็บงานค้างจาก Round 8 + จัดระยะห่างให้เท่ากันทั้งระบบ:**
- เอา "โครงการของฉันในรอบนี้" ออกจาก dashboard.js ตามที่ผู้ใช้ขอไว้ตั้งแต่ Round 8 (พักไว้ตอนนั้น) — ลบ `renderRowList()`/`STATUS_LABEL`/`STATUS_VAR_SUFFIX`/`canPropose` และ import ที่ไม่ใช้แล้วทั้งหมด เหลือ "ผลรอบที่ประกาศแล้ว" เป็นบล็อกเดียวเต็มความกว้าง
- พบว่าระยะห่างหัวข้อ→เนื้อหาไม่เท่ากันข้ามหน้า (บางหน้า 10px บางหน้า 18-36px) — เพิ่ม `.section-head.is-borderless` (dashboard.js/profile.js) และตัด margin/padding ส่วนเกินออกจาก `.step-carousel`/`.wizard.steps` ใน kaizenForm.js ให้ตรงกับ default 18px ทั้งระบบ

**kaizenForm.js — ย้ายปุ่ม "ย้อนกลับ/ไปขั้นถัดไป" ขึ้นไปรวมกับลูกศร/ปัดการ์ดบนแถบขั้นตอนแทน:**
- ผู้ใช้ตั้งคำถามว่าถ้าตัดปุ่มล่างจอออกจะกระทบอะไร เพราะ scroller ด้านบนก็เลื่อนขั้นได้อยู่แล้ว → ตัดสินใจย้ายความสามารถทั้งหมด (validate ก่อนข้าม/persist ร่าง/ปลดล็อกขั้นถัดไป) เข้าไปที่ลูกศรซ้าย-ขวาของ step-carousel โดยพฤติกรรมเดิมทุกอย่างยังอยู่ครบ (ข้ามขั้นที่ปลดล็อกแล้ว = แค่เลื่อนดู, ข้ามขอบเขตใหม่ = ต้อง validate+persist ก่อน) เหลือแค่ "เก็บร่างไว้ก่อน" อย่างเดียวในแถบล่าง
- **ปรับ timing**: เดิม DOM เปลี่ยนเนื้อหาทันที (0ms) ก่อนที่การ์ดจะเริ่มเลื่อนเสร็จ (~700-800ms) ทำให้ไม่สัมพันธ์กัน — ผู้ใช้ขอให้รอ animation เลื่อนจบก่อนค่อยเปลี่ยนเนื้อหา (แพทเทิร์นเดียวกับปุ่มสลับภาษาหน้า welcome ใน Round 9) เพิ่ม `animateStepThenCommit()` คุมลำดับนี้โดยเฉพาะ
- ปุ่ม "ยืนยันส่งโครงการ" (ขั้น 6): ปรับให้หน้าตาเหมือนปุ่ม "Create account" หน้า welcome เป๊ะ (`.btn-block`) — ลองทำเป็นแถบปุ่มลอยติดล่างจอ (`position:fixed`) ก่อน เจอบั๊กปริศนา (การ์ด fixed ยังเลื่อนตามสกอลล์ทั้งที่เช็ค property ที่เกี่ยวข้องทุกตัวใน ancestor แล้วปกติหมด หาสาเหตุ CSS ไม่เจอ) ผู้ใช้ตัดสินใจไม่เอาแบบ fixed เลย ให้เป็นการ์ดปุ่มธรรมดาต่อจากข้อความคำเตือน เลื่อนตามหน้าไปด้วยเหมือนเนื้อหาอื่น — ทำใหม่ตามนี้ (ปัญหา fixed เลยตกไปโดยไม่ต้องหาสาเหตุต่อ) ภายหลังผู้ใช้ขอเอากรอบขาว (`.card`) ที่ครอบปุ่มไว้ออกด้วย เหลือปุ่มลอยเปล่าๆ
- Step rail: เอาเลขลำดับการ์ด (1-6) ออก เหลือแค่เครื่องหมายถูกตอนกรอกแล้ว, ย้ายไอคอนมาเรียงข้างชื่อขั้น (ไม่ซ้อนบน) กันการ์ดที่มีไอคอนสูงกว่าการ์ดอื่นในแถวเดียวกัน

**Toggle switch แทน chip สำหรับฟิลด์เลือกได้หลายค่า (หมวดปัญหา/ระดับผลกระทบ/สิ่งที่ต้องการสนับสนุน):**
- ผู้ใช้ส่ง CSS ตัวอย่าง (Uiverse.io by namecho) มาให้ปรับใช้ — เปลี่ยนจาก `.chip` ปุ่มเป็น toggle switch แยกทีละแถวในทั้ง 3 ฟิลด์ ปรับสีจาก `--color-green` เดิม (จริงๆ เป็นสีฟ้า) เป็น `var(--primary)` ของแอป, ห่อด้วย `.card` ตามคำขอถัดมา (ยืนยัน UI ก่อนเริ่มทำตามที่ผู้ใช้ขอ)
- ทดสอบยืนยันว่า toggle ใช้งานได้จริง ไม่ใช่แค่ UI: เปิด/ปิดถูกต้อง, ค่าสะท้อนกลับไปที่หน้าทบทวน (ขั้น 6) ถูกต้อง, ช่อง "อื่น ๆ" (ระบุหมวดอื่น/ระบุอื่น ๆ) reveal/hide ตามค่า toggle ถูกต้องทั้งคู่

**สร้างร่างอัตโนมัติทันทีตั้งแต่ขั้น 2 (ผู้ใช้รายงานว่าไม่เห็นปุ่ม "เก็บร่างไว้ก่อน" ใน simulator):**
- เดิม `persist()` รอจนกว่าจะรู้ชื่อโครงการ (title ไม่ว่าง) ถึงจะสร้างแถวจริงใน DB — แปลว่าที่ขั้น 1 และระหว่างกรอกขั้น 2 (ก่อนกด "ถัดไป" สำเร็จ) ยังไม่มี `draft.Id` เลยไม่โชว์แถบ "เก็บร่างไว้ก่อน" เลย — แก้ให้สร้างแถวทันทีตอนกด "ถัดไป" ออกจากขั้น 1 (มี owner/department/plant/project_type ก็พอ ไม่ต้องรอชื่อ)
- **บั๊กที่เจอระหว่างแก้ (แก้ในรอบเดียวกัน)**: `title` เป็น NOT NULL ในตาราง แต่ `buildPatch()` เดิมแปลงค่าว่าง `''` เป็น `null` ให้ทุกฟิลด์เท่ากันหมด — พอสร้างร่างตั้งแต่ชื่อยังว่าง จะส่ง `title: null` ไปชน constraint ทันที ต้องกันเฉพาะ `Title` ไม่ให้แปลงเป็น null; และ create-branch เดิมทำ `Object.assign(state.draft, created)` ทั้งก้อน ซึ่งพอสร้างร่างตั้งแต่ฟิลด์อื่นยังว่างอยู่ (เช่น `ProblemDescription`) DB จะคืนค่าเป็น `null` กลับมาทับ state ท้องถิ่นจาก `''` เป็น `null` แล้วโค้ดที่เรียก `.trim()` กับฟิลด์เหล่านี้ตอน render ขั้น 2 จะ throw ทันที (หน้าว่างเปล่า) — แก้โดยดึงกลับมาแค่ `Id`/`Status` เหมือน branch update เดิม ไม่ assign ทั้งก้อน — ทดสอบยืนยันด้วยบัญชี employee จริง (test2): กด "ถัดไป" จากขั้น 1 → insert สำเร็จ (`title: ""`) → ปุ่มเก็บร่างโผล่ตั้งแต่ขั้น 2 → กรอกต่อจนจบไม่มี error

**บั๊กเล็กที่เจอระหว่างทำ (ไม่เกี่ยวกับ logic หลัก):** พิมพ์ปิดคอมเมนต์ HTML ผิดเป็น `*/` (สไตล์ JS) แทน `-->` 2 ครั้ง ทำให้ parser ของ browser มองว่าคอมเมนต์ยังไม่ปิด กลืน markup ที่ตามมาทั้งหมดเข้าไปเป็น comment node (element จริงหายไปเงียบๆ ทั้งที่เห็นข้อความใน `.innerHTML`) — แก้ทั้งสองจุดแล้ว

**ไฟล์ที่เปลี่ยน:** `js/views/dashboard.js` (ตัด "โครงการของฉันในรอบนี้"), `js/views/profile.js` (`is-borderless`), `js/views/kaizenForm.js` (รวมปุ่มขั้นเข้ากับ carousel, `animateStepThenCommit()`, toggle switch ×3 ฟิลด์, สร้างร่างอัตโนมัติที่ขั้น 2, `buildPatch()`/`persist()` แก้ null-Title), `css/style.css` (`.section-head.is-borderless`, `.toggle-list`/`.toggle-row`/`.switch*`, ตัด margin เกินของ `.step-carousel`/`.wizard.steps`)

---

### Round 11 — Push ขึ้น GitHub + Deploy จริงบน Netlify + พบบั๊ก RLS-adjacent จากการทดสอบสด (2026-09-17)

**เตรียม repo ก่อน push ขึ้น GitHub org ของบริษัท (`NBD-Health-Care-Company-Limited/KAIZEN-proposal-program`):**
- ตั้ง `.gitignore`: ไม่เอา `js/config.js`/`.env*`/`.claude/settings.local.json` (มี secret/เป็น local เฉพาะเครื่อง), ไม่เอาไฟล์หนัก 18MB (`KAIZEN Proposal Program.xlsx`), ไม่เอาเอกสารต้นฉบับ stakeholder (`*.xlsx`/`*.docx`) และดีไซน์เดิมที่เลิกใช้/ไม่เกี่ยวข้อง (`docs/*.md`, `apple.design.md`) ตามที่ผู้ใช้เลือกตัดออกให้ repo กระชับ — สรุปกฎไว้ใน `CLAUDE.md` หัวข้อ "Git hygiene" กันงานซ้ำในอนาคต
- **ตรวจความปลอดภัยก่อน push พบจริง**: Spec.md §4.8 (ย่อหน้าบัญชีทดสอบ) มีรหัสผ่าน 3 บัญชีทดสอบเขียนตรงๆ เป็น plaintext (`pass@1234`/`admin@1234`) — ลบออกจากไฟล์ (เหลือแค่ email+role อ้างอิง, รหัสผ่านเก็บใน Claude memory local แทน) แล้ว **รวม 4 commit แรกเป็น commit เดียว** (ผ่าน orphan branch) ก่อน push จริง กันรหัสผ่านหลงเหลือใน git history แม้จะลบออกจากไฟล์ล่าสุดแล้วก็ตาม — ยืนยันด้วย `git rev-list --objects --all` scan ทุก object ว่าไม่มีรหัสผ่านหลุดอยู่จุดไหนอีก

**เลือก hosting — Vercel → เปลี่ยนเป็น Netlify → ย้าย repo ไป personal account เพื่อ deploy:**
- เทียบ Vercel/Netlify: ทั้งคู่พอสำหรับ static site ไม่มี build step, ใช้ hash router (`#/...`) เลยไม่ต้องพึ่ง server-side rewrite rule เลย — เลือก Vercel ก่อนเพราะ DX เชื่อมต่อ GitHub org ง่ายกว่า
- **เจอทีหลังว่า Vercel Hobby (ฟรี) ห้ามใช้เชิงพาณิชย์ตาม ToS จริง** (ระบบนี้เป็นเครื่องมือภายในบริษัท) — Pro คิด ~$20/เดือน/คน ผู้ใช้เลือกเปลี่ยนไป **Netlify** แทน (free tier อนุญาตใช้เชิงพาณิชย์ได้) — สลับ `vercel.json` → `netlify.toml` (build command เดิม เปลี่ยนแค่ config file)
- **เจอบล็อกที่สองระหว่าง import repo เข้า Netlify**: free tier ของ Netlify เองก็ปฏิเสธ deploy private repo ที่เป็นของ **Organization** (ต้องอัปเกรด Pro เหมือนกัน) แต่ไม่บล็อก private repo ของ **personal account** — แก้โดย push โค้ดชุดเดียวกันไปที่ repo ใหม่ใน personal account (`Seksunw/KAIZEN-proposal-program`) ผ่าน git remote ที่สอง (`deploy`, แยกจาก `origin` ที่ยังเป็น org repo หลัก) แล้ว import repo นี้เข้า Netlify แทน — หลีกเลี่ยงค่าใช้จ่ายได้ทั้งสองชั้น
- **`js/config.js` เป็นความลับที่ gitignore ไว้ แต่ static host ต้องมีไฟล์นี้ตอน serve** — เพิ่ม `scripts/gen-config.sh` (generate ไฟล์นี้จาก env var `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`MAX_UPLOAD_MB` ตอน build) + `netlify.toml` (`build.command`/`build.publish`) ตั้ง env var ใน Netlify Site configuration — ทดสอบทั้ง success case และ fail-loud case (ลืมตั้ง env var ต้อง error ชัดเจน ไม่ deploy เงียบๆ ด้วย config เพี้ยน) ก่อน push จริง
- Netlify เปิด "Team protection" (ล็อกทั้ง site ไว้หลัง Netlify login) เป็นค่าเริ่มต้น — ต้องกด "Make public" ที่ระดับ project เดี่ยว (ไม่ใช่ team-wide default ซึ่งมีผลแค่ project ใหม่ในอนาคต) พนักงานจริงถึงจะเข้าเว็บได้โดยไม่ต้องมีบัญชี Netlify

**ทดสอบระบบ end-to-end บน production จริง (สร้างโครงการในบัญชีพนักงาน → ให้คะแนนในบัญชีกรรมการ) — เจอบั๊กจริง 2 เรื่อง:**
1. ให้คะแนนด้วยบัญชี `test1` ไม่ได้ ชน RLS ของ `committee_scores` ตรงๆ — สาเหตุ: รอบที่เปิดอยู่ตอนนี้ (`KAIZEN SEPTEMBER 2026`) ตั้ง `committee_weights` ไว้แค่ `seksun_wongyang` คนเดียว (100%) `test1` ไม่ได้ถูกผูกเข้ารอบนี้เลย — **ไม่ใช่บั๊ก** เป็นข้อมูล config ของรอบจริง (ผู้ใช้ตัดสินใจไม่แก้ ข้อมูลจริงของบริษัทไม่ควรแตะโดยไม่จำเป็น) เปลี่ยนไปทดสอบด้วย `seksun_wongyang` แทนแล้วผ่านครบ (7/7 เกณฑ์ 25/35)
2. **บั๊กจริงที่แก้แล้ว**: หน้าคิวตรวจ (`#/review`, `reviewQueue.js`) และหน้าให้คะแนนตรง (`#/review/:id`, `reviewScore.js`) พึ่ง RLS อย่างเดียวเพื่อกรองว่า "โครงการไหนอยู่ในคิวของฉัน" แต่ policy `k_read_feed` (`status <> 'draft'`, เพิ่มไว้ตั้งแต่ Round 7 สำหรับหน้า "โครงการทั้งหมด") ดันอนุญาตให้ **ทุกคนที่ login แล้ว** เห็นแถว `pending_review` ได้ด้วยเหมือนกัน ทำให้ user ที่มี role "committee" แต่ไม่ได้ถูกผูกกับรอบนั้นจริง (กรณี test1 ข้างต้น) ยังเห็นโครงการโผล่ในคิว "ยังไม่ให้คะแนน" อยู่ดี พอกดให้คะแนนถึงไปพังทีหลังด้วย raw RLS error ที่งง — ทั้งสองไฟล์มีข้อมูล `period.CommitteeWeights` พร้อมใช้เช็คอยู่แล้ว (เดิมใช้แค่แสดงผล "น้ำหนักคะแนนของคุณ X%") แค่ไม่เคยใช้เป็นเงื่อนไขกันเข้าคิว — เพิ่มเช็คนี้ทั้ง 2 ไฟล์ โชว์ข้อความ "คุณไม่ได้เป็นกรรมการของรอบนี้" แทนคิวหลอกๆ หรือ error ดิบ ทดสอบยืนยันทั้ง local + production จริง (deploy ผ่าน Netlify auto-deploy จาก push เข้า `deploy` remote) ว่าไม่กระทบ regression ของบัญชีที่ถูกผูกจริง (`seksun_wongyang` ยังเห็นคิวปกติ 2/2 เหมือนเดิม)
- ลบโครงการทดสอบทิ้งหลังยืนยันผ่านครบ (DB row + attachment record cascade) เหลือไฟล์รูปทดสอบ 1 ไฟล์ค้างใน Storage bucket (ลบไม่ได้ 403 เพราะ RLS ของ storage คนละชุดกับ table — ไฟล์เล็ก ไม่กระทบอะไร)

**ไฟล์ที่เปลี่ยน:** `.gitignore`, `CLAUDE.md` (หัวข้อ "Git hygiene" + "Deploying (Netlify)"), `netlify.toml` (ใหม่, แทนที่ `vercel.json` ที่ลบไป), `scripts/gen-config.sh` (ใหม่), `js/views/reviewQueue.js`/`js/views/reviewScore.js` (เพิ่มเช็ค `weightPct === null` กันเข้าคิว/ให้คะแนนถ้าไม่ได้เป็นกรรมการของรอบนั้นจริง)

---

### Round 12 — ตรวจสอบการรองรับ 2 ภาษา (TH/EN) ทั้งระบบ — พบว่าแปลจริงแค่ nav/หัวข้อ (2026-09-17)

**ขอบเขต:** อ่านโค้ดทั้งหมด (`js/i18n.js` ครบ, ทุกไฟล์ `js/views/*.js` + `js/ui.js` + `js/app.js`) + ทดสอบสดในเบราว์เซอร์ (สลับภาษาจริง, desktop 1440px + mobile 375px, ยืนยัน persistence ข้าม reload, รัน `Intl.DateTimeFormat` จริงเทียบพฤติกรรม locale) รายงานเต็มพร้อมหลักฐาน file:line ทุกข้อ: https://claude.ai/code/artifact/a3427420-0926-45ab-9a50-da0874d30e1c

**สรุปผล — โครงสร้างถูกต้อง แต่เดินสายไว้แค่เปลือก:** `i18n.js` มีดิกชันนารี TH/EN ครบ 83 คีย์ตรงกันสมบูรณ์ ไม่มีคีย์รั่ว/หาย ไม่มี `t()` เรียกคีย์ที่ไม่มีจริงเลยสักจุด, ภาษาที่เลือกจำไว้ถูกต้องข้าม reload (`localStorage` คีย์ `kaizen_lang`), หน้า Welcome/Reset Password แปลได้เป็นธรรมชาติทั้งสองภาษา (0 บรรทัดไทยหลุด) — **แต่กลไกนี้ถูกใช้แค่ตั้ง `document.title`/label เมนู sidebar ของเกือบทุกหน้าเท่านั้น เนื้อหาหลักจริงๆ ยังเป็นไทยล้วนไม่ว่าตั้งภาษาไหน**

**Critical (4):**
1. ฟอร์ม "เสนอ KAIZEN" (`kaizenForm.js`) — หน้าสำคัญที่สุดของระบบ ~116 บรรทัดข้อความไทยดิบเทียบ `t()` แค่ 9 ครั้ง แม้แต่ `document.title` (บรรทัด 66) ก็ hardcode `'แก้ไข'`/`'เสนอ'` ตรงๆ
2. หน้าเนื้อหาหลักอื่นๆ ทั้งหมด (dashboard/kaizenList/reviewQueue/reviewScore/kaizenDetail/kaizenProgress/kaizenFeed/admin\*) รูปแบบเดียวกัน — `t()` แค่หลักหน่วยเทียบข้อความไทยดิบหลักสิบ-ร้อยบรรทัดต่อไฟล์
3. `translateError()` (`ui.js:69`) — แปล error จาก backend เป็นไทยเสมอ ไม่รับพารามิเตอร์ภาษาเลย ใช้ 49 จุดทั่วแอป (ทุกปุ่ม submit/save/upload)
4. `roleLabel()`/`statusBadge()` (`ui.js:202`/`143`) — `ROLE_LABELS` ไม่มี EN เลย ใช้ในกล่องผู้ใช้ sidebar ทุกหน้า, `statusBadge(status, lang='th')` default ไทยและ 5/6 จุดเรียกลืมส่ง `lang` ทั้งที่ `constants.js` มีข้อมูล `{th,en}` พร้อมอยู่แล้ว

**High (4):** master data label (แผนก/โรงงาน/งบประมาณ) มี `LabelEn` จริงในฐานข้อมูลแต่ไม่เคยถูกใช้แสดงผลเลย (22 จุดใช้ `.LabelTh` ตรงๆ) · `thaiDate()`/`thaiDateTime()` (`ui.js:156`) hardcode locale `th-TH` ไม่เช็ค `getLang()` เลย ทำให้วันที่เป็นปีพุทธศักราช+เดือนย่อไทยเสมอแม้ตั้ง EN (ยืนยันด้วย `Intl.DateTimeFormat` จริงว่า `th-TH` ผูกปฏิทินพุทธไว้อัตโนมัติ ไม่ใช่ `+543` มือ) · `aria-label` แทบทุกจุด hardcode ไทย กระทบผู้ใช้ screen reader โดยตรง · `SYSTEM_TIMEZONE_LABEL` ไม่มีฉบับ EN

**Medium (3):** ข้อความไทยหลุดปนในหน้าที่แปลไว้เกือบครบ (`login.js:14,15,21,37`, `notFound.js:13-14`, `register.js:32`) · หน้า Profile (บ้านของปุ่มสลับภาษาหลัง login เอง) แทบไม่แปลอะไรเลยรวม `document.title` — กดสลับภาษาแล้วแทบไม่เห็นผลบนหน้าตัวเอง discoverability ต่ำมาก · คีย์ `state_retry` ("โหลดใหม่"/"Reload") นิยามถูกต้องสมบูรณ์แต่ไม่มีจุดไหนเรียกใช้เลย (0 จุด) — 12 ไฟล์ copy ข้อความ "โหลดใหม่" ดิบๆ แทน เป็นหลักฐานว่าโครงสร้างพร้อมแต่ไม่ได้ถูกต่อสาย

**Low (2):** มี 9 คีย์ใน i18n.js ที่นิยามไว้ไม่เคยถูกใช้เลย · `"Admin"` (อังกฤษ) hardcode กลาง sidebar ที่ส่วนใหญ่แปลแล้ว (`app.js:177`)

**พบว่าเป็นการตัดสินใจที่ถูกต้องแล้วจุดหนึ่ง (ไม่ใช่บั๊ก):** เดิมเคยมีปุ่มสลับภาษาอยู่ทุกหน้าหลัง login แต่การสลับใช้ `navigate(location.hash)` re-render หน้าปัจจุบันทั้งหน้า ทำให้ state ฟอร์มที่กรอกค้างหายเงียบๆ — ทีมงานตั้งใจเอาออกจากทุกหน้าหลัง login เหลือแค่หน้า Welcome (ไม่มีฟอร์ม) กับหน้า Profile (โหลดข้อมูลใหม่จาก network อยู่แล้ว) ตามที่บันทึกไว้ใน `app.js:122-125` — แก้ปัญหาข้อมูลฟอร์มหายถูกทางแล้ว แม้จะมีผลข้างเคียงคือหน้าส่วนใหญ่สลับภาษาจากในหน้าเองไม่ได้เลย

**ลำดับแก้ที่แนะนำ (เรียงตาม impact/effort ในรายงานเต็ม):** (1) แก้ 3 ฟังก์ชันกลาง `translateError`/`roleLabel`/`statusBadge` ก่อน — จุดเดียวกระทบทุกหน้าพร้อมกัน (2) แก้ `thaiDate()`/`thaiDateTime()` ให้สลับ locale ตามภาษา (3) ทำ `masterLabel()` helper ใช้ `LabelEn` ที่มีอยู่แล้ว (4) แทน `t('state_retry')` ทั้ง 12 จุด (5) ไล่แปล `aria-label` (6) เก็บกวาดหน้า auth ที่เหลือ + แปลหน้า Profile ให้ครบ (7) แปลเนื้อหาหลักของหน้าใหญ่ทั้งหมด — งานก้อนใหญ่สุด แยกเป็นโปรเจกต์ย่อย

**สถานะ:** เป็นการตรวจสอบ (audit) เท่านั้น ยังไม่ได้แก้ไขโค้ดใดๆ ในรอบนี้ — รอผู้ใช้สั่งว่าจะเริ่มแก้ข้อไหนก่อน

---

### Round 13 — เลือกแนวทางแก้ i18n: เสนอ 3 วิธีเทียบกัน, ทำวิธีที่ 2 (แก้ฟังก์ชันกลาง + guard script) (2026-09-17)

**ก่อนแก้ ผู้ใช้ขอให้เสนอทางเลือกเทียบกันก่อน ไม่ให้ตัดสินใจแก้เองทันที** — เสนอ 3 วิธี: (1) ไล่แปลทีละหน้าแบบค่อยเป็นค่อยไปโดยใช้กลไกเดิม (2) เหมือนข้อ 1 บวกสคริปต์กันข้อความไทย hardcode หลุดซ้ำ (3) จำกัดขอบเขตแค่แก้ฟังก์ชันกลางตอนนี้ เลื่อนงานแปลรายหน้าเป็น backlog แยก — เทียบกันด้วยเกณฑ์ 6 ข้อ (แก้ต้นเหตุ/ความเสี่ยง/ขนาดการเปลี่ยนแปลง/ทดสอบ-rollback/ยืดหยุ่นอนาคต/ความคุ้มค่า) แนะนำวิธีที่ 3 ไปก่อน แต่ **ผู้ใช้เลือกวิธีที่ 2**

**ทำจริง (ทั้งหมดเป็นการแก้ชั้น UI/string-rendering เท่านั้น ไม่แตะ API/DB/RLS/routing/auth เลย):**
- `translateError(message, lang = getLang())` — เดิมคืนไทยเสมอ ไม่มีพารามิเตอร์ภาษา ตอนนี้ `ERROR_MESSAGE_MAP` ทั้ง 39 รายการมี `[pattern, th, en]` ครบ (รวม 2 รายการที่เป็น interpolation function) ใช้ 49 จุดทั่วแอป
- `roleLabel(role, lang = getLang())` — เพิ่ม `ROLE_LABELS.en`
- `statusBadge()` — เปลี่ยน default param จาก `lang='th'` เป็น `lang=getLang()` แก้ 5 จุดที่เคยลืมส่ง `lang` โดยไม่ต้องแตะ call site เลยสักจุด
- `thaiDate()`/`thaiDateTime()` — เพิ่ม `lang = getLang()` สลับ locale `th-TH`↔`en-GB` (เลือก en-GB เพราะเรียง วัน-เดือน-ปี เหมือน th-TH ไม่ใช่ en-US ที่สลับเป็นเดือน-วัน-ปี)
- **`masterLabel(list, code, lang)` ใหม่** — helper กลางแทน pattern `list.find(...)?.LabelTh ?? code` ที่ประกาศซ้ำใน 8 ไฟล์ (kaizenForm.js ×4, kaizenFeed.js/kaizenDetail.js/reviewScore.js/reviewQueue.js/register.js ×1, adminUsers.js ×3, adminPeriodDetail.js ×3, profile.js ×2) — ตอนนี้เลือก `LabelEn`/`LabelTh` ตามภาษาจริง (ข้อมูล `LabelEn` มีอยู่แล้วในฐานข้อมูลจาก seed.sql ไม่ต้องกรอกเพิ่ม) ทดสอบสดยืนยันแล้วว่า dropdown แผนก/โรงงานในฟอร์มเสนอ KAIZEN โชว์ "Production"/"Plant 1" ฯลฯ ถูกต้องตอนตั้งภาษา EN
- `SYSTEM_TIMEZONE_LABEL` ย้ายเป็นคีย์ i18n (`system_timezone_label`)
- `adminAudit.js` `dayLabel()` และ `dashboard.js` deadline date เดิมเรียก `.toLocaleDateString('th-TH', ...)` ตรงๆ ไม่ผ่าน helper กลางเลย แก้ให้สลับ locale ตามภาษาเหมือนกัน (เพิ่มคีย์ `audit_today`/`audit_yesterday` ให้ "วันนี้"/"เมื่อวาน" ด้วย เพราะแก้แค่ locale ของวันที่แต่ทิ้งคำนำหน้าเป็นไทยไว้จะกลายเป็นข้อความปนภาษาแปลกกว่าเดิม)
- **ตรวจแล้วไม่แก้โดยตั้งใจ**: จุดที่เรียก `.toLocaleString('th-TH')` กับ `Number` (ยอด Cost saving ใน kaizenForm.js/kaizenDetail.js/reviewScore.js) — รันทดสอบจริงยืนยันว่า `th-TH`/`en-US`/`en-GB` ให้ผลลัพธ์ตัวคั่นหลักพันเหมือนกันทุกตัว (`1,234,567` เท่ากันหมด) เปลี่ยน locale ตรงนี้จะไม่มีผลอะไรที่มองเห็นได้เลย ไม่ทำเพื่อกันการแก้ไขที่ไม่มีประโยชน์

**สร้าง `scripts/check-i18n-coverage.mjs` (ใหม่, ไม่มี dependency) — จุดเด่นของวิธีที่ 2:** นับบรรทัดข้อความไทยดิบต่อไฟล์ (`js/views/*.js` + `ui.js`/`app.js`) เทียบกับ baseline ที่บันทึกไว้ (`scripts/i18n-baseline.json`) รันแล้ว exit code 1 ถ้าไฟล์ไหนมีบรรทัดไทยดิบเพิ่มขึ้นจากเดิม (`--update` เพื่อบันทึก baseline ใหม่หลังแปลคืบหน้าจริงหรือหลังตรวจว่าที่เพิ่มขึ้นตั้งใจ) — ออกแบบมาแก้ root cause ที่ Round 12 เจอตรงๆ คือ "มี `t()`/i18n.js อยู่แล้วก็ไม่พอกันคนเขียนโค้ด hardcode ซ้ำ" (หลักฐาน: คีย์ `state_retry` นิยามครบสองภาษาแต่ไม่มีจุดไหนเรียกใช้เลย) ทดสอบ self-test แล้ว: เพิ่มบรรทัดไทย hardcode ทดลองเข้าไฟล์ที่สะอาด → script ตรวจจับได้ถูกต้อง (exit 1), revert แล้ว → ผ่าน (exit 0)

**ทดสอบยืนยัน:** local dev server, ตั้งค่า EN แล้ว reload จริง (ไม่ใช่แค่ SPA navigate — `initLang()` อ่าน `localStorage` แค่ตอน bootstrap ครั้งเดียว) เช็คทั้ง sidebar role box ("Employee"), วันที่ deadline ("25 Sept 2026" แทน "25 ก.ย. 2569"), status badge ("Scored"/"Draft" แทน "ให้คะแนนครบแล้ว"/"ร่าง"), dropdown แผนก/โรงงานในฟอร์ม KAIZEN ("Production"/"Plant 1" ฯลฯ) — ครบทุกจุด แล้วสลับกลับเป็น TH เช็ค regression ว่าพฤติกรรมเดิมยังถูกต้องครบ (ปีพุทธ/เดือนไทยกลับมาถูกต้อง ไม่มีอะไรพัง)

**ยังไม่ทำ (ตามที่ตกลง — เป็น backlog แยกต่อไป):** งานแปลเนื้อหาหลักของหน้าใหญ่ทั้งหมด (kaizenForm.js ยังมี ~116 บรรทัดไทยดิบ, dashboard/kaizenList/review/admin\* ยังเป็นไทยล้วนเหมือนเดิม) — ไม่ได้แตะในรอบนี้ตามขอบเขตวิธีที่ 2 ที่ตกลงกันไว้ (แก้ฟังก์ชันกลางก่อน งานแปลรายหน้าเป็น incremental ทีหลัง)

**ไฟล์ที่เปลี่ยน:** `js/ui.js` (translateError/roleLabel/statusBadge/thaiDate/thaiDateTime/masterLabel ใหม่), `js/i18n.js` (คีย์ใหม่ 3 คีย์: system_timezone_label, audit_today, audit_yesterday), `js/views/adminAudit.js`/`adminPeriodDetail.js`/`adminUsers.js`/`dashboard.js`/`kaizenDetail.js`/`kaizenFeed.js`/`kaizenForm.js`/`profile.js`/`register.js`/`reviewQueue.js`/`reviewScore.js` (ใช้ helper ใหม่แทน `.LabelTh`/locale hardcode เดิม), `scripts/check-i18n-coverage.mjs` + `scripts/i18n-baseline.json` (ใหม่) — bump shared version tag `20260911z5`→`20260911z6` ทุกไฟล์ตามกฎ CLAUDE.md

### Round 14 — "ทำทั้งโปรเจคเลย": แปล TH/EN ให้ครบทุกไฟล์ `js/views/*.js` ที่เหลือ (2026-09-17)

**บริบท:** หลัง Round 13 (วิธีที่ 2 — แก้ฟังก์ชันกลาง + guard script) ผู้ใช้ถามว่า "เสร็จทั้งหมดคืออะไร" หลังชี้แจงว่างานแปลเนื้อหารายหน้ายังเป็น backlog แยก ผู้ใช้สั่งชัดเจน **"ทำทั้งโปรเจคเลย"** — ขยายขอบเขตเป็นแปลทุกไฟล์ `js/views/*.js` ที่ยังเหลือ ไม่ใช่แค่ 5 ไฟล์ที่ทำไปแล้วตอนพิสูจน์แนวทาง (kaizenForm/dashboard/kaizenList/kaizenDetail/kaizenProgress)

**วิธีทำ (เหมือนเดิมทุกไฟล์ ไม่มี refactor ใหญ่):** ต่อไฟล์ — (1) อ่านไฟล์เต็ม หาข้อความไทย hardcode ทั้งหมด (2) เพิ่มคีย์ `th`/`en` ใน `js/i18n.js` โดย **reuse คีย์เดิมก่อนเสมอถ้าข้อความตรงกัน** (เจอ reuse ได้หลายสิบจุดข้าม 15 ไฟล์ เช่น `kzlist_load_more`/`kzlist_filter_all`/`apd_col_department`/`kzform_aria_delete`/`common_cancel`) (3) เขียนไฟล์ view ใหม่ด้วย `t()`/`tf()` (4) `node --check` ทั้ง 2 ไฟล์ (5) รัน `node scripts/check-i18n-coverage.mjs` ยืนยันบรรทัดไทยดิบลดลง ไม่มีไฟล์ไหนแย่ลง (6) `--update` baseline แล้ว commit แยกต่อไฟล์

**ไฟล์ที่แปลรอบนี้ (เรียงตามลำดับที่ทำ, ตัวเลข = จำนวนบรรทัดไทยดิบก่อน→หลัง ตาม guard script):**
`reviewQueue.js` 22→0, `reviewScore.js` 38→2 (คอมเมนต์), `adminPeriodDetail.js` 61→4 (คอมเมนต์), `adminPeriods.js` 37→0, `adminMaster.js` 20→0, `adminUsers.js` 20→1 (คอมเมนต์), `adminAudit.js` 19→2 (คอมเมนต์), `profile.js` 17→2 (คอมเมนต์), `register.js` 9→1 (คอมเมนต์), `kaizenFeed.js` 6→2 (คอมเมนต์), `login.js` 4→0, `forbidden.js` 4→0, `notFound.js` 2→0 — `app.js` (5 บรรทัด) และ `forgotPassword.js` (1 บรรทัด) ตรวจแล้วเป็นคอมเมนต์ล้วน ไม่มีข้อความ user-facing ต้องแก้

**บั๊กจริงที่เจอและแก้ระหว่างทาง (นอกเหนือจากการแปลตรงๆ):**
- `adminAudit.js` — `ACTION_GROUPS` เดิมใช้ **ข้อความไทยเป็นทั้ง filter key และ label แสดงผล** พร้อมกัน (`submit_kaizen: 'ส่งงาน'`) ถ้าแปลแค่ label โดยไม่แยก key ออกมาจะทำให้ filter chip ที่เลือกไว้ค้างชื่อ key แบบ Thai ตลอดไป — แก้โดยแยกเป็น `ACTION_GROUPS` (code คงที่: `submit`/`score`/`period`/`decision`) + `GROUP_LABEL_KEYS` (map ไปคีย์ i18n) ให้ language-independent จริง
- `adminAudit.js`/`adminPeriodDetail.js` — `KAIZEN_STATUS_LABELS[status]?.th`/`PERIOD_STATUS_LABELS[s]?.th` เรียก `.th` ตรงๆ ไม่ผ่านภาษาที่เลือกไว้เลย (stepper ของ adminPeriodDetail.js และประโยค audit log "เปลี่ยนสถานะเป็น...") — เพิ่ม local helper `L(labelObj)` (เหมือนที่ kaizenForm.js มีอยู่แล้ว) เลือก `.en`/`.th` ตาม `getLang()`
- `adminAudit.js` — เวลาแถวละ log (`toLocaleTimeString('th-TH', ...)`) hardcode locale ไม่สลับตามภาษาเหมือนที่ `dayLabel()` ทำอยู่แล้ว — แก้ให้สลับเหมือนกัน
- `adminPeriods.js` — ฟอร์ม "สร้างรอบใหม่" ใช้ค่าคงที่ `SYSTEM_TIMEZONE_LABEL` จาก `constants.js` ตรงๆ (`'เวลาไทย (ICT, UTC+7)'`) แทนคีย์ i18n `system_timezone_label` ที่มีอยู่แล้ว (ใช้ถูกต้องแล้วใน `adminPeriodDetail.js`) — เจอจากการทดสอบสดตั้งค่า EN แล้วเห็นวงเล็บ timezone ยังเป็นไทย ไม่ใช่จากการสแกนไฟล์ (guard script ไม่จับ เพราะ Thai อยู่ใน `constants.js` ไม่ใช่ในไฟล์ view เอง) แก้โดยลบ import ทิ้งแล้วใช้ `t('system_timezone_label')` แทน — เช็คทั้งโปรเจกต์แล้วไม่มีไฟล์อื่นเรียก `SYSTEM_TIMEZONE_LABEL` ตรงๆ แบบนี้อีก
- **`index.html`** — `#mobile-drawer` (aria-label), `.eyebrow` (ข้อความ "เมนู"), `#btn-drawer-close` (aria-label "ปิดเมนู"), `#mobile-drawer-nav` (aria-label "เมนูเพิ่มเติม") เป็น markup คงที่ ไม่เคยผ่าน `t()` เลยเพราะ guard script สแกนแค่ `js/views/*.js`+`ui.js`+`app.js` ไม่รวม `index.html` — แก้โดยลบข้อความ/attribute ไทยออกจาก HTML แล้วให้ `js/app.js`'s `renderChrome()` ตั้งค่าด้วย `t()` ทุกครั้งที่ทำงาน (ซึ่งทำงานซ้ำอยู่แล้วตอนสลับภาษาผ่าน `kaizen:profile-updated` event จาก `profile.js`) เพิ่มคีย์ `mobile_drawer_close_aria`/`mobile_drawer_nav_aria` (ส่วน "เมนู" ใช้คีย์ `nav_more` เดิมที่มีอยู่แล้ว)

**Version tag bump:** `i18n.js` ถูกแก้เนื้อหาซ้ำหลายสิบครั้งตลอด Round 13-14 โดยยังใช้ query tag เดิม `?v=20260911z7` ตลอด — เบราว์เซอร์ที่เคย cache `i18n.js` ไว้ตั้งแต่ช่วงต้นจะไม่เห็นคีย์ใหม่ที่เพิ่มเข้ามาทีหลังเลย (บั๊ก cache แบบเดียวกับที่ CLAUDE.md เตือนไว้) แก้โดย bump shared tag ทุกไฟล์ project-wide `20260911z7`→`20260911z8` (find/replace 24 ไฟล์) และ bump `index.html`'s `js/app.js?v=` จาก `j`→`k` (เนื้อหา `app.js` เปลี่ยนจริงจากโค้ด `renderChrome()` ใหม่)

**ทดสอบยืนยัน:** local dev server, isolated browser context, ตั้ง EN แล้ว hard reload ล็อกอินด้วยบัญชี admin (ครบ 3 role) ไล่เช็คทุกหน้าที่แปลรอบนี้ผ่าน `document.getElementById('app').innerText` scan หาอักขระไทยที่หลุดมา (เจอเฉพาะข้อมูลจริงของผู้ใช้ เช่น ชื่อ-นามสกุล/ชื่อโครงการ/คำอธิบายปัญหาที่กรอกเป็นไทย ซึ่งถูกต้องแล้วที่ไม่แปล) ครบทั้ง dashboard/kaizen (list/detail/new)/review/feed/profile/admin (periods/period-detail/master/users/audit) เช็ค mobile-drawer aria-label ผ่าน accessibility snapshot ยืนยันเปลี่ยนเป็น "Menu"/"Close menu"/"More menu" ถูกต้อง ไม่มี console error แล้วสลับกลับ TH เช็ค regression บนหน้า `adminPeriodDetail.js` (ไฟล์ที่แก้เยอะสุด 61 บรรทัด) — ครบถ้วนไม่มีอะไรพัง

**ยังไม่ทำ:** ยังไม่ push ไป `origin`/`deploy` สำหรับงานรอบนี้ (รอคำสั่งชัดเจนตามกติกาเดิม)

**ไฟล์ที่เปลี่ยน:** `js/i18n.js` (คีย์ใหม่รวม ~230 คีย์ ทั้ง th/en), `js/app.js` (renderChrome() ตั้งค่า static chrome ใหม่), `index.html` (ลบ Thai attribute/text ออกจาก mobile-drawer, bump app.js tag), 13 ไฟล์ `js/views/*.js` ตามรายชื่อด้านบน — bump shared version tag `20260911z7`→`20260911z8` ทุกไฟล์

---

## 5. Data Contract — interface ระหว่าง component

หลักการ: **DB คือ source of truth ของ shape ข้อมูล** (`snake_case`) ฝั่ง UI ใช้ `PascalCase` เสมอ — ห้ามฝั่งใดฝั่งหนึ่งอ่าน field name ของอีกฝั่งตรง ๆ ทุกการแปลงต้องผ่าน `js/api.js`

### 5.1 DB Schema (8 ตาราง) — `supabase/schema.sql`

```sql
-- ============================================================
-- 0. extensions & enums (เก็บเป็น text + check constraint แทน
--    CREATE TYPE เพื่อแก้ค่าที่อนุญาตได้โดยไม่ต้อง ALTER TYPE)
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ============================================================
-- 1. profiles  (1:1 กับ auth.users)
-- ============================================================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  employee_id     text not null unique,
  full_name       text not null,
  full_name_en    text,
  email           text not null unique,
  department      text not null,               -- FK เชิงตรรกะ → master_data(type='department', code)
  plant           text not null,               -- FK เชิงตรรกะ → master_data(type='plant', code)
  roles           text[] not null default '{employee}',   -- subset of employee|committee|admin
  committee_role  text,                        -- FK เชิงตรรกะ → master_data(type='committee_role', code)
  preferred_lang  text not null default 'th' check (preferred_lang in ('th','en')),
  avatar_path     text,
  is_active       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_profiles_dept on profiles(department);
create index idx_profiles_plant on profiles(plant);

-- ============================================================
-- 2. master_data  (แทน plants/departments/committee_roles/
--    budget_bands/cost_saving_bands ทั้งหมด — คั่นด้วย `type`)
-- ============================================================
create table master_data (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in
                ('department','plant','committee_role','budget_band','cost_saving_band')),
  code        text not null,
  label_th    text not null,
  label_en    text not null,
  extra       jsonb not null default '{}',
  -- extra ตัวอย่างตาม type:
  --   committee_role:   {"default_weight_pct": 30}
  --   budget_band:      {"min": 100000, "max": 499999}
  --   cost_saving_band: {"rank": 4, "min": 50000, "max": 99999}
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  unique (type, code)
);

-- ============================================================
-- 3. evaluation_periods
--    (person_weighted เท่านั้นใน v1 → เก็บน้ำหนักตรง ๆ เป็น jsonb
--     {user_id: weight_pct} แทนตาราง period_committees)
-- ============================================================
create table evaluation_periods (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,             -- '2026-10'
  name_th             text not null,
  name_en             text,
  period_start        date not null,
  period_end          date not null,
  submission_deadline timestamptz not null,
  status              text not null default 'draft'
                        check (status in ('draft','open','scoring','closed','published')),
  committee_weights   jsonb not null default '{}',       -- {"<user_id>": 30, ...} รวมต้อง = 100 ตอน open
  opened_at   timestamptz, closed_at timestamptz, published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index uq_period_single_open on evaluation_periods((status)) where status = 'open';

-- ============================================================
-- 4. kaizen_projects
--    (ดูดรวม categories/impacts/support_needs/team_members
--     เป็น array/jsonb แทนตารางลูก)
-- ============================================================
create table kaizen_projects (
  id                    uuid primary key default gen_random_uuid(),
  code                  text unique,                     -- 'KZN-202610-0007' เติมตอน submit
  owner_id              uuid not null references profiles(id),
  period_id             uuid references evaluation_periods(id),
  department            text not null,
  plant                 text not null,
  project_type          text not null check (project_type in ('individual','group')),
  team_members          jsonb not null default '[]',     -- [{"employee_id":"..","full_name":".."}]

  title                 text not null,
  title_en              text,
  problem_description   text,
  problem_description_en text,
  categories            text[] not null default '{}',    -- safety|quality|productivity|cost|environment|communication|work_environment|other
  category_other        text,
  impacts               text[] not null default '{}',    -- safety|quality|cost|delivery|productivity|environment
  improvement_approach  text,
  improvement_approach_en text,
  support_needed        text[] not null default '{}',    -- equipment|budget|man_power|time|other
  support_other         text,

  budget_band           text,                             -- FK เชิงตรรกะ → master_data(type='budget_band', code)
  cost_saving_per_month numeric(14,2),
  cost_saving_basis     text,
  cost_saving_rank      int check (cost_saving_rank between 1 and 5),   -- เติมโดย trigger

  is_completed          boolean not null default false,
  start_date            date,
  completion_date       date,
  next_follow_up_date   date,
  responsible_user_id   uuid references profiles(id),
  progress_pct          int not null default 0 check (progress_pct between 0 and 100),
  confirmed_by_name     text,

  status                text not null default 'draft' check (status in
                          ('draft','submitted','in_progress','pending_review',
                           'scored','approved','need_revision','published')),
  submitted_at timestamptz, scored_at timestamptz, decided_at timestamptz, published_at timestamptz,
  revision_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint k_dates    check (completion_date is null or start_date is null or completion_date >= start_date),
  constraint k_completed check (not is_completed or completion_date is not null),
  constraint k_cs_basis check (coalesce(cost_saving_per_month,0) = 0 or cost_saving_basis is not null)
);
create index idx_k_owner  on kaizen_projects(owner_id);
create index idx_k_period on kaizen_projects(period_id);
create index idx_k_status on kaizen_projects(status);
create index idx_k_followup on kaizen_projects(next_follow_up_date)
  where is_completed = false and status not in ('draft','published');

-- ============================================================
-- 5. kaizen_attachments
-- ============================================================
create table kaizen_attachments (
  id            uuid primary key default gen_random_uuid(),
  kaizen_id     uuid not null references kaizen_projects(id) on delete cascade,
  phase         text not null check (phase in ('before','during','after','evidence')),
  storage_path  text not null unique,          -- bucket: kaizen-photos, path: {kaizen_id}/{phase}/{uuid}.{ext}
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 20971520),  -- 20MB
  caption       text,
  caption_en    text,
  sort_order    int not null default 0,
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index idx_ka_kaizen on kaizen_attachments(kaizen_id, phase, sort_order);

-- ============================================================
-- 6. kaizen_progress_updates
-- ============================================================
create table kaizen_progress_updates (
  id                  uuid primary key default gen_random_uuid(),
  kaizen_id           uuid not null references kaizen_projects(id) on delete cascade,
  update_date         date not null default current_date,
  progress_pct        int check (progress_pct between 0 and 100),
  note                text not null,
  obstacles           text,
  next_follow_up_date date,
  created_by          uuid not null references profiles(id),
  created_at          timestamptz not null default now()
);
create index idx_kpu_kaizen on kaizen_progress_updates(kaizen_id, update_date desc);

-- ============================================================
-- 7. committee_scores  (แทน scores + score_items รวมกัน —
--    คะแนนรายเกณฑ์เก็บใน items jsonb คีย์ = criterion code)
-- ============================================================
create table committee_scores (
  id                uuid primary key default gen_random_uuid(),
  period_id         uuid not null references evaluation_periods(id),
  kaizen_id         uuid not null references kaizen_projects(id) on delete cascade,
  committee_user_id uuid not null references profiles(id),
  items             jsonb not null default '{}',
  -- items ตัวอย่าง: {"safety":4,"quality":3,"productivity":5,"cost":3,"apply":4,"gemba":4,"communication":5}
  -- คีย์ต้องตรงกับ CRITERIA codes ใน js/constants.js เท่านั้น (ตรวจในแอปฝั่ง client + trigger ฝั่ง DB)
  raw_sum           int not null default 0,     -- sync อัตโนมัติจาก items โดย trigger
  overall_comment   text,
  status            text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at      timestamptz,
  is_locked         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (period_id, kaizen_id, committee_user_id)
);
create index idx_cs_kaizen on committee_scores(kaizen_id);
create index idx_cs_committee on committee_scores(committee_user_id, period_id);

-- ============================================================
-- 8. audit_log  (generic — แทน kaizen_status_history + audit เดิม)
-- ============================================================
create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references profiles(id),
  action      text not null,        -- 'submit_kaizen','submit_score','period_open','period_close','period_publish','status_change'
  entity_type text not null,        -- 'kaizen_projects' | 'evaluation_periods' | 'committee_scores'
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index idx_al_entity on audit_log(entity_type, entity_id, created_at desc);

-- ============================================================
-- Triggers (สรุป — เขียนเต็มใน migration จริง)
-- ============================================================
-- touch_updated_at()              : before update ทุกตารางที่มี updated_at
-- set_kaizen_code()                : before update kaizen_projects เมื่อ draft→submitted
-- sync_committee_raw_sum()         : before insert/update committee_scores → raw_sum = Σ values(items)
-- set_cost_saving_rank()           : before insert/update kaizen_projects → lookup master_data(type='cost_saving_band')
-- guard_kaizen_transition()        : before update of status kaizen_projects (state machine ตาม §2 workflow เดิม)
-- handle_new_user()                : after insert auth.users → insert profiles จาก raw_user_meta_data

-- ============================================================
-- View: ผลคะแนนคำนวณสด (แทน kaizen_results ถาวร — ดู backlog B5)
-- ============================================================
create view v_kaizen_results with (security_invoker = true) as
select
  cs.kaizen_id,
  cs.period_id,
  count(*)                                     as committee_count,
  sum(cs.raw_sum)                              as raw_sum_total,
  avg(cs.raw_sum)                              as average_raw,
  avg(cs.raw_sum) / 35.0 * 100                 as average_pct,
  sum( (cs.raw_sum / 35.0) *
       coalesce((ep.committee_weights ->> cs.committee_user_id::text)::numeric, 0) )
                                                as weighted_score,
  k.cost_saving_rank,
  rank() over (partition by cs.period_id order by
    sum((cs.raw_sum/35.0) * coalesce((ep.committee_weights->>cs.committee_user_id::text)::numeric,0)) desc
  ) as rank_overall
from committee_scores cs
join evaluation_periods ep on ep.id = cs.period_id
join kaizen_projects   k  on k.id  = cs.kaizen_id
where cs.status = 'submitted'
group by cs.kaizen_id, cs.period_id, k.cost_saving_rank;

-- ============================================================
-- RLS (สรุปหลักการ — เขียน policy เต็มต่อจากนี้ตอน implement)
-- ============================================================
-- ทุกตาราง: enable + force row level security, deny by default
-- profiles         : อ่านตัวเอง + admin; แก้ตัวเอง (ยกเว้น roles/is_active — admin เท่านั้น)
-- master_data      : อ่านได้ทุกคน authenticated; เขียนเฉพาะ admin
-- evaluation_periods: อ่านได้ทุกคนถ้า status<>'draft'; เขียนเฉพาะ admin ผ่าน RPC เท่านั้น
-- kaizen_projects  : owner อ่าน/เขียนของตัวเอง; committee อ่านเฉพาะ pending_review++ ; published อ่านได้ทุกคน; admin ทั้งหมด
-- kaizen_attachments/progress_updates : ตามสิทธิ์อ่าน/เขียน kaizen_projects แม่ (join เช็ค kaizen_id)
-- committee_scores : กรรมการเห็น/แก้เฉพาะแถวตัวเอง "ตลอดไป" ไม่มีข้อยกเว้น — เจ้าของโครงการไม่มี policy อ่านเลย
-- audit_log        : อ่านเฉพาะ admin; เขียนเฉพาะผ่าน trigger/RPC (security definer)
-- anon             : ไม่มีสิทธิ์ใด ๆ ทั้งสิ้น (revoke all from anon, public)

-- ============================================================
-- RPC ที่ต้องเป็น security definer
-- ============================================================
-- open_period(period_id)     : ตรวจ Σ committee_weights = 100 → status='open'
-- close_period(period_id)    : lock committee_scores → คำนวณ v_kaizen_results → status='closed'
-- publish_period(period_id)  : status='published' → kaizen_projects ที่ approved → status='published'
-- submit_kaizen(kaizen_id)   : ตรวจ gate (รูป before, ฟิลด์บังคับ) → status='submitted'
-- submit_score(score_id)     : ตรวจครบ 7 เกณฑ์ → status='submitted' → เช็คว่ากรรมการครบ → kaizen.status='scored'
```

*หมายเหตุ:* ชื่อคอลัมน์ enum-like (`status`, `phase`, `project_type`, `categories`, ...) ใช้ `text + check` แทน `CREATE TYPE` โดยตั้งใจ เพื่อแก้ค่าที่อนุญาตได้ด้วย `ALTER TABLE ... DROP/ADD CONSTRAINT` โดยไม่ต้องยุ่งกับ enum migration (เหมาะกับ MVP ที่กติกาอาจขยับ)

---

### 5.2 Client-side mapping (`js/api.js`) — `snake_case` (DB) ↔ `PascalCase` (UI)

**กติกา:**
- ทุก row ที่ออกจาก Supabase (`select`) ต้องผ่าน `dbToUI()` ก่อนส่งให้ view render
- ทุก object ที่จะเขียนกลับ (`insert`/`update`) ต้องผ่าน `uiToDB()` ก่อนส่งให้ `supabase-js`
- **ข้อยกเว้น (ไม่แปลง):** jsonb ที่เป็น "map ตาม code/uuid" ไม่ใช่ schema คงที่ — `committee_scores.items` (คีย์ = criterion code เช่น `"safety"`), `evaluation_periods.committee_weights` (คีย์ = user uuid), `master_data.extra` (คีย์หลากหลายตาม type) — คีย์เหล่านี้ **คงเดิมเสมอ** ไม่แปลงเป็น PascalCase

```js
// js/api.js
const toPascal = (s) => s.replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const toSnake  = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const PASSTHROUGH_KEYS = new Set(['Items', 'CommitteeWeights', 'Extra']); // อย่าลงลึกแปล key ข้างใน

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

// ตัวอย่างการใช้งานจริง
export async function getKaizenById(id) {
  const { data, error } = await supabase
    .from('kaizen_projects')
    .select('*, kaizen_attachments(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return dbToUI(data);          // → { Id, Code, OwnerId, Title, CostSavingPerMonth, KaizenAttachments: [...] }
}

export async function updateKaizen(id, uiPatch) {
  const patch = uiToDB(uiPatch); // { Title: 'ใหม่' } → { title: 'ใหม่' }
  const { data, error } = await supabase
    .from('kaizen_projects').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return dbToUI(data);
}
```

**ตัวอย่าง mapping ต่อ entity หลัก**

| DB (`kaizen_projects`) | UI (JS object) |
|---|---|
| `id` | `Id` |
| `owner_id` | `OwnerId` |
| `cost_saving_per_month` | `CostSavingPerMonth` |
| `is_completed` | `IsCompleted` |
| `next_follow_up_date` | `NextFollowUpDate` |
| `team_members` (jsonb array of `{employee_id, full_name}`) | `TeamMembers` → array ของ `{EmployeeId, FullName}` (แปลงลึกได้ปกติเพราะเป็น object schema คงที่ ไม่ใช่ map) |

| DB (`committee_scores`) | UI (JS object) |
|---|---|
| `committee_user_id` | `CommitteeUserId` |
| `raw_sum` | `RawSum` |
| `items` (jsonb, คีย์ = criterion code) | `Items` — **คงเดิม** `{ safety: 4, quality: 3, ... }` (ไม่แปลงคีย์ข้างใน) |

| DB (`evaluation_periods`) | UI (JS object) |
|---|---|
| `submission_deadline` | `SubmissionDeadline` |
| `committee_weights` (jsonb, คีย์ = uuid) | `CommitteeWeights` — **คงเดิม** `{ "<uuid>": 30, ... }` |

---

### 5.3 Router contract (`js/router.js`)

**รูปแบบ:** hash-based (`location.hash`), ไม่มี server-side routing, ทำงานฝั่ง client 100%

```js
// js/router.js — contract

// 1) นิยาม route: pattern รองรับ ':param', roles = บทบาทที่เข้าถึงได้ (ว่าง = ทุกคนที่ login แล้ว)
export const ROUTES = [
  { pattern: '#/login',                 view: 'views/login.js',        roles: [] , public: true },
  { pattern: '#/register',              view: 'views/register.js',    roles: [], public: true },
  { pattern: '#/dashboard',             view: 'views/dashboard.js',   roles: ['employee','committee','admin'] },
  { pattern: '#/kaizen',                view: 'views/kaizenList.js',  roles: ['employee','committee','admin'] },
  { pattern: '#/kaizen/new',            view: 'views/kaizenForm.js',  roles: ['employee','committee','admin'] },
  { pattern: '#/kaizen/:id',            view: 'views/kaizenDetail.js',roles: ['employee','committee','admin'] },
  { pattern: '#/kaizen/:id/edit',       view: 'views/kaizenForm.js',  roles: ['employee','committee','admin'] },
  { pattern: '#/kaizen/:id/progress',   view: 'views/kaizenProgress.js', roles: ['employee','committee','admin'] },
  { pattern: '#/leaderboard/:periodCode', view: 'views/leaderboard.js', roles: ['employee','committee','admin'] },
  { pattern: '#/review',                view: 'views/reviewQueue.js', roles: ['committee','admin'] },
  { pattern: '#/review/:kaizenId',      view: 'views/reviewScore.js', roles: ['committee','admin'] },
  { pattern: '#/admin/users',           view: 'views/adminUsers.js',  roles: ['admin'] },
  { pattern: '#/admin/master',          view: 'views/adminMaster.js', roles: ['admin'] },
  { pattern: '#/admin/periods',         view: 'views/adminPeriods.js',roles: ['admin'] },
  { pattern: '#/admin/periods/:id',     view: 'views/adminPeriodDetail.js', roles: ['admin'] },
  { pattern: '#/admin/audit',           view: 'views/adminAudit.js',  roles: ['admin'] },
  { pattern: '#/403',                   view: 'views/forbidden.js',   roles: [], public: true },
  { pattern: '#/404',                   view: 'views/notFound.js',    roles: [], public: true },
];

// 2) สัญญาที่ view module ทุกไฟล์ต้อง export
//    export async function render(container, params, session) { ... }
//      - container : HTMLElement (#app) — view ต้อง render DOM ลงตรงนี้เอง (innerHTML หรือ appendChild)
//      - params    : object จาก path params, เช่น { id: 'uuid...' } สำหรับ '#/kaizen/:id'
//      - session   : { user, profile /* UI-mapped, PascalCase */ } หรือ null ถ้ายังไม่ login
//      - คืนค่า Promise<void> — resolve เมื่อ render เสร็จ (router จะไม่ทำอะไรต่อจนกว่าจะ resolve)
//      - view ต้องตั้ง document.title เอง

// 3) Guard: ก่อนเรียก view.render() router ต้อง
//    a. หา route ที่ match(location.hash) — ไม่เจอ → ไป '#/404'
//    b. ถ้า route.public !== true และไม่มี session → redirect '#/login?next=<hash ปัจจุบัน>'
//    c. ถ้า route.roles.length > 0 และ session.profile.Roles ไม่ตัดกับ route.roles เลย → ไป '#/403'
//    d. เรียก view.render(document.getElementById('app'), params, session)

// 4) Param parsing: จับคู่ segment ต่อ segment, ':name' → capture เป็น string เดียว (ไม่ decode พิเศษ)
//    ตัวอย่าง: pattern '#/kaizen/:id/edit' + hash '#/kaizen/abc-123/edit' → params = { id: 'abc-123' }

// 5) Query string: อ่านแยกจาก params เสมอ ผ่าน helper getQuery() → URLSearchParams จาก '?' ต่อท้าย hash
//    เช่น '#/login?next=%23%2Fdashboard' → getQuery().get('next') === '#/dashboard'

// 6) Event contract:
//    - window.addEventListener('hashchange', onRouteChange)
//    - window.addEventListener('DOMContentLoaded', onRouteChange)  // first load
//    - navigate(hash) helper = ทางเดียวที่โค้ดอื่นควรใช้เปลี่ยนหน้า (ไม่ set location.hash ตรง ๆ ที่อื่น)
```

**สรุปเป็นตาราง (route → role → view module):**

| Route | Roles | View |
|---|---|---|
| `#/login`, `#/register` | public | `login.js`, `register.js` |
| `#/dashboard` | employee, committee, admin | `dashboard.js` |
| `#/kaizen`, `#/kaizen/:id`, `#/kaizen/new`, `#/kaizen/:id/edit`, `#/kaizen/:id/progress` | employee, committee (+admin) — ดู §2.8 | `kaizenList/Detail/Form/Progress.js` |
| `#/leaderboard/:periodCode` | ทุกคน (login แล้ว) | `leaderboard.js` |
| `#/review`, `#/review/:kaizenId` | committee, admin | `reviewQueue.js`, `reviewScore.js` |
| `#/admin/*` | admin เท่านั้น | `adminUsers/Master/Periods/Audit.js` |
| `#/403`, `#/404` | public | `forbidden.js`, `notFound.js` |

*อ้างอิงหน้าเต็ม (สำหรับขยายภายหลัง): `docs/01-architecture.md` §3–§4*

---

## ภาคผนวก: ความสัมพันธ์กับเอกสารเดิม

| เอกสาร | สถานะ | ใช้ทำอะไรต่อ |
|---|---|---|
| `docs/01-architecture.md` | Reference (full design) | ดู workflow/route เต็มเวลาจะขยาย v1 → v2 |
| `docs/02-database-schema.md` | Reference (full design) | ดูตอนต้องแตก `master_data`/`committee_scores` กลับเป็นตารางแยกจริง (เมื่อ scale ขึ้น) |
| `docs/03-rls-policies.md` | Reference (full design) | ต้นแบบ policy เต็มก่อนเขียน RLS จริงใน `supabase/schema.sql` |
| `docs/04-project-structure.md` | Reference (full design) | ต้นแบบตอน migrate จาก vanilla JS → Next.js ถ้าระบบโตเกิน MVP |
| **`Spec.md` (ฉบับนี้)** | **Active — สร้างจริงตามนี้** | ใช้เป็น source of truth ระหว่างพัฒนา v1 |
