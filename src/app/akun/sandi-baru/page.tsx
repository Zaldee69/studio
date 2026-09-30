import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { NewPassword } from "./new-password";

export const metadata: Metadata = { title: "Kata sandi baru", robots: { index: false } };

export default function Page() {
  return (
    <div className="min-h-screen bg-lux font-jost text-cream">
      <PublicHeader />
      <main className="mx-auto flex max-w-[1180px] justify-center px-[22px] py-14 min-[900px]:py-24"><Suspense><NewPassword /></Suspense></main>
      <PublicFooter />
    </div>
  );
}
