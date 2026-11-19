"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { RouteTabs, PELANGGAN_TABS } from "@/components/route-tabs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { Empty, useToast } from "@/components/ui";
import { CAT_NAME, CATS } from "@/lib/domain/category";
import { fillNama, firstName } from "@/lib/domain/customer";
import { formatJam, formatTanggal } from "@/lib/domain/format";
import { blastWarnings, cleanSegment, describeSegment, PRESETS, type Segment } from "@/lib/domain/segment";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

type Campaign = { id: string; name: string; message: string; segment: Segment; archived: boolean; updated_at: string };
type Send = { id: string; campaign_id: string; recipient_count: number; created_at: string; created_by_name: string | null;
  sent: number; failed: number; pending: number; skipped: number };
type Draft = { id: string | null; name: string; message: string; segment: Segment };

const MAX = 900;
const footer = (shop: string) => `\n\n— ${shop}`;
const blank = (bookingUrl: string): Draft => ({ id: null, name: "", segment: {},
  message: `Hai {nama}! Sekarang booking bisa online. Dapatkan DISKON 10% dengan booking online sekarang 👇\n${bookingUrl}` });
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? "hari ini" : d === 1 ? "kemarin" : `${d} hari lalu`;
};

const Step = ({ n, title, hint }: { n: number; title: string; hint: string }) => (
  <div className="flex items-start gap-3">
    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{n}</span>
    <div className="flex flex-col"><h3 className="text-base font-semibold leading-7">{title}</h3><span className="text-[13px] text-muted">{hint}</span></div>
  </div>
);

