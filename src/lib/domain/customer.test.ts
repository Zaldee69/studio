import { describe, expect, it } from "vitest";
import { fillNama, followupLink } from "./customer";

describe("sapaan {nama}", () => {
  it("nama depan; 'Kak' bila nama belum diketahui; tidak menjadi 'Kak Kak'", () => {
    expect(fillNama("Halo Kak {nama}, apa kabar?", "Budi Santoso")).toBe("Halo Kak Budi, apa kabar?");
    expect(fillNama("Halo Kak {nama}, apa kabar?", "No Name")).toBe("Halo Kak, apa kabar?");
    expect(fillNama("Hai {nama}!", "No Name")).toBe("Hai Kak!");
    expect(followupLink("628123", "Halo Kak {nama}", "No Name")).toBe("https://wa.me/628123?text=Halo%20Kak");
  });
});
