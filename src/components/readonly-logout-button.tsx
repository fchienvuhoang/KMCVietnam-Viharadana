"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

export function ReadonlyLogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function logout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/viewer/logout", { method: "POST" });
      window.location.reload();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isLoggingOut}
      className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" />
      Đăng xuất
    </button>
  );
}
