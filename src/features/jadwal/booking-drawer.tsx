"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloseButton, StatusBadge, useOnline } from "@/components/ui";
import { METHOD_LABEL } from "@/lib/domain/closing";
import { formatJam, formatRupiah, formatTanggal } from "@/lib/domain/format";
import { actualMinutes } from "@/lib/domain/staff";
import { STATUS, FLOW, type ApptStatus } from "@/lib/domain/status";
import { createClient } from "@/lib/supabase/client";
import type { DayAppt, Master } from "../counter/types";
import type { PayMethod } from "@/lib/domain/cart";

/** Laci detail booking: status satu langkah, bayar, ubah, batalkan. */
export function BookingDrawer({ appt, master, conflict, offLabel, onClose, onEdit, onStatus, onCancel, onDismissRequest, onReview, onNoShow }: {
  appt: DayAppt; master: Master; conflict: boolean; offLabel: string | null; onClose: () => void; onEdit: () => void;
  onStatus: (s: ApptStatus) => void; onCancel: (reason: string) => Promise<boolean>; onDismissRequest: () => void;
  onReview: (accept: boolean, reason?: string) => void; onNoShow: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const online = useOnline();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [paid, setPaid] = useState<{ id: string; total: number; method: PayMethod } | null>(null);
  const svc = appt.appointment_services.map((s) => master.services.find((x) => x.id === s.service_id)).filter((s) => !!s);
  const staff = master.staff.find((s) => s.id === appt.staff_id);
  const res = master.resources.find((r) => r.id === appt.resource_id);
  const pending = appt.status === "pending_review";
  const closed = appt.status === "paid" || appt.status === "cancelled" || pending;
  const [openedAt] = useState(() => Date.now());
  // Tidak datang: hanya booked|arrived yang jamnya sudah lewat.
  const canNoShow = (appt.status === "booked" || appt.status === "arrived") && Date.parse(appt.start_at) < openedAt;

  useEffect(() => {
    if (appt.status !== "paid") return;
    let alive = true;
    createClient().from("transaction_items").select("transaction:transactions(id, total, payment_method, voided_at)")
      .eq("appointment_id", appt.id).limit(5)
      .then(({ data }) => {
        const tx = (data ?? []).map((r) => r.transaction).find((t) => t && !t.voided_at);
        if (alive && tx) setPaid({ id: tx.id, total: tx.total, method: tx.payment_method });
      });
    return () => { alive = false; };
  }, [appt.id, appt.status]);

  return (
    <div className="flex min-h-full flex-col gap-5 p-6">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col items-start gap-1.5">
          <StatusBadge status={appt.status} />
          <h2 className="font-display text-2xl font-bold">{appt.customer?.name ?? "Walk-in"}</h2>
          {appt.customer?.whatsapp && <span className="text-[13px] text-muted tabular">{appt.customer.whatsapp}</span>}
          {appt.group?.code && <span className="text-xs font-bold text-muted">Kode {appt.group.code}</span>}
        </div>
        <CloseButton onClick={onClose} label="Tutup detail" />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-[13px] tabular">
        {[["Waktu", `${formatJam(appt.start_at)}–${formatJam(appt.end_at)} · ${appt.duration_min} mnt`], ["Tanggal", formatTanggal(appt.start_at)],
          ["Kursi / meja", res?.name ?? "—"], ["Kapster / teknisi", staff?.name ?? "—"]].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5"><dt className="text-muted">{k}</dt><dd className="font-bold">{v}</dd></div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Layanan</span>
        {svc.map((s) => (
          <div key={s.id} className="flex justify-between text-sm tabular"><span>{s.name}</span><span>{formatRupiah(s.price)}</span></div>
        ))}
        <div className="flex justify-between border-t border-dashed border-line pt-2 text-sm font-bold tabular">
          <span>Estimasi</span><span>{formatRupiah(svc.reduce((a, s) => a + s.price, 0))}</span>
        </div>
      </div>

      {(appt.arrived_at || appt.service_started_at) && (
        <p className="rounded-[10px] bg-paper px-3 py-2 text-[13px] tabular">
          <b>Waktu nyata:</b>{" "}
          {[appt.arrived_at && `datang ${formatJam(appt.arrived_at)}`, appt.service_started_at && `mulai ${formatJam(appt.service_started_at)}`,
            appt.service_ended_at && `selesai ${formatJam(appt.service_ended_at)}`].filter(Boolean).join(" · ")}
          {actualMinutes(appt.service_started_at, appt.service_ended_at) != null && ` (${actualMinutes(appt.service_started_at, appt.service_ended_at)} mnt)`}
        </p>
      )}
      {appt.change_request && !closed && (
        <div role="alert" className="flex flex-col gap-2 rounded-[10px] bg-[#FFF1C2] p-3 text-[13px] text-[#5A4300]">
          <span><b>{staff?.name ?? "Kapster"} minta ubah jadwal:</b> “{appt.change_request}”</span>
          <span className="text-xs">Pindahkan lewat <b>Ubah booking</b> — permintaan otomatis selesai.</span>
          <button onClick={onDismissRequest} className="self-start rounded-lg border border-[#EBCB67] bg-white/60 px-3 py-2 text-xs font-bold">Tandai sudah ditangani</button>
        </div>
      )}
      {appt.customer?.notes && (
        <div className="rounded-[10px] bg-[#EEEBFA] p-3 text-[13px] leading-normal text-[#2E2670]"><b>Preferensi pelanggan:</b> {appt.customer.notes}</div>
      )}
      {appt.notes && <div className="rounded-[10px] bg-paper p-3 text-[13px] leading-normal"><b>Catatan:</b> {appt.notes}</div>}
      {appt.source === "online" && <p className="text-xs font-semibold text-muted">Masuk lewat booking online.</p>}
      {offLabel && !closed && (
        <div role="alert" className="rounded-[10px] bg-[#EEEBE4] p-3 text-[13px] font-semibold text-[#4A463F]">{staff?.name} izin/cuti {offLabel} — pindahkan booking ini.</div>
      )}
      {conflict && !closed && (
        <div role="alert" className="rounded-[10px] bg-[#FFDADA] p-3 text-[13px] text-[#6E1616]">Bentrok dengan booking lain di kursi/meja yang sama.</div>
      )}

      {!closed && (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Ubah status</span>
            <div className="grid grid-cols-2 gap-2">
              {FLOW.map((st) => {
                const on = appt.status === st, S = STATUS[st];
                return (
                  <button key={st} aria-pressed={on} disabled={!online} onClick={() => !on && onStatus(st)}
                    className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] border-2 text-[13px] font-bold disabled:opacity-50"
                    style={{ borderColor: on ? S.dot : "#E4E0D6", background: on ? S.bg : "#FFFFFF", color: on ? S.fg : "#1C1B19" }}>
                    <span className="size-2 rounded-full" style={{ background: S.dot }} />{st === "booked" ? "Booked" : S.short}
                  </button>
                );
              })}
            </div>
          </div>
          <Link href={`${master.base}/kasir?booking=${appt.id}`} className="btn-ink h-12 text-[15px]">Proses bayar di Kasir</Link>
          <button onClick={onEdit} className="btn-ghost h-11 rounded-[10px]">Ubah booking</button>
        </>
      )}

      {appt.status === "paid" && (
        <div className="flex flex-col gap-2 rounded-[10px] bg-[#D9F2E1] p-3.5 text-sm font-semibold text-[#144D2A] tabular">
          <span>Lunas{paid && ` · ${formatRupiah(paid.total)} · ${METHOD_LABEL[paid.method]}`}</span>
          {paid && <Link href={`${master.base}/kasir?tab=riwayat&tx=${paid.id}`} className="text-[13px] underline">Lihat transaksi →</Link>}
        </div>
      )}
      {pending && (
        <div className="flex flex-col gap-2 rounded-[10px] border-2 border-dashed border-[#8F897D] p-3.5">
          <b className="text-sm">Booking online menunggu konfirmasi</b>
          <span className="text-xs text-muted">Terima atau tolak — pesan WhatsApp ke pelanggan disiapkan otomatis.</span>
          {rejecting ? (
            <form onSubmit={(e) => { e.preventDefault(); onReview(false, rejectReason.trim()); }} className="flex flex-col gap-2">
              <label htmlFor="rej-reason" className="text-xs font-bold text-muted">Alasan (dikirim ke pelanggan)</label>
              <input id="rej-reason" className="input" autoFocus value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Mis. kapster berhalangan" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setRejecting(false)} className="btn-ghost flex-1 rounded-[10px]">Kembali</button>
                <button disabled={!online} className="btn flex-1 rounded-[10px] bg-[#A12A2A] text-white">Tolak booking</button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setRejecting(true)} disabled={!online} className="btn-ghost h-12 rounded-[10px] text-[#A12A2A]">Tolak</button>
              <button onClick={() => onReview(true)} disabled={!online} className="btn h-12 rounded-[10px] bg-[#1F7A45] text-white">Terima</button>
            </div>
          )}
        </div>
      )}
      {appt.status === "cancelled" && (
        <div className="rounded-[10px] bg-paper p-3.5 text-sm"><b>Dibatalkan</b>{appt.cancel_reason && ` · ${appt.cancel_reason}`}</div>
      )}

      <div className="flex-1" />
      {canNoShow && !cancelling && (
        <button onClick={() => { if (confirm("Tandai pelanggan tidak datang?")) onNoShow(); }} disabled={!online} className="btn-ghost h-11 rounded-[10px]">Tidak datang</button>
      )}
      {!closed && (cancelling ? (
        <form className="flex flex-col gap-2 rounded-[10px] border border-line p-3"
          onSubmit={async (e) => { e.preventDefault(); if (await onCancel(reason)) setCancelling(false); }}>
          <label htmlFor="cancel-reason" className="text-xs font-bold text-muted">Alasan pembatalan</label>
          <input id="cancel-reason" className="input" autoFocus required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mis. pelanggan berhalangan" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setCancelling(false)} className="btn-ghost flex-1 rounded-[10px]">Kembali</button>
            <button disabled={!reason.trim() || !online} className="btn flex-1 rounded-[10px] bg-[#A12A2A] text-white">Batalkan booking</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setCancelling(true)} className="btn-ghost h-11 rounded-[10px] text-[#A12A2A]">Batalkan booking</button>
      ))}
    </div>
  );
}
