"use client";

import { useRouter } from "next/navigation";
import { CustomerAuth } from "@/components/customer-auth";

export function LoginPanel() {
  const router = useRouter();
  return <CustomerAuth onDone={() => router.refresh()} />;
}
