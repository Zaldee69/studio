"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { CAT_STYLE, CatChip, Empty, useOnline, useToast } from "@/components/ui";
import { STAFF_TITLE, type Cat } from "@/lib/domain/category";
import { bundleHint, calcCart, promoEligible, quickCash, upsellSuggestions, type BaseMethod, type CartLine, type Voucher } from "@/lib/domain/cart";
import { formatJam, formatRupiah, jktDate } from "@/lib/domain/format";
import { cashChange } from "@/lib/domain/receipt";
import { STATUS } from "@/lib/domain/status";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { CustomerCombobox } from "../counter/customer-combobox";
import { TX_SELECT, useDayAppointments } from "../counter/hooks";
import type { Customer, DayAppt, Master, SvcCat, TxRow } from "../counter/types";
import { printerReady, printerSettings } from "@/lib/printer";
import { printReceipt, ReceiptView, toReceipt } from "./receipt-view";
import { TopupModal } from "./topup-modal";
import { apptName } from "@/lib/domain/guest";

// staffLocked: item dari booking yang sudah ada kapsternya — komisi mengikuti booking (dicek juga di server)
const PAIR_COLORS = ["#7A4E9C", "#2F6F8F", "#A0522D", "#3E7B4F", "#9C3D5E"];
type Item = { key: string; serviceId: string; staffId: string; appointmentId: string | null; fromUpsell?: boolean; staffLocked?: boolean };
const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\D/g, "")) || 0);

