/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { api } from "../services/api";

// แปลง path ที่ได้จาก upload ("/uploads/xxx.pdf") ให้เป็นลิงก์ชั่วคราวที่มี token
// สำหรับใช้ใน <img>/<video>/<iframe>/<a href> ที่แนบ Authorization header เองไม่ได้
// ลิงก์ภายนอก (http/https), data:, blob: ไม่ต้องผ่านนี้ — คืนค่าเดิมทันที
export async function resolveSignedUrl(
  rawUrl: string | undefined,
): Promise<string | undefined> {
  if (!rawUrl) return rawUrl;
  if (!rawUrl.startsWith("/uploads/")) return rawUrl;
  const storedFilename = rawUrl.slice("/uploads/".length).split("?")[0];
  try {
    const { url } = await api.signFileUrl(storedFilename);
    return url;
  } catch (err) {
    console.error("Failed to sign file url:", err);
    return undefined;
  }
}