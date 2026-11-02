-- Audit tumpang tindih TT-18 (1 Nov, keputusan owner #8): staf menerima push & WA untuk kejadian booking yang sama dengan
-- aturan berbeda; push bahkan terkirim untuk booking online "menunggu konfirmasi" yang nanti ditolak, dan untuk walk-in.
-- Sekarang: kabar booking lewat WA (notify_staff_wa). Push hanya untuk yang mendesak: booking terkonfirmasi yang dimulai
-- ≤ 2 jam lagi (baru, dipindah, atau dibatalkan) — WA bisa terlewat di sela memotong.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('notify_staff_push()'::regprocedure) into def;
  old := def;
  def := replace(def, $a$  if kind is null then return null; end if;$a$,
    $a$  if kind is null or new.status = 'pending_review' or new.source = 'walk_in'
     or new.start_at > now() + interval '2 hours' or new.start_at < now() - interval '1 hour' then return null; end if;$a$);
  if def = old then raise exception 'Patch notify_staff_push tidak menemukan teks'; end if;
  execute def;
end $$;
