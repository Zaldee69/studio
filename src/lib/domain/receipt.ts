import { METHOD_LABEL } from "./closing";
import { formatRupiah } from "./format";
import type { PayMethod } from "./cart";

export interface Receipt {
  shop: string;
  when: string;
  customer: string;
  items: { name: string; price: number }[];
  subtotal: number;
  discount: number;
  discountLabel: string;
  depositUsed: number;
  paid: number;
  method: PayMethod;
  cashReceived: number | null;
  balanceAfter: number | null;
}

/** Kembalian tunai; null bila tidak ada uang diterima. */
export const cashChange = (paid: number, received: number | null) => (received == null ? null : Math.max(0, received - paid));

/** Teks struk ringkas untuk wa.me. */
export function receiptText(r: Receipt): string {
  const change = cashChange(r.paid, r.cashReceived);
  return [
    `*${r.shop}*`, r.when, r.customer, "",
    ...r.items.map((i) => `${i.name} — ${formatRupiah(i.price)}`), "",
    `Subtotal: ${formatRupiah(r.subtotal)}`,
    r.discount ? `${r.discountLabel}: −${formatRupiah(r.discount)}` : "",
    r.depositUsed ? `Saldo deposit: −${formatRupiah(r.depositUsed)}` : "",
    `*Dibayar (${METHOD_LABEL[r.method]}): ${formatRupiah(r.paid)}*`,
    change ? `Kembalian: ${formatRupiah(change)}` : "",
    r.balanceAfter != null && (r.depositUsed || r.balanceAfter > 0) ? `Sisa saldo deposit: ${formatRupiah(r.balanceAfter)}` : "",
    "", "Terima kasih! 🙏",
  ].filter((l, i, a) => l !== "" || (a[i - 1] ?? "") !== "").join("\n").trim();
}

export function waLink(whatsapp: string | null | undefined, text: string): string {
  return `https://wa.me/${whatsapp ?? ""}?text=${encodeURIComponent(text)}`;
}
