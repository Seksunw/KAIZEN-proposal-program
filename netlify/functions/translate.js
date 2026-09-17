// netlify/functions/translate.js — proxy ไป Google Cloud Translation API v2 ซ่อน
// GOOGLE_TRANSLATE_API_KEY ไว้ฝั่ง server (เรียกตรงจาก browser ไม่ได้ ไม่งั้น key หลุดผ่าน
// dev tools) — ใช้เฉพาะแปลข้อความไทยใน kaizen_projects (ProblemDescription/ImprovementApproach)
// ให้กรรมการที่อ่านไทยไม่ออกอ่านได้ ไม่เกี่ยวกับ i18n ของ UI เอง (แยกคนละระบบ)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let texts;
  let target;
  try {
    ({ texts, target } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!Array.isArray(texts) || texts.length === 0 || texts.some((t) => typeof t !== 'string')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'texts must be a non-empty array of strings' }) };
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Translation not configured' }) };
  }

  try {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, source: 'th', target: target || 'en', format: 'text' }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || 'Translation failed' }) };
    }
    const translated = (data.data?.translations ?? []).map((t) => t.translatedText);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ translated }) };
  } catch {
    return { statusCode: 500, body: JSON.stringify({ error: 'Translation request failed' }) };
  }
};
