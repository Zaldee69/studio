-- Jam buka 10.00–21.00 setiap hari (keputusan 9 Nov). Hari yang ditandai libur tetap libur.
-- Trigger opening_hours_sync ikut menyamakan settings.open_time/close_time (grid Jadwal konter).
update opening_hours set open_time = '10:00', close_time = '21:00' where weekday between 0 and 6;
