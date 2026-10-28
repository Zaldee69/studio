-- Stok bahan menipis → juga ke Telegram owner (sebelumnya hanya lonceng di aplikasi), dan ringkasan pagi 08.05 WIB
-- menyebut semua bahan yang masih di bawah ambang reorder sampai dicatat stok masuk.

create or replace function stock_cross_reorder() returns trigger language plpgsql security definer set search_path = public as $$
declare it inventory_items; now_qty numeric;
begin
  select * into it from inventory_items where id = new.item_id;
  if not it.active or new.qty >= 0 then return null; end if;
  select coalesce(sum(qty), 0) into now_qty from stock_moves where item_id = new.item_id;
  if now_qty - new.qty > it.reorder_at and now_qty <= it.reorder_at
     and not exists (select 1 from notifications where kind = 'low_stock' and read_at is null and payload ->> 'item_id' = it.id::text) then
    perform notify('manager', 'low_stock', jsonb_build_object('item_id', it.id, 'name', it.name, 'qty', now_qty,
                                                              'reorder_at', it.reorder_at, 'unit', it.unit));
    perform safe_alert(format(E'📦 Stok menipis: %s\nSisa %s %s (ambang %s). Pesan lewat Inventaris → Daftar belanja.',
      it.name, trim_scale(now_qty), it.unit, trim_scale(it.reorder_at)));
  end if;
  return null;
end $$;

create function alert_low_stock() returns void language plpgsql security definer set search_path = public as $$
declare lines text;
begin
  select string_agg(format('• %s: sisa %s %s (ambang %s)', name, trim_scale(qty), unit, trim_scale(reorder_at)), E'\n' order by name)
    into lines from stock_levels where active and kind = 'consumable' and reorder_at > 0 and qty <= reorder_at;
  if lines is not null then
    perform safe_alert(E'📦 Bahan yang perlu dipesan:\n' || lines || E'\nBuka Inventaris → Daftar belanja, lalu catat Stok masuk saat barang datang.');
  end if;
end $$;
revoke execute on function alert_low_stock() from public, anon, authenticated;

create or replace function alert_morning() returns void language plpgsql security definer set search_path = public as $$
begin
  perform alert_unpaid_weeks();
  perform alert_low_stock();
  if extract(isodow from jkt_today()) = 1 then perform alert_weekly_summary(); end if;
end $$;