/** Kasir: tagihan dari booking + katalog (kiri), keranjang (kanan). Angka final dihitung ulang server (checkout). */
export function Pos({ master, initialAppt }: { master: Master; initialAppt: DayAppt | null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const online = useOnline();
  const today = jktDate();
  const svc = useMemo(() => new Map(master.services.map((s) => [s.id, s])), [master.services]);
  // Dibuka dari Jadwal ("Proses bayar di Kasir"): booking langsung di keranjang.
  const [items, setItems] = useState<Item[]>(() => initialAppt
    ? initialAppt.appointment_services.map((s) => ({ key: uid(), serviceId: s.service_id, staffId: initialAppt.staff_id ?? "", appointmentId: initialAppt.id }))
    : []);
  const [customer, setCustomer] = useState<Customer | null>(initialAppt?.customer ?? null);
  const [useDeposit, setUseDeposit] = useState(false);
  const [method, setMethod] = useState<BaseMethod>("cash");
  const [qrisRef, setQrisRef] = useState(""); // No. referensi QRIS / transfer (wajib, dicek unik di server)
  const [received, setReceived] = useState("");
  const [cashPart, setCashPart] = useState(""); // bayar campuran: sebagian tunai
  const [tip, setTip] = useState(""); // tips QRIS (titipan staf, diserahkan tunai dari laci)
  const [tipPick, setTipPick] = useState("");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [lastStaff, setLastStaff] = useState<Partial<Record<SvcCat, string>>>({});
  const [tab, setTab] = useState<SvcCat>("barbershop");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<ReturnType<typeof toReceipt> | null>(null);
  const [topup, setTopup] = useState(false);
  // voucher yang dimasukkan kasir (walk-in / layanan tanpa voucher booking); dicek ulang bila pelanggan berganti (1× per pelanggan)
  const [vInput, setVInput] = useState("");
  const [posV, setPosV] = useState<{ cust: string; v: Voucher; label: string } | null>(null);
  const [vMsg, setVMsg] = useState("");
  const [vBusy, setVBusy] = useState(false);

  const { data: dayAppts } = useDayAppointments(today);
  const unpaid = (dayAppts ?? []).filter((a) => a.status !== "paid" && a.status !== "cancelled" && a.status !== "pending_review");
  const { data: stock } = useRealtimeTable(["stock_moves"], async () => {
    const { data } = await createClient().from("retail_stock").select("service_id, qty");
    return new Map((data ?? []).map((r) => [r.service_id!, Number(r.qty)]));
  });
  const { data: balance, setData: setBalance } = useRealtimeTable(["deposit_topups", "transactions"], async () => {
    if (!customer) return 0;
    const { data } = await createClient().from("customer_stats").select("deposit_balance").eq("customer_id", customer.id).maybeSingle();
    return data?.deposit_balance ?? 0;
  }, customer?.id ?? "");
  const bal = customer ? balance ?? 0 : 0;

  // ---------- keranjang ----------
  const inCart = new Set(items.map((i) => i.appointmentId).filter(Boolean));
  // Pasangan/rombongan: booking satu kode (booking_group) atau pelanggan sama dengan ≥2 tagihan → tanda huruf & warna sama
  const groups = new Map<string, { tag: string; color: string; ids: string[] }>();
  {
    const by = new Map<string, string[]>();
    for (const a of unpaid) {
      const k = a.booking_group_id ?? (a.customer_id ? `c:${a.customer_id}` : null);
      if (k) by.set(k, [...(by.get(k) ?? []), a.id]);
    }
    let n = 0;
    for (const ids of by.values()) if (ids.length > 1) {
      const g = { tag: String.fromCharCode(65 + (n % 26)), color: PAIR_COLORS[n++ % PAIR_COLORS.length], ids };
      ids.forEach((id) => groups.set(id, g));
    }
  }
  const missingPartners = unpaid.filter((a) => !inCart.has(a.id) && groups.get(a.id)?.ids.some((id) => inCart.has(id)));
  function toggleAppt(a: DayAppt) {
    setDone(null);
    if (inCart.has(a.id)) {
      const rest = items.filter((i) => i.appointmentId !== a.id);
      setItems(rest);
      // pelanggan diisi dari booking ini & tak ada booking lain miliknya di keranjang → kosongkan (jangan terbawa ke booking berikutnya)
      const others = (dayAppts ?? []).filter((x) => rest.some((i) => i.appointmentId === x.id));
      if (customer && customer.id === a.customer?.id && !others.some((x) => x.customer?.id === customer.id)) setCustomer(null);
      return;
    }
    setItems((prev) => [...prev, ...a.appointment_services.map((s) => ({ key: uid(), serviceId: s.service_id, staffId: a.staff_id ?? "", appointmentId: a.id, staffLocked: !!a.staff_id }))]);
    if (!customer && a.customer) setCustomer(a.customer);
  }
  async function addService(id: string, fromUpsell = false) {
    const s = svc.get(id);
    if (!s) return;
    if (s.category === "retail" && (stock?.get(id) ?? 1) <= 0 && !(await confirm({ title: `Stok ${s.name} tercatat 0`, description: "Tetap jual? Stok akan tercatat minus sampai opname berikutnya.", confirmLabel: "Tetap jual" }))) return;
    setDone(null);
    const sameCat = items.find((i) => svc.get(i.serviceId)?.category === s.category && i.staffId)?.staffId;
    const staffId = s.category === "retail" ? "" : lastStaff[s.category] ?? sameCat ?? "";
    setItems([...items, { key: uid(), serviceId: id, staffId, appointmentId: null, fromUpsell }]);
  }
  const setStaff = (key: string, staffId: string) => {
    const cat = svc.get(items.find((i) => i.key === key)!.serviceId)!.category;
    setItems(items.map((i) => (i.key === key ? { ...i, staffId } : i)));
    if (cat !== "retail") setLastStaff({ ...lastStaff, [cat]: staffId });
  };

  const kasirV = posV && posV.cust === (customer?.id ?? "") ? posV.v : null;
  const apptOf = (id: string | null) => (id ? (dayAppts ?? []).find((a) => a.id === id) ?? (initialAppt?.id === id ? initialAppt : null) : null);
  const lines: CartLine[] = items.map((i) => {
    const s = svc.get(i.serviceId)!;
    return { serviceId: s.id, name: s.name, category: s.category, price: s.price, staffId: i.staffId || null, appointmentId: i.appointmentId,
      promo: s.category !== "retail" && promoEligible(apptOf(i.appointmentId), master.shop.promo), voucher: apptOf(i.appointmentId)?.group?.voucher ?? kasirV };
  });
  const k = calcCart(lines, { bundlePct: master.shop.bundlePct, promoPct: master.shop.promo.pct, method, useDeposit: useDeposit && bal > 0, depositBalance: bal });
  // <1000px keranjang ada di bawah katalog → bar ringkas melayang selama keranjang belum terlihat
  const cartRef = useRef<HTMLElement>(null);
  const [cartSeen, setCartSeen] = useState(true);
  useEffect(() => {
    const el = cartRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCartSeen(e.isIntersecting), { rootMargin: "0px 0px -120px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const hint = bundleHint(lines.filter((l) => l.category !== "retail"));
  const ups = upsellSuggestions(items.map((i) => i.serviceId), master.services.filter((s) => s.active), dismissed)
    .map((id) => ({ id, s: svc.get(id)!, from: master.services.find((x) => x.upsell_service_id === id && items.some((i) => i.serviceId === x.id))! }))
    .filter((u) => u.s?.active);
  const missingStaff = lines.some((l) => l.category !== "retail" && !l.staffId);
  const cashDue = method === "cash" ? k.paid : 0;
  const recv = num(received);
  const change = cashDue > 0 ? cashChange(cashDue, recv ?? cashDue) : null;
  const shortCash = cashDue > 0 && recv != null && recv < cashDue;
  const nonCash = method !== "cash" && k.paid > 0; // QRIS / transfer: wajib No. referensi, boleh tips
  const refLabel = method === "transfer" ? "transfer" : "QRIS";
  const tipAmt = nonCash ? num(tip) ?? 0 : 0;
  const cashAmt = nonCash ? num(cashPart) ?? 0 : 0;
  const nonCashAmt = k.paid - cashAmt;
  const tipStaffIds = [...new Set(lines.map((l) => l.staffId).filter(Boolean))] as string[];
  const tipStaff = tipStaffIds.includes(tipPick) ? tipPick : tipStaffIds[0] ?? "";

  function reset() {
    setItems([]); setCustomer(null); setUseDeposit(false); setMethod("cash"); setQrisRef(""); setReceived(""); setCashPart(""); setTip(""); setTipPick(""); setDismissed([]); setError("");
    setVInput(""); setPosV(null); setVMsg("");
  }

  async function applyVoucher() {
    setVBusy(true); setVMsg("");
    const { data, error } = await createClient().rpc("voucher_check_kasir", {
      p_code: vInput, p_service_ids: items.map((i) => i.serviceId), p_customer: customer?.id ?? undefined });
    setVBusy(false);
    const r = data as { ok: boolean; message?: string; voucher?: Voucher; label?: string; days?: string | null } | null;
    if (error || !r?.ok || !r.voucher) { setPosV(null); return setVMsg(error?.message ?? r?.message ?? "Voucher tidak bisa dipakai"); }
    setPosV({ cust: customer?.id ?? "", v: r.voucher, label: `${r.label}${r.days ? ` · ${r.days}` : ""}` });
  }

  async function pay() {
    setError("");
    if (!items.length) return;
    if (missingStaff) return setError("Pilih kapster/nail artist untuk setiap layanan (dasar komisi).");
    if (shortCash) return setError("Uang diterima kurang dari tagihan.");
    if (cashAmt >= k.paid && cashAmt > 0) return setError(`Bagian tunai harus kurang dari tagihan — kalau lunas tunai, pilih Tunai.`);
    if (nonCash && qrisRef.replace(/[\s-]/g, "").length < 4) return setError(`Isi No. referensi ${refLabel} dari bukti bayar.`);
    setPaying(true);
    const supabase = createClient();
    const { data: txId, error } = await supabase.rpc("checkout", { p: {
      customer_id: customer?.id ?? null, use_deposit: useDeposit && bal > 0, method: k.paid > 0 ? method : "cash",
      cash_received: cashDue > 0 ? recv ?? cashDue : null, qris_ref: method !== "cash" ? qrisRef : null,
      tip: tipAmt, tip_staff_id: tipAmt > 0 ? tipStaff : null, cash_part: cashAmt, voucher_code: kasirV?.code ?? null,
      items: items.map((i) => ({ service_id: i.serviceId, staff_id: i.staffId || null, appointment_id: i.appointmentId, from_upsell: !!i.fromUpsell })),
    } });
    if (error) { setPaying(false); return setError(error.message); }
    const [{ data: tx }, st] = await Promise.all([
      supabase.from("transactions").select(TX_SELECT).eq("id", txId).single(),
      customer ? supabase.from("customer_stats").select("deposit_balance").eq("customer_id", customer.id).single() : Promise.resolve({ data: null }),
    ]);
    setPaying(false);
    const receipt = toReceipt(tx as unknown as TxRow, master.shop, (id) => master.staff.find((s) => s.id === id)?.name, st.data?.deposit_balance ?? null, master.userName);
    setDone(receipt);
    toast(`Pembayaran ${formatRupiah((tx as unknown as TxRow).total)} tercatat`);
    reset();
    // struk langsung tercetak (+ laci terbuka untuk tunai) bila printer Bluetooth tersambung
    if (printerReady() && printerSettings().autoPrint) {
      printReceipt(receipt, (receipt.method === "cash" && receipt.paid > 0) || !!receipt.cashPart)
        .catch((e) => toast(`Struk belum tercetak: ${e instanceof Error ? e.message : e}. Coba tombol Cetak struk.`, "error"));
    }
  }

  const catalog = master.services.filter((s) => s.active && s.category === tab);

  return (
    <div className="flex flex-col gap-4 min-[1000px]:min-h-0 min-[1000px]:flex-1 min-[1000px]:flex-row xl:gap-6">
      {/* KIRI */}
      <div className="flex min-w-0 flex-col gap-3 min-[1000px]:min-h-0 min-[1000px]:flex-1">
        <section className="flex shrink-0 flex-col gap-2.5 rounded-[14px] border border-line bg-card px-4 py-3.5" aria-label="Tagihan dari booking hari ini">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold">Tagihan dari booking hari ini</h2>
            <span className="hidden text-xs text-muted xl:inline">Pilih satu atau lebih (mis. pasangan datang bareng)</span>
          </div>
          {!unpaid.length ? <span className="text-[13px] text-muted">{dayAppts ? "Semua booking hari ini sudah lunas." : "Memuat…"}</span> : (
            <div className="grid max-h-[160px] grid-cols-2 gap-2 overflow-y-auto xl:max-h-[240px] xl:grid-cols-3">
              {unpaid.map((a) => {
                const on = inCart.has(a.id), S = STATUS[a.status];
                return (
                  <button key={a.id} aria-pressed={on} onClick={() => toggleAppt(a)}
                    className={`flex min-h-16 flex-col gap-1 rounded-[10px] border-2 px-3 py-2.5 text-left ${on ? "border-ink bg-paper" : "border-line bg-card"}`}>
                    <span className="flex w-full items-center gap-1.5 text-[13px] font-bold">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: S.dot }} title={S.label} />
                      <span className="flex-1 truncate">{apptName(a)}</span>
                      {groups.get(a.id) && <span className="shrink-0 rounded px-1.5 text-[11px] font-bold text-white" style={{ background: groups.get(a.id)!.color }}
                        title={`Datang bersama (${groups.get(a.id)!.ids.length} orang)`} aria-label={`Rombongan ${groups.get(a.id)!.tag}, ${groups.get(a.id)!.ids.length} orang`}>👥 {groups.get(a.id)!.tag}</span>}
                      <span className="text-xs font-semibold text-muted tabular">{formatJam(a.start_at)}</span>
                    </span>
                    <span className="w-full truncate text-xs text-[#4A4C46]">
                      {S.short} · {a.appointment_services.map((s) => svc.get(s.service_id)?.name).join(", ")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {!!missingPartners.length && (
            <div role="note" className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[#FBF3DE] px-3 py-2 text-[13px] text-[#5A4300]">
              <span className="flex-1">Datang bersama: <b>{missingPartners.map(apptName).join(", ")}</b> belum masuk tagihan.</span>
              <button onClick={() => missingPartners.forEach((a) => toggleAppt(a))} className="h-9 rounded-lg bg-ink px-3 text-xs font-bold text-white">Tambahkan juga</button>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3.5 rounded-[14px] border border-line bg-card p-4 min-[1000px]:min-h-[260px] min-[1000px]:flex-1" aria-label="Katalog">
          <div role="tablist" aria-label="Kategori layanan" className="flex gap-1.5 overflow-x-auto">
            {(["barbershop", "nail", "massage", "retail"] as const).filter((c) => master.services.some((s) => s.active && s.category === c)).map((c) => (
              <button key={c} role="tab" aria-selected={tab === c} onClick={() => setTab(c)}
                className={`h-11 shrink-0 rounded-full border px-4 text-[13px] font-bold ${tab === c ? "border-ink bg-ink text-white" : "border-[#DCDCD6] bg-card"}`}>
                {CAT_STYLE[c].label}
              </button>
            ))}
          </div>
          <div className="grid min-h-0 grid-cols-2 content-start gap-2.5 overflow-y-auto xl:grid-cols-3">
            {catalog.map((s) => {
              const qty = stock?.get(s.id);
              const out = s.category === "retail" && qty != null && qty <= 0;
              return (
                <button key={s.id} onClick={() => addService(s.id)} aria-label={`Tambah ${s.name}${out ? " (stok habis)" : ""}`}
                  className="flex min-h-[88px] flex-col gap-1.5 rounded-xl border border-line bg-card px-3.5 py-3 text-left hover:bg-paper [@media(pointer:coarse)]:min-h-24">
                  <span className="text-sm font-bold">{s.name}</span>
                  <span className="flex w-full justify-between text-[13px] tabular">
                    <b>{formatRupiah(s.price)}</b>
                    <span className={out ? "font-bold text-[#A12A2A]" : "text-muted"}>
                      {s.category === "retail" ? (out ? "Stok habis" : qty != null ? `Produk · stok ${qty}` : "Produk") : `${s.duration_min} mnt`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* KERANJANG */}
      <section ref={cartRef} aria-label="Keranjang" className="flex shrink-0 scroll-mt-16 flex-col rounded-[14px] border border-line bg-card min-[1000px]:w-[360px] min-[1000px]:overflow-y-auto min-[1000px]:overscroll-contain xl:w-[420px]">
        {done ? (
          <div className="flex-1 overflow-y-auto px-6 py-7">
            <ReceiptView r={done}>
              <button onClick={() => setDone(null)} className="btn-ink h-[52px] rounded-xl text-[15px]">Transaksi baru</button>
            </ReceiptView>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 border-b border-[#EDEDE9] px-5 py-4">
              <label htmlFor="cart-cust" className="text-xs font-bold text-muted">Pelanggan</label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <CustomerCombobox id="cart-cust" value={customer} onChange={(c) => { setCustomer(c); setUseDeposit(false); setVMsg(""); }} emptyLabel="Pelanggan umum (walk-in)" />
                </div>
                <button onClick={() => setTopup(true)} disabled={!customer || !online} className="btn-ghost h-11 rounded-[10px] px-3 disabled:opacity-40">Top-up</button>
              </div>
              {customer && <span className="text-xs text-muted tabular">Saldo deposit: <b className="text-ink">{formatRupiah(bal)}</b></span>}
              {items.length > 0 && (kasirV ? (
                <div className="flex min-h-11 items-center gap-2 rounded-[10px] border border-accent bg-[#ECEEE8] px-3 text-[13px]">
                  <span className="flex-1">Voucher <b>{kasirV.code}</b> ({posV!.label}){!k.discountLabel.startsWith("Voucher") && " — diskon lain lebih besar, voucher tidak dipakai"}</span>
                  <button onClick={() => { setPosV(null); setVInput(""); }} className="h-11 px-2 text-xs font-semibold text-muted">Lepas</button>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <input aria-label="Kode voucher" placeholder="Kode voucher (opsional)" autoComplete="off" maxLength={20} value={vInput}
                      onChange={(e) => { setVInput(e.target.value.toUpperCase()); setVMsg(""); }} className="input h-11 min-w-0 flex-1 uppercase" />
                    <button onClick={applyVoucher} disabled={!vInput.trim() || vBusy || !online} className="btn-ghost h-11 rounded-[10px] px-3 disabled:opacity-40">
                      {vBusy ? "Cek…" : "Pakai"}</button>
                  </div>
                  {vMsg && <span role="alert" className="text-xs text-[#9B2C22]">{vMsg}</span>}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 px-5 py-3">
              {!items.length && <Empty>Keranjang kosong. Pilih booking di atas atau tambahkan layanan/produk dari katalog.</Empty>}
              {items.map((i) => {
                const s = svc.get(i.serviceId)!;
                return (
                  <div key={i.key} className="flex min-h-11 items-center gap-2.5">
                    <span className="max-sm:hidden"><CatChip cat={s.category} /></span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1 py-1">
                      <span className="text-sm font-semibold">{s.name}</span>
                      {s.category === "retail" ? (
                        <select aria-label={`Dijual oleh (${s.name})`} value={i.staffId} onChange={(e) => setStaff(i.key, e.target.value)}
                          className="h-11 max-w-full self-start rounded-lg border border-[#DCDCD6] bg-card px-2 text-base text-[#4A4C46] [@media(pointer:fine)]:h-9 [@media(pointer:fine)]:text-[13px]">
                          <option value="">Dijual oleh — (opsional)</option>
                          {master.staff.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      ) : (
                        <select aria-label={`${STAFF_TITLE[s.category as Cat]} untuk ${s.name}`} value={i.staffId} onChange={(e) => setStaff(i.key, e.target.value)} disabled={i.staffLocked}
                          title={i.staffLocked ? "Sesuai booking. Bila kapster diganti, ubah booking di Jadwal." : undefined}
                          className={`h-11 max-w-full self-start rounded-lg border bg-card px-2 text-base text-[#4A4C46] [@media(pointer:fine)]:h-9 [@media(pointer:fine)]:text-[13px] ${i.staffId ? "border-[#DCDCD6]" : "border-[#D23B3B]"}`}>
                          <option value="">Pilih {STAFF_TITLE[s.category as Cat].toLowerCase()}</option>
                          {master.staff.filter((t) => t.active && t.category === s.category).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      )}
                    </span>
                    <span className="shrink-0 text-sm tabular">{formatRupiah(s.price)}</span>
                    <button onClick={() => setItems(items.filter((x) => x.key !== i.key))} aria-label={`Hapus ${s.name}`}
                      className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-paper">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                );
              })}
              {ups.map((u) => (
                <div key={u.id} className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-[#CFC8B8] bg-paper px-3 py-2.5">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3A4137" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d="M12 3l2.4 5 5.6.8-4 3.9 1 5.5L12 15.6 7 18.2l1-5.5-4-3.9 5.6-.8z" /></svg>
                  <span className="flex-1 text-[13px] leading-snug">Setelah {u.from?.name}, tawarkan {u.s.name}? <b className="tabular">{formatRupiah(u.s.price)}</b></span>
                  <button onClick={() => addService(u.id, true)} className="h-11 rounded-lg bg-accent px-3 text-xs font-bold text-white">Tambah</button>
                  <button onClick={() => setDismissed([...dismissed, u.id])} className="h-11 px-2 text-xs font-semibold text-muted">Abaikan</button>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-[#EDEDE9] px-5 py-4 text-sm tabular">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatRupiah(k.subtotal)}</span></div>
              {k.discount > 0 && (
                <div className="flex justify-between font-semibold text-accent-ink"><span>{k.discountLabel}</span><span>−{formatRupiah(k.discount)}</span></div>
              )}
              {hint && <div className="text-xs text-muted">Tambah 1 layanan {hint === "nail" ? "nail" : "barbershop"} untuk diskon paket {master.shop.bundlePct}%</div>}
              {customer && (
                <button onClick={() => setUseDeposit(!useDeposit)} aria-pressed={useDeposit && bal > 0} disabled={bal <= 0}
                  className={`flex min-h-11 items-center gap-2.5 rounded-[10px] border px-3 text-left text-[13px] font-semibold disabled:opacity-50 ${useDeposit && bal > 0 ? "border-accent bg-[#ECEEE8]" : "border-line bg-card"}`}>
                  <span className={`relative h-5 w-9 shrink-0 rounded-full ${useDeposit && bal > 0 ? "bg-accent" : "bg-[#DCDCD6]"}`}>
                    <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${useDeposit && bal > 0 ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                  <span className="flex-1">Pakai saldo deposit{bal <= 0 && " (saldo 0)"}</span>
                  <span>−{formatRupiah(k.depositUsed)}</span>
                </button>
              )}
              {k.depositUsed > 0 && <div className="flex justify-between text-[13px] text-muted"><span>Sisa dibayar</span><span>{formatRupiah(k.paid)}</span></div>}

              <div role="radiogroup" aria-label="Metode pembayaran" className="grid grid-cols-3 gap-2">
                {([["cash", "Tunai"], ["qris", "QRIS"], ["transfer", "Transfer"]] as const).map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={method === v} disabled={k.paid === 0 && items.length > 0} onClick={() => setMethod(v)}
                    className={`h-11 rounded-[10px] border-2 text-sm font-bold disabled:opacity-40 ${method === v ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{l}</button>
                ))}
              </div>
              {nonCash && (
                <div className="flex flex-col gap-1 rounded-[10px] bg-paper p-3">
                  <label htmlFor="qris-ref" className="text-[13px] font-bold">No. referensi {refLabel}</label>
                  <input id="qris-ref" autoComplete="off" className="input h-11 uppercase tabular placeholder:normal-case"
                    placeholder={method === "transfer" ? "mis. No. Ref / 4 digit terakhir rekening pengirim" : "mis. 4 digit terakhir No. Ref"}
                    value={qrisRef} onChange={(e) => setQrisRef(e.target.value)} />
                  <span className="text-xs text-muted">{method === "transfer" ? "Cek dana sudah masuk di mutasi rekening toko sebelum dicatat. " : "Dari bukti bayar di HP pelanggan / notifikasi bank. "}Satu nomor hanya untuk satu transaksi.</span>
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-[#E3E3DE] pt-2.5">
                    <div className="flex items-center gap-2">
                      <label htmlFor="cash-part" className="flex-1 text-[13px] font-bold">Sebagian dibayar tunai (opsional)</label>
                      <input id="cash-part" inputMode="numeric" placeholder="0" className="input h-11 w-32 text-right tabular"
                        value={cashPart ? Number(cashPart).toLocaleString("id-ID") : ""} onChange={(e) => setCashPart(e.target.value.replace(/\D/g, ""))} />
                    </div>
                    {cashAmt > 0 && (cashAmt < k.paid
                      ? <span className="text-xs text-muted">Terima {formatRupiah(cashAmt)} tunai ke laci, sisanya <b className="text-ink">{formatRupiah(nonCashAmt)}</b> lewat {refLabel}.</span>
                      : <span className="text-xs text-[#A12A2A]">Bagian tunai harus kurang dari tagihan — kalau lunas tunai, pilih Tunai.</span>)}
                  </div>
                  {tipStaffIds.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5 border-t border-[#E3E3DE] pt-2.5">
                      <div className="flex items-center gap-2">
                        <label htmlFor="tip-in" className="flex-1 text-[13px] font-bold">Tips (opsional)</label>
                        <input id="tip-in" inputMode="numeric" placeholder="0" className="input h-11 w-32 text-right tabular"
                          value={tip ? Number(tip).toLocaleString("id-ID") : ""} onChange={(e) => setTip(e.target.value.replace(/\D/g, ""))} />
                      </div>
                      {tipAmt > 0 && <>
                        <div className="flex items-center gap-2">
                          <label htmlFor="tip-staff" className="flex-1 text-[13px] font-bold">Tips untuk</label>
                          <select id="tip-staff" className="input h-11 w-40" value={tipStaff} onChange={(e) => setTipPick(e.target.value)}>
                            {tipStaffIds.map((id) => <option key={id} value={id}>{master.staff.find((s) => s.id === id)?.name ?? "Staf"}</option>)}
                          </select>
                        </div>
                        <div className="flex justify-between text-[15px] font-bold"><span>{method === "transfer" ? "Total transfer" : "Total scan QRIS"}</span><span>{formatRupiah(nonCashAmt + tipAmt)}</span></div>
                        <span className="text-xs text-muted">Tips bukan omzet. Serahkan {formatRupiah(tipAmt)} tunai dari laci ke staf sekarang — kas diharapkan ikut berkurang.</span>
                      </>}
                    </div>
                  )}
                </div>
              )}
              {cashDue > 0 && (
                <div className="flex flex-col gap-2 rounded-[10px] bg-paper p-3">
                  <div className="flex items-center gap-2">
                    <label htmlFor="cash-in" className="flex-1 text-[13px] font-bold">Uang diterima</label>
                    <input id="cash-in" inputMode="numeric" placeholder={cashDue.toLocaleString("id-ID")} className="input h-11 w-40 text-right tabular"
                      value={received ? Number(received.replace(/\D/g, "")).toLocaleString("id-ID") : ""} onChange={(e) => setReceived(e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {quickCash(cashDue).map((q) => (
                      <button key={q.label} onClick={() => setReceived(String(q.value))} aria-pressed={recv === q.value}
                        className={`h-11 flex-1 rounded-lg border px-2 text-[13px] font-bold ${recv === q.value ? "border-ink bg-ink text-white" : "border-[#DCDCD6] bg-card"}`}>{q.label}</button>
                    ))}
                  </div>
                  <div className={`flex justify-between text-[15px] font-bold ${shortCash ? "text-[#A12A2A]" : ""}`}>
                    <span>{shortCash ? "Kurang" : "Kembalian"}</span>
                    <span>{formatRupiah(shortCash ? cashDue - (recv ?? 0) : change ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-[#EDEDE9] bg-card px-5 pb-4 pt-3 tabular">
              {error && <p role="alert" className="text-[13px] font-semibold text-[#A12A2A]">{error}</p>}
              <div className="flex items-baseline justify-between"><span className="font-bold">Total</span><span className="font-display text-[28px] font-bold">{formatRupiah(k.total)}</span></div>
              <button onClick={pay} disabled={!items.length || paying || !online || shortCash}
                className="btn-ink h-14 rounded-xl text-base">
                {paying ? "Memproses…" : `Catat pembayaran · ${formatRupiah(k.paid)}`}
              </button>
            </div>
          </>
        )}
      </section>

      {!done && items.length > 0 && !cartSeen && (
        <button onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 flex h-14 items-center gap-3 rounded-xl bg-ink px-4 text-left text-white shadow-[0_8px_24px_rgba(28,27,25,0.3)] md:bottom-4 min-[1000px]:hidden">
          <span className="flex-1 text-sm"><b>{items.length} item</b> · {formatRupiah(k.total)}</span>
          <span className="text-sm font-bold">Bayar ↓</span>
        </button>
      )}

      {customer && (
        <TopupModal customer={customer} balance={bal} packs={master.packs} canBonus={master.role === "manager"} open={topup} onClose={() => setTopup(false)}
          onDone={(nb) => { setBalance(nb); setTopup(false); }} />
      )}
    </div>
  );
}
