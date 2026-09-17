// js/views/notFound.js — MIGRATION.md ข้อ 15
import { t } from '../i18n.js?v=20260911z7';
import { escapeHtml, pageHeader, stateCard } from '../ui.js?v=20260911z7';

export async function render(container) {
  document.title = `${t('notfound_title')} · ${t('appName')}`;

  container.innerHTML = `
    ${pageHeader({ title: t('notfound_title') })}
    <div class="page-body">
      ${stateCard({
        title: t('notfound_detail'),
        body: `ไม่พบหน้า <span class="mono">${escapeHtml(location.hash || '(ว่าง)')}</span> — ลองกลับไปแดชบอร์ดแล้วเข้าใหม่จากเมนู`,
        actions: '<a href="#/dashboard"><button type="button">กลับไปแดชบอร์ด</button></a>',
      })}
    </div>
  `;
}
