"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

// Old URL from the first prototype — rerouting now lives under each plan.
export default function AlternateRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/plans");
  }, [router]);
  return <Spinner />;
}
