// Keranjang kasir. Cermin checkout() di SQL — ubah keduanya bersamaan.
export type Category = "barbershop" | "nail" | "retail";
export type PayMethod = "cash" | "qris" | "deposit" | "deposit_cash" | "deposit_qris";

export interface CartLine {
  serviceId: string;
  name: string;
  category: Category;
  price: number;
  staffId?: string | null;
  appointmentId?: string | null;
}

export interface CartResult {
  subtotal: number;
  discount: number;
  discountLabel: string;
  shares: number[]; // porsi diskon per baris, urutan sama dengan input
  total: number;
  depositUsed: number;
  paid: number;
  paymentMethod: PayMethod;
}

/** Diskon paket: ≥1 barbershop + ≥1 nail → bundlePct% × subtotal jasa, dibulatkan ke Rp100. */
export function bundleDiscount(lines: CartLine[], bundlePct: number): number {
  const has = (c: Category) => lines.some((l) => l.category === c);
  if (!has("barbershop") || !has("nail")) return 0;
  const base = lines.filter((l) => l.category !== "retail").reduce((a, l) => a + l.price, 0);
  return Math.round((base * bundlePct) / 10000) * 100;
}

/** Porsi proporsional (dibulatkan ke bawah); sisa pembulatan ke item layanan terakhir. */
export function allocateDiscount(lines: CartLine[], discount: number): number[] {
  const base = lines.filter((l) => l.category !== "retail").reduce((a, l) => a + l.price, 0);
  let last = -1;
  lines.forEach((l, i) => { if (l.category !== "retail") last = i; });
  let allocated = 0;
  return lines.map((l, i) => {
    if (discount === 0 || l.category === "retail") return 0;
    const share = i === last ? discount - allocated : Math.floor((discount * l.price) / base);
    allocated += share;
    return share;
  });
}

export function calcCart(
  lines: CartLine[],
  opts: { bundlePct: number; depositBalance?: number; useDeposit?: boolean; method: "cash" | "qris" },
): CartResult {
  const subtotal = lines.reduce((a, l) => a + l.price, 0);
  const discount = bundleDiscount(lines, opts.bundlePct);
  const total = subtotal - discount;
  const depositUsed = opts.useDeposit ? Math.min(Math.max(opts.depositBalance ?? 0, 0), total) : 0;
  const paymentMethod: PayMethod =
    depositUsed > 0 && depositUsed < total ? `deposit_${opts.method}` : depositUsed > 0 ? "deposit" : opts.method;
  return {
    subtotal, discount, total, depositUsed, paymentMethod,
    discountLabel: discount ? `Diskon paket ${opts.bundlePct}%` : "",
    shares: allocateDiscount(lines, discount),
    paid: total - depositUsed,
  };
}

/** Saran upsell: layanan di keranjang yang punya upsell_service_id, belum ada di keranjang & belum diabaikan. */
export function upsellSuggestions(
  cartServiceIds: string[],
  services: { id: string; upsell_service_id: string | null }[],
  dismissed: string[] = [],
): string[] {
  const inCart = new Set(cartServiceIds);
  const out = new Set<string>();
  for (const s of services) {
    const up = s.upsell_service_id;
    if (inCart.has(s.id) && up && !inCart.has(up) && !dismissed.includes(up)) out.add(up);
  }
  return [...out];
}

/** Kategori yang kurang untuk diskon bundle ("Tambah 1 layanan nail…"), atau null. */
export function bundleHint(lines: CartLine[]): "barbershop" | "nail" | null {
  const b = lines.some((l) => l.category === "barbershop"), n = lines.some((l) => l.category === "nail");
  return b === n ? null : b ? "nail" : "barbershop";
}

/** Tombol nominal cepat tunai: uang pas + 3 nominal terdekat di atas tagihan (50rb/100rb/200rb, atau dibulatkan). */
export function quickCash(due: number): { label: string; value: number }[] {
  const up = (step: number) => Math.ceil(due / step) * step;
  const vals = [...new Set([50_000, 100_000, 200_000, up(50_000), up(100_000), up(100_000) + 100_000])]
    .filter((v) => v > due).sort((a, b) => a - b).slice(0, 3);
  return [{ label: "Uang pas", value: due }, ...vals.map((v) => ({ label: `${(v / 1000).toLocaleString("id-ID")}rb`, value: v }))];
}
