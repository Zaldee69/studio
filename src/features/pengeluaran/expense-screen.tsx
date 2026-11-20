"use client";

import { DateInput } from "@/components/date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useEffect, useState } from "react";
import { CloseButton, Empty, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { downloadText, toCsv } from "@/lib/domain/csv";
import { EXPENSE_CAT, EXPENSE_SOURCE, type ExpenseCat, type ExpenseSource } from "@/lib/domain/expense";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { IMAGE_ACCEPT, toUploadable } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";
import { KasbonPanel } from "./kasbon-panel";

type Row = {
  id: string; date: string; category: ExpenseCat; description: string; amount: number; source: ExpenseSource; receipt_path: string | null;
  created_at: string; voided_at: string | null; void_reason: string | null; template_id: string | null; profiles: { full_name: string | null } | null; staff: { name: string } | null;
};
type Tpl = { id: string; category: ExpenseCat; description: string; amount: number; source: ExpenseSource; day_of_month: number };
type Prefill = Omit<Tpl, "day_of_month"> & { templateId: string };
const shiftMonth = (m: string, d: number) => { const t = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + d, 1)); return t.toISOString().slice(0, 7); };
const monthName = (m: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const monthEnd = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);

/** Pengeluaran operasional. Manajer: per bulan, semua sumber, bisa membatalkan. Kasir: hari ini; laci dibatasi kas kecil, sumber lain wajib nota. */
export function ExpenseScreen({ role }: { role: "manager" | "cashier" }) {
  const toast = useToast(); const online = useOnline();
  const manager = role === "manager";
  const today = jktDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [adding, setAdding] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null); // "Catat" dari pengeluaran rutin
  const [newTpl, setNewTpl] = useState(false);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20); // baris per halaman
  const [cat, setCat] = useState<"" | ExpenseCat>("");
  const [q, setQ] = useState("");
  const [qs, setQs] = useState(""); // pencarian yang sudah ditunda 300 ms
  useEffect(() => { const t = setTimeout(() => { setQs(q.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);

  const { data, refresh } = useRealtimeTable(["expenses", "cash_closings"], async () => {
    const supabase = createClient();
    const [from, to] = manager ? [`${month}-01`, monthEnd(month)] : [today, today];
    let list = supabase.from("expenses")
      .select("id, date, category, description, amount, source, receipt_path, created_at, voided_at, void_reason, template_id, profiles!expenses_created_by_fkey(full_name), staff(name)", { count: "exact" })
      .gte("date", from).lte("date", to);
    if (cat) list = list.eq("category", cat);
    if (qs) list = list.ilike("description", `%${qs.replace(/[%_]/g, "")}%`);
    // ringkasan bulan penuh (ringan, tanpa halaman) terpisah dari daftar yang dibagi per halaman
    const [rows, sum, lim, closed, staff, tpl] = await Promise.all([
      list.order("date", { ascending: false }).order("created_at", { ascending: false }).range(page * size, page * size + size - 1),
      supabase.from("expenses").select("category, amount, template_id, date").gte("date", from).lte("date", to).is("voided_at", null),
      supabase.rpc("expense_limits"), supabase.from("cash_closings").select("id").eq("date", today).limit(1),
      supabase.from("staff").select("id, name").eq("active", true).order("name"),
      manager ? supabase.from("expense_templates").select("id, category, description, amount, source, day_of_month").eq("active", true).order("day_of_month") : Promise.resolve({ data: [] }),
    ]);
    if (rows.error) throw rows.error;
    return { rows: rows.data as unknown as Row[], count: rows.count ?? 0, all: (sum.data ?? []) as { category: ExpenseCat; amount: number; template_id: string | null; date: string }[],
      lim: lim.data?.[0] ?? { petty_cash_limit: 0, receipt_required_above: 0 }, todayClosed: !!closed.data?.length, staff: staff.data ?? [], tpl: (tpl.data ?? []) as Tpl[] };
  }, `${manager ? month : today}:${page}:${size}:${cat}:${qs}`);

  const all = data?.all ?? [];
  const total = all.reduce((a, r) => a + r.amount, 0);
  const byCat = Object.entries(all.reduce<Record<string, number>>((a, r) => ({ ...a, [r.category]: (a[r.category] ?? 0) + r.amount }), {})).sort((a, b) => b[1] - a[1]);
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / size));

  async function openReceipt(path: string) {
    const { data, error } = await createClient().storage.from("receipts").createSignedUrl(path, 300);
    if (error) return toast(error.message, "error");
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function exportCsv() {
    // semua baris bulan itu (bukan hanya halaman yang tampil)
    const { data: full, error } = await createClient().from("expenses")
      .select("id, date, category, description, amount, source, receipt_path, created_at, voided_at, void_reason, template_id, profiles!expenses_created_by_fkey(full_name), staff(name)")
      .gte("date", `${month}-01`).lte("date", monthEnd(month)).order("date", { ascending: false }).order("created_at", { ascending: false });
    if (error) return toast(error.message, "error");
    downloadText(`pengeluaran-${month}.csv`, toCsv([
      ["Tanggal", "Kategori", "Staf (kasbon)", "Keterangan", "Sumber", "Jumlah", "Dicatat oleh", "Status"],
      ...((full ?? []) as unknown as Row[]).map((r) => [r.date, EXPENSE_CAT[r.category], r.staff?.name ?? "", r.description, EXPENSE_SOURCE[r.source], r.amount,
        r.profiles?.full_name ?? "", r.voided_at ? `Dibatalkan: ${r.void_reason}` : ""]),
    ]));
  }

  const arrow = "flex size-11 items-center justify-center rounded-xl text-lg text-muted hover:bg-paper hover:text-ink disabled:opacity-30";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 basis-full flex-col gap-0.5 sm:basis-0 sm:flex-1">
          <h1 className="font-display text-[28px] font-medium tracking-tight">Pengeluaran</h1>
          <span className="text-[13px] text-muted">{manager ? "Biaya operasional di luar stok, perawatan, dan gaji" : "Pengeluaran hari ini"}</span>
        </div>
        {manager && (
          <div className="flex w-full items-center rounded-2xl border border-line bg-card p-0.5 sm:w-auto">
            <button onClick={() => { setMonth(shiftMonth(month, -1)); setPage(0); }} aria-label="Bulan sebelumnya" className={arrow}>‹</button>
            <b className="min-w-0 flex-1 px-1 text-center sm:min-w-36 sm:flex-none font-display text-base font-semibold">{monthName(month)}</b>
            <button onClick={() => { setMonth(shiftMonth(month, 1)); setPage(0); }} disabled={month >= today.slice(0, 7)} aria-label="Bulan berikutnya" className={arrow}>›</button>
          </div>
        )}
        {manager && <Button onClick={exportCsv} disabled={!all.length} variant="outline" className="h-11 flex-1 sm:flex-none">Ekspor</Button>}
        <Button onClick={() => setAdding(true)} disabled={!online || !data || (!manager && data.todayClosed)} className="h-11 flex-[2] sm:flex-none">+ Catat pengeluaran</Button>
      </div>
      <details className="group rounded-2xl border border-line bg-card px-4 py-2 text-sm">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between font-medium">Aturan pencatatan<span aria-hidden="true" className="text-muted group-open:rotate-180">⌄</span></summary>
        <p className="pb-2 pt-1 leading-relaxed text-muted">
          {manager
            ? "Kasbon staf otomatis menjadi potongan gaji bulan itu. Pengeluaran dari laci mengurangi kas diharapkan di tutup kasir. Semuanya masuk laporan owner sampai laba bersih."
            : `Pilih Dibayar dari sesuai sumber uangnya. Dari laci maksimal ${formatRupiah(data?.lim.petty_cash_limit ?? 0)} dan mengurangi kas diharapkan saat tutup kasir; sumber lain wajib foto nota.`}
          {data && ` Foto nota wajib di atas ${formatRupiah(data.lim.receipt_required_above)}.`}
        </p>
      </details>
      {data && <KasbonPanel staff={data.staff} />}
      {!manager && data?.todayClosed && <p className="rounded-2xl bg-[#FBF2E4] px-4 py-3 text-sm text-[#6B4A10]">Kasir hari ini sudah ditutup. Pengeluaran dari laci tidak bisa ditambah lagi.</p>}

      <div className="grid grid-cols-2 gap-3 tabular min-[700px]:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-0.5 rounded-3xl bg-accent p-4 text-paper min-[700px]:col-span-1">
          <span className="text-[13px] font-medium opacity-70">Total {manager ? "bulan ini" : "hari ini"}</span>
          <b className="font-display text-xl font-semibold leading-tight tracking-tight min-[700px]:text-[28px]">{formatRupiah(total)}</b>
          <span className="text-xs opacity-70">{all.length} pengeluaran</span>
        </div>
        {byCat.slice(0, 3).map(([c, v]) => (
          <div key={c} className="flex flex-col gap-0.5 rounded-3xl border border-line bg-card p-4">
            <span className="text-[13px] font-medium text-muted">{EXPENSE_CAT[c as ExpenseCat]}</span>
            <b className="font-display text-xl font-semibold leading-tight tracking-tight min-[700px]:text-[28px]">{formatRupiah(v)}</b>
            <span className="text-xs text-muted">{total ? Math.round((v * 100) / total) : 0}% dari total</span>
          </div>
        ))}
      </div>

      {manager && data && month === today.slice(0, 7) && (
        <section aria-label="Pengeluaran rutin bulanan" className="flex flex-col gap-1 rounded-3xl border border-line bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-base font-semibold">Rutin bulanan</h2>
            <Button onClick={() => setNewTpl(true)} disabled={!online} variant="outline" className="h-10 px-3 text-xs">+ Tambah rutin</Button>
          </div>
          {!data.tpl.length && <p className="text-sm text-muted">Belum ada. Tambahkan sewa, IPL, listrik, atau internet. Tiap bulan diingatkan di lonceng dan tinggal dicatat.</p>}
          {data.tpl.map((t) => {
            const done = all.find((r) => r.template_id === t.id);
            const late = !done && Number(today.slice(8)) > t.day_of_month;
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-3 text-sm first:mt-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="font-medium">{t.description}</b>
                  <span className="text-[13px] text-muted">{EXPENSE_CAT[t.category]} · {EXPENSE_SOURCE[t.source]} · tiap tgl {t.day_of_month}</span>
                </span>
                <b className="font-semibold tabular">{formatRupiah(t.amount)}</b>
                {done ? <span className="rounded-full bg-[#E3F4EA] px-2.5 py-1 text-xs font-semibold text-[#1D5A3A]">Sudah dicatat</span>
                  : <button onClick={() => setPrefill({ ...t, templateId: t.id })} disabled={!online}
                      className={`h-10 rounded-[10px] px-3 text-xs font-semibold ${late ? "bg-[#FBEEEC] text-[#6E1616]" : "bg-[#FBF2E4] text-[#6B4A10]"}`}>
                      {late ? "Terlambat · Catat" : Number(today.slice(8)) === t.day_of_month ? "Jatuh tempo hari ini · Catat" : `Tgl ${t.day_of_month} · Catat`}</button>}
                <Button onClick={async () => { const { error } = await createClient().from("expense_templates").update({ active: false }).eq("id", t.id); if (error) toast(error.message, "error"); else refresh(); }}
                  disabled={!online} aria-label={`Hapus rutin ${t.description}`} variant="ghost" className="h-10 px-3 text-xs text-muted">Hapus</Button>
              </div>
            );
          })}
        </section>
      )}

      <section aria-label="Daftar pengeluaran" className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="basis-full text-base font-semibold sm:mr-auto sm:basis-auto">Daftar pengeluaran <span className="ml-1 rounded-full bg-paper px-2 py-0.5 text-xs font-normal text-muted tabular">{data?.count ?? 0}</span></h2>
          <Input type="search" aria-label="Cari keterangan" placeholder="Cari keterangan…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 min-w-0 flex-1 sm:w-52 sm:flex-none" />
          <NativeSelect aria-label="Filter kategori" value={cat} onChange={(e) => { setCat(e.target.value as "" | ExpenseCat); setPage(0); }} className="h-11 min-w-0 flex-1 sm:w-44 sm:flex-none">
            <option value="">Semua kategori</option>
            {Object.entries(EXPENSE_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col">
          {!data ? <Empty>Memuat…</Empty> : !data.rows.length ? <Empty>{cat || qs ? "Tidak ada pengeluaran yang cocok." : `Belum ada pengeluaran ${manager ? "di bulan ini" : "hari ini"}.`}</Empty> : data.rows.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-3 text-sm first:border-t-0 ${r.voided_at ? "opacity-60" : ""}`}>
              <span className="flex min-w-0 basis-full flex-col sm:basis-0 sm:flex-1">
                <b className={`font-medium ${r.voided_at ? "line-through" : ""}`}>{r.staff && `Kasbon ${r.staff.name} · `}{r.description}</b>
                <span className="text-[13px] text-muted">
                  {EXPENSE_CAT[r.category]} · {EXPENSE_SOURCE[r.source]} · {manager ? formatTanggal(`${r.date}T12:00:00+07:00`) : formatJam(r.created_at)}
                  {r.profiles?.full_name && ` · ${r.profiles.full_name}`}
                </span>
                {r.voided_at && <span className="text-xs text-[#D94B42]">Dibatalkan: {r.void_reason}</span>}
              </span>
              <div className="flex w-full items-center gap-1 sm:w-auto">
                <b className="mr-auto min-w-24 font-semibold tabular sm:mr-0 sm:text-right">{formatRupiah(r.amount)}</b>
                {r.receipt_path && <button onClick={() => openReceipt(r.receipt_path!)} className="h-10 px-2 text-xs font-medium text-muted underline">Nota</button>}
                {manager && !r.voided_at && <Button onClick={() => setVoiding(r)} disabled={!online} variant="ghost" className="h-10 px-3 text-xs text-muted">Batalkan</Button>}
              </div>
            </div>
          ))}
        </div>
        {!!data?.count && (
          <nav aria-label="Halaman daftar pengeluaran" className="flex flex-col gap-3 border-t border-line pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="order-first tabular text-center text-muted sm:order-2">
              Halaman <b className="text-ink">{page + 1}</b> dari {pages} · {page * size + 1}–{Math.min((page + 1) * size, data.count)} dari {data.count}
            </span>
            <span className="flex items-center gap-2 sm:order-1">
              <Button onClick={() => setPage(page - 1)} disabled={page === 0} variant="outline" className="h-10 flex-1 rounded-[14px] px-3 sm:flex-none">‹ Sebelumnya</Button>
              <Button onClick={() => setPage(page + 1)} disabled={page + 1 >= pages} variant="outline" className="h-10 flex-1 rounded-[14px] px-3 sm:hidden">Berikutnya ›</Button>
            </span>
            <span className="flex items-center justify-center gap-2 sm:order-3">
              <label htmlFor="ex-size" className="text-muted">Per halaman</label>
              <NativeSelect id="ex-size" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="h-10 w-20">
                {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </NativeSelect>
              <Button onClick={() => setPage(page + 1)} disabled={page + 1 >= pages} variant="outline" className="hidden h-10 rounded-[14px] px-3 sm:inline-flex">Berikutnya ›</Button>
            </span>
          </nav>
        )}
      </section>

      <Sheet open={adding || !!prefill} onClose={() => { setAdding(false); setPrefill(null); }} label="Catat pengeluaran" width={480}>
        {data && <AddForm key={prefill?.templateId ?? "new"} manager={manager} lim={data.lim} staff={data.staff} prefill={prefill} onDone={() => { setAdding(false); setPrefill(null); refresh(); }} />}
      </Sheet>
      <Sheet open={newTpl} onClose={() => setNewTpl(false)} label="Tambah pengeluaran rutin" width={440}>
        {newTpl && <TemplateForm onDone={() => { setNewTpl(false); refresh(); }} />}
      </Sheet>
      <Sheet open={!!voiding} onClose={() => setVoiding(null)} label="Batalkan pengeluaran" width={440}>
        {voiding && <VoidForm row={voiding} onDone={() => { setVoiding(null); refresh(); }} />}
      </Sheet>
    </div>
  );
}

function AddForm({ manager, lim, staff, prefill, onDone }: {
  manager: boolean; lim: { petty_cash_limit: number; receipt_required_above: number }; staff: { id: string; name: string }[]; prefill?: Prefill | null; onDone: () => void;
}) {
  const toast = useToast();
  const today = jktDate();
  const [f, setF] = useState({ date: today, category: prefill?.category ?? "perlengkapan" as ExpenseCat, description: prefill?.description ?? "",
    amount: prefill ? String(prefill.amount) : "", source: prefill?.source ?? (manager ? "kas_toko" : "laci") as ExpenseSource, staff: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0;
  const needReceipt = amount > lim.receipt_required_above || (!manager && f.source !== "laci");
  const overLimit = !manager && f.source === "laci" && amount > lim.petty_cash_limit;
  const kasbon = f.category === "kasbon";
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    const supabase = createClient();
    let path: string | null = null;
    if (file) {
      let ready;
      try { ready = await toUploadable(file); } catch (e) { setBusy(false); return toast(e instanceof Error ? e.message : String(e), "error"); }
      path = `expenses/${f.date.slice(0, 7)}/${crypto.randomUUID()}.${ready.ext}`;
      const up = await supabase.storage.from("receipts").upload(path, ready.blob, { contentType: ready.type });
      if (up.error) { setBusy(false); return toast(`Foto nota gagal diunggah: ${up.error.message}`, "error"); }
    }
    const { error } = await supabase.rpc("add_expense", {
      p_date: f.date, p_category: f.category, p_description: f.description, p_amount: amount, p_source: f.source, p_receipt_path: path ?? undefined,
      p_staff_id: kasbon ? f.staff : undefined, p_template_id: prefill?.templateId,
    });
    setBusy(false);
    if (error) return toast(error.message, "error");
    // manajer mencatat pengeluaran laci ke tanggal yang sudah ditutup → kas diharapkan berubah, tutup ulang agar selisih terkoreksi
    const { data: closed } = f.source === "laci" ? await supabase.from("cash_closings").select("id").eq("date", f.date).limit(1) : { data: null };
    toast(closed?.length
      ? `Pengeluaran ${formatRupiah(amount)} tercatat. Kasir ${formatTanggal(`${f.date}T12:00:00+07:00`)} sudah ditutup — tutup ulang di menu Kasir → Tutup kasir (tanggal itu) agar selisihnya terkoreksi.`
      : `Pengeluaran ${formatRupiah(amount)} tercatat`);
    onDone();
  }

  return (
    <form className="flex flex-col gap-3 p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">Catat pengeluaran{prefill && " rutin"}</h2><CloseButton onClick={onDone} /></div>
      {prefill && <p className="text-xs text-muted">Terisi dari pengeluaran rutin — ubah jumlah bila tagihan bulan ini berbeda.</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kategori" htmlFor="ex-cat">
          <NativeSelect id="ex-cat" value={f.category} onChange={set("category")}>
            {Object.entries(EXPENSE_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Jumlah (Rp)" htmlFor="ex-amount" hint={overLimit ? `Melebihi batas kas kecil ${formatRupiah(lim.petty_cash_limit)}` : undefined}>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">Rp</span>
            <Input id="ex-amount" className="pl-10 text-right tabular" inputMode="numeric" required placeholder="0"
              value={f.amount ? Number(f.amount).toLocaleString("id-ID") : ""} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} />
          </div>
        </Field>
      </div>
      {kasbon && (
        <Field label="Staf" htmlFor="ex-staff" hint="Dipotong otomatis dari gaji bulan ini (penyelesaian akhir bulan).">
          <NativeSelect id="ex-staff" required value={f.staff} onChange={set("staff")}>
            <option value="">Pilih staf…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <Field label="Keterangan" htmlFor="ex-desc">
        <Input id="ex-desc" required minLength={2} maxLength={200} placeholder={kasbon ? "mis. Keperluan keluarga" : "mis. Galon air minum 2 buah"} value={f.description} onChange={set("description")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {manager && <Field label="Tanggal" htmlFor="ex-date"><DateInput id="ex-date" required max={today} value={f.date} onChange={set("date")} /></Field>}
        <Field label="Dibayar dari" htmlFor="ex-src">
          <NativeSelect id="ex-src" value={f.source} onChange={set("source")}>
            {Object.entries(EXPENSE_SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label={needReceipt ? "Foto nota (wajib)" : "Foto nota (opsional)"} htmlFor="ex-file" hint={!manager && f.source !== "laci" ? "Wajib untuk pengeluaran non-laci." : `Wajib untuk pengeluaran di atas ${formatRupiah(lim.receipt_required_above)}.`}>
        <Input id="ex-file" type="file" accept={`${IMAGE_ACCEPT},application/pdf`} required={needReceipt} className="py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      {f.source === "laci" && <p className="text-xs text-muted">Diambil dari laci kas — mengurangi kas diharapkan saat tutup kasir {manager ? "tanggal itu" : "hari ini"}.</p>}
      <div className="flex gap-2">
        <Button type="button" onClick={onDone} variant="outline" className="flex-1">Batal</Button>
        <Button disabled={busy || !amount || overLimit || (needReceipt && !file) || (kasbon && !f.staff)} className="flex-1">{busy ? "Menyimpan…" : "Simpan"}</Button>
      </div>
    </form>
  );
}

/** Templat pengeluaran rutin bulanan (manajer). */
function TemplateForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ category: "sewa" as ExpenseCat, description: "", amount: "", source: "transfer" as ExpenseSource, day: "1" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await createClient().from("expense_templates").insert({ category: f.category, description: f.description.trim(), amount: Number(f.amount),
      source: f.source, day_of_month: Number(f.day) });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Pengeluaran rutin ditambahkan"); onDone();
  }
  return (
    <form className="flex flex-col gap-3 p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">Tambah pengeluaran rutin</h2><CloseButton onClick={onDone} /></div>
      <Field label="Kategori" htmlFor="tp-cat">
        <NativeSelect id="tp-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ExpenseCat })}>
          {Object.entries(EXPENSE_CAT).filter(([k]) => k !== "kasbon").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Keterangan" htmlFor="tp-desc"><Input id="tp-desc" required minLength={2} placeholder="mis. IPL Ruko Emerald" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Perkiraan jumlah (Rp)" htmlFor="tp-amount"><Input id="tp-amount" className="text-right tabular" inputMode="numeric" required
          value={f.amount ? Number(f.amount).toLocaleString("id-ID") : ""} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Jatuh tempo tiap tanggal" htmlFor="tp-day"><Input id="tp-day" type="number" min={1} max={28} required value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
      </div>
      <Field label="Dibayar dari" htmlFor="tp-src">
        <NativeSelect id="tp-src" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as ExpenseSource })}>
          {Object.entries(EXPENSE_SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      <div className="flex gap-2"><Button type="button" onClick={onDone} variant="outline" className="flex-1">Batal</Button>
        <Button disabled={busy || !Number(f.amount) || f.description.trim().length < 2} className="flex-1">Simpan</Button></div>
    </form>
  );
}

function VoidForm({ row, onDone }: { row: Row; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="flex flex-col gap-3 p-5" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const { error } = await createClient().rpc("void_expense", { p_id: row.id, p_reason: reason });
      setBusy(false);
      if (error) return toast(error.message, "error");
      toast("Pengeluaran dibatalkan"); onDone();
    }}>
      <h2 className="text-lg font-semibold">Batalkan “{row.description}”?</h2>
      <p className="text-sm text-muted">{formatRupiah(row.amount)} · tetap tersimpan sebagai riwayat & tercatat di audit.</p>
      <Field label="Alasan (wajib)" htmlFor="ex-void"><Input id="ex-void" required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="flex gap-2"><Button type="button" onClick={onDone} variant="outline" className="flex-1">Kembali</Button>
        <Button disabled={!reason.trim() || busy} className="flex-1">Batalkan pengeluaran</Button></div>
    </form>
  );
}
