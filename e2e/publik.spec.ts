import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { admin, newSession, randomWa, uniq } from "./helpers";

// Tahap 3 — wajah publik: landing → booking online → konter/HP kapster, bentrok slot, pelanggan lama, mode tinjau.
// Semua di tanggal H+2/H+3 supaya tidak bergantung jam saat tes jalan.

const jkt = (plusDays: number) => new Date(Date.now() + plusDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const H2 = jkt(2), H3 = jkt(3);

async function ids() {
  const [{ data: svc }, { data: staff }] = await Promise.all([
    admin.from("services").select("id, name").in("name", ["Potong Rambut", "Gel Polish Tangan"]),
    admin.from("staff").select("id, name"),
  ]);
  const s = Object.fromEntries((svc ?? []).map((x) => [x.name, x.id]));
  const st = Object.fromEntries((staff ?? []).map((x) => [x.name, x.id]));
  return { potong: s["Potong Rambut"] as string, gel: s["Gel Polish Tangan"] as string, st: st as Record<string, string> };
}

/** Pengunjung publik: konteks baru dengan IP palsu unik (rate limit per IP tidak saling mengganggu). */
async function visitor(browser: Browser, info: TestInfo) {
  const ctx = await browser.newContext({ ...info.project.use, extraHTTPHeaders: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  return ctx.newPage();
}

async function guest(p: Page, name: string) {
  await p.fill("#g-name", name);
  await p.fill("#g-wa", randomWa());
  await p.getByLabel(/Saya menyetujui/).check();
}
const lanjut = (p: Page) => p.getByRole("button", { name: /^Lanjut/ }).first().click();
const konfirmasi = (p: Page) => p.getByRole("button", { name: /^Konfirmasi/ }).first().click();
const firstTime = (p: Page) => p.locator("button[aria-pressed]:not([aria-label])", { hasText: /^\d\d:\d\d$/ }).first();

async function counterOn(browser: Browser, info: TestInfo, days: number) {
  const k = await newSession(browser, info, "cashier");
  await k.goto("/kasir/jadwal");
  for (let i = 0; i < days; i++) await k.getByRole("button", { name: "Hari berikutnya" }).click();
  return k;
}

async function register(p: Page, name: string, email: string) {
  await p.goto("/akun");
  await p.getByRole("tab", { name: "Daftar" }).click();
  await p.fill("#c-name", name);
  await p.fill("#c-email", email);
  await p.fill("#c-pw1", "rahasia123");
  await p.fill("#c-pw2", "rahasia123");
  await p.getByRole("button", { name: "Daftar & masuk" }).click();
  await expect(p.getByText("Saldo deposit", { exact: true })).toBeVisible();
}

test("1 · landing → Reservasi Bloom → Gel Polish + Potong Rambut bersamaan → tamu → sukses; muncul di konter (Online) & HP Andi", async ({ browser }, info) => {
  const kasir = await counterOn(browser, info, 2);
  const andi = await newSession(browser, info, "andi", { width: 390, height: 844 });
  await andi.goto("/kapster/jadwal");

  const name = `Tamu ${uniq()}`;
  const p = await visitor(browser, info);
  await p.goto("/");
  await p.getByRole("link", { name: "Reservasi Bloom" }).click();
  await p.waitForURL(/kategori=nail/);
  await p.getByRole("button", { name: /Gel Polish Tangan/ }).click();
  await p.getByRole("tab", { name: /Groom/ }).click();
  await p.getByRole("button", { name: /Potong Rambut/ }).first().click();
  await lanjut(p);
  await p.getByRole("button", { name: /^A\s*Andi/ }).click();
  await lanjut(p);
  await p.locator("button[aria-pressed][aria-label]").nth(2).click(); // H+2
  await firstTime(p).click();
  await lanjut(p);
  await guest(p, name);
  await konfirmasi(p);
  await expect(p.getByText("Booking terkonfirmasi")).toBeVisible();
  await expect(p.getByText(/Kode\s*GB-/)).toBeVisible();
  await expect(p.getByRole("button", { name: "Tambahkan ke kalender" })).toBeVisible();

  // konter: tanpa refresh — kartu dengan badge Online + toast
  await expect(kasir.getByText(/Booking online baru/)).toBeVisible();
  const cards = kasir.getByRole("button", { name: new RegExp(`^${name},`) });
  await expect(cards).toHaveCount(2); // nail + barber bersamaan
  await expect(cards.first()).toContainText("Online");
  // HP kapster yang ditunjuk (Andi)
  await expect(andi.getByText(name, { exact: true })).toBeVisible();
});

test("2 · dua pengunjung memilih jam yang sama → yang kedua diberi tahu 'baru saja terisi'", async ({ browser }, info) => {
  const { potong, st } = await ids();
  const url = `/booking?langkah=konfirmasi&layanan=${potong}&staf=barbershop:${st.Dimas}&tgl=${H2}&jam=11:00`;
  const [a, b] = [await visitor(browser, info), await visitor(browser, info)];
  for (const p of [a, b]) { await p.goto(url); await guest(p, `Rebut ${uniq()}`); }
  await konfirmasi(a);
  await expect(a.getByText("Booking terkonfirmasi")).toBeVisible();
  await konfirmasi(b);
  await expect(b.getByText(/baru saja terisi/)).toBeVisible();
  await expect(b).toHaveURL(/langkah=waktu/);
  await expect(b.locator("button[aria-pressed]:not([aria-label])", { hasText: /^11:00$/ })).toHaveCount(0);
});

test("3 · pelanggan lama daftar dgn email tercatat → saldo & riwayat tampil → jadwal ulang → konter ikut berubah", async ({ browser }, info) => {
  const { potong, st } = await ids();
  const name = `Lama ${uniq()}`, email = `lama-${uniq()}@contoh.test`;
  const { data: c } = await admin.from("customers").insert({ name, email, whatsapp: "62" + randomWa().slice(1) }).select("id").single();
  await admin.from("deposit_topups").insert({ customer_id: c!.id, amount_paid: 500_000, amount_credited: 550_000, method: "cash" });
  const { data: tx } = await admin.from("transactions").insert({ customer_id: c!.id, subtotal: 75_000, total: 75_000, paid_amount: 75_000, payment_method: "cash" }).select("id").single();
  await admin.from("transaction_items").insert({ transaction_id: tx!.id, name: "Potong Rambut", category: "barbershop", price: 75_000, net_amount: 75_000 });

  const p = await visitor(browser, info);
  await register(p, name, email);
  await expect(p.getByText("Rp550.000")).toBeVisible();
  await expect(p.getByText("Potong Rambut")).toBeVisible();

  await p.goto(`/booking?langkah=konfirmasi&layanan=${potong}&staf=barbershop:${st.Rizky}&tgl=${H3}&jam=12:00`);
  await konfirmasi(p);
  await expect(p.getByText("Booking terkonfirmasi")).toBeVisible();

  const kasir = await counterOn(browser, info, 3);
  await expect(kasir.getByRole("button", { name: new RegExp(`^${name}, 12.00`) })).toBeVisible();

  await p.goto("/akun");
  await p.getByRole("link", { name: "Jadwal ulang" }).click();
  await p.locator("button[aria-pressed][aria-label]").nth(3).click(); // H+3
  await p.locator("button[aria-pressed]:not([aria-label])", { hasText: /^15:00$/ }).click();
  await lanjut(p);
  await konfirmasi(p);
  await expect(p.getByText("Jadwal diubah")).toBeVisible();

  await p.goto("/akun");
  await expect(p.getByText(/· 15\.00/)).toBeVisible();
  await expect(p.getByText(/· 12\.00/)).toHaveCount(0);
  await expect(kasir.getByRole("button", { name: new RegExp(`^${name}, 15.00`) })).toBeVisible();
  await expect(kasir.getByRole("button", { name: new RegExp(`^${name}, 12.00`) })).toHaveCount(0);
});

test("5 · mode tinjau → booking menunggu → kasir Terima → status pelanggan berubah", async ({ browser }, info) => {
  const { potong, st } = await ids();
  await admin.from("settings").update({ online_booking_mode: "review" }).eq("id", true);
  try {
    const name = `Tinjau ${uniq()}`;
    const p = await visitor(browser, info);
    await register(p, name, `tinjau-${uniq()}@contoh.test`);
    await p.goto(`/booking?langkah=konfirmasi&layanan=${potong}&staf=barbershop:${st.Dimas}&tgl=${H3}&jam=13:00`);
    await konfirmasi(p);
    await expect(p.getByText("Menunggu konfirmasi toko")).toBeVisible();
    await p.goto("/akun");
    await expect(p.getByText(/Menunggu konfirmasi toko/)).toBeVisible();

    const kasir = await counterOn(browser, info, 3);
    const cardEl = kasir.getByRole("button", { name: new RegExp(`^${name},`) });
    await expect(cardEl).toHaveAccessibleName(/Menunggu konfirmasi/);
    await cardEl.click();
    await kasir.getByRole("button", { name: "Terima" }).click();
    await expect(kasir.getByText(/diterima/)).toBeVisible();
    await expect(cardEl).toHaveAccessibleName(/Booked/);

    await p.reload();
    await expect(p.getByText(/Terjadwal/)).toBeVisible();
    const { data: grp } = await admin.from("booking_groups").select("id, customer:customers!inner(name)").eq("customer.name", name).single();
    const { data: msgs } = await admin.from("outbound_messages").select("template").eq("booking_group_id", grp!.id);
    expect(msgs?.map((m) => m.template)).toEqual(expect.arrayContaining(["booking_pending", "booking_confirmed"]));
  } finally {
    await admin.from("settings").update({ online_booking_mode: "auto" }).eq("id", true);
  }
});

test("konkurensi · 20 permintaan paralel ke slot yang sama → tepat 1 sukses; klik ganda (request id sama) → 1 booking", async () => {
  const { potong, st } = await ids();
  const base = { date: H2, time: "17:00", service_ids: [potong], staff_pick: { barbershop: st.Rizky }, together: true };
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    admin.rpc("book_online", { p: { ...base, name: `Paralel ${i}`, whatsapp: randomWa(), client_request_id: crypto.randomUUID() } })));
  const ok = res.filter((r) => r.data?.ok);
  expect(ok).toHaveLength(1);
  expect(res.filter((r) => r.data?.code === "slot_taken")).toHaveLength(19);

  const req = crypto.randomUUID(), wa = randomWa();
  const dup = await Promise.all(Array.from({ length: 5 }, () =>
    admin.rpc("book_online", { p: { ...base, time: "18:00", name: "Klik ganda", whatsapp: wa, client_request_id: req } })));
  expect(dup.every((r) => r.data?.ok)).toBe(true);
  expect(new Set(dup.map((r) => r.data.code)).size).toBe(1);
  const { count } = await admin.from("booking_groups").select("id", { count: "exact", head: true }).eq("client_request_id", req);
  expect(count).toBe(1);
});
