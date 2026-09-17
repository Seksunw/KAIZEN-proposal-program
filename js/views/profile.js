// js/views/profile.js — โปรไฟล์ของฉัน: รูป/ชื่อ/role, สถิติโครงการ, ข้อมูลบัญชี
import { getMyKaizenList, getPeriods, getResults, getMasterData, uploadAvatar, updateProfile, getAvatarSignedUrl, signOut } from '../api.js?v=20260911z10';
import { t, tf, getLang, setLang } from '../i18n.js?v=20260911z10';
import { escapeHtml, translateError, pageHeader, skeletonRows, stateCard, initials, roleLabel, hydrateAvatars, resizeImage, masterLabel } from '../ui.js?v=20260911z10';
import { navigate } from '../router.js?v=20260911z10';
import { MAX_UPLOAD_MB } from '../config.js?v=20260911z10';

export async function render(container, params, session) {
  document.title = `${t('pr_page_title')} · ${t('appName')}`;
  container.innerHTML = `${pageHeader({ title: t('pr_page_title') })}<div class="page-body">${skeletonRows(3)}</div>`;

  const profile = session.profile;
  const roles = profile?.Roles ?? [];

  let myKaizen = [];
  let latestScore = null;
  let departments = [];
  let plants = [];
  try {
    [myKaizen, departments, plants] = await Promise.all([
      getMyKaizenList(session.user.id),
      getMasterData('department'),
      getMasterData('plant'),
    ]);
  } catch { /* สถิติ/label พัง ไม่บล็อกทั้งหน้า — เหลือ fallback เป็น code ดิบ */ }

  const deptLabel = (code) => masterLabel(departments, code);
  const plantLabel = (code) => masterLabel(plants, code);

  try {
    const periods = await getPeriods();
    const published = periods.filter((p) => p.Status === 'published')
      .sort((a, b) => (a.PeriodStart < b.PeriodStart ? 1 : -1));
    for (const p of published) {
      const mine = myKaizen.find((k) => k.PeriodId === p.Id);
      if (!mine) continue;
      const results = await getResults(p.Id);
      const row = results.find((r) => r.KaizenId === mine.Id);
      if (row) { latestScore = row; break; }
    }
  } catch { /* เพิกเฉย */ }

  const submittedCount = myKaizen.filter((k) => k.Status !== 'draft').length;
  const publishedCount = myKaizen.filter((k) => k.Status === 'published').length;
  const scoreValue = latestScore ? Number(latestScore.WeightedScore).toFixed(2) : '—';

  const state = { saving: false, error: '' };
  renderPage();

  function renderPage() {
    container.innerHTML = `
      ${pageHeader({ title: t('pr_page_title') })}
      <div class="page-body is-narrow">
        <div class="profile-hero">
          <div class="profile-avatar-wrap">
            <div class="avatar is-xl"${profile?.AvatarPath ? ` data-avatar-path="${escapeHtml(profile.AvatarPath)}"` : ''}>${escapeHtml(initials(profile?.FullName))}</div>
            <button type="button" id="btn-edit-avatar" class="profile-avatar-edit" aria-label="${escapeHtml(t('pr_change_avatar_aria'))}" ${state.saving ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <input type="file" accept="image/*" id="f-avatar" style="display:none" />
          </div>
          <div class="profile-name">${escapeHtml(profile?.FullName ?? '')}</div>
          <div class="profile-role-pills">${roles.map((r) => `<span class="badge badge-outline">${escapeHtml(roleLabel(r))}</span>`).join('')}</div>
          ${state.error ? `<div class="error" style="margin-top:var(--sp-3)">${escapeHtml(state.error)}</div>` : ''}
        </div>

        <div class="profile-stats">
          <div class="profile-stat-card">
            <div class="profile-stat-value">${submittedCount}</div>
            <div class="profile-stat-label">${t('pr_stat_submitted')}</div>
          </div>
          <div class="profile-stat-card">
            <div class="profile-stat-value">${publishedCount}</div>
            <div class="profile-stat-label">${t('pr_stat_published')}</div>
          </div>
          <div class="profile-stat-card">
            <div class="profile-stat-value mono">${scoreValue}</div>
            <div class="profile-stat-label">${t('pr_stat_latest_score')}</div>
          </div>
        </div>

        <div class="section-head is-borderless"><h2>${t('pr_account_info_heading')}</h2></div>
        <div class="profile-settings">
          <div class="profile-settings-row">
            <span class="profile-settings-label">${t('pr_email_label')}</span>
            <span class="profile-settings-value">${escapeHtml(session.user.email ?? '—')}</span>
          </div>
          <div class="profile-settings-row">
            <span class="profile-settings-label">${t('apd_col_employee_id')}</span>
            <span class="profile-settings-value mono">${escapeHtml(profile?.EmployeeId ?? '—')}</span>
          </div>
          <div class="profile-settings-row">
            <span class="profile-settings-label">${t('pr_dept_plant_label')}</span>
            <span class="profile-settings-value">${escapeHtml(deptLabel(profile?.Department) ?? '—')} / ${escapeHtml(plantLabel(profile?.Plant) ?? '—')}</span>
          </div>
          <button type="button" id="btn-toggle-lang" class="profile-settings-row is-button">
            <span class="profile-settings-label">${t('pr_language_label')}</span>
            <span class="profile-settings-value">${getLang() === 'th' ? t('pr_lang_thai') : t('pr_lang_english')}</span>
          </button>
        </div>
        <div class="profile-settings" style="margin-top:var(--sp-3)">
          <button type="button" id="btn-logout-profile" class="profile-settings-row is-button is-danger">
            <span class="profile-settings-label">${t('pr_logout_btn')}</span>
          </button>
        </div>
      </div>
    `;

    hydrateAvatars(container, getAvatarSignedUrl);

    document.getElementById('btn-edit-avatar').addEventListener('click', () => document.getElementById('f-avatar').click());
    document.getElementById('f-avatar').addEventListener('change', onAvatarChange);
    document.getElementById('btn-toggle-lang').addEventListener('click', () => {
      setLang(getLang() === 'th' ? 'en' : 'th');
      window.dispatchEvent(new CustomEvent('kaizen:profile-updated'));
      navigate(location.hash);
    });
    document.getElementById('btn-logout-profile').addEventListener('click', async () => {
      await signOut();
    });
  }

  async function onAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      state.error = tf('kzform_file_too_large', { mb: MAX_UPLOAD_MB });
      renderPage();
      return;
    }
    state.saving = true; state.error = '';
    renderPage();
    try {
      const resized = await resizeImage(file);
      const path = await uploadAvatar(session.user.id, resized);
      await updateProfile(session.user.id, { AvatarPath: path });
      profile.AvatarPath = path;
      window.dispatchEvent(new CustomEvent('kaizen:profile-updated'));
    } catch (err) {
      state.error = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.saving = false;
      renderPage();
    }
  }
}
