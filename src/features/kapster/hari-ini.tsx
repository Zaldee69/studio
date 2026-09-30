"use client";

import { useEffect, useRef, useState } from "react";
import { useOnline, useToast } from "@/components/ui";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { ACTION, commissionOnDay, pickCurrent, revertRemaining, serviceTimer } from "@/lib/domain/staff";
import { STATUS, type ApptStatus } from "@/lib/domain/status";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { useKapster, type MyAppt } from "./provider";

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Layar tetap menyala selama tab Hari ini terbuka (Wake Lock API; diam-diam dilewati bila tak didukung). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const get = async () => { try { if (document.visibilityState === "visible") lock = await navigator.wakeLock?.request("screen"); } catch { /* tidak didukung / ditolak */ } };
    get();
    const onVis = () => { if (document.visibilityState === "visible") get(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, []);
}

export function HariIni() {
  const { me, appts, services, patch, refresh } = useKapster();
  const toast = useToast();
  const online = useOnline();
  const now = useNow(15_000);
  const today = jktDate();
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justDone, setJustDone] = useState<string | null>(null);
  useWakeLock();

  const mine = (appts ?? []).filter((a) => jktDate(new Date(a.start_at)) === today && a.status !== "cancelled");
  const queue = mine.filter((a) => ["booked", "arrived", "in_service"].includes(a.status));
  const selectable = mine.filter((a) => a.id === selId || a.id === justDone || ["booked", "arrived", "in_service"].includes(a.status));
  const cur = pickCurrent(selectable, selId ?? justDone);

  const { data: comm } = useRealtimeTable(["appointments"], async () => {
    const { data } = await createClient().rpc("commission_items", { p_month: today });
    return commissionOnDay((data ?? []).map((i) => ({ created_at: i.created_at, commission: Number(i.commission) })), today);
  });

  async function act(a: MyAppt) {
    const to = ({ booked: "arrived", arrived: "in_service", in_service: "completed" } as Record<string, ApptStatus>)[a.status];
    if (!to) return;
    setBusy(true);
    patch(a.id, { status: to, status_changed_at: new Date().toISOString(), changed_by_me: true }); // optimistis
    const { error } = await createClient().rpc("advance_appointment_status", { p_id: a.id });
    setBusy(false);
    if (error) { toast(error.message, "error"); refresh(); return; }
    if (to === "completed") {
      toast(`${a.customer_name ?? "Walk-in"} selesai — diteruskan ke kasir`);
      setJustDone(a.id); setSelId(null);
      setTimeout(() => setJustDone((d) => (d === a.id ? null : d)), 5000);
    } else toast(to === "arrived" ? "Pelanggan datang" : "Layanan dimulai");
    refresh();
  }
  async function revert(a: MyAppt) {
    const { error } = await createClient().rpc("revert_my_status", { p_id: a.id });
    if (error) return toast(error.message, "error");
    toast("Status terakhir dibatalkan"); setJustDone(null); setSelId(a.id); refresh();
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 tabular">
        {[["Antrean", String(queue.length)], ["Selesai", String(mine.filter((a) => a.status === "completed" || a.status === "paid").length)],
          ["Komisi hari ini", comm == null ? "…" : formatRupiah(comm)]].map(([k, v], i) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-[14px] bg-card p-3.5">
            <span className="text-xs text-muted">{k}</span>
            <b className={`font-display ${i === 2 ? "text-[19px] min-[420px]:text-[22px]" : "text-[26px]"}`}>{v}</b>
          </div>
        ))}
      </div>

      {appts === null ? <div className="rounded-[18px] bg-card p-7 text-center text-[15px] text-muted">Memuat…</div>
        : cur ? <CurrentCard key={cur.id} a={cur} busy={busy || !online} now={now} onAct={() => act(cur)} onRevert={() => revert(cur)} services={services} category={me.category} />
        : <div className="rounded-[18px] bg-card p-7 text-center text-[15px] text-[#4A463F]">Tidak ada antrean lagi hari ini.</div>}

      <section className="flex flex-col rounded-[18px] bg-card px-4 py-2">
        <span className="py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-muted">Semua jadwal saya hari ini</span>
        {!mine.length && <span className="pb-3 text-sm text-muted">Belum ada booking untuk Anda hari ini.</span>}
        {mine.map((a) => {
          const S = STATUS[a.status], on = cur?.id === a.id;
          return (
            <button key={a.id} onClick={() => setSelId(a.id)} aria-pressed={on}
              className={`flex min-h-[60px] items-center gap-3 border-t border-[#F0EDE6] px-1 py-2 text-left tabular ${on ? "bg-paper" : ""}`}>
              <b className="w-[52px] shrink-0 text-[15px]">{formatJam(a.start_at)}</b>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-[15px]">{a.customer_name ?? "Walk-in"}</b>
                <span className="truncate text-[13px] text-muted">{a.service_ids.map((id) => services.get(id)?.name).join(", ")}</span>
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap rounded-[10px] px-2.5 py-[3px] text-xs font-bold" style={{ background: S.bg, color: S.fg }}>
                <span className="size-[7px] rounded-full" style={{ background: S.dot }} />{S.label}
              </span>
            </button>
          );
        })}
      </section>
    </>
  );
}

