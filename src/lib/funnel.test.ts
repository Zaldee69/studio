import { describe, expect, it } from "vitest";
import { landingSource } from "./funnel";

describe("sumber pengunjung web", () => {
  it("tautan bertanda menang atas perujuk; alias dinormalkan", () => {
    expect(landingSource("?src=ig", "https://www.google.com/", "dprasstudio.com")).toBe("instagram");
    expect(landingSource("?utm_source=MAPS", "", "dprasstudio.com")).toBe("google_maps");
    expect(landingSource("?src=wa", "", "dprasstudio.com")).toBe("whatsapp");
    expect(landingSource("?src=brosur-2", "", "dprasstudio.com")).toBe("brosur");
    // tautan bio Instagram yang sebenarnya (IG menambah utm_* & fbclid sendiri)
    expect(landingSource("?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=PAZXh0bgNhZW0CMTEA", "", "dprasstudio.com")).toBe("instagram");
  });
  it("tanpa tanda: dari domain perujuk", () => {
    expect(landingSource("", "https://l.instagram.com/?u=x", "dprasstudio.com")).toBe("instagram");
    expect(landingSource("", "https://www.google.co.id/", "dprasstudio.com")).toBe("google");
    expect(landingSource("", "", "dprasstudio.com")).toBe("langsung");
    expect(landingSource("", "https://dprasstudio.com/booking", "dprasstudio.com")).toBe("langsung");
    expect(landingSource("", "https://contoh.com/", "dprasstudio.com")).toBe("lainnya");
  });
});
