/** Nama di kartu jadwal/notifikasi: pelanggan terdaftar, atau nama panggilan walk-in (bukan data pelanggan), atau "Walk-in". */
export const apptName = (a: { customer?: { name: string } | null; guest_name?: string | null }) =>
  a.customer?.name ?? (a.guest_name ? `${a.guest_name} (walk-in)` : "Walk-in");

/** Nama di struk: pelanggan terdaftar, nama panggilan walk-in dari booking yang dibayar, atau "Pelanggan umum". */
export const receiptName = (customer: { name: string } | null, guestNames: (string | null | undefined)[]) =>
  customer?.name ?? guestNames.find(Boolean) ?? "Pelanggan umum";
