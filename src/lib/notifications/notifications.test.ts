import { describe, expect, it, vi } from "vitest";
import { processQueue, type Queued, type Store } from "./dispatch";
import { render } from "./templates";

const g = { code: "GB-7K3Q", customerName: "Rina Wati", startAt: "2026-10-03T03:30:00Z", services: ["Potong Rambut", "Gel Polish"], staff: ["Andi", "Sari"],
  shop: { name: "D'Pras Barbershop", address: "Jl. Contoh 1", whatsapp: "6281200000000" } };

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
    expect(r.subject).toBe("Pengingat: besok di D'Pras Barbershop");
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

describe("blast promosi (CRM)", () => {
  it("pesan promo dikirim apa adanya tanpa data booking", async () => {
    const wa = vi.fn(async () => {});
    const { s, finished } = store([{ id: "p", channel: "whatsapp", to_address: "6281300000001", template: "promo", booking_group_id: null, attempts: 0, body: "Hai Dodi, diskon 10%!" }]);
    expect(await processQueue(s, { email: null, whatsapp: wa })).toEqual({ sent: 1, skipped: 0, failed: 0, retry: 0 });
    expect(wa).toHaveBeenCalledWith("6281300000001", "Hai Dodi, diskon 10%!");
    expect(finished.p).toMatchObject({ status: "sent" });
  });
  it("kode masuk (otp) dikirim segera (flag instant)", async () => {
    const wa = vi.fn(async () => {});
    const { s } = store([{ id: "o", channel: "whatsapp", to_address: "6281300000002", template: "otp", booking_group_id: null, attempts: 0, body: "Kode masuk: 123456" }]);
    await processQueue(s, { email: null, whatsapp: wa });
    expect(wa).toHaveBeenCalledWith("6281300000002", "Kode masuk: 123456", { instant: true });
  });
});

describe("adapter WhatsApp (Wablas)", () => {
  it("POST form ke /api/send-message dengan Authorization token.secret; status:false (HTTP 200) dianggap gagal", async () => {
    const { sendWhatsAppAdapter } = await import("./adapters");
    vi.stubEnv("WABLAS_TOKEN", "tok"); vi.stubEnv("WABLAS_SECRET_KEY", "sec"); vi.stubEnv("WABLAS_URL", "https://solo.wablas.com/");
    const calls: [string, RequestInit][] = [];
    let reply = { status: true, message: "pending" };
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => { calls.push([url, init]); return new Response(JSON.stringify(reply)); });
    const send = sendWhatsAppAdapter()!;
    await send("6281234567890", "Kode 123456", { instant: true });
    expect(calls[0][0]).toBe("https://solo.wablas.com/api/send-message");
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe("tok.sec");
    expect(String(calls[0][1].body)).toBe("phone=6281234567890&message=Kode+123456&flag=instant");
    reply = { status: false, message: "token invalid" };
    await expect(send("6281234567890", "x")).rejects.toThrow(/token invalid/);
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
    expect(sendWhatsAppAdapter()).toBeNull(); // tanpa kredensial = nonaktif
  });
});
