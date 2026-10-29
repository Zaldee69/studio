import { describe, expect, it, vi } from "vitest";
import { localOnly, type Adapters } from "./adapters";
import { processQueue, type Queued, type Store } from "./dispatch";

describe("pengaman Supabase lokal", () => {
  const real = () => ({ email: vi.fn(async () => {}), whatsapp: vi.fn(async () => {}), telegram: vi.fn(async () => {}) });

  it("WA hanya ke nomor tes; pesan lain ditandai skipped tanpa coba ulang; Telegram bertanda LOKAL", async () => {
    const a = real();
    const guarded = localOnly(a as unknown as Adapters, "6280000000001");
    const msgs: Queued[] = [
      { id: "1", channel: "whatsapp", to_address: "6281266540688", template: "promo", booking_group_id: null, attempts: 0, body: "Halo" },
      { id: "2", channel: "whatsapp", to_address: "6280000000001", template: "promo", booking_group_id: null, attempts: 0, body: "Halo" },
      { id: "3", channel: "telegram", to_address: "ops", template: "alert", booking_group_id: null, attempts: 0, body: "Kasir belum ditutup" },
    ];
    const finish = vi.fn(async () => {});
    const store: Store = { claim: async () => msgs, group: async () => null, finish };
    const out = await processQueue(store, guarded);

    expect(out).toMatchObject({ sent: 2, skipped: 1, retry: 0 });
    expect(a.whatsapp).toHaveBeenCalledTimes(1);
    expect(a.whatsapp).toHaveBeenCalledWith("6280000000001", "Halo", undefined);
    expect(finish).toHaveBeenCalledWith("1", expect.objectContaining({ status: "skipped", attempts: 0 }));
    expect(a.telegram).toHaveBeenCalledWith("🧪 LOKAL (bukan prod)\nKasir belum ditutup");
  });

  it("tanpa NOTIFY_TEST_WA tidak ada WA sama sekali", async () => {
    const a = real();
    await expect(localOnly(a as unknown as Adapters).whatsapp!("6282253654721", "x")).rejects.toThrow("bukan NOTIFY_TEST_WA");
    expect(a.whatsapp).not.toHaveBeenCalled();
  });
});
