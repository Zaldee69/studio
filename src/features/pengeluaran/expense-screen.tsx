"use client";

import { useState } from "react";
import { CloseButton, Empty, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { downloadText, toCsv } from "@/lib/domain/csv";
import { EXPENSE_CAT, EXPENSE_SOURCE, type ExpenseCat, type ExpenseSource } from "@/lib/domain/expense";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { IMAGE_ACCEPT, toUploadable } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string; date: string; category: ExpenseCat; description: string; amount: number; source: ExpenseSource; receipt_path: string | null;
  created_at: string; voided_at: string | null; void_reason: string | null; profiles: { full_name: string | null } | null;
};
const monthEnd = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);

/** Pengeluaran operasional. Manajer: per bulan, semua sumber, bisa membatalkan. Kasir: hari ini, hanya dari laci (kas kecil). */
export function ExpenseScreen({ role }: { role: "manager" | "cashier" }) {
  const toast = useToast(); const online = useOnline();
  const manager = role === "manager";
  const today = jktDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Row | null>(null);

  const { data, refresh } = useRealtimeTable(["expenses", "cash_closings"], async () => {
    const supabase = createClient();
    let q = supabase.from("expenses")
      .select("id, date, category, description, amount, source, receipt_path, created_at, voided_at, void_reason, profiles!expenses_created_by_fkey(full_name)")
      .order("date", { ascending: false }).order("created_at", { ascending: false });
    q = manager ? q.gte("date", `${month}-01`).lte("date", monthEnd(month)) : q.eq("date", today);
    const [rows, lim, closed] = await Promise.all([
      q, supabase.rpc("expense_limits"), supabase.from("cash_closings").select("id").eq("date", today).limit(1),
    ]);
    if (rows.error) throw rows.error;
    return { rows: rows.data as unknown as Row[], lim: lim.data?.[0] ?? { petty_cash_limit: 0, receipt_required_above: 0 }, todayClosed: !!closed.data?.length };
  }, manager ? month : today);

  const live = (data?.rows ?? []).filter((r) => !r.voided_at);
  const total = live.reduce((a, r) => a + r.amount, 0);
  const byCat = Object.entries(live.reduce<Record<string, number>>((a, r) => ({ ...a, [r.category]: (a[r.category] ?? 0) + r.amount }), {}))
    .sort((a, b) => b[1] - a[1]);

  async function openReceipt(path: string) {
    const { data, error } = await createClient().storage.from("receipts").createSignedUrl(path, 300);
    if (error) return toast(error.message, "error");
    window.open(data.signedUrl, "_blank", "noopener");
  }
  function exportCsv() {
    downloadText(`pengeluaran-${month}.csv`, toCsv([
      ["Tanggal", "Kategori", "Keterangan", "Sumber", "Jumlah", "Dicatat oleh", "Status"],
      ...(data?.rows ?? []).map((r) => [r.date, EXPENSE_CAT[r.category], r.description, EXPENSE_SOURCE[r.source], r.amount,
        r.profiles?.full_name ?? "", r.voided_at ? `Dibatalkan: ${r.void_reason}` : ""]),
    ]));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="flex-1 font-display text-[28px] font-bold tracking-tight">Pengeluaran</h1>
        {manager && <>
          <label htmlFor="ex-month" className="sr-only">Bulan</label>
          <input id="ex-month" type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="input w-auto" />
          <button onClick={exportCsv} disabled={!data?.rows.length} className="btn-ghost h-11">Ekspor</button>
        </>}
        <button onClick={() => setAdding(true)} disabled={!online || !data || (!manager && data.todayClosed)} className="btn-ink h-11">+ Catat pengeluaran</button>
      </div>
      <p className="text-sm text-muted">
        {manager
          ? "Biaya operasional di luar stok, perawatan fasilitas, dan gaji. Pengeluaran dari laci mengurangi kas diharapkan di tutup kasir; semuanya masuk laporan owner sampai laba bersih."
          : `Belanja kecil hari ini yang dibayar dari laci kas (maks. ${formatRupiah(data?.lim.petty_cash_limit ?? 0)}). Mengurangi kas diharapkan saat tutup kasir. Di atas itu, minta manajer yang mencatat.`}
        {data && ` Foto nota wajib di atas ${formatRupiah(data.lim.receipt_required_above)}.`}
      </p>
      {!manager && data?.todayClosed && <p className="rounded-[10px] bg-[#FBF3DE] px-3.5 py-3 text-sm text-[#5A4300]">Kasir hari ini sudah ditutup — pengeluaran dari laci tidak bisa ditambah lagi.</p>}

      <div className="grid grid-cols-2 gap-2.5 tabular min-[700px]:grid-cols-4">
        <div className="flex flex-col gap-0.5 rounded-[14px] bg-ink p-3.5 text-paper"><span className="text-xs text-[#9A9C95]">Total {manager ? "bulan ini" : "hari ini"}</span><b className="text-xl">{formatRupiah(total)}</b></div>
        {byCat.slice(0, 3).map(([c, v]) => (
          <div key={c} className="flex flex-col gap-0.5 rounded-[14px] bg-card p-3.5"><span className="text-xs text-muted">{EXPENSE_CAT[c as ExpenseCat]}</span><b className="text-xl">{formatRupiah(v)}</b></div>
        ))}
      </div>

      <div className="rounded-[14px] border border-line bg-card px-3">
        {!data ? <Empty>Memuat…</Empty> : !data.rows.length ? <Empty>Belum ada pengeluaran {manager ? "di bulan ini" : "hari ini"}.</Empty> : data.rows.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#EEEEEA] py-2.5 text-sm first:border-t-0 ${r.voided_at ? "opacity-60" : ""}`}>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className={r.voided_at ? "line-through" : ""}>{r.description}</b>
              <span className="text-xs text-muted">
                {EXPENSE_CAT[r.category]} · {EXPENSE_SOURCE[r.source]} · {manager ? formatTanggal(`${r.date}T12:00:00+07:00`) : formatJam(r.created_at)}
                {r.profiles?.full_name && ` · ${r.profiles.full_name}`}
              </span>
              {r.voided_at && <span className="text-xs text-[#A12A2A]">Dibatalkan: {r.void_reason}</span>}
            </span>
            {r.receipt_path && <button onClick={() => openReceipt(r.receipt_path!)} className="text-xs font-semibold underline">Nota</button>}
            <b className="tabular">{formatRupiah(r.amount)}</b>
            {manager && !r.voided_at && <button onClick={() => setVoiding(r)} disabled={!online} className="btn-ghost h-9 px-3 text-xs">Batalkan</button>}
          </div>
        ))}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} label="Catat pengeluaran" width={480}>
        {data && <AddForm manager={manager} lim={data.lim} onDone={() => { setAdding(false); refresh(); }} />}
      </Sheet>
      <Sheet open={!!voiding} onClose={() => setVoiding(null)} label="Batalkan pengeluaran" width={440}>
        {voiding && <VoidForm row={voiding} onDone={() => { setVoiding(null); refresh(); }} />}
      </Sheet>
    </div>
  );
}

