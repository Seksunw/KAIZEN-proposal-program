// js/views/kaizenForm.js — ฟอร์มเสนอ/แก้ไข KAIZEN แบบ multi-step (MIGRATION.md ข้อ 4)
// หมายเหตุ MVP: ไม่มี autosave ทุก 20 วินาทีเหมือน full design — บันทึกร่างเกิดขึ้นตอนกด
// "ถัดไป"/"เก็บร่างไว้ก่อน" เท่านั้น
// ★ ผู้ใช้ขอ (2026-09-16) ให้สร้างแถวจริงใน DB ทันทีตั้งแต่เข้าขั้น 2 (แค่มี owner/department/
// plant/project_type จากขั้น 1 ก็พอ ไม่ต้องรอชื่อโครงการ) เพื่อให้ปุ่ม "เก็บร่างไว้ก่อน" (ต้องมี
// draft.Id) โผล่ได้ตั้งแต่ต้นขั้น 2 แทนที่จะโผล่ทีหลังตอนกรอกชื่อโครงการเสร็จแล้วกด "ถัดไป" อีกที
// — title เป็น NOT NULL ในตาราง แต่ '' (ค่าว่าง) ก็ผ่านได้ ไม่ใช่ null จึงต้องกัน buildPatch()
// ไม่ให้แปลง Title='' เป็น null เหมือนฟิลด์ข้อความอื่น (ดูคอมเมนต์ที่ buildPatch)
import {
  getKaizenById, createKaizen, updateKaizen, submitKaizen,
  getOpenPeriod, getPeriodById, getMasterData, uploadAttachment, deleteAttachment, getAttachmentSignedUrl,
  getAvatarSignedUrl, getKaizenEditGrants,
} from '../api.js?v=20260911z11';
import { t, tf, getLang } from '../i18n.js?v=20260911z11';
import { navigate } from '../router.js?v=20260911z11';
import { escapeHtml, translateError, statusBadge, initials, openLightbox, resizeImage, hydrateAvatars, stateCard, todayInSystemTz, daysBetweenDateStrings, addDaysToDateString, masterLabel, thaiDateTime } from '../ui.js?v=20260911z11';
import {
  CATEGORIES, CATEGORY_LABELS, IMPACTS, IMPACT_LABELS,
  SUPPORT_NEEDED, SUPPORT_NEEDED_LABELS, ATTACHMENT_PHASES, ATTACHMENT_PHASE_LABELS,
} from '../constants.js?v=20260911z11';
import { MAX_UPLOAD_MB } from '../config.js?v=20260911z11';

// ★ i18n audit Round 13 (full project translation) — เดิมเป็น array ข้อความไทยดิบ เปลี่ยนเป็น
// เก็บ "คีย์" แทน เรียก t() ตอน render จริงถึงจะได้ค่าตามภาษาปัจจุบันเสมอ (ไม่ cache ค่าดิบไว้ตรงนี้
// ตั้งแต่ module load เพราะตอนนั้นภาษายังไม่ initLang() เสร็จ)
const STEP_TITLE_KEYS = ['kzform_step1', 'kzform_step2', 'kzform_step3', 'kzform_step4', 'kzform_step5', 'kzform_step6'];
const PROBLEM_MIN_LEN = 50;
const COST_BASIS_MIN_LEN = 30;

const WRITABLE_FIELDS = [
  'OwnerId', 'PeriodId', 'Department', 'Plant', 'ProjectType', 'TeamMembers',
  'Title', 'TitleEn', 'ProblemDescription', 'ProblemDescriptionEn',
  'Categories', 'CategoryOther', 'Impacts', 'ImprovementApproach', 'ImprovementApproachEn',
  'SupportNeeded', 'SupportOther', 'BudgetBand', 'CostSavingPerMonth', 'CostSavingBasis',
  'IsCompleted', 'StartDate', 'CompletionDate', 'NextFollowUpDate', 'ResponsibleUserId',
  'ConfirmedByName',
];

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// ★ CATEGORY_LABELS/IMPACT_LABELS/SUPPORT_NEEDED_LABELS/ATTACHMENT_PHASE_LABELS (constants.js)
// มี .th/.en ครบทุกตัวอยู่แล้ว แต่ทั้งไฟล์นี้เดิมอ่านแค่ .th ตรงๆ ทุกจุด (i18n audit Round 12/13)
// helper เล็กๆ นี้เลือกภาษาปัจจุบันแทน — ใช้กับ label object แบบ {th,en} เท่านั้น
function L(labelObj) {
  return labelObj[getLang() === 'en' ? 'en' : 'th'];
}

function buildPatch(draft) {
  const patch = {};
  for (const key of WRITABLE_FIELDS) {
    const v = draft[key];
    // ★ Title เป็น NOT NULL ในตาราง (ต่างจากฟิลด์ข้อความอื่นที่ null ได้) — ต้องคงเป็น '' ไว้
    // ไม่แปลงเป็น null เหมือนฟิลด์อื่น ไม่งั้น createKaizen()/updateKaizen() จะชน not-null
    // constraint ทันทีที่ชื่อโครงการยังว่าง (ตอนสร้างร่างอัตโนมัติที่ขั้น 2 ก่อนกรอกชื่อ)
    patch[key] = (v === '' && key !== 'Title') ? null : v;
  }
  if (patch.CostSavingPerMonth !== null && patch.CostSavingPerMonth !== undefined) {
    patch.CostSavingPerMonth = Number(patch.CostSavingPerMonth);
  }
  // ★ DB (guard_kaizen_completion trigger) ปฏิเสธ is_completed=true ถ้ายังไม่มี attachment
  // phase='after' เลย — ผู้ใช้เลือก "เสร็จแล้ว" ได้ตั้งแต่ขั้น 4 แต่รูปเพิ่งอัปโหลดได้ที่ขั้น 5
  // (หลังจากนั้น) ถ้าส่ง true ไปตรงๆ ทุกครั้งที่กด "ถัดไป"/"เก็บร่าง" ระหว่างขั้น 4-5 (ก่อนอัปโหลด
  // รูปจริง) จะชน exception ทุกครั้งจนติดล็อก แก้โดย "ยังไม่ส่ง true ไป DB" จนกว่าจะมีรูปหลังทำ
  // จริงแล้วเท่านั้น — UI ยังโชว์ "เสร็จแล้ว" ตามที่ผู้ใช้เลือกไว้ตลอด (อ่านจาก draft.IsCompleted
  // ในหน่วยความจำ ไม่ใช่จากค่าที่ persist ไปจริง) พอมีรูปแล้ว patch ครั้งถัดไปจะส่ง true ให้เองอัตโนมัติ
  if (patch.IsCompleted && !(draft.KaizenAttachments ?? []).some((a) => a.Phase === 'after')) {
    patch.IsCompleted = false;
  }
  return patch;
}

