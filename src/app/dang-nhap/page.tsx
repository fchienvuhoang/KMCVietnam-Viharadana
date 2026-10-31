import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { isAdminPasswordConfigured, safeRedirectPath } from "@/lib/auth";

type Props = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Đăng nhập quản trị",
};

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f4] px-4 py-8 text-zinc-950">
      <section className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-zinc-100 p-2 text-zinc-700">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Đăng nhập quản trị</h1>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Nhập mật khẩu để vào trang import sao kê và quản lý thiện pháp.
            </p>
          </div>
        </div>

        <LoginForm authConfigured={isAdminPasswordConfigured()} nextPath={safeRedirectPath(next)} />
      </section>
    </main>
  );
}