function AddForm({ manager, lim, onDone }: { manager: boolean; lim: { petty_cash_limit: number; receipt_required_above: number }; onDone: () => void }) {
  const toast = useToast();
  const today = jktDate();
  const [f, setF] = useState({ date: today, category: "perlengkapan" as ExpenseCat, description: "", amount: "", source: (manager ? "kas_toko" : "laci") as ExpenseSource });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0;
  const needReceipt = amount > lim.receipt_required_above;
  const overLimit = !manager && amount > lim.petty_cash_limit;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

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
    });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(`Pengeluaran ${formatRupiah(amount)} tercatat`);
    onDone();
  }

  return (
    <form className="flex flex-col gap-3 p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold">Catat pengeluaran</h2><CloseButton onClick={onDone} /></div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kategori" htmlFor="ex-cat">
          <select id="ex-cat" className="input" value={f.category} onChange={set("category")}>
            {Object.entries(EXPENSE_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Jumlah (Rp)" htmlFor="ex-amount" hint={overLimit ? `Melebihi batas kas kecil ${formatRupiah(lim.petty_cash_limit)}` : undefined}>
          <input id="ex-amount" className="input" inputMode="numeric" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} />
        </Field>
      </div>
      <Field label="Keterangan" htmlFor="ex-desc">
        <input id="ex-desc" className="input" required minLength={2} maxLength={200} placeholder="mis. Galon air minum 2 buah" value={f.description} onChange={set("description")} />
      </Field>
      {manager && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal" htmlFor="ex-date"><input id="ex-date" type="date" className="input" required max={today} value={f.date} onChange={set("date")} /></Field>
          <Field label="Dibayar dari" htmlFor="ex-src">
            <select id="ex-src" className="input" value={f.source} onChange={set("source")}>
              {Object.entries(EXPENSE_SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
      )}
      <Field label={needReceipt ? "Foto nota (wajib)" : "Foto nota (opsional)"} htmlFor="ex-file" hint={`Wajib untuk pengeluaran di atas ${formatRupiah(lim.receipt_required_above)}.`}>
        <input id="ex-file" type="file" accept={`${IMAGE_ACCEPT},application/pdf`} required={needReceipt} className="input py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      {f.source === "laci" && <p className="text-xs text-muted">Diambil dari laci kas — mengurangi kas diharapkan saat tutup kasir {manager ? "tanggal itu" : "hari ini"}.</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="btn-ghost flex-1">Batal</button>
        <button disabled={busy || !amount || overLimit || (needReceipt && !file)} className="btn-ink flex-1">{busy ? "Menyimpan…" : "Simpan"}</button>
      </div>
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
      <h2 className="text-lg font-bold">Batalkan “{row.description}”?</h2>
      <p className="text-sm text-muted">{formatRupiah(row.amount)} · tetap tersimpan sebagai riwayat & tercatat di audit.</p>
      <Field label="Alasan (wajib)" htmlFor="ex-void"><input id="ex-void" className="input" required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="flex gap-2"><button type="button" onClick={onDone} className="btn-ghost flex-1">Kembali</button>
        <button disabled={!reason.trim() || busy} className="btn-ink flex-1">Batalkan pengeluaran</button></div>
    </form>
  );
}
