/** Cookie perangkat stasiun (token acak; DB hanya menyimpan hash-nya). */
export const STATION_COOKIE = "gb_station";
/** Sesi stasiun aktif; habis 5 menit tanpa aktivitas → proxy mengeluarkan sesi kapster. */
export const STATION_ACTIVE = "gb_station_active";
export const STATION_IDLE_S = 5 * 60;
