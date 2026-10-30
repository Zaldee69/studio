import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

// Asisten AI di Analitik: notulen rapat AI mingguan tampil & bisa ganti minggu (tanpa memanggil AI).
// Panggilan AI sungguhan hanya bila AI_LIVE=1 (memakai ANTHROPIC_API_KEY lingkungan lokal, berbayar).
test("analitik: notulen rapat AI mingguan + asisten AI", async ({ page }) => {
  sql(`insert into ai_meetings (week, notes) values ('2026-01-05', 'Rekomendasi GM: uji notulen lama.'), ('2026-01-12', 'Rekomendasi GM: uji notulen baru.')
       on conflict (week) do update set notes = excluded.notes`);
  try {
    await login(page, "manager");
    await page.goto("/manajer/analitik");
    const panel = page.getByRole("region", { name: "Asisten AI" });
    await expect(panel.getByRole("button", { name: "Jelaskan periode ini" })).toBeVisible();
    await panel.getByLabel("Minggu").selectOption("2026-01-12");
    await expect(panel.getByText("Rekomendasi GM: uji notulen baru.")).toBeVisible();
    await panel.getByLabel("Minggu").selectOption("2026-01-05");
    await expect(panel.getByText("Rekomendasi GM: uji notulen lama.")).toBeVisible();
    if (process.env.AI_LIVE === "1") {
      await panel.getByRole("button", { name: "Jelaskan periode ini" }).click();
      await expect(panel.locator("article").first()).toContainText(/Penjelasan periode/, { timeout: 60_000 });
      await expect(panel.locator("article p").first()).not.toBeEmpty();
      console.log("AI:", await panel.locator("article p").first().textContent());
    }
  } finally {
    sql("delete from ai_meetings where week in ('2026-01-05', '2026-01-12')");
  }
});
