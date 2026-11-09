"use client";

import { Button } from "@/components/ui/button";
export function PrintButton({ label = "Cetak / PDF" }: { label?: string }) {
  return <Button type="button" onClick={() => window.print()} className="h-11">{label}</Button>;
}
