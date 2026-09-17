// js/i18n.js — dictionary TH/EN สลับเอง (ไม่ใช้ next-intl ตาม Spec.md §1.2)
const DICT = {
  th: {
    appName: 'ระบบ KAIZEN Proposal Program',
    nav_dashboard: 'แดชบอร์ด',
    nav_kaizen: 'โครงการของฉัน',
    nav_review: 'ตรวจให้คะแนน',
    nav_feed: 'โครงการทั้งหมด',
    nav_admin_users: 'จัดการผู้ใช้',
    nav_admin_master: 'ข้อมูลหลัก',
    nav_admin_periods: 'รอบการประเมิน',
    nav_admin_audit: 'ประวัติการใช้งาน',
    nav_new_kaizen: 'เสนอ KAIZEN ใหม่',
    nav_more: 'เมนู',
    nav_logout: 'ออกจากระบบ',

    welcome_title: 'เริ่มต้นใช้งาน',
    welcome_subtitle: 'เสนอโครงการ KAIZEN ให้กรรมการตัดสิน ติดตามความคืบหน้า และดูผลการประเมินได้ง่ายๆ ที่เดียว',
    welcome_create_account: 'สร้างบัญชี',
    welcome_login_link: 'เข้าสู่ระบบ',

    login_title: 'เข้าสู่ระบบ',
    login_email: 'อีเมล',
    login_password: 'รหัสผ่าน',
    login_submit: 'เข้าสู่ระบบ',
    login_no_account: 'ยังไม่มีบัญชี?',
    login_register_link: 'สมัครสมาชิก',
    login_error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    login_forgot_link: 'ลืมรหัสผ่าน?',

    register_title: 'สมัครสมาชิก',
    register_employee_id: 'รหัสพนักงาน',
    register_full_name: 'ชื่อ-นามสกุล',
    register_full_name_en: 'ชื่อ-นามสกุล (English)',
    register_department: 'แผนก',
    register_plant: 'โรงงาน',
    register_email: 'อีเมล',
    register_password: 'รหัสผ่าน',
    register_confirm_password: 'ยืนยันรหัสผ่าน',
    register_submit: 'สมัครสมาชิก',
    register_success: 'สมัครสำเร็จ กรุณารอผู้ดูแลระบบเปิดใช้งานบัญชีของคุณ',
    register_has_account: 'มีบัญชีอยู่แล้ว?',
    register_login_link: 'เข้าสู่ระบบ',

    password_min_hint: 'อย่างน้อย 8 ตัวอักษร',
    password_too_short: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
    password_mismatch: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
    password_match_ok: 'รหัสผ่านตรงกัน',

    forgot_title: 'ลืมรหัสผ่าน',
    forgot_sub: 'กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้',
    forgot_submit: 'ส่งลิงก์ตั้งรหัสผ่านใหม่',
    forgot_sent_title: 'ส่งอีเมลแล้ว (ถ้ามีบัญชีนี้ในระบบ)',
    forgot_sent_body: 'ถ้าอีเมลนี้มีบัญชีอยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว กรุณาตรวจสอบกล่องจดหมาย (รวมถึงโฟลเดอร์ Junk/Spam)',
    forgot_back_login: 'กลับไปหน้าเข้าสู่ระบบ',

    reset_title: 'ตั้งรหัสผ่านใหม่',
    reset_sub: 'ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ',
    reset_new_password: 'รหัสผ่านใหม่',
    reset_confirm_password: 'ยืนยันรหัสผ่านใหม่',
    reset_submit: 'บันทึกรหัสผ่านใหม่',
    reset_success: 'ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่',
    reset_expired_title: 'ลิงก์หมดอายุหรือไม่ถูกต้อง',
    reset_expired_body: 'ลิงก์ตั้งรหัสผ่านใหม่นี้หมดอายุ ถูกใช้ไปแล้ว หรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง',
    reset_no_session_body: 'ไม่พบข้อมูลสำหรับตั้งรหัสผ่านใหม่ กรุณากดลิงก์จากอีเมลอีกครั้ง หรือขอลิงก์ใหม่',
    reset_request_new: 'ขอลิงก์ใหม่',

    dashboard_title: 'แดชบอร์ด',
    dashboard_welcome: 'สวัสดี',
    empty_no_open_period: 'ยังไม่มีรอบประเมินที่เปิดอยู่ — บันทึกร่างไว้ก่อนได้ ส่งได้เมื่อ Admin เปิดรอบ',
    empty_leaderboard: 'รอบนี้ยังไม่ประกาศผล ต้องรอ Admin ปิดรอบและประกาศผลก่อน',
    empty_feed: 'ยังไม่มีโครงการที่ส่งในตัวกรองนี้',
    empty_no_tasks: 'ไม่มีเรื่องด่วนที่ต้องทำตอนนี้',
    empty_my_kaizen: 'ยังไม่มีโครงการในรอบนี้ — เริ่มจากปัญหาหน้างานที่คุณเจอบ่อยที่สุด',
    empty_review_queue: 'คุณให้คะแนนครบทุกโครงการแล้ว รอกรรมการที่เหลือส่งคะแนนจึงจะปิดรอบได้',
    empty_periods: 'ยังไม่มีรอบประเมิน — สร้างรอบแรกเพื่อเริ่มรับข้อเสนอ',
    empty_progress: 'ยังไม่มีการบันทึกความคืบหน้า — บันทึกครั้งแรกเพื่อให้หัวหน้าฝ่ายเห็นว่าเริ่มแล้ว',
    empty_audit: 'ยังไม่มีเหตุการณ์ในช่วงเวลาที่เลือก',
    audit_today: 'วันนี้',
    audit_yesterday: 'เมื่อวาน',
    empty_photos: 'ยังไม่มีรูป — รูปก่อน/หลังเป็นสิ่งที่กรรมการดูมากที่สุด',
    forbidden_detail: 'หน้านี้เปิดได้เฉพาะบางสิทธิ์เท่านั้น',
    notfound_detail: 'ไม่พบหน้าที่คุณเปิด',
    state_retry: 'โหลดใหม่',
    state_contact_admin: 'แจ้งผู้ดูแลระบบ',
    system_timezone_label: 'เวลาไทย (ICT, UTC+7)',

    forbidden_title: 'ไม่มีสิทธิ์เข้าถึง',
    forbidden_message: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้',
    notfound_title: 'ไม่พบหน้านี้',
    notfound_message: 'ไม่พบหน้าที่คุณต้องการ',
    back_to_dashboard: 'กลับไปแดชบอร์ด',

    common_loading: 'กำลังโหลด...',
    common_save: 'บันทึก',
    common_cancel: 'ยกเลิก',
    common_error_generic: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
    account_inactive: 'บัญชีของคุณยังไม่ถูกเปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  },
  en: {
    appName: 'KAIZEN Proposal Program',
    nav_dashboard: 'Dashboard',
    nav_kaizen: 'My KAIZEN',
    nav_review: 'Review',
    nav_feed: 'All Projects',
    nav_admin_users: 'Users',
    nav_admin_master: 'Master Data',
    nav_admin_periods: 'Periods',
    nav_admin_audit: 'Audit Log',
    nav_new_kaizen: 'New KAIZEN',
    nav_more: 'Menu',
    nav_logout: 'Log out',

    welcome_title: "Let's get started",
    welcome_subtitle: 'Submit KAIZEN proposals for committee review, track progress, and check results — all in one place.',
    welcome_create_account: 'Create Account',
    welcome_login_link: 'Login to Account',

    login_title: 'Sign in',
    login_email: 'Email',
    login_password: 'Password',
    login_submit: 'Sign in',
    login_no_account: "Don't have an account?",
    login_register_link: 'Register',
    login_error: 'Invalid email or password',
    login_forgot_link: 'Forgot password?',

    register_title: 'Register',
    register_employee_id: 'Employee ID',
    register_full_name: 'Full name',
    register_full_name_en: 'Full name (English)',
    register_department: 'Department',
    register_plant: 'Plant',
    register_email: 'Email',
    register_password: 'Password',
    register_confirm_password: 'Confirm password',
    register_submit: 'Register',
    register_success: 'Registered successfully. Please wait for an admin to activate your account.',
    register_has_account: 'Already have an account?',
    register_login_link: 'Sign in',

    password_min_hint: 'At least 8 characters',
    password_too_short: 'Password must be at least 8 characters',
    password_mismatch: 'Passwords do not match',
    password_match_ok: 'Passwords match',

    forgot_title: 'Forgot password',
    forgot_sub: "Enter the email you registered with — we'll send you a password reset link",
    forgot_submit: 'Send reset link',
    forgot_sent_title: 'Email sent (if an account exists)',
    forgot_sent_body: 'If an account exists for this email, we\'ve sent a password reset link. Please check your inbox (and Junk/Spam folder).',
    forgot_back_login: 'Back to sign in',

    reset_title: 'Set a new password',
    reset_sub: 'Set a new password for your account',
    reset_new_password: 'New password',
    reset_confirm_password: 'Confirm new password',
    reset_submit: 'Save new password',
    reset_success: 'Password updated. Please sign in with your new password.',
    reset_expired_title: 'Link expired or invalid',
    reset_expired_body: 'This password reset link has expired, was already used, or is invalid. Please request a new one.',
    reset_no_session_body: 'No password reset data found. Please click the link in your email again, or request a new one.',
    reset_request_new: 'Request a new link',

    dashboard_title: 'Dashboard',
    dashboard_welcome: 'Hello',
    empty_no_open_period: 'No evaluation period is open — you can still save a draft, submit once Admin opens one',
    empty_leaderboard: 'Results not published yet',
    empty_feed: 'No submitted projects match this filter yet',
    empty_no_tasks: 'Nothing urgent to do right now',
    empty_my_kaizen: 'No projects in this period yet — start from the problem you run into most often',
    empty_review_queue: 'You have scored every project — waiting on the rest of the committee before this period can close',
    empty_periods: 'No evaluation periods yet — create the first one to start accepting proposals',
    empty_progress: 'No progress updates yet',
    empty_audit: 'No events in this range',
    audit_today: 'Today',
    audit_yesterday: 'Yesterday',
    empty_photos: 'No photos yet',
    forbidden_detail: 'This page is limited to certain roles only',
    notfound_detail: 'The page you opened was not found',
    state_retry: 'Reload',
    state_contact_admin: 'Contact admin',
    system_timezone_label: 'Thailand time (ICT, UTC+7)',

    forbidden_title: 'Forbidden',
    forbidden_message: 'You do not have access to this page',
    notfound_title: 'Not found',
    notfound_message: 'The page you requested was not found',
    back_to_dashboard: 'Back to dashboard',

    common_loading: 'Loading...',
    common_save: 'Save',
    common_cancel: 'Cancel',
    common_error_generic: 'Something went wrong. Please try again.',
    account_inactive: 'Your account is not active yet. Please contact an admin.',
  },
};

let currentLang = 'th';

export function initLang() {
  let lang = 'th';
  try { lang = localStorage.getItem('kaizen_lang') || 'th'; } catch { /* private mode */ }
  currentLang = DICT[lang] ? lang : 'th';
  return currentLang;
}

export function setLang(lang) {
  currentLang = DICT[lang] ? lang : 'th';
  try { localStorage.setItem('kaizen_lang', currentLang); } catch { /* private mode */ }
}

export function getLang() {
  return currentLang;
}

export function t(key) {
  return DICT[currentLang]?.[key] ?? DICT.th[key] ?? key;
}
