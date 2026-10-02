import { describe, expect, it, vi } from "vitest";
import { processQueue, type Queued, type Store } from "./dispatch";
import { render } from "./templates";

const g = { code: "GB-7K3Q", customerName: "Rina Wati", startAt: "2026-10-03T03:30:00Z", services: ["Potong Rambut", "Gel Polish"], staff: ["Andi", "Sari"],
  shop: { name: "Groom & Bloom", address: "Jl. Contoh 1", whatsapp: "6281200000000" } };

function store(rows: Queued[]) {
  const finished: Record<string, Parameters<Store["finish"]>[1]> = {};
  const s: Store = { claim: async () => rows, group: async (id) => (id === "g1" ? g : null), finish: async (id, p) => { finished[id] = p; } };
  return { s, finished };
}
const q = (id: string, channel: "email" | "whatsapp", attempts = 0, group = "g1"): Queued =>
  ({ id, channel, to_address: channel === "email" ? "rina@x.id" : "6281234567890", template: "booking_confirmed", booking_group_id: group, attempts });

describe("notifikasi", () => {
  it("template memuat kode, waktu WIB, layanan, staf; HTML di-escape", () => {
    const r = render("reminder_h1", { ...g, customerName: "<Rina>" });
    expect(r.subject).toBe("Pengingat: besok di Groom & Bloom");
    expect(r.text).toContain("Kode booking: GB-7K3Q");
    expect(r.text).toContain("pukul 10.30 WIB");
    expect(r.text).toContain("Kapster/nail artist: Andi, Sari");
    expect(r.html).toContain("&lt;Rina&gt;");
    expect(render("booking_pending", g).text).toContain("sedang dikonfirmasi toko");
  });
  it("kirim, lewati kanal nonaktif, retry lalu gagal", async () => {
    const email = vi.fn(async () => {});
    const { s, finished } = store([q("a", "email"), q("b", "whatsapp"), q("c", "email", 0, "hilang")]);
    expect(await processQueue(s, { email, whatsapp: null })).toEqual({ sent: 1, skipped: 2, failed: 0, retry: 0 });
    expect(email).toHaveBeenCalledWith("rina@x.id", expect.objectContaining({ subject: "Booking GB-7K3Q terkonfirmasi" }));
    expect(finished.b).toMatchObject({ status: "skipped", last_error: "WhatsApp belum dikonfigurasi" });

    const boom = vi.fn(async () => { throw new Error("502 upstream"); });
    const r2 = store([q("d", "whatsapp", 0), q("e", "whatsapp", 2)]);
    expect(await processQueue(r2.s, { email: null, whatsapp: boom }, new Date("2026-10-01T00:00:00Z"))).toEqual({ sent: 0, skipped: 0, failed: 1, retry: 1 });
    expect(r2.finished.d).toMatchObject({ status: "queued", attempts: 1, send_after: "2026-10-01T00:05:00.000Z" });
    expect(r2.finished.e).toMatchObject({ status: "failed", attempts: 3 });
  });
});
