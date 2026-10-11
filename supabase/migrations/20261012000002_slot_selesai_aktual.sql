-- Booking yang sudah selesai/lunas melepas kursi & staf sejak jam selesai SEBENARNYA (service_ended_at), bukan jam selesai
-- terjadwal. Data prod 11/10: 10 dari 10 "bentrok" adalah walk-in setelah potong rambut selesai lebih cepat dari jadwal 45 menit.
-- Berlaku untuk peringatan bentrok (konter) dan slot booking online (plan_booking).
create function occupied_until(a appointments) returns timestamptz language sql immutable as $$
  select case when a.status in ('completed', 'paid') and a.service_ended_at is not null
              then greatest(a.start_at, least(a.end_at, a.service_ended_at)) else a.end_at end
$$;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['booking_conflicts', $a$a.end_at + b.buf > p_start$a$, $a$occupied_until(a) + b.buf > p_start$a$],
    array['plan_booking', $a$x.start_at - buf < b0 and x.end_at + buf > a0$a$, $a$x.start_at - buf < b0 and occupied_until(x) + buf > a0$a$]
  ];
begin
  for i in 1 .. array_length(patches, 1) loop
    fn := patches[i][1];
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    old := def;
    def := replace(def, patches[i][2], patches[i][3]); -- plan_booking: kedua kemunculan (staf & kursi)
    if def = old then raise exception 'Patch % #% tidak menemukan teks', fn, i; end if;
    execute def;
  end loop;
end $$;
