// js/views/register.js — split layout เดียวกับ login.js (README.md ข้อ 2)
import { signUp, getMasterData, uploadAvatar, updateProfile } from '../api.js?v=20260911z11';
import { t, tf, getLang } from '../i18n.js?v=20260911z11';
import { navigate } from '../router.js?v=20260911z11';
import { escapeHtml, translateError, criteriaTags, wireCriteriaTags, resizeImage, masterLabel } from '../ui.js?v=20260911z11';
import { MAX_UPLOAD_MB } from '../config.js?v=20260911z11';

const PASSWORD_MIN_LEN = 8;

export async function render(container) {
  document.title = `${t('register_title')} · ${t('appName')}`;

  let departments = [];
  let plants = [];
  try {
    [departments, plants] = await Promise.all([
      getMasterData('department'),
      getMasterData('plant'),
    ]);
  } catch {
    // master_data อาจยังไม่ seed — ปล่อยเป็น select ว่างไปก่อน ไม่บล็อกการสมัคร
  }

  const options = (list) => list.map((m) => `<option value="${m.Code}">${escapeHtml(masterLabel(list, m.Code))}</option>`).join('');

  container.innerHTML = `
    <div class="auth-shell">
      <div class="auth-brand">
        <img src="assets/suntory-wellness.jpg" alt="Suntory Wellness" />
        <div class="brand-sub">KAIZEN PROGRAM</div>
        <p class="brand-line">${t('register_brand_line')}</p>
        <p class="muted" style="font-size:12.8px;margin-top:var(--sp-5)">${t('auth_criteria_label')}</p>
        ${criteriaTags(getLang())}
      </div>
      <div class="auth-form-wrap">
        <div class="auth-card">
          <h1>${t('register_title')}</h1>
          <p class="auth-sub">${t('register_sub')}</p>
          <form id="register-form">
            <div class="hstack" style="margin-bottom:var(--sp-5)">
              <div class="avatar is-quiet" id="avatar-preview" style="width:64px;height:64px;font-size:22px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              </div>
              <div style="min-width:0">
                <button type="button" id="btn-pick-avatar" class="secondary is-sm">${t('register_pick_avatar')}</button>
                <input type="file" id="f-avatar" accept="image/*" hidden />
                <p class="field-hint" style="margin-top:4px">${t('register_avatar_optional_hint')}</p>
              </div>
            </div>
            <div class="form-control">
              <input type="text" name="employeeId" id="f-employee-id" required placeholder=" " />
              <label for="f-employee-id"><span>${t('register_employee_id')}</span></label>
            </div>
            <div class="form-control">
              <input type="text" name="fullName" id="f-full-name" required placeholder=" " />
              <label for="f-full-name"><span>${t('register_full_name')}</span></label>
            </div>
            <div>
              <div class="form-control">
                <input type="text" name="fullNameEn" id="f-full-name-en" placeholder=" " />
                <label for="f-full-name-en"><span>${t('register_full_name_en')}</span></label>
              </div>
              <span class="field-hint">${t('register_full_name_en_hint')}</span>
            </div>
            <div class="field-row">
              <label>${t('register_department')}
                <select name="department" required>
                  <option value="" disabled selected></option>
                  ${options(departments)}
                </select>
              </label>
              <label>${t('register_plant')}
                <select name="plant" required>
                  <option value="" disabled selected></option>
                  ${options(plants)}
                </select>
              </label>
            </div>
            <div class="form-control">
              <input type="email" name="email" id="f-email" required autocomplete="email" placeholder=" " />
              <label for="f-email"><span>${t('register_email')}</span></label>
            </div>
            <div>
              <div class="form-control">
                <input type="password" name="password" id="f-password" required minlength="${PASSWORD_MIN_LEN}" autocomplete="new-password" placeholder=" " />
                <label for="f-password"><span>${t('register_password')}</span></label>
              </div>
              <span class="field-hint" id="password-hint">${t('password_min_hint')}</span>
            </div>
            <div class="form-control">
              <input type="password" name="confirmPassword" id="f-confirm-password" required autocomplete="new-password" placeholder=" " />
              <label for="f-confirm-password"><span>${t('register_confirm_password')}</span></label>
            </div>
            <div id="match-hint"></div>
            <div id="register-error"></div>
            <button type="submit" class="btn-block">${t('register_submit')}</button>
          </form>
          <div id="register-success" hidden>
            <div class="success">${t('register_success')}</div>
            <button type="button" class="btn-block" id="btn-register-continue" style="margin-top:var(--sp-4)">${t('forgot_back_login')}</button>
          </div>
          <div class="divider"></div>
          <p>${t('register_has_account')} <a href="#/login">${t('register_login_link')}</a></p>
        </div>
      </div>
    </div>
  `;

  wireCriteriaTags(container);

  const form = document.getElementById('register-form');
  const errorBox = document.getElementById('register-error');
  const successBox = document.getElementById('register-success');
  const avatarInput = document.getElementById('f-avatar');
  const avatarPreview = document.getElementById('avatar-preview');
  let avatarFile = null;

  document.getElementById('btn-pick-avatar').addEventListener('click', () => avatarInput.click());
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      errorBox.innerHTML = `<div class="error">${escapeHtml(tf('kzform_file_too_large', { mb: MAX_UPLOAD_MB }))}</div>`;
      avatarInput.value = '';
      return;
    }
    errorBox.innerHTML = '';
    avatarFile = file;
    avatarPreview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" />`;
  });

  // ★ ยืนยันรหัสผ่าน + policy เดิม (minlength=6 ไม่มี live feedback เลย) — เพิ่ม live hint
  // แบบเดียวกับ resetPassword.js (Spec.md §4.8 backlog Low #1)
  const passwordInput = document.getElementById('f-password');
  const confirmInput = document.getElementById('f-confirm-password');
  const passwordHint = document.getElementById('password-hint');
  const matchHint = document.getElementById('match-hint');
  function updatePasswordHints() {
    const pw = passwordInput.value;
    passwordHint.textContent = pw.length > 0 && pw.length < PASSWORD_MIN_LEN ? t('password_too_short') : t('password_min_hint');
    passwordHint.style.color = pw.length > 0 && pw.length < PASSWORD_MIN_LEN ? 'var(--danger)' : '';
    if (confirmInput.value.length === 0) { matchHint.innerHTML = ''; return; }
    const matches = pw === confirmInput.value;
    matchHint.innerHTML = `<p class="field-hint" style="color:${matches ? 'var(--primary)' : 'var(--danger)'}">${matches ? t('password_match_ok') : t('password_mismatch')}</p>`;
  }
  passwordInput.addEventListener('input', updatePasswordHints);
  confirmInput.addEventListener('input', updatePasswordHints);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.innerHTML = '';
    if (passwordInput.value.length < PASSWORD_MIN_LEN) {
      errorBox.innerHTML = `<div class="error">${escapeHtml(t('password_too_short'))}</div>`;
      return;
    }
    if (passwordInput.value !== confirmInput.value) {
      errorBox.innerHTML = `<div class="error">${escapeHtml(t('password_mismatch'))}</div>`;
      return;
    }
    const fd = new FormData(form);
    try {
      const { user } = await signUp({
        email: fd.get('email'),
        password: fd.get('password'),
        employeeId: fd.get('employeeId'),
        fullName: fd.get('fullName'),
        fullNameEn: fd.get('fullNameEn') || null,
        department: fd.get('department'),
        plant: fd.get('plant'),
      });
      // อัปโหลด avatar เป็น best-effort — ไม่บล็อกการสมัครถ้าล้มเหลว (ไม่บังคับ ใส่ทีหลังได้)
      if (avatarFile && user) {
        try {
          const resized = await resizeImage(avatarFile, 640, 0.85);
          const path = await uploadAvatar(user.id, resized);
          await updateProfile(user.id, { AvatarPath: path });
        } catch { /* เพิกเฉย — สมัครสำเร็จแล้ว รูปตั้งทีหลังได้ */ }
      }
      form.hidden = true;
      successBox.hidden = false;
      document.getElementById('btn-register-continue').addEventListener('click', () => navigate('#/login'));
    } catch (err) {
      // ★ ข้อความ error จาก unique constraint (email/employee_id ซ้ำ) เดิมโชว์ดิบๆ ตรงๆ เช่น
      // "duplicate key value violates unique constraint profiles_email_key" — ต่างข้อความกัน
      // ระหว่างอีเมลซ้ำกับรหัสพนักงานซ้ำ เดาได้ว่าอีเมล/รหัสพนักงานไหนมีบัญชีอยู่แล้ว (user
      // enumeration) — ครอบด้วยข้อความกลางเดียวกันเสมอไม่ว่าจะซ้ำฟิลด์ไหน (Spec.md §4.8 finding M8)
      const isDuplicate = /duplicate key value|already registered|already exists/i.test(err.message || '');
      const msg = isDuplicate
        ? t('register_err_duplicate')
        : (translateError(err.message) || err.message || t('common_error_generic'));
      errorBox.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
    }
  });
}
