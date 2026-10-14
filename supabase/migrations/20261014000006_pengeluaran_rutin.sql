-- Pengeluaran rutin bulanan (sewa, IPL, listrik, internet, …): manajer membuat templat sekali; tiap bulan pada tanggal jatuh
-- temponya manajer diingatkan (lonceng) dan cukup menekan "Catat" (form terisi; jumlah bisa diubah, nota tetap diminta bila wajib).
-- Status "sudah dicatat bulan ini" = ada pengeluaran (tidak dibatalkan) dari templat itu di bulan berjalan (expenses.template_id).
create table expense_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category <> 'kasbon'),
  description text not null check (trim(description) <> ''),
  amount bigint not null check (amount > 0),
  source text not null check (source in ('laci', 'kas_toko', 'transfer')),
  day_of_month int not null check (day_of_month between 1 and 28),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table expense_templates enable row level security;
create policy manager_all on expense_templates for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');
alter table expenses add column template_id uuid references expense_templates (id);

-- add_expense: + p_template_id (opsional)
do $$
declare def text; old text;
begin
  select pg_get_functiondef('add_expense'::regproc) into def;
  old := def;
  def := replace(def, $a$p_staff_id uuid DEFAULT NULL::uuid)$a$, $a$p_staff_id uuid DEFAULT NULL::uuid, p_template_id uuid DEFAULT NULL::uuid)$a$);
  def := replace(def, $a$  insert into expenses (date, category, description, amount, source, receipt_path, staff_id, adjustment_id)
  values (d, p_category, trim(p_description), p_amount, p_source, nullif(p_receipt_path, ''), p_staff_id, adj)$a$,
  $a$  if p_template_id is not null and r <> 'manager' then raise exception 'Pengeluaran rutin dicatat manajer'; end if;
  insert into expenses (date, category, description, amount, source, receipt_path, staff_id, adjustment_id, template_id)
  values (d, p_category, trim(p_description), p_amount, p_source, nullif(p_receipt_path, ''), p_staff_id, adj, p_template_id)$a$);
  if def = old or position('template_id)' in def) = 0 then raise exception 'Patch add_expense tidak menemukan teks'; end if;
  drop function add_expense(date, text, text, bigint, text, text, uuid);
  execute def;
end $$;
revoke execute on function add_expense(date, text, text, bigint, text, text, uuid, uuid) from public, anon;

-- Pengingat 08:00 WIB: templat yang jatuh tempo (hari ini atau sudah lewat) dan belum dicatat bulan ini; sekali per templat per hari.
create function recurring_expense_reminders(p_today date default null) returns int
language plpgsql security definer set search_path = public as $$
declare today date := coalesce(p_today, jkt_today()); n int;
begin
  insert into notifications (target_role, kind, payload)
  select 'manager', 'expense_due', jsonb_build_object('template_id', t.id, 'name', t.description, 'amount', t.amount,
         'day', t.day_of_month, 'date', today)
  from expense_templates t
  where t.active and extract(day from today) >= t.day_of_month
    and not exists (select 1 from expenses e where e.template_id = t.id and e.voided_at is null
                      and e.date >= date_trunc('month', today)::date and e.date <= today)
    and not exists (select 1 from notifications x where x.kind = 'expense_due'
                      and x.payload ->> 'template_id' = t.id::text and x.payload ->> 'date' = today::text);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function recurring_expense_reminders(date) from public, anon, authenticated;
select cron.schedule('gb-expense-reminder', '0 1 * * *', $$select public.recurring_expense_reminders()$$);  -- 08:00 WIB
