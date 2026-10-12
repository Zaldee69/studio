import { expect, test } from "@playwright/test";
import { login, sql, uniq } from "./helpers";

// Beranda: pendapatan hari ini per layanan, dikelompokkan per kategori; total = kartu "Omzet hari ini".
test("pendapatan per layanan hari ini: dikelompokkan per kategori, total sama dengan omzet", async ({ page }) => {
  const nm = `Rekap ${uniq()}`;
  sql(`with t as (insert into transactions (subtotal, total, paid_amount, payment_method) values (125000, 125000, 125000, 'cash') returning id)
       insert into transaction_items (transaction_id, name, category, price, net_amount)
       select t.id, x.n, x.c::service_category, x.p, x.p from t, (values ('${nm} cukur', 'barbershop', 75000), ('${nm} cukur', 'barbershop', 50000)) x(n, c, p)`);
  await login(page, "manager");
  await page.goto("/manajer");
  const sec = page.getByRole("region", { name: "Pendapatan per layanan hari ini" });
  await expect(sec).toContainText("Barbershop");
  await expect(sec.getByRole("listitem").filter({ hasText: `${nm} cukur` })).toContainText(/×2\s*Rp125\.000/);
  const omzet = (await page.getByRole("link", { name: /Omzet hari ini/ }).locator("b").innerText()).trim();
  await expect(sec.locator("h2 + b")).toHaveText(omzet);
});
