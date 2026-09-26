"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui";
import { homeFor } from "@/lib/format";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? homeFor(user.role) : "/login");
  }, [user, loading, router]);

  return (
    <div className="min-h-screen vsc-grid place-items-center">
      <Spinner />
    </div>
  );
}
