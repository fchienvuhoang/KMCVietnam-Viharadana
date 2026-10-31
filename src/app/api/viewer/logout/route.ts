import { NextResponse } from "next/server";
import { READONLY_SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(READONLY_SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/bao-cao",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
