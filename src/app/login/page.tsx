import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { signIn, signOut, signUpTeam } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Login tim" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { status, daftar } = await searchParams;
  const register = daftar === "1";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="font-display text-sm font-semibold text-accent">Groom &amp; Bloom</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{register ? "Daftar akun tim" : "Login tim"}</h1>
        <p className="mt-1 text-sm text-muted">Manajer, kasir, dan kapster — halaman menyesuaikan peran.</p>

        {status === "pending" && (
          <div role="status" className="mt-6 rounded-lg bg-st-booked p-4 text-sm">
            Akun Anda menunggu aktivasi manajer. Coba masuk lagi setelah diaktifkan.
            <form action={signOut} className="mt-2"><button className="font-semibold underline">Keluar</button></form>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-line bg-card p-6">
          {register ? (
            <AuthForm action={signUpTeam} submit="Daftar" fields={[
              { name: "full_name", label: "Nama lengkap", autoComplete: "name" },
              { name: "email", label: "Email", type: "email", autoComplete: "email" },
              { name: "password", label: "Kata sandi (min. 8)", type: "password", autoComplete: "new-password" },
              { name: "role", label: "Peran", options: [["cashier", "Kasir / front desk"], ["staff", "Kapster / teknisi"]] },
              { name: "invite_code", label: "Kode undangan", autoComplete: "off" },
            ]} />
          ) : (
            <AuthForm action={signIn} submit="Masuk" fields={[
              { name: "email", label: "Email", type: "email", autoComplete: "email" },
              { name: "password", label: "Kata sandi", type: "password", autoComplete: "current-password" },
            ]} />
          )}
        </div>
        <a href={register ? "/login" : "/login?daftar=1"} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent">
          {register ? "Sudah punya akun? Masuk" : "Anggota tim baru? Daftar dengan kode undangan"}
        </a>
      </div>
    </main>
  );
}