/** CRM: campaign promosi WhatsApp yang bisa dipakai ulang — pilih penerima → tulis pesan → kirim (manajer). */
export function PromosiScreen({ shop, waReady, bookingUrl }: { shop: string; waReady: boolean; bookingUrl: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft>(() => blank(bookingUrl));
  const [count, setCount] = useState<{ n: number; names: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const { data, refresh } = useRealtimeTable(["campaigns", "campaign_sends"], async () => {
    const db = createClient();
    const [c, s, st] = await Promise.all([
      // kiriman otomatis (ajak potong lagi, minta ulasan) diatur di Pengaturan → Pesan otomatis, bukan di sini
      db.from("campaigns").select("id, name, message, segment, archived, updated_at").is("auto_kind", null).order("updated_at", { ascending: false }),
      db.from("campaign_send_stats").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("settings").select("blast_daily_limit").single(),
    ]);
    if (c.error) throw c.error;
    return { campaigns: (c.data ?? []) as unknown as Campaign[], sends: (s.data ?? []) as unknown as Send[], dailyLimit: st.data?.blast_daily_limit ?? 50 };
  }, "promosi");
  const campaigns = (data?.campaigns ?? []).filter((c) => c.archived === showArchived);
  const sendsOf = (id: string | null) => (data?.sends ?? []).filter((s) => s.campaign_id === id);
  const pending = (data?.sends ?? []).some((s) => s.pending > 0);
  // status antrean tidak dikirim realtime → segarkan berkala selama masih ada yang dalam antrean
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [pending, refresh]);

  // jumlah penerima dihitung otomatis setiap segmen berubah
  const segKey = JSON.stringify(cleanSegment(draft.segment));
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const { data: rows, error } = await createClient().rpc("campaign_audience", { p_segment: JSON.parse(segKey) as Json });
      if (alive && !error) setCount({ n: rows?.length ?? 0, names: (rows ?? []).slice(0, 8).map((r) => r.name) });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [segKey]);

  const seg = draft.segment;
  const setSeg = (patch: Partial<Segment>) => setDraft({ ...draft, segment: { ...seg, ...patch } });
  const length = draft.message.length + footer(shop).length;
  const dirty = draft.id ? (() => { const c = data?.campaigns.find((x) => x.id === draft.id);
    return !c || c.name !== draft.name || c.message !== draft.message || JSON.stringify(cleanSegment(c.segment)) !== segKey; })() : true;
  const lastSend = sendsOf(draft.id)[0];
  const sample = count?.names[0] ?? "Rina";
  const first = firstName(sample) || "Kak";

  function open(c: Campaign | null, copy = false) {
    setDraft(c ? { id: copy ? null : c.id, name: copy ? `${c.name} (salinan)` : c.name, message: c.message, segment: c.segment } : blank(bookingUrl));
    setCount(null);
  }
  function insert(text: string) {
    const el = msgRef.current, at = el?.selectionStart ?? draft.message.length;
    setDraft({ ...draft, message: draft.message.slice(0, at) + text + draft.message.slice(el?.selectionEnd ?? at) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + text.length, at + text.length); });
  }
  async function save(): Promise<string | null> {
    if (!draft.name.trim()) { toast("Beri nama campaign dulu.", "error"); return null; }
    if (draft.message.trim().length < 10) { toast("Pesan terlalu pendek.", "error"); return null; }
    if (length > MAX) { toast(`Pesan terlalu panjang (${length}/${MAX}).`, "error"); return null; }
    const row = { name: draft.name.trim(), message: draft.message, segment: cleanSegment(seg) as { [k: string]: Json }, updated_at: new Date().toISOString() };
    const db = createClient();
    const r = draft.id ? await db.from("campaigns").update(row).eq("id", draft.id).select("id").single()
      : await db.from("campaigns").insert(row).select("id").single();
    if (r.error) { toast(r.error.message, "error"); return null; }
    setDraft({ ...draft, id: r.data.id });
    await refresh();
    return r.data.id;
  }
  async function send() {
    if (!count?.n) return toast("Tidak ada penerima untuk segmen ini.", "error");
    if (draft.message.includes("[LINK")) return toast("Ganti tulisan [LINK …] dengan alamat yang sebenarnya.", "error");
    const again = lastSend ? ` Campaign ini terakhir dikirim ${ago(lastSend.created_at)} ke ${lastSend.recipient_count} pelanggan.` : "";
    const warn = blastWarnings(draft.message, count.n, data?.dailyLimit ?? 50).map((w) => ` ⚠️ ${w}`).join("");
    if (!(await confirm({ title: `Kirim ke ${count.n} pelanggan?`,
      description: `${describeSegment(seg)} akan menerima pesan WhatsApp ini. Pesan langsung masuk antrean dan tidak bisa dibatalkan.${again}${warn}`,
      confirmLabel: `Kirim ${count.n} pesan` }))) return;
    setBusy(true);
    const id = dirty ? await save() : draft.id;
    if (!id) return setBusy(false);
    const { data: r, error } = await createClient().rpc("send_campaign", { p_campaign: id });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(`Campaign masuk antrean untuk ${(r as { recipients: number }).recipients} pelanggan · dikirim bertahap: maks 5 pesan per 5 menit, sesuai batas blast per hari (Pengaturan → Pesan otomatis)`);
    refresh();
  }
  async function archive(c: Campaign) {
    const { error } = await createClient().from("campaigns").update({ archived: !c.archived }).eq("id", c.id);
    if (error) return toast(error.message, "error");
    if (draft.id === c.id) open(null);
    refresh();
  }

  const step = "flex flex-col gap-3 rounded-3xl border border-line bg-card p-5";
  const num = (v: string) => (v ? Math.max(0, Math.floor(+v)) || undefined : undefined);
  const chip = (on: boolean) => `h-10 rounded-full border px-4 text-[13px] font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-card text-ink hover:border-[#CBCFD6]"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-[28px] font-medium tracking-tight">Promosi</h1>
        <span className="text-[13px] text-muted">Kirim promo WhatsApp ke pelanggan yang tepat</span>
      </div>
      <RouteTabs tabs={PELANGGAN_TABS} label="Bagian pelanggan" />
      {!waReady && (
        <p role="alert" className="rounded-2xl bg-[#FBF2E4] px-4 py-3 text-sm text-[#6B4A10]">
          WhatsApp (Wablas) belum dikonfigurasi di server, jadi pesan akan tercatat <b>dilewati</b>. Isi WABLAS_TOKEN &amp; WABLAS_SECRET_KEY.
        </p>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.75fr)_1.6fr]">
        {/* DAFTAR CAMPAIGN */}
        <section aria-label="Daftar campaign" className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-5">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-base font-semibold">Campaign</h2>
            <Button onClick={() => open(null)} variant="brand" className="h-10">+ Baru</Button>
          </div>
          <div role="tablist" aria-label="Status campaign" className="flex w-fit gap-1 rounded-xl bg-side p-1">
            {[false, true].map((a) => (
              <button key={String(a)} role="tab" aria-selected={showArchived === a} onClick={() => setShowArchived(a)}
                className="h-9 rounded-lg px-4 text-[13px] font-medium text-muted aria-selected:bg-card aria-selected:font-semibold aria-selected:text-ink aria-selected:shadow-sm">
                {a ? "Arsip" : "Aktif"}
              </button>
            ))}
          </div>
          {!data ? <Empty>Memuat…</Empty> : !campaigns.length ? (
            <Empty>{showArchived ? "Tidak ada campaign di arsip." : "Belum ada campaign. Buat yang pertama di sebelah kanan."}</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {campaigns.map((c) => {
                const last = sendsOf(c.id)[0], on = draft.id === c.id;
                return (
                  <li key={c.id} aria-label={`Campaign ${c.name}`} className={`rounded-2xl border p-1 ${on ? "border-accent bg-paper" : "border-line"}`}>
                    <button onClick={() => open(c)} aria-current={on ? "true" : undefined} className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left hover:bg-paper">
                      <b className="text-sm font-medium">{c.name}</b>
                      <span className="text-[13px] text-muted">{describeSegment(c.segment)}</span>
                      <span className="text-xs text-muted">
                        {last ? `Dikirim ${sendsOf(c.id).length}× · terakhir ${ago(last.created_at)} ke ${last.recipient_count} orang` : "Belum pernah dikirim"}
                      </span>
                    </button>
                    <div className="flex gap-1 px-1 pb-1">
                      <button onClick={() => open(c, true)} className="h-9 rounded-lg px-3 text-xs font-semibold text-muted hover:bg-paper hover:text-ink">Duplikat</button>
                      <button onClick={() => archive(c)} className="h-9 rounded-lg px-3 text-xs font-semibold text-muted hover:bg-paper hover:text-ink">{c.archived ? "Pulihkan" : "Arsipkan"}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-line pt-3 text-xs text-muted">Pesan otomatis (ajak potong lagi, minta ulasan Google) diatur di <Link href="/manajer/pengaturan?tab=pesan" className="underline">Pengaturan → Pesan otomatis</Link>.</p>
        </section>

        {/* EDITOR: 1 penerima → 2 pesan → 3 kirim */}
        <div className="flex flex-col gap-4" aria-label="Editor campaign">
          <section className="flex flex-col gap-1.5 rounded-3xl border border-line bg-card p-5">
            <label htmlFor="promo-name" className="text-base font-semibold">{draft.id ? "Nama campaign" : "Campaign baru"}</label>
            <Input id="promo-name" className="text-base font-medium" maxLength={80} value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="mis. Promo booking online Oktober" />
            <span className="text-[13px] text-muted">Hanya untuk Anda, tidak terlihat pelanggan.</span>
          </section>

          <section aria-label="1. Penerima" className={step}>
            <Step n={1} title="Siapa penerimanya?" hint="Pilih kelompok pelanggan, atau atur filter sendiri." />
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const on = JSON.stringify(cleanSegment(p.segment)) === segKey;
                return <button key={p.label} aria-pressed={on} onClick={() => setDraft({ ...draft, segment: p.segment })} className={chip(on)}>{p.label}</button>;
              })}
            </div>
            <details className="group rounded-2xl bg-paper px-4 py-2.5 text-sm">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between font-medium">Atur filter sendiri<span aria-hidden="true" className="text-muted group-open:rotate-180">⌄</span></summary>
              <div className="mt-2 flex flex-col gap-3 pb-1">
                <label className="flex flex-wrap items-center gap-2">Terakhir datang ≥
                  <Input aria-label="Minggu tidak datang" type="number" min={1} max={104} className="h-9 w-20" value={seg.inactive_weeks ?? ""}
                    onChange={(e) => setSeg({ inactive_weeks: num(e.target.value) })} /> minggu lalu
                </label>
                <div className="flex flex-wrap items-center gap-3">Pernah memakai:
                  {CATS.map((c) => (
                    <label key={c} className="flex items-center gap-1.5">
                      <Checkbox className="size-5" checked={!!seg.categories?.includes(c)}
                        onCheckedChange={(v) => setSeg({ categories: v === true ? [...(seg.categories ?? []), c] : (seg.categories ?? []).filter((x) => x !== c) })} />
                      {CAT_NAME[c]}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">Sudah datang ≥
                  <Input aria-label="Minimal kunjungan" type="number" min={1} className="h-9 w-20" value={seg.min_visits ?? ""} onChange={(e) => setSeg({ min_visits: num(e.target.value) })} />×
                  <span className="ml-2">belanja ≥ Rp</span>
                  <Input aria-label="Minimal total belanja" type="number" min={0} step={50000} className="h-9 w-36" value={seg.min_spend ?? ""} onChange={(e) => setSeg({ min_spend: num(e.target.value) })} />
                </div>
                <label className="flex flex-wrap items-center gap-2">Booking online:
                  <NativeSelect aria-label="Booking online" className="h-9 w-auto" value={seg.online === undefined ? "" : seg.online ? "yes" : "no"}
                    onChange={(e) => setSeg({ online: e.target.value === "" ? undefined : e.target.value === "yes" })}>
                    <option value="">Semua</option><option value="yes">Pernah</option><option value="no">Belum pernah</option>
                  </NativeSelect>
                </label>
              </div>
            </details>
            <div className="flex items-center gap-4 rounded-2xl bg-paper px-4 py-3" aria-live="polite">
              <b className="font-display text-[28px] font-semibold leading-none tracking-tight tabular">{count ? count.n : "…"}</b>
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">pelanggan akan menerima · {describeSegment(seg)}</span>
                <span className="truncate text-[13px] text-muted">{count?.n ? `mis. ${count.names.join(", ")}${count.n > count.names.length ? ", …" : ""}. ` : ""}Pelanggan tanpa WhatsApp tidak ikut.</span>
              </div>
            </div>
          </section>

          <section aria-label="2. Pesan" className={step}>
            <Step n={2} title="Tulis pesan" hint="Pratinjau di sebelah kanan, persis seperti yang diterima pelanggan." />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Textarea ref={msgRef} aria-label="Pesan" rows={9} className="py-2 leading-normal" value={draft.message}
                  onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button type="button" onClick={() => insert("{nama}")} variant="outline" className="h-9 px-3 text-xs">+ Nama pelanggan</Button>
                  <Button type="button" onClick={() => insert(bookingUrl)} variant="outline" className="h-9 px-3 text-xs">+ Link booking</Button>
                  <span className={`ml-auto text-xs tabular ${length > MAX ? "text-danger" : "text-muted"}`}>{length}/{MAX}</span>
                </div>
                <span className="text-xs text-muted">*tebal* dan _miring_ mengikuti format WhatsApp. Salam penutup dan cara berhenti ditambahkan otomatis.</span>
              </div>
              <div className="flex flex-col gap-1.5 rounded-2xl bg-[#E5DDD5] p-3">
                <span className="text-xs font-medium text-[#54656F]">Pratinjau di WhatsApp {first}</span>
                <div aria-label="Pratinjau pesan" className="max-w-[320px] self-start whitespace-pre-wrap rounded-[14px] rounded-tl-none bg-white px-3 py-2 text-[13px] leading-snug shadow-sm">
                  {fillNama(draft.message, sample) + footer(shop)}
                </div>
              </div>
            </div>
          </section>

          <section aria-label="3. Kirim" className={step}>
            <Step n={3} title="Simpan dan kirim" hint="Pesan masuk antrean dan dikirim bertahap, tidak bisa dibatalkan." />
            <div className="flex flex-wrap gap-2">
              <Button onClick={async () => { if (await save()) toast("Campaign disimpan"); }} disabled={busy || !dirty} variant="outline" className="h-11">
                {draft.id ? (dirty ? "Simpan perubahan" : "Tersimpan ✓") : "Simpan sebagai draf"}
              </Button>
              <Button onClick={send} disabled={busy || !count?.n || length > MAX} variant="brand" className="h-11">
                {busy ? "Mengirim…" : `${lastSend ? "Kirim lagi" : "Kirim"} ke ${count?.n ?? "…"} pelanggan`}
              </Button>
            </div>
            {draft.id && (
              <div className="flex flex-col gap-1 border-t border-line pt-3">
                <b className="text-sm font-medium">Riwayat pengiriman</b>
                {!sendsOf(draft.id).length ? <span className="text-sm text-muted">Belum pernah dikirim.</span> : sendsOf(draft.id).map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 text-sm tabular last:border-0">
                    <span className="min-w-40 font-medium">{formatTanggal(s.created_at)} {formatJam(s.created_at)}</span>
                    <span className="text-muted">{s.recipient_count} penerima</span>
                    <span className="rounded-full bg-[#E3F4EA] px-2 py-0.5 text-xs font-semibold text-[#1D5A3A]">{s.sent} terkirim</span>
                    {s.pending > 0 && <span className="rounded-full bg-[#FBF2E4] px-2 py-0.5 text-xs font-semibold text-[#6B4A10]">{s.pending} dalam antrean</span>}
                    {s.failed > 0 && <span className="rounded-full bg-[#FBEEEC] px-2 py-0.5 text-xs font-semibold text-[#6E1616]">{s.failed} gagal</span>}
                    {s.skipped > 0 && <span className="rounded-full bg-side px-2 py-0.5 text-xs font-semibold text-muted">{s.skipped} dilewati</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
