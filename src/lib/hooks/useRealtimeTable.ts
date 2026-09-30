"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Ambil data lewat `fetcher`, lalu ambil ulang setiap ada perubahan di salah satu `tables` (Supabase Realtime)
 * atau saat `depsKey` berubah (mis. tanggal). `setData` untuk update optimistis — event realtime/refresh
 * berikutnya menimpanya dengan angka server.
 * RLS berlaku juga untuk event realtime: tiap peran hanya menerima baris yang boleh ia lihat.
 * ponytail: refetch penuh per event; ganti ke patch per-baris jika daftar jadi besar.
 */
export function useRealtimeTable<T>(tables: string[], fetcher: () => Promise<T>, depsKey = "") {
  const [data, setData] = useState<T | null>(null);
  const fetchRef = useRef(fetcher);
  useEffect(() => { fetchRef.current = fetcher; });
  const key = tables.join(",");

  const refresh = useCallback(() => fetchRef.current().then(setData), []);

  useEffect(() => {
    let alive = true;
    const load = () => fetchRef.current().then((d) => { if (alive) setData(d); });
    const supabase = createClient();
    load();
    const channel = supabase.channel(`rt:${key}:${crypto.randomUUID()}`);
    for (const table of key.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, load);
    }
    // Pasang token login ke koneksi realtime SEBELUM join — kalau tidak, channel join sebagai anon
    // dan RLS menyaring semua event.
    supabase.realtime.setAuth().then(() => { if (alive) channel.subscribe(); });
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [key, depsKey]);

  return { data, refresh, setData };
}
