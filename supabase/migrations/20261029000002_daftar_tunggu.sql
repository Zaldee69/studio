-- Daftar tunggu Nail Art & Lashes (lini "Segera hadir"). Pendaftar = pelanggan (dicari/dibuat dari No. WA) + baris waitlist per minat.
-- Saat lini dibuka: Promosi → segmen "Daftar tunggu …" → blast (antrean, batas harian, sapaan {nama} seperti blast lain).

create table waitlist (
  customer_id uuid not null references customers (id),
  interest text not null check (interest in ('nail', 'lashes')),
  source text check (source ~ '^[a-z_]{1,20}$'),
  created_at timestamptz not null default now(),
  primary key (customer_id, interest)
);
alter table waitlist enable row level security;
create policy manager_all on waitlist for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');

-- Dipanggil server action (service role) — p: {name, whatsapp, interests[], source, ip}. Balikan: daftar minat yang baru ditambahkan.
create function join_waitlist(p jsonb) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  wa text := normalize_wa(p ->> 'whatsapp');
  nm text := left(trim(coalesce(p ->> 'name', '')), 60);
  ip text := coalesce(p ->> 'ip', '');
  src text := case when p ->> 'source' ~ '^[a-z_]{1,20}$' then p ->> 'source' end;
  wants text[] := (select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'interests', '[]')) x where x in ('nail', 'lashes'));
  cid uuid; added text[];
begin
  if length(nm) < 2 then raise exception 'Nama wajib diisi'; end if;
  if wa is null then raise exception 'No. WhatsApp tidak valid'; end if;
  if wants is null then raise exception 'Pilih Nail Art atau Lashes'; end if;
  -- rate limit sama dengan booking online: 5/jam per No. WA, 20/jam per IP
  if (select count(*) from booking_attempts where key = 'tunggu:' || wa and created_at > now() - interval '1 hour') >= 5
     or (ip <> '' and (select count(*) from booking_attempts where key = 'tunggu-ip:' || ip and created_at > now() - interval '1 hour') >= 20) then
    raise exception 'Terlalu banyak percobaan, coba lagi nanti';
  end if;
  insert into booking_attempts (key) values ('tunggu:' || wa);
  if ip <> '' then insert into booking_attempts (key) values ('tunggu-ip:' || ip); end if;

  select id into cid from customers where whatsapp = wa;
  if cid is null then
    insert into customers (name, whatsapp, created_by, source)
    values (nm, wa, null, case src when 'ig' then 'instagram' when 'instagram' then 'instagram' when 'wa' then 'whatsapp'
                                   when 'gmaps' then 'google_maps' else 'web' end)
    returning id into cid;
  end if;
  with ins as (insert into waitlist (customer_id, interest, source) select cid, x, src from unnest(wants) x
               on conflict do nothing returning interest)
  select array_agg(interest) into added from ins;
  if added is not null then
    perform enqueue_alert(format(E'💅 Daftar tunggu %s: %s (%s)%s',
      array_to_string(array(select case x when 'nail' then 'Nail Art' else 'Lashes' end from unnest(added) x), ' & '), nm, wa,
      coalesce(' · dari ' || src, '')));
  end if;
  return coalesce(added, '{}');
end $$;
revoke execute on function join_waitlist(jsonb) from public, anon, authenticated;

-- Segmen campaign: {"waitlist": "nail" | "lashes"}
do $$
declare def text; old text;
begin
  select pg_get_functiondef('campaign_audience'::regproc) into def;
  old := def;
  def := replace(def, $a$  online boolean := (p_segment ->> 'online')::boolean;$a$,
    $a$  online boolean := (p_segment ->> 'online')::boolean;
  wl text := nullif(p_segment ->> 'waitlist', '');$a$);
  def := replace(def, $a$  order by c.name;$a$,
    $a$    and (wl is null or exists (select 1 from waitlist w where w.customer_id = c.id and w.interest = wl))
  order by c.name;$a$);
  if def = old or def !~ 'w\.interest = wl' or def !~ 'wl text' then raise exception 'Patch campaign_audience tidak menemukan teks'; end if;
  execute def;
end $$;
