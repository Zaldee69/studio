import type { Metadata } from "next";
import { signOut } from "@/lib/auth-actions";
import { TeamAuth } from "./team-auth";

export const metadata: Metadata = { title: "Login tim" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { status, daftar, mfa } = await searchParams;
  const register = daftar === "1" && mfa !== "1";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="font-display text-sm font-semibold text-accent">Groom &amp; Bloom</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{mfa === "1" ? "Verifikasi 2 langkah" : register ? "Daftar akun tim" : "Login tim"}</h1>
        <p className="mt-1 text-sm text-muted">Manajer, kasir, dan kapster — halaman menyesuaikan peran.</p>

        {status === "pending" && (
          <div role="status" className="mt-6 rounded-lg bg-st-booked p-4 text-sm">
            Akun Anda menunggu aktivasi manajer. Coba masuk lagi setelah diaktifkan.
            <form action={signOut} className="mt-2"><button className="font-semibold underline">Keluar</button></form>
          </div>
        )}
        {status === "terkonfirmasi" && (
          <p role="status" className="mt-6 rounded-lg bg-st-booked p-4 text-sm">Jika tautan masih berlaku, email Anda sudah terkonfirmasi. Silakan masuk.</p>
        )}

        <div className="mt-6 rounded-2xl border border-line bg-card p-6">
          <TeamAuth key={`${register}-${mfa}`} register={register} mfa={mfa === "1"} />
        </div>
        {mfa !== "1" && (
          <a href={register ? "/login" : "/login?daftar=1"} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent">
            {register ? "Sudah punya akun? Masuk" : "Anggota tim baru? Daftar dengan kode undangan"}
          </a>
        )}
      </div>
    </main>
  );
}
