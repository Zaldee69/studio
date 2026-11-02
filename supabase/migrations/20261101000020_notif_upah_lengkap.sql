-- Audit tumpang tindih TT-20 (1 Nov): notifikasi "Aturan bayaran diubah" hanya untuk komisi khusus & jaring harian; perubahan
-- komisi ritel khusus, potong HPP, gaji pokok, dan bayar bulanan tidak dilaporkan ke owner. Sekarang semua kolom upah staf.
-- Jaring pengaman bulanan (dihapus 1 Nov) tidak lagi ikut notifikasi pengaturan.
create or replace function alert_staff_pay() returns trigger language plpgsql security definer set search_path = public as $$
declare lines text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  select string_agg('• ' || k.label || ': ' || case
           when k.kind = 'rp' then coalesce(fmt_rp((o ->> k.key)::bigint), 'tidak ada') || ' → ' || coalesce(fmt_rp((n ->> k.key)::bigint), 'tidak ada')
           when k.kind = 'pct' then coalesce((o ->> k.key) || '%', 'default') || ' → ' || coalesce((n ->> k.key) || '%', 'default')
           else case when o ->> k.key is null then 'default' when (o ->> k.key)::boolean then 'ya' else 'tidak' end || ' → '
             || case when n ->> k.key is null then 'default' when (n ->> k.key)::boolean then 'ya' else 'tidak' end end,
         E'\n' order by k.ord) into lines
  from (values (1, 'commission_pct_override', 'Komisi khusus', 'pct'), (2, 'retail_pct_override', 'Komisi ritel khusus', 'pct'),
               (3, 'deduct_hpp', 'Komisi dipotong HPP', 'bool'), (4, 'daily_min_pay', 'Jaring harian', 'rp'),
               (5, 'base_salary', 'Gaji pokok', 'rp'), (6, 'pay_monthly', 'Dibayar bulanan', 'bool')) k(ord, key, label, kind)
  where o -> k.key is distinct from n -> k.key;
  if lines is not null then perform safe_alert(format(E'⚙️ Aturan bayaran %s diubah oleh %s:\n%s', new.name, actor_name(), lines)); end if;
  return null;
end $$;
drop trigger staff_pay_alert on staff;
create trigger staff_pay_alert after update on staff for each row
  when ((old.commission_pct_override, old.retail_pct_override, old.deduct_hpp, old.daily_min_pay, old.base_salary, old.pay_monthly)
        is distinct from (new.commission_pct_override, new.retail_pct_override, new.deduct_hpp, new.daily_min_pay, new.base_salary, new.pay_monthly))
  execute function alert_staff_pay();

do $$
declare def text; old text;
begin
  select pg_get_functiondef('alert_settings()'::regprocedure) into def;
  old := def;
  def := replace(def, $a$(5, 'min_monthly_pay', 'Jaring pengaman bulanan'), $a$, '');
  if def = old then raise exception 'Patch alert_settings tidak menemukan teks'; end if;
  execute def;
end $$;
