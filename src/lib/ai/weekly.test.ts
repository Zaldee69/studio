import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { MODEL, ROLES, telegramBody, writeWeeklyMeeting } from "./weekly";

const fake = (res: object) => {
  const create = vi.fn(async () => res);
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
};

describe("rapat mingguan AI", () => {
  it("4 jabatan membaca angka, lalu GM menerima pendapat mereka dan menulis notulen", async () => {
    const { client, create } = fake({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Minggu ini naik." }] });
    expect(await writeWeeklyMeeting(client, { minggu: "3–9 Nov" })).toBe("Minggu ini naik.");
    expect(create).toHaveBeenCalledTimes(ROLES.length * 2 + 1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: MODEL, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"],
      messages: [{ role: "user", content: expect.stringContaining('"minggu":"3–9 Nov"') }],
    }));
    const gm = (create.mock.calls.at(-1) as unknown as [{ messages: { content: string }[] }])[0].messages[0].content;
    expect(gm).toContain("[Keuangan]\nMinggu ini naik.");
    expect(gm).toContain("Putaran 2");
    const r2 = (create.mock.calls[ROLES.length] as unknown as [{ messages: { role: string; content: string }[] }])[0].messages;
    expect(r2.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(r2[2].content).not.toContain("[Keuangan]"); // tidak menanggapi diri sendiri
    expect(r2[2].content).toContain("[SDM]");
  });
  it("penolakan atau jawaban kosong menjadi error (owner dikabari gagal, bukan pesan kosong)", async () => {
    await expect(writeWeeklyMeeting(fake({ stop_reason: "refusal", content: [] }).client, {})).rejects.toThrow("ditolak");
    await expect(writeWeeklyMeeting(fake({ stop_reason: "max_tokens", content: [] }).client, {})).rejects.toThrow("kosong");
  });
  it("pesan Telegram berjudul dan tidak melewati batas 4.096 karakter", () => {
    expect(telegramBody("3–9 Nov", "Isi")).toBe("🤖 Rapat mingguan AI · minggu 3–9 Nov\n\nIsi");
    expect(telegramBody("3–9 Nov", "x".repeat(10_000)).length).toBeLessThanOrEqual(3900);
  });
});
