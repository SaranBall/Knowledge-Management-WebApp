/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Local-only fallback assets — ไม่พึ่งพา external CDN (unsplash.com, randomuser.me, youtube.com)
 * เพื่อลดความเสี่ยงจาก external dependency ที่อาจเข้าไม่ถึง หรือมีประเด็น privacy/compliance
 *
 * หมายเหตุ: ค่าเหล่านี้ใช้เป็น "placeholder ตอนแสดงผล/preview" เท่านั้น
 * ไม่ควรใช้เป็นค่าที่ยอมให้ submit เข้า database จริง (ระบบบังคับต้องอัปโหลดรูปจริง
 * ผ่าน validation ทั้งฝั่ง client และ server แล้ว — ดู requireAvatar ใน server.ts)
 */

// Avatar placeholder แบบ inline SVG data URI — ไม่ต้อง host ไฟล์แยก ไม่ต้องพึ่งเน็ตนอก
export const DEFAULT_AVATAR_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <rect width="80" height="80" rx="40" fill="#e2e8f0"/>
  <circle cx="40" cy="32" r="14" fill="#94a3b8"/>
  <path d="M14 68c0-14.36 11.64-26 26-26s26 11.64 26 26" fill="#94a3b8"/>
</svg>
`.trim(),
  );

// ใช้แทน mock lesson image ตอนสร้างคอร์สแล้วไม่ได้แนบรูปจริง
export const DEFAULT_LESSON_IMAGE_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
  <rect width="800" height="450" fill="#f1f5f9"/>
  <text x="400" y="230" font-family="sans-serif" font-size="24" fill="#94a3b8"
        text-anchor="middle">ยังไม่มีรูปภาพประกอบ</text>
</svg>
`.trim(),
  );