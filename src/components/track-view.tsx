"use client";

import { useEffect } from "react";
import { track } from "@/lib/funnel";

export function TrackView({ step }: { step: "landing" }) {
  useEffect(() => { track(step); }, [step]);
  return null;
}
