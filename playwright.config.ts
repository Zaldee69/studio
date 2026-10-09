import { defineConfig, devices } from "@playwright/test";

// E2E konter (Tahap 1). Butuh Supabase lokal jalan (`npx supabase start`). DB di-reset sekali per run
// (set E2E_SKIP_RESET=1 untuk melewati). Server produksi lokal di port 3100.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://127.0.0.1:3100", locale: "id-ID", timezoneId: "Asia/Jakarta", trace: "retain-on-failure" },
  // konter.spec: layar konter (laptop/tablet). kapster.spec: HP kapster + tablet. publik.spec: HP pelanggan. fase2.spec: inventaris & SDM, fase3.spec: analitik & SOP (1366/1024/820). perf.spec: 12 bulan data (390, terakhir).
  projects: [
    { name: "laptop-1366", testMatch: /konter|fase2|fase3|keamanan/, use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
    { name: "tablet-1024", testMatch: /konter|kapster|fase2|fase3/, use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: "portrait-820", testMatch: /konter|kapster|fase2|fase3/, use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "hp-390", testMatch: /kapster|perf|publik/, use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: {
    command: "npm run build && npx next start -p 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: true,
    // konsultasi gaya: OpenAI tiruan (e2e/fake-openai.ts), bukan API sungguhan
    // WhatsApp: Wablas tiruan (e2e/publik-wa.spec.ts) — pesan ke nomor lain cukup gagal/diulang, tidak keluar ke internet
    env: { OPENAI_BASE_URL: "http://127.0.0.1:3199/v1", OPENAI_API_KEY: "e2e-palsu",
      WABLAS_URL: "http://127.0.0.1:3197", WABLAS_TOKEN: "e2e", WABLAS_SECRET_KEY: "palsu" },
    timeout: 240_000,
  },
});
