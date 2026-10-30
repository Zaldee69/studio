import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { analitikAnswer } from "./analitik";

const fake = () => {
  const create = vi.fn(async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Jawaban." }] }));
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
};
type Call = [{ system: string; messages: { content: string }[] }];

describe("asisten AI Analitik", () => {
  it("jelaskan periode: satu panggilan, data JSON ikut, tanpa pertanyaan", async () => {
    const { client, create } = fake();
    expect(await analitikAnswer(client, { summary: { tx: 12 } }, null)).toBe("Jawaban.");
    const [arg] = create.mock.calls[0] as unknown as Call;
    expect(arg.system).toContain("Jelaskan periode ini");
    expect(arg.messages[0].content).toContain('"tx":12');
    expect(arg.messages[0].content).not.toContain("Pertanyaan manajer");
  });
  it("tanya data: pertanyaan ikut, aturan 'hanya dari JSON', data besar dipangkas", async () => {
    const { client, create } = fake();
    await analitikAnswer(client, { big: "x".repeat(50_000) }, "Kenapa Selasa sepi?");
    const [arg] = create.mock.calls[0] as unknown as Call;
    expect(arg.system).toContain("HANYA dari JSON");
    expect(arg.messages[0].content).toContain("Pertanyaan manajer: Kenapa Selasa sepi?");
    expect(arg.messages[0].content).toContain("(dipangkas)");
    expect(arg.messages[0].content.length).toBeLessThan(41_000);
  });
});
