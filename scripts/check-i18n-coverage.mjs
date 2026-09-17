#!/usr/bin/env node
// scripts/check-i18n-coverage.mjs — เฝ้าดูว่าจำนวนบรรทัดข้อความไทยดิบ (ไม่ผ่าน t()) ใน
// js/views/*.js (+ js/ui.js, js/app.js) เพิ่มขึ้นจากที่บันทึกไว้ล่าสุดหรือไม่ — สร้างขึ้นตาม
// i18n audit Round 12 (Spec.md) เพราะพบว่า "มี t()/i18n.js อยู่แล้ว" ไม่พอกันคนเขียนโค้ด hardcode
// ข้อความไทยใหม่ทับไปเรื่อยๆ (หลักฐาน: คีย์ state_retry มีอยู่ครบสองภาษาแต่ 0 จุดเรียกใช้จริง)
//
// ไม่มี dependency ใหม่ ไม่ต้อง npm install — รันตรงด้วย: node scripts/check-i18n-coverage.mjs
//   node scripts/check-i18n-coverage.mjs           ตรวจสอบเทียบ baseline, exit 1 ถ้ามีไฟล์ไหนแย่ลง
//   node scripts/check-i18n-coverage.mjs --update  บันทึกจำนวนปัจจุบันเป็น baseline ใหม่ (ทำหลัง
//                                                   แปลไฟล์เสร็จให้ตัวเลขลดลงจริง หรือหลังตรวจแล้วว่า
//                                                   ค่าที่เพิ่มขึ้นตั้งใจ/ยอมรับได้)
//
// ข้อจำกัดที่รู้ตัว: นับ "บรรทัดที่มีอักขระไทย นอกบรรทัดคอมเมนต์ //" เป็น proxy ของข้อความ raw
// ไม่ใช่การ parse AST จริง — ไม่แม่นกับ comment แบบ /* */ หลายบรรทัด (ไฟล์ในโปรเจกต์นี้ใช้ // ทุกจุด
// อยู่แล้วในทางปฏิบัติ) และนับได้เกินจริงเล็กน้อยถ้าบรรทัดเดียวมีมากกว่า 1 ข้อความ แต่พอเป็น "สัญญาณ
// เตือนการเปลี่ยนแปลง" (ค่าขึ้น/ลง) ได้แม่นยำพอ ซึ่งเป็นจุดประสงค์เดียวของสคริปต์นี้

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASELINE_PATH = join(ROOT, 'scripts', 'i18n-baseline.json');
const THAI_RE = /[฀-๿]/;

const TARGET_GLOBS = [
  join(ROOT, 'js', 'views', '*.js'),
  join(ROOT, 'js', 'ui.js'),
  join(ROOT, 'js', 'app.js'),
];

function listTargetFiles() {
  const files = [];
  for (const pattern of TARGET_GLOBS) {
    // node:fs globSync ต้องการ Node >=22 — ถ้าเวอร์ชันเก่ากว่านั้น fallback เป็น readdir ตรงๆ
    if (typeof globSync === 'function') {
      files.push(...globSync(pattern));
    }
  }
  return files.sort();
}

function countRawThaiLines(filePath) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;
    if (THAI_RE.test(line)) count++;
  }
  return count;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

function main() {
  const shouldUpdate = process.argv.includes('--update');
  const files = listTargetFiles();
  if (files.length === 0) {
    console.error('ไม่พบไฟล์เป้าหมายเลย (js/views/*.js, js/ui.js, js/app.js) — เช็ค path/Node version (ต้อง >=22 สำหรับ fs.globSync)');
    process.exit(2);
  }

  const baseline = loadBaseline();
  const current = {};
  const regressions = [];
  const improvements = [];

  for (const file of files) {
    const key = relative(ROOT, file);
    const count = countRawThaiLines(file);
    current[key] = count;
    const prev = baseline[key];
    if (prev === undefined) continue; // ไฟล์ใหม่ — ไม่มี baseline เทียบ ปล่อยผ่าน ให้ --update บันทึกครั้งแรก
    if (count > prev) regressions.push({ file: key, prev, count, diff: count - prev });
    else if (count < prev) improvements.push({ file: key, prev, count, diff: prev - count });
  }

  if (shouldUpdate) {
    writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n');
    console.log(`บันทึก baseline ใหม่แล้ว (${files.length} ไฟล์) → ${relative(ROOT, BASELINE_PATH)}`);
    return;
  }

  if (improvements.length > 0) {
    console.log('ดีขึ้น (บรรทัดข้อความไทยดิบลดลง):');
    for (const r of improvements) console.log(`  ${r.file}: ${r.prev} → ${r.count} (-${r.diff})`);
    console.log('  รัน --update เพื่อบันทึกความคืบหน้านี้เป็น baseline ใหม่\n');
  }

  if (regressions.length > 0) {
    console.error('พบข้อความไทยดิบเพิ่มขึ้นจาก baseline (อาจมี hardcode ใหม่หลุดเข้ามา):');
    for (const r of regressions) console.error(`  ${r.file}: ${r.prev} → ${r.count} (+${r.diff})`);
    console.error('\nถ้าเพิ่มขึ้นเพราะตั้งใจ (เช่น เพิ่มฟีเจอร์ใหม่ที่ยังไม่ได้แปล) รัน --update เพื่อรับค่าใหม่');
    process.exit(1);
  }

  console.log(`ผ่าน — ไม่มีไฟล์ไหนมีข้อความไทยดิบเพิ่มขึ้นจาก baseline (ตรวจ ${files.length} ไฟล์)`);
}

main();
