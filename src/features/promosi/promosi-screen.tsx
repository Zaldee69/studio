"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { Empty, useToast } from "@/components/ui";
import { CAT_NAME, CATS } from "@/lib/domain/category";
import { formatJam, formatTanggal } from "@/lib/domain/format";
import { cleanSegment, describeSegment, PRESETS, type Segment } from "@/lib/domain/segment";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

type Campaign = { id: string; name: string; message: string; segment: Segment; archived: boolean; updated_at: string };
type Send = { id: string; campaign_id: string; recipient_count: number; created_at: string; created_by_name: string | null;
  sent: number; failed: number; pending: number; skipped: number };
type Draft = { id: string | null; name: string; message: string; segment: Segment };

const MAX = 900;
const footer = (shop: string) => `\n\n— ${shop}\nTidak ingin menerima info promo? Balas STOP.`;
const blank = (bookingUrl: string): Draft => ({ id: null, name: "", segment: {},
  message: `Hai {nama}! Sekarang booking bisa online. Dapatkan DISKON 10% dengan booking online sekarang 👇\n${bookingUrl}` });
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? "hari ini" : d === 1 ? "kemarin" : `${d} hari lalu`;
};

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
    const [c, s] = await Promise.all([
      db.from("campaigns").select("id, name, message, segment, archived, updated_at").order("updated_at", { ascending: false }),
      db.from("campaign_send_stats").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (c.error) throw c.error;
    return { campaigns: (c.data ?? []) as unknown as Campaign[], sends: (s.data ?? []) as unknown as Send[] };
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
  const first = count?.names[0]?.trim().split(" ")[0] ?? "Rina";

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
    if (!(await confirm({ title: `Kirim ke ${count.n} pelanggan?`,
      description: `${describeSegment(seg)} akan menerima pesan WhatsApp ini. Pesan langsung masuk antrean dan tidak bisa dibatalkan.${again}`,
      confirmLabel: `Kirim ${count.n} pesan` }))) return;
    setBusy(true);
    const id = dirty ? await save() : draft.id;
    if (!id) return setBusy(false);
    const { data: r, error } = await createClient().rpc("send_campaign", { p_campaign: id });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(`Campaign dikirim ke ${(r as { recipients: number }).recipients} pelanggan`);
    refresh();
  }
  async function archive(c: Campaign) {
    const { error } = await createClient().from("campaigns").update({ archived: !c.archived }).eq("id", c.id);
    if (error) return toast(error.message, "error");
    if (draft.id === c.id) open(null);
    refresh();
  }

  const step = "flex flex-col gap-3 rounded-[14px] border border-line bg-card p-4";
  const num = (v: string) => (v ? Math.max(0, Math.floor(+v)) || undefined : undefined);
  const chip = (on: boolean) => `h-10 rounded-full border px-4 text-[13px] font-semibold ${on ? "border-ink bg-ink text-white" : "border-[#D9D4C8] bg-card"}`;

  return (
    <div className="flex flex-col gap-4">
      {!waReady && (
        <p role="alert" className="rounded-[10px] bg-[#FFF1C2] px-3 py-2 text-sm text-[#5A4300]">
          WhatsApp (Wablas) belum dikonfigurasi di server — pesan akan tercatat <b>dilewati</b>. Isi WABLAS_TOKEN &amp; WABLAS_SECRET_KEY.
        </p>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(280px,0.8fr)_1.6fr]">
        {/* DAFTAR CAMPAIGN */}
        <section aria-label="Daftar campaign" className="flex flex-col gap-3 rounded-[14px] border border-line bg-card p-4">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-base font-bold">Campaign</h2>
            <button onClick={() => open(null)} className="btn-primary h-10">+ Campaign baru</button>
          </div>
          <div role="tablist" aria-label="Status campaign" className="flex gap-1.5">
            {[false, true].map((a) => (
              <button key={String(a)} role="tab" aria-selected={showArchived === a} onClick={() => setShowArchived(a)} className={chip(showArchived === a)}>
                {a ? "Arsip" : "Aktif"}
              </button>
            ))}
          </div>
          {!data ? <Empty>Memuat…</Empty> : !campaigns.length ? (
            <Empty>{showArchived ? "Tidak ada campaign di arsip." : "Belum ada campaign. Buat yang pertama di sebelah kanan."}</Empty>
          ) : campaigns.map((c) => {
            const last = sendsOf(c.id)[0], on = draft.id === c.id;
            return (
              <article key={c.id} aria-label={`Campaign ${c.name}`} className={`flex flex-col gap-1.5 rounded-[12px] border-2 p-3 ${on ? "border-ink bg-paper" : "border-line"}`}>
                <button onClick={() => open(c)} className="text-left">
                  <b className="block text-sm">{c.name}</b>
                  <span className="block text-xs text-muted">{describeSegment(c.segment)}</span>
                  <span className="mt-1 block text-xs text-[#4A463F]">
                    {last ? `Terakhir dikirim ${ago(last.created_at)} · ${last.recipient_count} penerima · ${sendsOf(c.id).length}× dikirim` : "Belum pernah dikirim"}
                  </span>
                </button>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => open(c)} className="btn-ghost h-9 px-3 text-xs">{last ? "Kirim lagi / ubah" : "Buka"}</button>
                  <button onClick={() => open(c, true)} className="btn-ghost h-9 px-3 text-xs">Duplikat</button>
                  <button onClick={() => archive(c)} className="btn-ghost h-9 px-3 text-xs text-muted">{c.archived ? "Pulihkan" : "Arsipkan"}</button>
                </div>
              </article>
            );
          })}
        </section>

        {/* EDITOR: 1 penerima → 2 pesan → 3 kirim */}
        <div className="flex flex-col gap-4" aria-label="Editor campaign">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-muted">{draft.id ? "Campaign" : "Campaign baru"} — nama (untuk Anda, tidak terlihat pelanggan)</span>
            <input aria-label="Nama campaign" className="input text-base font-semibold" maxLength={80} value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="mis. Promo booking online Oktober" />
          </label>

          <section aria-label="1. Penerima" className={step}>
            <h3 className="text-sm font-bold"><span className="mr-2 rounded-full bg-ink px-2 py-0.5 text-white">1</span>Siapa penerimanya?</h3>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const on = JSON.stringify(cleanSegment(p.segment)) === segKey;
                return <button key={p.label} aria-pressed={on} onClick={() => setDraft({ ...draft, segment: p.segment })} className={chip(on)}>{p.label}</button>;
              })}
            </div>
            <details className="group rounded-[10px] bg-paper p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Atur filter sendiri</summary>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-wrap items-center gap-2">Terakhir datang ≥
                  <input aria-label="Minggu tidak datang" type="number" min={1} max={104} className="input h-9 w-20" value={seg.inactive_weeks ?? ""}
                    onChange={(e) => setSeg({ inactive_weeks: num(e.target.value) })} /> minggu lalu
                </label>
                <div className="flex flex-wrap items-center gap-3">Pernah memakai:
                  {CATS.map((c) => (
                    <label key={c} className="flex items-center gap-1.5">
                      <input type="checkbox" className="size-5 accent-[#5646C8]" checked={!!seg.categories?.includes(c)}
                        onChange={(e) => setSeg({ categories: e.target.checked ? [...(seg.categories ?? []), c] : (seg.categories ?? []).filter((x) => x !== c) })} />
                      {CAT_NAME[c]}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">Sudah datang ≥
                  <input aria-label="Minimal kunjungan" type="number" min={1} className="input h-9 w-20" value={seg.min_visits ?? ""} onChange={(e) => setSeg({ min_visits: num(e.target.value) })} />×
                  <span className="ml-2">belanja ≥ Rp</span>
                  <input aria-label="Minimal total belanja" type="number" min={0} step={50000} className="input h-9 w-36" value={seg.min_spend ?? ""} onChange={(e) => setSeg({ min_spend: num(e.target.value) })} />
                </div>
                <label className="flex flex-wrap items-center gap-2">Booking online:
                  <select aria-label="Booking online" className="input h-9 w-auto" value={seg.online === undefined ? "" : seg.online ? "yes" : "no"}
                    onChange={(e) => setSeg({ online: e.target.value === "" ? undefined : e.target.value === "yes" })}>
                    <option value="">Semua</option><option value="yes">Pernah</option><option value="no">Belum pernah</option>
                  </select>
                </label>
              </div>
            </details>
            <p className="text-sm" aria-live="polite">
              <b>{describeSegment(seg)}</b> → {count ? <b className="text-accent-ink">{count.n} pelanggan</b> : "menghitung…"}
              {!!count?.n && <span className="block text-xs text-muted">mis. {count.names.join(", ")}{count.n > count.names.length ? ", …" : ""}</span>}
              <span className="block text-xs text-muted">Pelanggan tanpa WhatsApp dan yang pernah membalas STOP tidak ikut dikirimi.</span>
            </p>
          </section>

          <section aria-label="2. Pesan" className={step}>
            <h3 className="text-sm font-bold"><span className="mr-2 rounded-full bg-ink px-2 py-0.5 text-white">2</span>Tulis pesan</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <textarea ref={msgRef} aria-label="Pesan" rows={9} className="input py-2 leading-normal" value={draft.message}
                  onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => insert("{nama}")} className="btn-ghost h-9 px-3 text-xs">+ Nama pelanggan</button>
                  <button type="button" onClick={() => insert(bookingUrl)} className="btn-ghost h-9 px-3 text-xs">+ Link booking</button>
                  <span className={`ml-auto text-xs tabular ${length > MAX ? "text-danger" : "text-muted"}`}>{length}/{MAX}</span>
                </div>
                <span className="text-xs text-muted">*tebal*, _miring_ mengikuti format WhatsApp. Salam penutup & cara berhenti ditambahkan otomatis.</span>
              </div>
              <div className="flex flex-col gap-1.5 rounded-[12px] bg-[#E5DDD5] p-3">
                <span className="text-[11px] font-semibold text-[#54656F]">Pratinjau di WhatsApp {first}</span>
                <div aria-label="Pratinjau pesan" className="max-w-[320px] self-start whitespace-pre-wrap rounded-[10px] rounded-tl-none bg-white px-3 py-2 text-[13px] leading-snug shadow-sm">
                  {draft.message.replaceAll("{nama}", first) + footer(shop)}
                </div>
              </div>
            </div>
          </section>

          <section aria-label="3. Kirim" className={step}>
            <h3 className="text-sm font-bold"><span className="mr-2 rounded-full bg-ink px-2 py-0.5 text-white">3</span>Simpan &amp; kirim</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={async () => { if (await save()) toast("Campaign disimpan"); }} disabled={busy || !dirty} className="btn-ghost">
                {draft.id ? (dirty ? "Simpan perubahan" : "Tersimpan ✓") : "Simpan sebagai draf"}
              </button>
              <button onClick={send} disabled={busy || !count?.n || length > MAX} className="btn-primary">
                {busy ? "Mengirim…" : `${lastSend ? "Kirim lagi" : "Kirim"} ke ${count?.n ?? "…"} pelanggan`}
              </button>
            </div>
            {draft.id && (
              <div className="flex flex-col gap-2 border-t border-[#F0EDE6] pt-3">
                <span className="text-xs font-bold text-muted">Riwayat pengiriman campaign ini</span>
                {!sendsOf(draft.id).length ? <span className="text-sm text-muted">Belum pernah dikirim.</span> : sendsOf(draft.id).map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular">
                    <span className="min-w-40">{formatTanggal(s.created_at)} {formatJam(s.created_at)}</span>
                    <span className="text-muted">{s.recipient_count} penerima</span>
                    <span className="text-[#1F7A45]">{s.sent} terkirim</span>
                    {s.pending > 0 && <span className="text-[#5A4300]">{s.pending} dalam antrean…</span>}
                    {s.failed > 0 && <span className="text-danger">{s.failed} gagal</span>}
                    {s.skipped > 0 && <span className="text-muted">{s.skipped} dilewati</span>}
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
