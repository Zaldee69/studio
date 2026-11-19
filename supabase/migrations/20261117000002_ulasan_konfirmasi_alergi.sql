-- 1) Minta ulasan: ±1 jam setelah transaksi (sebelumnya 2 jam & hanya 2×/hari), nama toko dari pengaturan (bukan tertulis D'Pras).
create or replace function auto_review_request() returns int language plpgsql security definer set search_path = public as $$
declare url text; shop text; rows jsonb;
begin
  select google_review_url, shop_name into url, shop from settings;
  if url is null then return 0; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'wa', c.whatsapp, 'body', format(
           E'Halo Kak%s, terima kasih sudah berkunjung ke %s.\nBila berkenan, ceritakan pengalaman Kakak lewat ulasan singkat di Google:\n%s\nUlasan Kakak sangat membantu kami, juga teman-teman yang sedang mencari tempat yang pas. Sampai bertemu lagi,',
           case when trim(c.name) ~* '^no name$' then '' else ' ' || split_part(trim(c.name), ' ', 1) end, shop, url))), '[]')
    into rows
  from customers c
  where c.deleted_at is null and coalesce(c.whatsapp, '') <> ''
    and exists (select 1 from transactions t where t.customer_id = c.id and t.voided_at is null
                  and t.created_at between now() - interval '1 day' and now() - interval '1 hour')
    and not exists (select 1 from outbound_messages o join campaign_sends cs on cs.id = o.send_id join campaigns k on k.id = cs.campaign_id
                    where o.customer_id = c.id and k.auto_kind = 'review');
  return enqueue_auto_promo('review', rows);
end $$;
-- tiap jam selama jam buka (10.00–21.00 WIB = 03–14 UTC), bukan 2× sehari
select cron.schedule('gb-minta-ulasan', '0 3-14 * * *', $$select public.auto_review_request()$$);

-- 2) Konfirmasi / batal satu ketuk dari pengingat H-1: tautan berisi token acak per booking.
alter table booking_groups
  add column confirm_token text unique not null default encode(extensions.gen_random_bytes(12), 'hex'),
  add column confirmed_at timestamptz;

-- Hanya server (service role) yang memanggil: token = kunci, jadi tidak diberikan ke anon/authenticated.
create function booking_token_info(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g booking_groups; hrs int := (select cancel_cutoff_hours from settings); first_start timestamptz; st text; r jsonb;
begin
  select * into g from booking_groups where confirm_token = p_token;
  if not found then return null; end if;
  select min(start_at), min(status::text) filter (where status in ('booked', 'pending_review')) into first_start, st from appointments where booking_group_id = g.id;
  select jsonb_build_object('code', g.code, 'start_at', first_start, 'confirmed', g.confirmed_at is not null,
           'active', st is not null, 'cancellable', st is not null and first_start - now() >= make_interval(hours => hrs), 'cutoff_hours', hrs,
           'name', split_part(trim(coalesce(c.name, '')), ' ', 1),
           'services', (select coalesce(jsonb_agg(distinct sv.name), '[]') from appointments a join appointment_services x on x.appointment_id = a.id
                         join services sv on sv.id = x.service_id where a.booking_group_id = g.id and a.status in ('booked', 'pending_review')))
    into r from booking_groups b left join customers c on c.id = b.customer_id where b.id = g.id;
  return r;
end $$;

create function booking_token_confirm(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update booking_groups g set confirmed_at = coalesce(confirmed_at, now()) where confirm_token = p_token
    and exists (select 1 from appointments a where a.booking_group_id = g.id and a.status in ('booked', 'pending_review'));
  return found;
end $$;

create function booking_token_cancel(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g booking_groups; hrs int := (select cancel_cutoff_hours from settings); first_start timestamptz;
begin
  select * into g from booking_groups where confirm_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'tidak_ditemukan'); end if;
  select min(start_at) into first_start from appointments where booking_group_id = g.id and status in ('booked', 'pending_review');
  if first_start is null then return jsonb_build_object('ok', false, 'reason', 'sudah_selesai'); end if;
  if first_start - now() < make_interval(hours => hrs) then return jsonb_build_object('ok', false, 'reason', 'cutoff', 'hours', hrs); end if;
  update appointments set status = 'cancelled', cancel_reason = 'Dibatalkan pelanggan (tautan pengingat)'
   where booking_group_id = g.id and status in ('booked', 'pending_review');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function booking_token_info(text), booking_token_confirm(text), booking_token_cancel(text) from public, anon, authenticated;

-- 3) Alergi/kondisi pelanggan (penting untuk lashes & gel nail): tampil di kartu booking.
alter table customers add column allergies text;
