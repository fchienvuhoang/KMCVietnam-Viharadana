"use client";

import { LockKeyhole, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

type LoginResponse = {
  ok: boolean;
  next?: string;
  error?: string;
};

export function LoginForm({
  authConfigured,
  nextPath,
}: {
  authConfigured: boolean;
  nextPath: string;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(authConfigured ? null : "ADMIN_PASSWORD chưa được cấu hình.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
          next: nextPath,
        }),
      });
      const json = (await response.json()) as LoginResponse;

      if (!response.ok) {
        throw new Error(json.error || "Không đăng nhập được.");
      }

      window.location.assign(json.next || "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không đăng nhập được.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Mật khẩu quản trị</span>
        <input
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          required
          disabled={!authConfigured || isSubmitting}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-zinc-50"
        />
      </label>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <button
        disabled={!authConfigured || isSubmitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        Đăng nhập
      </button>
    </form>
  );
}