export async function render(container, params, session) {
  const isEdit = Boolean(params.id);
  document.title = `${t(isEdit ? 'kzform_h1_edit' : 'kzform_h1_new')} · ${t('appName')}`;
  // ★ ผู้ใช้ขอ (2026-09-16) ให้ admin กดข้ามขั้นตอนในฟอร์มนี้ได้อิสระ ไม่ต้องกรอกครบทีละขั้น —
  // ปลดล็อกแค่การ "นำทาง" (คลิก tab ข้ามไปมา) เท่านั้น ไม่แตะ stepIssues()/allBlockingIssues()
  // ที่บล็อกปุ่ม "ไปขั้นถัดไป"/"ยืนยันส่งโครงการ" เลย — ส่งโครงการไม่ครบไม่ได้เหมือนเดิมทุก role
  const isAdmin = (session.profile?.Roles ?? []).includes('admin');

  const state = {
    step: 1,
    maxStepReached: isAdmin ? 6 : 1,
    saving: false,
    error: [],
    certify: false,
    openPeriod: null,
    // ★ ตั้งค่าเมื่อ need_revision + รอบปิดแล้ว + มีสิทธิ์แก้ไขชั่วคราวที่ยังไม่หมดอายุเท่านั้น
    // (Spec.md §4.8 backlog Low #7) — ใช้โชว์ banner เตือนผู้ใช้ว่าทำไมถึงแก้ไขได้ทั้งที่รอบปิดแล้ว
    activeEditGrant: null,
    departments: [],
    plants: [],
    budgetBands: [],
    costSavingBands: [],
    draft: {
      Id: null,
      Status: null,
      OwnerId: session.user.id,
      PeriodId: null,
      Department: session.profile.Department,
      Plant: session.profile.Plant,
      ProjectType: 'individual',
      TeamMembers: [],
      Title: '',
      TitleEn: '',
      ProblemDescription: '',
      ProblemDescriptionEn: '',
      Categories: [],
      CategoryOther: '',
      Impacts: [],
      ImprovementApproach: '',
      ImprovementApproachEn: '',
      SupportNeeded: [],
      SupportOther: '',
      BudgetBand: '',
      CostSavingPerMonth: '',
      CostSavingBasis: '',
      IsCompleted: false,
      StartDate: '',
      CompletionDate: '',
      NextFollowUpDate: '',
      ResponsibleUserId: session.user.id,
      ConfirmedByName: session.profile.FullName ?? '',
      KaizenAttachments: [],
    },
  };

  try {
    [state.departments, state.plants, state.budgetBands, state.costSavingBands] = await Promise.all([
      getMasterData('department'),
      getMasterData('plant'),
      getMasterData('budget_band'),
      getMasterData('cost_saving_band'),
    ]);
  } catch { /* master_data ยังว่าง — ใช้ค่า prefill จาก profile ต่อไปได้ */ }

  if (isEdit) {
    try {
      const existing = await getKaizenById(params.id);
      // ★ เช็ค ownership ก่อน render ฟอร์มแก้ไข — RLS (k_update_own) จะบล็อกการเขียนจริงอยู่แล้ว
      // ถ้าไม่ใช่เจ้าของ แต่ก่อนหน้านี้หน้านี้ไม่เคยเช็คตรงนี้เลย ทำให้กรรมการที่เห็นโครงการผ่าน
      // k_read_committee หรือใครก็ตามที่เห็นโครงการ published เปิด #/kaizen/:id/edit ได้ฟอร์ม
      // เต็มรูปแบบทั้งที่เขียนจริงจะพังเงียบๆ ด้วย RLS error ที่งง (Spec.md §4.8 finding M5) —
      // ยกเว้น admin เพราะ k_update_admin ไม่เช็ค owner_id เลย เขียนสำเร็จจริง ไม่ใช่กรณีที่ต้องกัน
      // (isAdmin คำนวณไว้แล้วบนสุดของ render())
      if (existing.OwnerId !== session.user.id && !isAdmin) {
        container.innerHTML = `<div class="page-body">${stateCard({
          kind: 'forbidden',
          title: t('kzform_no_edit_permission_title'),
          body: t('kzform_no_edit_permission_body'),
          actions: `<a href="#/kaizen/${params.id}"><button type="button" class="secondary">${t('kzform_back_to_detail')}</button></a>`,
        })}</div>`;
        return;
      }
      // ★ need_revision ที่รอบของ "โครงการนี้เอง" (ไม่ใช่รอบที่เปิดอยู่ตอนนี้) ปิด/ประกาศผลไปแล้ว
      // — RLS (k_update_own) จะบล็อกการบันทึกทุกอย่างเงียบๆ ด้วย error ที่งง ยกเว้นมีสิทธิ์แก้ไข
      // ชั่วคราว (kaizen_edit_grants) ที่ admin ให้ไว้และยังไม่หมดอายุเท่านั้น — เช็คก่อน render
      // ฟอร์มเพื่อบอกเหตุผลที่ชัดเจนแทนปล่อยให้กรอกไปแล้วเซฟไม่ได้ทีหลัง (Spec.md §4.8 backlog Low #7)
      if (existing.Status === 'need_revision' && existing.PeriodId && !isAdmin) {
        const ownPeriod = await getPeriodById(existing.PeriodId).catch(() => null);
        if (ownPeriod && !['draft', 'open', 'scoring'].includes(ownPeriod.Status)) {
          const grants = await getKaizenEditGrants(existing.Id).catch(() => []);
          const now = new Date();
          const active = grants.find((g) => !g.RevokedAt && new Date(g.GrantedAt) <= now && now < new Date(g.ExpiresAt));
          if (!active) {
            container.innerHTML = `<div class="page-body">${stateCard({
              kind: 'forbidden',
              title: t('kzform_locked_title'),
              body: t('kzform_locked_body'),
              actions: `<a href="#/kaizen/${params.id}"><button type="button" class="secondary">${t('kzform_back_to_detail')}</button></a>`,
            })}</div>`;
            return;
          }
          state.activeEditGrant = active;
        }
      }

      Object.assign(state.draft, existing);
      // ★ ผู้ใช้ขอ (2026-09-16) ให้แต่ละหัวข้อกดข้ามไปได้ก็ต่อเมื่อกรอกครบจริงเท่านั้น — เดิม
      // ปลดล็อกทุกขั้นทันทีที่เป็นการแก้ไขโครงการที่มีอยู่แล้ว (ไม่ว่าร่างนั้นจะกรอกไปถึงไหนจริง)
      // ทำให้กดข้าม "ปัญหา"/"แนวทาง" ที่ยังไม่ได้กรอกไปหน้า "ทบทวน" ได้เลย — เช็คทีละขั้นด้วย
      // stepIssues() (ฟังก์ชันเดียวกับที่ใช้บล็อกปุ่ม "ไปขั้นถัดไป") แทนการปลดล็อกทั้งหมดเหมา ๆ
      // — โครงการ need_revision ที่เคยส่งครบแล้วจะไม่ติดปัญหาอะไรเลย ผลลัพธ์ยังเป็น 6 เหมือนเดิม
      // admin ข้ามเช็คนี้ไปเลย (ปลดล็อกอิสระตามที่ขอ — ตั้งไว้แล้วตั้งแต่ state init ด้านบน)
      state.maxStepReached = 6;
      if (!isAdmin) {
        for (let s = 1; s <= 5; s++) {
          if (stepIssues(s).length > 0) { state.maxStepReached = s; break; }
        }
      }
    } catch (err) {
      container.innerHTML = `<div class="page-body"><div class="state-card is-error"><div class="state-main">
        <div class="state-title">${t('error_load_failed')}</div>
        <p class="state-body">${escapeHtml(translateError(err.message) || err.message || t('common_error_generic'))}</p>
      </div></div></div>`;
      return;
    }
    // ★ ต้องรู้ว่ารอบที่เปิดอยู่ตอนนี้คือรอบไหนเสมอตอนแก้ไข ไม่ใช่แค่ตอนสร้างใหม่ — เดิมหน้านี้
    // ไม่เคยดึง openPeriod เลยในโหมดแก้ไข ทำให้ไม่มีคำเตือน "ไม่มีรอบเปิด" ระหว่างแก้ไข และตอน
    // กดส่งจริงถ้ารอบเดิมปิดไปแล้วจะเจอ raw error จาก DB ตรงๆ (Spec.md §4.8 finding M4) —
    // เฉพาะโครงการที่ยังส่งได้ (draft/need_revision) เท่านั้นที่ต้องรู้เรื่องนี้
    if (!state.draft.Status || state.draft.Status === 'draft' || state.draft.Status === 'need_revision') {
      try { state.openPeriod = await getOpenPeriod(); } catch { /* ไม่มีรอบเปิด — แก้ไขได้ ส่งไม่ได้ */ }
    }
  } else {
    try {
      state.openPeriod = await getOpenPeriod();
      state.draft.PeriodId = state.openPeriod?.Id ?? null;
    } catch { /* ไม่มีรอบเปิด — บันทึกร่างได้ ส่งไม่ได้ */ }
  }

  async function persist() {
    const patch = buildPatch(state.draft);
    if (!state.draft.Id) {
      const created = await createKaizen(patch);
      // ★ ดึงกลับมาแค่ Id/Status (เหมือน branch update ด้านล่าง) ไม่ Object.assign ทั้งก้อน —
      // ตอนสร้างร่างอัตโนมัติที่ขั้น 2 (2026-09-16) ฟิลด์ข้อความส่วนใหญ่ยังว่างอยู่ ฝั่ง DB คืนค่า
      // เป็น null (ไม่ใช่ '') กลับมา ถ้า assign ทับ state.draft ทั้งก้อนจะเปลี่ยนค่า local จาก ''
      // เป็น null แล้วโค้ดที่เรียก .trim()/escapeHtml() กับฟิลด์เหล่านี้ในขั้นถัดๆ ไปจะพังทันที
      // (พบจริงจาก ProblemDescription null ทำ charCountHtml() throw ตอน render ขั้น 2)
      state.draft.Id = created.Id;
      state.draft.Status = created.Status;
    } else {
      const updated = await updateKaizen(state.draft.Id, patch);
      state.draft.Status = updated.Status;
    }
  }

  // ---- validation: คืน array ของปัญหา (ใช้ทั้งบล็อกปุ่ม, char-count, และหน้าทบทวน) ----
  function stepIssues(step) {
    const d = state.draft;
    const issues = [];
    if (step === 1) {
      if (d.ProjectType === 'group' && d.TeamMembers.length === 0) {
        issues.push(t('kzform_val_group_needs_member'));
      }
    }
    if (step === 2) {
      if (d.Title.trim().length < 5) issues.push(t('kzform_val_title_min'));
      if (d.Categories.length === 0) issues.push(t('kzform_val_category_required'));
      if (d.ProblemDescription.trim().length < PROBLEM_MIN_LEN) {
        issues.push(tf('kzform_val_problem_min', { min: PROBLEM_MIN_LEN, current: d.ProblemDescription.trim().length }));
      }
    }
    if (step === 3) {
      if (!d.ImprovementApproach || d.ImprovementApproach.trim().length === 0) {
        issues.push(t('kzform_val_approach_required'));
      }
      if (Number(d.CostSavingPerMonth) > 0 && (!d.CostSavingBasis || d.CostSavingBasis.trim().length < COST_BASIS_MIN_LEN)) {
        issues.push(tf('kzform_val_cost_basis_min', { min: COST_BASIS_MIN_LEN }));
      }
    }
    if (step === 4) {
      if (d.StartDate && d.CompletionDate && d.CompletionDate < d.StartDate) {
        issues.push(t('kzform_val_completion_before_start'));
      }
      if (d.IsCompleted && !d.CompletionDate) issues.push(t('kzform_val_completion_date_required'));
      if (!d.IsCompleted && !d.NextFollowUpDate) issues.push(t('kzform_val_followup_required'));
      // ★ ไม่เช็คเรื่องรูป "หลังทำ" ที่ขั้นนี้ — ตั้งใจปล่อยให้เลือก "เสร็จแล้ว" แล้วไปขั้น 5 เพื่อ
      // อัปโหลดรูปได้เสมอ (รูปอัปโหลดได้ที่ขั้น 5 ซึ่งอยู่ "หลัง" ขั้นนี้ ถ้าบล็อกไว้ตรงนี้จะกลาย
      // เป็นไปขั้น 5 ไม่ได้เลย วนตันไม่มีทางออก) — buildPatch()/persist() เป็นคนกันไม่ให้ยิง
      // is_completed=true ไป DB ก่อนมีรูปจริงแทน (ดูคอมเมนต์ที่ buildPatch) ส่วน step 5 ด้านล่าง
      // เป็นคนบังคับให้ต้องมีรูปจริงก่อนจะไปขั้น 6 ได้
    }
    if (step === 5) {
      const hasBefore = (d.KaizenAttachments ?? []).some((a) => a.Phase === 'before');
      if (!hasBefore) issues.push(t('kzform_val_before_photo_required'));
      const hasAfter = (d.KaizenAttachments ?? []).some((a) => a.Phase === 'after');
      if (d.IsCompleted && !hasAfter) {
        issues.push(t('kzform_val_after_photo_required'));
      }
    }
    if (step === 6) {
      if (!d.ConfirmedByName || d.ConfirmedByName.trim().length === 0) issues.push(t('kzform_val_confirmed_by_required'));
      if (!state.certify) issues.push(t('kzform_val_certify_required'));
    }
    return issues;
  }

  function allBlockingIssues() {
    return [1, 2, 3, 4, 5].flatMap((s) => stepIssues(s));
  }

  function costBandFor(value) {
    const n = Number(value);
    if (!n || n <= 0) return null;
    return state.costSavingBands.find((b) => {
      const min = b.Extra?.min ?? 0;
      const max = b.Extra?.max;
      return n >= min && (max == null || n <= max);
    }) ?? null;
  }

  // ★ true ระหว่างที่โค้ดกำลังเลื่อน #step-track เอง (ทั้ง animateStepThenCommit ด้านล่าง และ
  // การ sync ตำแหน่งท้าย renderStep()) — ตัว scroll listener ที่จับการปัดของผู้ใช้ (ท้ายไฟล์)
  // ต้องเช็คค่านี้ก่อนเสมอ ไม่งั้นจะตีความอนิเมชั่นที่เราสั่งเองว่าเป็นการปัดของผู้ใช้ วนเปลี่ยน
  // ขั้นซ้อนกันเอง
  let scrollGuard = false;

  // ★ ผู้ใช้ขอ (2026-09-16) ให้เนื้อหาขั้นถัดไปเปลี่ยนก็ต่อเมื่ออนิเมชั่นเลื่อนการ์ดเล่นจบก่อน —
  // เดิม renderStep() แทนที่ DOM ทันที (เนื้อหาโผล่ทันที 0ms) แล้วค่อยเริ่มเลื่อนการ์ดทีหลัง
  // (~700-800ms) ทำให้ไม่สัมพันธ์กัน (วัดจริงแล้วเจอ) — ฟังก์ชันนี้เลื่อน track ปัจจุบัน (ก่อนที่
  // commit() จะเรียก renderStep() ทับ) ให้เสร็จก่อน ค่อยเรียก commit() ทีหลัง เหมือน pattern
  // หน้า welcome (รอ animation ปุ่มเปลี่ยนภาษาจบก่อนค่อยเปลี่ยนหน้า)
  function animateStepThenCommit(n, commit) {
    const track = document.getElementById('step-track');
    const targetCard = track ? [...track.querySelectorAll('.step-slide')][n - 1] : null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!track || !targetCard || reduceMotion || Math.abs(track.scrollLeft - targetCard.offsetLeft) < 1) {
      commit();
      return;
    }
    scrollGuard = true;
    let settled = false;
    let settleTimer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      track.removeEventListener('scroll', onScroll);
      clearTimeout(settleTimer);
      clearTimeout(maxWaitTimer);
      scrollGuard = false;
      commit();
    };
    const onScroll = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, 100);
    };
    track.addEventListener('scroll', onScroll);
    // ★ safety net เผื่อ scroll event ไม่ยิง (เช่นตำแหน่งชนกันพอดี) — วัดจริง native smooth
    // scroll ของเคสนี้ใช้เวลาราว 700-800ms กันไว้ 900ms
    const maxWaitTimer = setTimeout(finish, 900);
    track.scrollTo({ left: targetCard.offsetLeft, behavior: 'smooth' });
  }

  function goToStep(n) {
    if (n < 1 || n > state.maxStepReached) return;
    animateStepThenCommit(n, () => {
      state.step = n;
      state.error = [];
      renderStep();
    });
  }

  async function onSaveDraft() {
    state.saving = true; renderStep();
    try {
      await persist();
    } catch (e) {
      state.error = [e.message || t('common_error_generic')];
    } finally {
      state.saving = false;
      renderStep();
    }
  }

  async function onNext() {
    const issues = stepIssues(state.step);
    if (issues.length > 0) { state.error = issues; renderStep(); return; }

    state.saving = true; state.error = []; renderStep();
    try {
      await persist();
      // ★ commit (step+1/ปลดล็อก/saving=false) รอจน animation เลื่อนการ์ดจบก่อน (ผู้ใช้ขอ
      // 2026-09-16) — ไม่ใช้ finally เหมือนเดิมเพราะฝั่งสำเร็จต้อง defer ให้ animateStepThenCommit
      // เป็นคนเรียก renderStep() แทน ฝั่ง error ยัง set saving=false ทันทีเหมือนเดิม (ไม่ต้องเลื่อน
      // อะไร เพราะยังอยู่ขั้นเดิม)
      const nextStep = state.step + 1;
      animateStepThenCommit(nextStep, () => {
        state.step = nextStep;
        state.maxStepReached = Math.max(state.maxStepReached, state.step);
        state.saving = false;
        renderStep();
      });
    } catch (e) {
      state.error = [e.message || t('common_error_generic')];
      state.saving = false;
      renderStep();
    }
  }

  async function onSubmit() {
    const issues = allBlockingIssues().concat(stepIssues(6));
    if (issues.length > 0) { state.error = issues; renderStep(); return; }

    state.saving = true; state.error = []; renderStep();
    try {
      await persist();
      // ★ โครงการที่ถูกตีกลับ (need_revision) ต้องกลับไปเป็น draft ก่อนเสมอ เพราะ submitKaizen()
      // (RPC) รับเฉพาะ status='draft' — ย้าย PeriodId ไปที่รอบที่เปิดอยู่ ณ ตอนนี้ด้วย (รอบเดิม
      // ตอนถูกตีกลับอาจปิดไปแล้ว) แล้วเข้า flow เดียวกับส่งใหม่ทุกอย่าง (เช็ค period เปิด/deadline/
      // รูปก่อนทำ ฯลฯ ซ้ำใหม่ทั้งหมด) — ดู Spec.md §4.8 finding H1
      if (state.draft.Status === 'need_revision') {
        await updateKaizen(state.draft.Id, { Status: 'draft', PeriodId: state.openPeriod?.Id ?? null });
      }
      await submitKaizen(state.draft.Id);
      // ★ รวม "ส่งโครงการ" กับ "ส่งให้กรรมการให้คะแนน" (เดิมเป็นปุ่มแยกใน kaizenProgress.js
      // ต้องไปกดเองทีหลัง) เป็นการกดครั้งเดียวตามคำขอผู้ใช้ 2026-09-11 — submitted -> pending_review
      // เป็น transition ที่อนุญาตอยู่แล้ว (guard_kaizen_transition) และไม่มี gate เพิ่มเพราะ
      // is_completed ยังเป็น false ตอนนี้เสมอ (เพิ่งสร้าง ยังไม่เคยมีโอกาสทำเครื่องหมายเสร็จ) —
      // ปุ่ม "ส่งให้กรรมการให้คะแนน" ใน kaizenProgress.js ยังคงอยู่ ไว้ใช้กับโครงการเก่าที่ค้าง
      // อยู่ที่ submitted/in_progress จากก่อนหน้านี้ที่ยังไม่เคยถูกส่งเข้าคิว
      await updateKaizen(state.draft.Id, { Status: 'pending_review' });
      navigate(`#/kaizen/${state.draft.Id}`);
    } catch (e) {
      state.error = [e.message || t('common_error_generic')];
      state.saving = false;
      renderStep();
    }
  }

  // ★ การ์ดใหญ่เต็มความกว้าง โชว์ทีละขั้น (ผู้ใช้ส่งภาพตัวอย่างยืนยัน 2026-09-16 — ไม่ใช่แถบ
  // chip เล็กเห็นพร้อมกันหลายอันแบบรอบแรกที่ทำ) เลื่อนเปลี่ยนขั้นด้วย scroll-snap ทีละใบ
  function renderStepRail() {
    return STEP_TITLE_KEYS.map((titleKey, i) => {
      const n = i + 1;
      const isCurrent = n === state.step;
      const isDone = n <= state.maxStepReached && !isCurrent;
      const cls = isCurrent ? 'is-current' : (isDone ? 'is-done' : '');
      const clickable = n <= state.maxStepReached;
      const statusText = isDone ? t('kzform_status_done') : (isCurrent ? t('kzform_status_current') : t('kzform_status_todo'));
      // ★ ผู้ใช้ขอเอาเลขลำดับออก (2026-09-16) — เหลือแค่เครื่องหมายถูกตอนกรอกแล้ว ไม่มีอะไรโชว์
      // ตอนยังไม่ถึง/กำลังทำ (ชื่อขั้น + "ขั้น N จาก 6" ใน eyebrow ข้างบนบอกลำดับอยู่แล้ว)
      // ★ ไอคอนถูกวางเรียงข้าง title แนวนอน (ไม่ใช่ซ้อนบน) — ถ้าซ้อนบนแยกบรรทัดจะทำให้การ์ด
      // ที่กรอกแล้ว (มีไอคอน) สูงกว่าการ์ดอื่นในแถวเดียวกัน แล้ว align-items:stretch (ค่า default
      // ของ flex) จะดึงการ์ดทุกใบในแถวให้สูงเท่าใบที่สูงที่สุดหมด ทำให้สูงเกิน .pick ที่ขอเทียบไว้
      // (เจอจากวัดจริง 2026-09-16 — สูงเกิน ~26px ตรงกับความสูงไอคอน+gap ที่เคยแยกบรรทัด)
      const icon = isDone
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0"><path d="M4 12l5 5L20 6"/></svg>'
        : '';
      return `
        <li class="step-slide ${cls}">
          <button type="button" class="step-slide-card" data-step="${n}" ${clickable ? '' : 'disabled'}>
            <span class="step-slide-title">${icon}${escapeHtml(t(titleKey))}</span>
            <span class="step-slide-status">${statusText}</span>
          </button>
        </li>
      `;
    }).join('');
  }

  // ★ จุดบอกตำแหน่งใต้แถบขั้นตอน (ผู้ใช้ขอ 2026-09-16 ตามแบบ scroll-snap carousel) — ใช้
  // data-step เดียวกับ tab ด้านบน เลยได้ wiring คลิกฟรีจาก querySelectorAll('[data-step]')
  // ที่มีอยู่แล้วใน renderStep() ไม่ต้องเพิ่ม event listener ใหม่
  function renderStepDots() {
    return STEP_TITLE_KEYS.map((_, i) => {
      const n = i + 1;
      const clickable = n <= state.maxStepReached;
      return `<button type="button" class="step-carousel-dot ${n === state.step ? 'is-active' : ''}" data-step="${n}" aria-label="${escapeAttr(tf('kzform_aria_goto_step', { n }))}" ${clickable ? '' : 'disabled'}></button>`;
    }).join('');
  }

  function renderErrorBox() {
    const box = document.getElementById('form-error');
    if (!box) return;
    if (!state.error || state.error.length === 0) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
        <div>${state.error.map((i) => `<div>${escapeHtml(i)}</div>`).join('')}</div>
      </div>
    `;
  }

  async function renderStep() {
    const periodLabel = state.openPeriod ? tf('kzform_period_code', { code: escapeHtml(state.openPeriod.Code) }) : '';

    container.innerHTML = `
      <header class="page-header">
        <div class="page-header-main">
          <div class="eyebrow">${tf('kzform_step_of_6', { n: state.step })} · ${escapeHtml(t(STEP_TITLE_KEYS[state.step - 1]))}${periodLabel ? ` · ${periodLabel}` : ''}</div>
          <h1>${t(isEdit ? 'kzform_h1_edit' : 'kzform_h1_new')}</h1>
        </div>
        ${state.draft.Id ? `<div class="page-header-actions"><span class="autosave">${t('kzform_autosave')}</span></div>` : ''}
      </header>
      <div class="page-body is-narrow">
        <div class="step-carousel">
          <button type="button" class="step-carousel-arrow" id="step-prev" aria-label="${escapeAttr(t('kzform_aria_prev_step'))}" ${state.step <= 1 || state.saving ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <ol class="wizard steps" id="step-track">${renderStepRail()}</ol>
          <button type="button" class="step-carousel-arrow" id="step-next" aria-label="${escapeAttr(t('kzform_aria_next_step'))}" ${state.step >= 6 || state.saving ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div class="step-carousel-dots">${renderStepDots()}</div>
        ${(!isEdit || state.draft.Status === 'need_revision') && !state.openPeriod ? `<div class="warning" style="margin-top:var(--sp-4)">${t('kzform_no_open_period_warning')}</div>` : ''}
        ${state.activeEditGrant ? `<div class="warning" style="margin-top:var(--sp-4)">${tf('kzform_edit_grant_banner', { expires: escapeHtml(thaiDateTime(state.activeEditGrant.ExpiresAt)), reason: escapeHtml(state.activeEditGrant.Reason) })}</div>` : ''}
        <div id="step-body" style="margin-top:var(--sp-5)"></div>
        <div id="form-error" style="margin-top:var(--sp-4)"></div>
        <!-- ★ ผู้ใช้ขอย้ายความสามารถ "ย้อนกลับ"/"ไปขั้นถัดไป" ขึ้นไปที่ลูกศร/ปัดการ์ดบนแถบขั้นตอน
             แทน (2026-09-16) — เหลือแค่ "เก็บร่างไว้ก่อน" เท่านั้นในแถบนี้ (ปุ่มส่งจริงย้ายไปอยู่
             เป็นการ์ดต่อจากข้อความอธิบายในเนื้อหาขั้น 6 แทน — ดู renderStep6()) ไม่โชว์แถบนี้เลย
             ถ้าไม่มีอะไรจะแสดง — โผล่ตั้งแต่ขั้น 2 เป็นต้นไป (persist() สร้างแถวจริงทันทีตอนกด
             "ขั้นถัดไป" ออกจากขั้น 1 แล้ว ดูคอมเมนต์ที่ persist()) เหลือแค่ขั้น 1 เท่านั้นที่ยังไม่มี
             draft.Id เลยไม่โชว่แถบนี้ กันแถบว่างเปล่าค้างอยู่ล่างจอ -->
        ${state.draft.Id ? `
          <div class="wizard-actions">
            <button type="button" id="btn-save-draft" class="ghost" ${state.saving ? 'disabled' : ''}>${t('kzform_save_draft')}</button>
            <span class="spacer"></span>
          </div>
        ` : ''}
      </div>
    `;

    renderErrorBox();

    document.getElementById('btn-save-draft')?.addEventListener('click', onSaveDraft);
    container.querySelectorAll('[data-step]').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(Number(btn.dataset.step)));
    });
    document.getElementById('step-prev')?.addEventListener('click', () => goToStep(state.step - 1));
    // ★ ลูกศรขวารับหน้าที่ "ไปขั้นถัดไป" เดิมด้วย (2026-09-16) — ถ้าขั้นถัดไปปลดล็อกอยู่แล้ว
    // (เช่น admin หรือขั้นที่เคยผ่านไปแล้ว) แค่เลื่อนดูเฉยๆ (goToStep) แต่ถ้าอยู่ตรงขอบเขตที่ยัง
    // ไม่เคยปลดล็อก ต้องตรวจ+บันทึก+ปลดล็อกก่อน (onNext) เหมือนปุ่มเดิมทุกประการ
    document.getElementById('step-next')?.addEventListener('click', () => {
      if (state.saving) return;
      if (state.step < state.maxStepReached) goToStep(state.step + 1);
      else if (state.step < 6) onNext();
    });

    // ★ sync ตำแหน่ง track ที่เพิ่งสร้างใหม่ (scrollLeft รีเซ็ตเป็น 0 เสมอทุก re-render) ให้ตรงกับ
    // ขั้นปัจจุบันทันที "ไม่มีอนิเมชั่น" (2026-09-16) — อนิเมชั่นเลื่อนแบบนุ่มนวลย้ายไปอยู่ก่อน
    // commit() ใน animateStepThenCommit()/goToStep()/onNext() แล้วแทน จุดนี้แค่กันไม่ให้เห็นวูบ
    // ไปการ์ดแรกก่อนสักครู่ทุกครั้งที่ re-render (เช่นตอน state.saving เปลี่ยนแต่ step เดิม)
    const track = document.getElementById('step-track');
    const currentSlide = track?.querySelector('.step-slide.is-current');
    // ★ ต้องระบุ behavior:'instant' ตรงๆ (ไม่ใช่แค่ตั้ง .scrollLeft เฉยๆ) — .wizard.steps มี
    // scroll-behavior:smooth ทาง CSS อยู่แล้ว (ไว้ใช้กับ scrollTo อื่น) การเซ็ต .scrollLeft
    // ตรงๆ ก็ยังโดน CSS นั้นครอบให้เลื่อนแบบนุ่มนวลไปด้วย (เจอจากวัดจริง — เห็นเลื่อนซ้อนอีกรอบ
    // หลัง commit) ต้องสั่ง 'instant' ชัดเจนเพื่อ bypass CSS แล้วเปลี่ยนทันทีจริงๆ
    if (track && currentSlide) track.scrollTo({ left: currentSlide.offsetLeft, behavior: 'instant' });

    // ★ ปัดการ์ดใหญ่ (scroll-snap ทีละใบ ตามภาพตัวอย่างที่ผู้ใช้ส่ง 2026-09-16) ก็เปลี่ยนขั้นได้
    // เหมือนกด tab/ลูกศร — หาใบที่เลื่อนมาอยู่ตรงกลางแล้วเรียก goToStep() ตัวเดียวกัน ถ้าใบนั้น
    // ยังล็อกอยู่ (เกิน maxStepReached) ให้ "ดีดกลับ" ไปใบปัจจุบันแทนที่จะปล่อยให้ค้างอยู่ใบที่
    // ยังไปไม่ได้ — ★ ต้องเช็ค scrollGuard (ตั้งไว้ใน animateStepThenCommit) ก่อนเสมอ ไม่ให้ยิง
    // handler นี้ซ้อนระหว่างเล่น animation ที่เราสั่งเอง ไม่งั้นจะเด้งเปลี่ยนขั้นผิดจังหวะ
    let settleTimer = null;
    track?.addEventListener('scroll', () => {
      if (scrollGuard) return;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const slides = [...track.querySelectorAll('.step-slide')];
        const center = track.scrollLeft + track.offsetWidth / 2;
        let closest = 0;
        let dist = Infinity;
        slides.forEach((el, i) => {
          const d = Math.abs(center - (el.offsetLeft + el.offsetWidth / 2));
          if (d < dist) { dist = d; closest = i; }
        });
        const n = closest + 1;
        if (n === state.step) return;
        if (n > state.maxStepReached) {
          // ★ ปัดไปใบถัดไปทันทีจากขอบเขตปัจจุบัน (เหมือนกดลูกศรขวา) ให้ตรวจ+บันทึก+ปลดล็อกด้วย
          // ไม่ใช่แค่ดีดกลับเฉยๆ — ปัดข้ามหลายใบรวดเดียว (ยังไม่เคยผ่านขั้นกลางเลย) ยังคงดีดกลับ
          if (n === state.step + 1 && state.step < 6 && !state.saving) { onNext(); return; }
          animateStepThenCommit(state.step, () => {});
          return;
        }
        goToStep(n);
      }, 150);
    });

    const stepBody = document.getElementById('step-body');
    if (state.step === 1) renderStep1(stepBody);
    else if (state.step === 2) renderStep2(stepBody);
    else if (state.step === 3) renderStep3(stepBody);
    else if (state.step === 4) renderStep4(stepBody);
    else if (state.step === 5) await renderStep5(stepBody);
    else if (state.step === 6) renderStep6(stepBody);

    hydrateAvatars(container, getAvatarSignedUrl); // no-op ถ้าไม่มี [data-avatar-path] ในขั้นนี้ (เฉพาะขั้น 1)

    // ★ ต้องเลื่อนมาที่นี่ (ท้ายสุดของ renderStep ไม่ใช่ใน renderErrorBox เอง) — renderErrorBox()
    // ถูกเรียกตอน #step-body ยังว่างเปล่า (ก่อน renderStep1-6 เติมเนื้อหาจริง) ถ้า scrollIntoView
    // ตอนนั้นหน้าเว็บสั้นมาก ดูเหมือน "อยู่ในจอแล้ว" ไม่ต้องเลื่อน พอ renderStep5 เติม 4
    // ส่วนรูปภาพเข้ามาทีหลังหน้าเว็บถึงยาวขึ้นจริง กล่อง error เลยตกไปนอกจอเหมือนเดิม (พบจาก
    // ทดสอบสด — ต้องเรียกตอนเลย์เอาต์สุดท้ายนิ่งแล้วเท่านั้น, 2026-09-15)
    if (state.error && state.error.length > 0) {
      document.getElementById('form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ============ ขั้น 1 · ผู้เสนอ ============
  function renderStep1(el) {
    const d = state.draft;
    const deptOptions = state.departments
      .map((m) => `<option value="${escapeAttr(m.Code)}" ${m.Code === d.Department ? 'selected' : ''}>${escapeHtml(masterLabel(state.departments, m.Code))}</option>`)
      .join('');
    const plantOptions = state.plants
      .map((m) => `<option value="${escapeAttr(m.Code)}" ${m.Code === d.Plant ? 'selected' : ''}>${escapeHtml(masterLabel(state.plants, m.Code))}</option>`)
      .join('');

    el.innerHTML = `
      <div class="card" style="display:flex;align-items:center;gap:14px;margin-bottom:var(--sp-5)">
        <div class="avatar"${session.profile.AvatarPath ? ` data-avatar-path="${escapeAttr(session.profile.AvatarPath)}"` : ''}>${escapeHtml(initials(session.profile.FullName))}</div>
        <div style="min-width:0;overflow-wrap:anywhere">
          <div style="font-weight:600;font-size:14.5px">${escapeHtml(session.profile.FullName)}</div>
          <div class="muted mono" style="font-size:12.5px">${escapeHtml(tf('kzform_employee_id', { id: session.profile.EmployeeId }))}</div>
        </div>
      </div>
      <div class="field-row">
        <label>${t('kzform_department')}<select id="f-department">${deptOptions}</select></label>
        <label>${t('kzform_plant')}<select id="f-plant">${plantOptions}</select></label>
      </div>
      <div style="margin-top:var(--sp-5)">
        <label class="field-label">${t('kzform_project_type')}</label>
        <div class="pick-set">
          <button type="button" class="pick ${d.ProjectType === 'individual' ? 'is-on' : ''}" data-pick-type="individual">
            <div class="pick-title">${t('kzform_individual')}</div><div class="pick-sub">${t('kzform_individual_sub')}</div>
          </button>
          <button type="button" class="pick ${d.ProjectType === 'group' ? 'is-on' : ''}" data-pick-type="group">
            <div class="pick-title">${t('kzform_group')}</div><div class="pick-sub">${t('kzform_group_sub')}</div>
          </button>
        </div>
      </div>
      <div id="team-members-block" style="margin-top:var(--sp-5)" ${d.ProjectType === 'group' ? '' : 'hidden'}>
        <label class="field-label">${t('kzform_team_members')}</label>
        <p class="field-hint">${t('kzform_team_members_hint')}</p>
        <div id="team-members-list"></div>
        <button type="button" id="btn-add-member" class="secondary is-sm">${t('kzform_add_member')}</button>
      </div>
    `;

    document.getElementById('f-department').addEventListener('change', (e) => { d.Department = e.target.value; });
    document.getElementById('f-plant').addEventListener('change', (e) => { d.Plant = e.target.value; });
    el.querySelectorAll('[data-pick-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        d.ProjectType = btn.dataset.pickType;
        renderStep1(el);
      });
    });

    function renderMembers() {
      const listEl = document.getElementById('team-members-list');
      listEl.innerHTML = d.TeamMembers.map((m, i) => `
        <div class="member-row">
          <input type="text" placeholder="${escapeAttr(t('kzform_employee_id_placeholder'))}" value="${escapeAttr(m.EmployeeId)}" data-i="${i}" data-f="EmployeeId" />
          <input type="text" placeholder="${escapeAttr(t('kzform_full_name_placeholder'))}" value="${escapeAttr(m.FullName)}" data-i="${i}" data-f="FullName" />
          <button type="button" class="icon-btn" data-remove="${i}" aria-label="${escapeAttr(t('kzform_aria_delete'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>
      `).join('');
      listEl.querySelectorAll('input').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          d.TeamMembers[Number(e.target.dataset.i)][e.target.dataset.f] = e.target.value;
        });
      });
      listEl.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          d.TeamMembers.splice(Number(e.currentTarget.dataset.remove), 1);
          renderMembers();
        });
      });
    }
    renderMembers();
    document.getElementById('btn-add-member')?.addEventListener('click', () => {
      d.TeamMembers.push({ EmployeeId: '', FullName: '' });
      renderMembers();
    });
  }

  // ============ ขั้น 2 · ปัญหา ============
  function renderStep2(el) {
    const d = state.draft;

    function charCountHtml() {
      const len = d.ProblemDescription.trim().length;
      const ok = len >= PROBLEM_MIN_LEN;
      const remaining = Math.max(0, PROBLEM_MIN_LEN - len);
      return `
        <div class="char-count ${ok ? 'is-ok' : ''}">
          <div class="bar"><i style="width:${Math.min(100, (len / PROBLEM_MIN_LEN) * 100)}%"></i></div>
          <span class="n">${len}/${PROBLEM_MIN_LEN}</span>
          <span class="msg">${ok ? t('kzform_char_ok') : tf('kzform_char_remaining', { n: remaining })}</span>
        </div>
      `;
    }

    el.innerHTML = `
      <label><span>${t('kzform_title_th_label')} <span class="req">*</span></span>
        <input type="text" id="f-title" value="${escapeAttr(d.Title)}" placeholder="${escapeAttr(t('kzform_title_placeholder'))}" />
      </label>
      <fieldset style="margin-top:var(--sp-5)">
        <legend>${t('kzform_categories_legend')} <span class="req">*</span></legend>
        <!-- ★ ผู้ใช้ขอเปลี่ยนจาก chip เป็น toggle switch แยกทีละแถว ห่อด้วย .card (2026-09-16
             อ้างอิง Uiverse.io by namecho) — ใช้แบบเดียวกันกับ "ระดับผลกระทบ" (ล่างนี้)/
             "สิ่งที่ต้องการสนับสนุน" (renderStep3) ตามคำขอ แต่ยังไม่แตะ .chip กลางที่ใช้ร่วมกับ
             หน้าอื่นทั่วแอป (เช่น filter-chip/pick ที่ไม่ใช่ chip-set) -->
        <div class="card">
          <div class="toggle-list" id="cat-chips">
            ${CATEGORIES.map((c) => `
              <label class="toggle-row">
                <span class="toggle-row-label">${escapeHtml(L(CATEGORY_LABELS[c]))}</span>
                <span class="switch">
                  <input type="checkbox" data-value="${c}" ${d.Categories.includes(c) ? 'checked' : ''} />
                  <span class="slider"></span>
                </span>
              </label>
            `).join('')}
          </div>
        </div>
      </fieldset>
      <label id="cat-other-wrap" style="margin-top:var(--sp-5)" ${d.Categories.includes('other') ? '' : 'hidden'}>${t('kzform_category_other_label')}
        <input type="text" id="f-category-other" value="${escapeAttr(d.CategoryOther ?? '')}" />
      </label>
      <label style="margin-top:var(--sp-5)"><span>${t('kzform_problem_desc_label')} <span class="req">*</span></span>
        <textarea id="f-problem" rows="4">${escapeHtml(d.ProblemDescription)}</textarea>
      </label>
      <div id="cc-problem-wrap">${charCountHtml()}</div>
      <fieldset style="margin-top:var(--sp-5)">
        <legend>${t('kzform_impacts_legend')}</legend>
        <div class="card">
          <div class="toggle-list" id="impact-chips">
            ${IMPACTS.map((c) => `
              <label class="toggle-row">
                <span class="toggle-row-label">${escapeHtml(L(IMPACT_LABELS[c]))}</span>
                <span class="switch">
                  <input type="checkbox" data-value="${c}" ${d.Impacts.includes(c) ? 'checked' : ''} />
                  <span class="slider"></span>
                </span>
              </label>
            `).join('')}
          </div>
        </div>
      </fieldset>
    `;

    document.getElementById('f-title').addEventListener('input', (e) => { d.Title = e.target.value; });
    document.getElementById('f-category-other')?.addEventListener('input', (e) => { d.CategoryOther = e.target.value; });

    const problemInput = document.getElementById('f-problem');
    problemInput.addEventListener('input', (e) => {
      d.ProblemDescription = e.target.value;
      document.getElementById('cc-problem-wrap').innerHTML = charCountHtml();
    });

    const catOtherWrap = document.getElementById('cat-other-wrap');
    document.getElementById('cat-chips').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const v = cb.dataset.value;
        const on = d.Categories.includes(v);
        d.Categories = on ? d.Categories.filter((x) => x !== v) : [...d.Categories, v];
        catOtherWrap.hidden = !d.Categories.includes('other');
      });
    });
    document.getElementById('impact-chips').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const v = cb.dataset.value;
        const on = d.Impacts.includes(v);
        d.Impacts = on ? d.Impacts.filter((x) => x !== v) : [...d.Impacts, v];
      });
    });
  }

  // ============ ขั้น 3 · แนวทาง ============
  function renderStep3(el) {
    const d = state.draft;
    const bandOptions = state.budgetBands
      .map((m) => `<option value="${escapeAttr(m.Code)}" ${m.Code === d.BudgetBand ? 'selected' : ''}>${escapeHtml(masterLabel(state.budgetBands, m.Code))}</option>`)
      .join('');

    function costHintHtml() {
      const band = costBandFor(d.CostSavingPerMonth);
      if (!band) return '';
      const min = band.Extra?.min ?? 0;
      const max = band.Extra?.max;
      const range = max != null
        ? `${min.toLocaleString('th-TH')}–${max.toLocaleString('th-TH')}`
        : tf('kzform_more_than', { min: min.toLocaleString('th-TH') });
      return `<p class="field-hint" style="color:var(--primary)">${tf('kzform_cost_hint', { rank: band.Extra?.rank, range })}</p>`;
    }

    el.innerHTML = `
      <label><span>${t('kzform_approach_label')} <span class="req">*</span></span><textarea id="f-approach" rows="4">${escapeHtml(d.ImprovementApproach)}</textarea></label>
      <fieldset style="margin-top:var(--sp-5)">
        <legend>${t('kzform_support_legend')}</legend>
        <div class="card">
          <div class="toggle-list" id="support-chips">
            ${SUPPORT_NEEDED.map((c) => `
              <label class="toggle-row">
                <span class="toggle-row-label">${escapeHtml(L(SUPPORT_NEEDED_LABELS[c]))}</span>
                <span class="switch">
                  <input type="checkbox" data-value="${c}" ${d.SupportNeeded.includes(c) ? 'checked' : ''} />
                  <span class="slider"></span>
                </span>
              </label>
            `).join('')}
          </div>
        </div>
      </fieldset>
      <label id="support-other-wrap" style="margin-top:var(--sp-5)" ${d.SupportNeeded.includes('other') ? '' : 'hidden'}>${t('kzform_support_other_label')}
        <input type="text" id="f-support-other" value="${escapeAttr(d.SupportOther ?? '')}" />
      </label>
      <label style="margin-top:var(--sp-5)">${t('kzform_budget_label')}<select id="f-budget-band"><option value=""></option>${bandOptions}</select></label>
      <label style="margin-top:var(--sp-5)">${t('kzform_cost_saving_label')}<input type="number" min="0" step="1" id="f-cost-saving" value="${d.CostSavingPerMonth ?? ''}" /></label>
      <div id="cost-hint-wrap">${costHintHtml()}</div>
      <label style="margin-top:var(--sp-5)">${t('kzform_cost_basis_label')}<textarea id="f-cost-basis" rows="3">${escapeHtml(d.CostSavingBasis ?? '')}</textarea></label>
    `;

    document.getElementById('f-approach').addEventListener('input', (e) => { d.ImprovementApproach = e.target.value; });
    document.getElementById('f-budget-band').addEventListener('change', (e) => { d.BudgetBand = e.target.value; });
    document.getElementById('f-cost-saving').addEventListener('input', (e) => {
      d.CostSavingPerMonth = e.target.value;
      document.getElementById('cost-hint-wrap').innerHTML = costHintHtml();
    });
    document.getElementById('f-cost-basis').addEventListener('input', (e) => { d.CostSavingBasis = e.target.value; });
    document.getElementById('f-support-other')?.addEventListener('input', (e) => { d.SupportOther = e.target.value; });

    const supportOtherWrap = document.getElementById('support-other-wrap');
    document.getElementById('support-chips').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const v = cb.dataset.value;
        const on = d.SupportNeeded.includes(v);
        d.SupportNeeded = on ? d.SupportNeeded.filter((x) => x !== v) : [...d.SupportNeeded, v];
        supportOtherWrap.hidden = !d.SupportNeeded.includes('other');
      });
    });
  }

  // ============ ขั้น 4 · แผนงาน ============
  function renderStep4(el) {
    const d = state.draft;

    function followUpWarningHtml() {
      if (!d.NextFollowUpDate) return '';
      // ★ เทียบ calendar date ล้วนๆ (ไม่ผ่าน new Date() เทียบ Date.now()) กัน bug ที่วันที่ตั้งไว้
      // เองถูกนับว่า "ผ่านมาแล้ว" ตั้งแต่เช้ามืดของวันนั้นเอง (Spec.md §4.8 backlog Low #2)
      const days = daysBetweenDateStrings(todayInSystemTz(), d.NextFollowUpDate);
      if (days <= 0) return '';
      return `<div class="warning" style="margin-top:8px">${tf('kzform_followup_overdue', { n: days })}</div>`;
    }

    el.innerHTML = `
      <div style="margin-bottom:var(--sp-5)">
        <label class="field-label">${t('kzform_review_status')}</label>
        <div class="pick-set">
          <button type="button" class="pick ${!d.IsCompleted ? 'is-on' : ''}" data-pick-completed="false">
            <div class="pick-title">${t('kzform_status_in_progress')}</div>
          </button>
          <button type="button" class="pick ${d.IsCompleted ? 'is-on' : ''}" data-pick-completed="true">
            <div class="pick-title">${t('kzform_status_completed')}</div>
          </button>
        </div>
      </div>
      <div class="field-row">
        <label>${t('kzform_start_date')}<input type="date" id="f-start" value="${d.StartDate ?? ''}" /></label>
        <label><span>${t('kzform_completion_date')}${d.IsCompleted ? ' <span class="req">*</span>' : ''}</span><input type="date" id="f-completion" value="${d.CompletionDate ?? ''}" /></label>
      </div>
      <div id="followup-block" style="margin-top:var(--sp-5)" ${d.IsCompleted ? 'hidden' : ''}>
        <label><span>${t('kzform_next_followup')} <span class="req">*</span></span><input type="date" id="f-followup" value="${d.NextFollowUpDate ?? ''}" /></label>
        <div class="hstack" style="margin-top:var(--sp-2)">
          <button type="button" class="secondary is-sm" data-followup-offset="14">${t('kzform_plus_2_weeks')}</button>
          <button type="button" class="secondary is-sm" data-followup-offset="30">${t('kzform_plus_1_month')}</button>
        </div>
        <div id="followup-warning-wrap">${followUpWarningHtml()}</div>
      </div>
    `;

    document.getElementById('f-start').addEventListener('input', (e) => { d.StartDate = e.target.value; });
    document.getElementById('f-completion').addEventListener('input', (e) => { d.CompletionDate = e.target.value; });
    document.getElementById('f-followup')?.addEventListener('input', (e) => {
      d.NextFollowUpDate = e.target.value;
      const wrap = document.getElementById('followup-warning-wrap');
      if (wrap) wrap.innerHTML = followUpWarningHtml();
    });
    el.querySelectorAll('[data-followup-offset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const days = Number(btn.dataset.followupOffset);
        // ★ บวกวันจาก "วันนี้ตามเขตเวลาระบบ" ไม่ใช่ Date.now()+ms แล้วตัด UTC date — ช่วงเช้ามืด
        // (เที่ยงคืน–7 โมงเช้าไทย) UTC ยังเป็นเมื่อวาน ทำให้ได้วันที่คลาดไป 1 วัน (Spec.md §4.8 Low #2)
        const dateStr = addDaysToDateString(todayInSystemTz(), days);
        d.NextFollowUpDate = dateStr;
        const input = document.getElementById('f-followup');
        if (input) input.value = dateStr;
        const wrap = document.getElementById('followup-warning-wrap');
        if (wrap) wrap.innerHTML = followUpWarningHtml();
      });
    });
    el.querySelectorAll('[data-pick-completed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        d.IsCompleted = btn.dataset.pickCompleted === 'true';
        renderStep4(el);
      });
    });
  }

  // ============ ขั้น 5 · รูปภาพ ============
  async function renderStep5(el) {
    const d = state.draft;
    if (!d.Id) {
      el.innerHTML = `<p class="muted">${t('kzform_fill_prev_steps')}</p>`;
      return;
    }

    el.innerHTML = `
      <div class="note">${t('kzform_photo_hint')}</div>
      ${ATTACHMENT_PHASES.map((phase) => `
        <div class="attach-phase" style="margin-top:var(--sp-5)">
          <h3 style="margin-bottom:var(--sp-2)">${escapeHtml(L(ATTACHMENT_PHASE_LABELS[phase]))}${phase === 'before' ? ` <span class="req">${t('kzform_before_required')}</span>` : ''}</h3>
          ${phase === 'after' ? `<p class="field-hint">${t('kzform_after_hint')}</p>` : ''}
          <div class="attach-grid" id="attach-grid-${phase}"><p class="muted">${t('common_loading')}</p></div>
        </div>
      `).join('')}
    `;

    for (const phase of ATTACHMENT_PHASES) {
      const items = (d.KaizenAttachments ?? []).filter((a) => a.Phase === phase);
      const grid = document.getElementById(`attach-grid-${phase}`);
      const dropzoneHtml = `
        <label class="dropzone" for="attach-input-${phase}" data-drop="${phase}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
          ${t('kzform_add_photo')}
        </label>
        <input type="file" accept="image/*" id="attach-input-${phase}" style="display:none" />
      `;

      grid.innerHTML = items.map((a) => `
        <div class="attach-item" data-id="${a.Id}">
          <img alt="${escapeAttr(a.FileName)}" />
          <button type="button" class="icon-btn" data-del="${a.Id}" aria-label="${escapeAttr(t('kzform_aria_delete'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>
      `).join('') + dropzoneHtml;

      for (const a of items) {
        try {
          const url = await getAttachmentSignedUrl(a.StoragePath);
          const img = grid.querySelector(`[data-id="${a.Id}"] img`);
          img.src = url;
          img.addEventListener('click', () => openLightbox(url, a.FileName));
        } catch { /* ไม่บล็อกทั้งหน้าถ้า thumbnail โหลดไม่ขึ้น */ }
      }

      grid.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const attachment = items.find((a) => a.Id === btn.dataset.del);
          try {
            await deleteAttachment(attachment);
            d.KaizenAttachments = d.KaizenAttachments.filter((x) => x.Id !== attachment.Id);
          } catch (err) {
            state.error = [translateError(err.message) || err.message || t('common_error_generic')];
          }
          await renderStep();
        });
      });

      async function handleFile(file) {
        if (!file) return;
        // ★ เดิมเช็คแค่ขนาดไฟล์ ไม่เช็คว่าเป็นรูปจริง — accept="image/*" บน input เป็นแค่คำแนะนำ
        // ฝั่ง browser ข้ามได้ง่าย (ลาก-วางไฟล์ประเภทอื่นได้ปกติ) ทำให้เก็บไฟล์ที่ไม่ใช่รูปไว้เป็น
        // "รูปแนบ" ได้ พังหน้า thumbnail/lightbox ทีหลัง (Spec.md §4.8 finding M6)
        // ★ จำกัดชนิดให้ตรงกับ allowlist จริงที่ DB บังคับ (kaizen_attachments_mime_type_allowed
        // ใน schema.sql) แทน startsWith('image/') แบบกว้างเดิม — กัน type แปลกๆ (เช่น image/svg+xml
        // ที่แฝง <script> ได้, หรือ image/heic ที่ <img> แสดงไม่ได้ทุก browser) ตกไปถึงขั้น resize/
        // upload ก่อนจะถูก DB ปฏิเสธแบบ error ไม่ชัดเจนทีหลัง (Spec.md §4.8 backlog Low #5)
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          // ★ สาเหตุที่พบบ่อยที่สุดของ error นี้คือรูปถ่ายจากกล้อง iPhone ที่เป็น HEIC/HEIF
          // โดย default (browser ส่วนใหญ่ที่ไม่ใช่ Safari ถอดรหัสไม่ได้เลย ดูเหตุผลเต็มด้านบน)
          // เดิมข้อความไม่บอกสาเหตุ/ทางแก้ ผู้ใช้มือถือกดถ่ายแล้วแนบไม่ติดโดยไม่รู้ว่าทำไม
          // (2026-09-15)
          state.error = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name || '')
            ? [t('kzform_heic_error')]
            : [t('kzform_invalid_image_type')];
          await renderStep();
          return;
        }
        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
          state.error = [tf('kzform_file_too_large', { mb: MAX_UPLOAD_MB })];
          await renderStep();
          return;
        }
        try {
          const resized = await resizeImage(file);
          const attachment = await uploadAttachment({ kaizenId: d.Id, phase, file: resized, uploadedBy: session.user.id });
          d.KaizenAttachments = [...(d.KaizenAttachments ?? []), attachment];
          state.error = [];
        } catch (err) {
          state.error = [translateError(err.message) || err.message || t('common_error_generic')];
        }
        await renderStep();
      }

      document.getElementById(`attach-input-${phase}`).addEventListener('change', (e) => handleFile(e.target.files[0]));

      const dz = grid.querySelector(`[data-drop="${phase}"]`);
      if (dz) {
        dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--primary)'; });
        dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
        dz.addEventListener('drop', (e) => {
          e.preventDefault();
          dz.style.borderColor = '';
          handleFile(e.dataTransfer.files?.[0]);
        });
      }
    }
  }

  // ============ ขั้น 6 · ทบทวน ============
  function renderStep6(el) {
    const d = state.draft;
    // ★ need_revision ต้องนับเป็น "ยังส่งได้" ด้วย ไม่งั้นจะไม่มีปุ่มส่งเลยและโครงการที่ถูกตีกลับ
    // จะแก้แล้วส่งใหม่ไม่ได้ตลอดไป (ดู Spec.md §4.8 finding H1) — ย้ายมาคำนวณที่นี่ (จากเดิมอยู่
    // renderStep()) เพราะปุ่มส่งย้ายมาเป็นการ์ดในเนื้อหาขั้น 6 นี้แล้ว ไม่ใช่แถบปุ่มลอยล่างจอ
    const isDraftStatus = !d.Status || d.Status === 'draft' || d.Status === 'need_revision';
    const submitIssues = allBlockingIssues().concat(stepIssues(6));
    const rows = [
      { label: t('kzform_review_title'), value: d.Title || '—', step: 2, ok: d.Title.trim().length >= 5 },
      {
        label: t('kzform_review_dept_plant'),
        value: `${escapeHtml(masterLabel(state.departments, d.Department))} / ${escapeHtml(masterLabel(state.plants, d.Plant))}`,
        step: 1,
        ok: true,
      },
      { label: t('kzform_review_project_type'), value: d.ProjectType === 'group' ? t('kzform_group') : t('kzform_individual'), step: 1, ok: true },
      { label: t('kzform_review_categories'), value: d.Categories.map((c) => (CATEGORY_LABELS[c] ? L(CATEGORY_LABELS[c]) : c)).join(', ') || '—', step: 2, ok: d.Categories.length > 0 },
      { label: t('kzform_review_problem_desc'), value: tf('kzform_chars_count', { n: d.ProblemDescription.trim().length }), step: 2, ok: d.ProblemDescription.trim().length >= PROBLEM_MIN_LEN },
      { label: t('kzform_review_approach'), value: d.ImprovementApproach ? tf('kzform_chars_count', { n: d.ImprovementApproach.trim().length }) : '—', step: 3, ok: Boolean(d.ImprovementApproach) },
      {
        label: t('kzform_review_cost_saving'),
        value: Number(d.CostSavingPerMonth) > 0 ? `${Number(d.CostSavingPerMonth).toLocaleString('th-TH')} ${t('kzform_baht')}` : t('kzform_none'),
        step: 3,
        ok: !(Number(d.CostSavingPerMonth) > 0) || (d.CostSavingBasis ?? '').trim().length >= COST_BASIS_MIN_LEN,
      },
      {
        label: t('kzform_review_status'),
        value: d.IsCompleted ? tf('kzform_completed_on', { date: d.CompletionDate || '—' }) : tf('kzform_in_progress_followup', { date: d.NextFollowUpDate || '—' }),
        step: 4,
        ok: d.IsCompleted ? Boolean(d.CompletionDate) : Boolean(d.NextFollowUpDate),
      },
      {
        label: t('kzform_review_photos'),
        value: tf('kzform_files_count', { n: (d.KaizenAttachments ?? []).length }),
        step: 5,
        ok: (d.KaizenAttachments ?? []).some((a) => a.Phase === 'before'),
      },
    ];

    el.innerHTML = `
      <div class="review-summary">
        ${rows.map((r) => `
          <div class="muted" style="font-size:13px;padding-top:2px">${escapeHtml(r.label)}</div>
          <div style="font-size:14px;${r.ok ? '' : 'color:var(--danger);font-weight:700'}">${r.value}</div>
          <button type="button" class="secondary is-sm" data-goto="${r.step}">${t('kzform_edit_btn')}</button>
        `).join('')}
      </div>
      <hr style="margin:var(--sp-5) 0" />
      <label><span>${t('kzform_confirmed_by_label')} <span class="req">*</span></span>
        <input type="text" id="f-confirmed-by" value="${escapeAttr(d.ConfirmedByName ?? '')}" />
      </label>
      <label class="inline" style="margin-top:var(--sp-2)">
        <input type="checkbox" id="f-certify" ${state.certify ? 'checked' : ''} />
        ${t('kzform_certify_label')}
      </label>
      <p class="field-hint" style="margin-top:var(--sp-3)">${t('kzform_submit_hint')}</p>
      <!-- ★ ผู้ใช้ขอ (2026-09-16) ให้ปุ่ม "ยืนยันส่งโครงการ" ต่อจากข้อความอธิบายด้านบนนี้เลย
           (ไม่ใช่แถบปุ่มลอยล่างจอแบบเดิม) — อยู่ในเนื้อหาปกติ เลื่อนตามหน้าไปด้วยเหมือนเนื้อหาอื่น
           ทุกอย่าง ไม่ fixed/sticky ปุ่มเต็มความกว้างแบบเดียวกับ "Create account" หน้า welcome
           (.btn-block) — ★ ลองห่อด้วย .card ไปก่อน แต่ผู้ใช้ขอเอากรอบขาวออก (2026-09-16 รอบ 2)
           เหลือแค่ปุ่มลอยเปล่าๆ ไม่มีกล่องห่อ -->
      <div style="margin-top:var(--sp-4)">
        ${isDraftStatus ? `<button type="button" id="btn-submit" class="btn-block" ${state.saving || submitIssues.length > 0 ? 'disabled' : ''}>${state.saving ? t('common_loading') : (submitIssues.length > 0 ? tf('kzform_submit_btn_missing', { n: submitIssues.length }) : t('kzform_submit_btn'))}</button>` : `<p class="muted" style="margin:0">${tf('kzform_already_submitted', { status: statusBadge(state.draft.Status) })}</p>`}
      </div>
    `;
    document.getElementById('f-confirmed-by').addEventListener('input', (e) => { d.ConfirmedByName = e.target.value; });
    document.getElementById('f-certify').addEventListener('change', (e) => {
      state.certify = e.target.checked;
      renderStep(); // ต้องรีเฟรชปุ่มส่ง (disabled ผูกกับ certify ด้วย)
    });
    el.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(Number(btn.dataset.goto)));
    });
    document.getElementById('btn-submit')?.addEventListener('click', onSubmit);
  }

  await renderStep();
}
