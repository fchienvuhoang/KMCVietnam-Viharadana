import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionMaxAge,
  isAdminPasswordConfigured,
  safeRedirectPath,
  verifyAdminPassword,
} from "@/lib/auth";
import { apiError } from "@/lib/api";

const loginSchema = z.object({
  password: z.string().min(1),
  next: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    if (!isAdminPasswordConfigured()) {
      return NextResponse.json({ error: "ADMIN_PASSWORD chưa được cấu hình." }, { status: 503 });
    }

    const body = loginSchema.parse(await request.json());
    if (!verifyAdminPassword(body.password)) {
      return NextResponse.json({ error: "Mật khẩu không đúng." }, { status: 401 });
    }

    const response = NextResponse.json({
      ok: true,
      next: safeRedirectPath(body.next),
    });
    response.cookies.set(ADMIN_SESSION_COOKIE, await createAdminSessionToken(), {
      httpOnly: true,
      maxAge: getAdminSessionMaxAge(),
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    return apiError(error);
  }
}