function CurrentCard({ a, busy, now, onAct, onRevert, services, category }: {
  a: MyAppt; busy: boolean; now: number; onAct: () => void; onRevert: () => void; services: Map<string, { name: string; duration_min: number }>; category: string;
}) {
  const S = STATUS[a.status];
  const action = ACTION[a.status];
  const timer = a.status === "in_service" && a.service_started_at ? serviceTimer(a.service_started_at, a.duration_min, now) : null;
  const canRevert = revertRemaining(a, now) > 0;
  const done = a.status === "completed" || a.status === "paid";

  return (
    <section aria-label="Pelanggan saat ini" className="flex flex-col gap-3.5 rounded-[18px] border-2 bg-card p-[18px]"
      style={{ borderColor: a.status === "in_service" ? "#E06C1A" : "#FFFFFF" }}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex-1 text-xs font-bold uppercase tracking-[0.06em] text-muted">
          {a.status === "in_service" ? "Sedang dilayani" : done ? "Detail layanan" : "Pelanggan berikutnya"}
        </span>
        {a.source === "online" && <span className="rounded bg-ink px-1.5 text-[11px] font-bold text-white">Online</span>}
        <span className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold" style={{ background: S.bg, color: S.fg }}>
          <span className="size-2 rounded-full" style={{ background: S.dot }} />{S.label}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight">{a.customer_name ?? "Walk-in"}</h2>
        <span className="text-[15px] text-[#4A463F] tabular">{formatJam(a.start_at)}–{formatJam(a.end_at)} · {a.resource_name}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {a.service_ids.map((id) => (
          <span key={id} className="flex h-8 items-center rounded-full bg-paper px-3 text-sm font-semibold">{services.get(id)?.name} · {services.get(id)?.duration_min} mnt</span>
        ))}
      </div>
      {timer && (
        <div role="timer" aria-live="off" className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[15px] font-bold tabular ${timer.over ? "bg-[#FFDADA] text-[#6E1616]" : "bg-[#FFE2CC] text-[#6B3000]"}`}>
          <span>⏱ {timer.elapsedMin} / {a.duration_min} menit</span>
          {timer.over && <span>Lewat {timer.overBy} mnt</span>}
        </div>
      )}
      {a.customer_notes && (
        <div className="rounded-xl bg-[#EEEBFA] px-3.5 py-3 text-sm leading-normal text-[#2E2670]"><b>Preferensi pelanggan:</b> {a.customer_notes}</div>
      )}
      {a.notes && <div className="rounded-xl bg-paper px-3.5 py-3 text-sm leading-normal"><b>Catatan booking:</b> {a.notes}</div>}
      {a.customer_id && <History customerId={a.customer_id} />}
      {a.customer_id && <PrefEditor customerId={a.customer_id} initial={a.customer_notes ?? ""} category={category} />}

      {action && (
        <button onClick={onAct} disabled={busy} className="h-[60px] rounded-[14px] text-[17px] font-bold text-white disabled:opacity-60" style={{ background: action.bg }}>
          {action.label}
        </button>
      )}
      {done && <span className="text-[15px] font-semibold text-[#4A463F]">{a.status === "paid" ? "Lunas ✓" : "Pembayaran diproses kasir."}</span>}
      {canRevert && (
        <button onClick={onRevert} disabled={busy} className="self-start rounded-lg px-2 py-2 text-[13px] font-semibold text-muted underline">Batalkan status terakhir</button>
      )}
    </section>
  );
}

function History({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<{ start_at: string; services: string; notes: string }[] | null>(null);
  useEffect(() => {
    let alive = true;
    createClient().rpc("staff_customer_history", { p_customer_id: customerId }).then(({ data }) => { if (alive) setRows(data ?? []); });
    return () => { alive = false; };
  }, [customerId]);
  if (!rows?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Kunjungan sebelumnya dengan Anda</span>
      {rows.map((r) => (
        <span key={r.start_at} className="text-sm text-[#4A463F]">
          <b className="tabular">{formatTanggal(r.start_at).replace(/^\w+, /, "").replace(/ \d{4}$/, "")}</b> — {r.services}{r.notes && ` · ${r.notes}`}
        </span>
      ))}
    </div>
  );
}

function PrefEditor({ customerId, initial, category }: { customerId: string; initial: string; category: string }) {
  const [v, setV] = useState(initial);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onChange = (x: string) => {
    setV(x); setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await createClient().rpc("update_customer_notes", { p_customer_id: customerId, p_notes: x });
      setState(error ? "error" : "saved");
    }, 700);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="st-pref" className="text-[13px] font-bold">Perbarui preferensi ({category === "nail" ? "mis. warna gel, bentuk kuku" : "mis. ukuran clipper, model"})</label>
      <textarea id="st-pref" rows={2} value={v} onChange={(e) => onChange(e.target.value)}
        className="resize-y rounded-xl border border-[#D9D4C8] px-3 py-2.5 text-base leading-normal outline-none focus:border-accent" />
      <span className="text-xs text-muted" aria-live="polite">
        {state === "saving" ? "Menyimpan…" : state === "saved" ? "Tersimpan ✓" : state === "error" ? "Gagal menyimpan" : "Tersimpan otomatis"}
      </span>
    </div>
  );
}
