-- Bonus kasir (manajer 9 Nov): 1% dari omzet bersih studio sebulan, hanya bila omzet bersih ≥ Rp25 jt
-- (1% dari seluruh omzet, bukan dari kelebihannya). Gaji pokok kasir dicatat lewat Pengeluaran → "Gaji kasir"
-- (pengeluaran rutin bulanan); bonus dibayar bersama gaji bulan berikutnya, dicatat di kategori yang sama.
-- Omzet bersih = Σ net_amount item transaksi tidak di-void, tanggal Asia/Jakarta (definisi laporan owner).
-- ponytail: aturan di settings tanpa layar pengaturan; tambah kolom di Pengaturan bila owner mengubah aturannya.
alter table settings
  add column cashier_bonus_pct numeric not null default 1 check (cashier_bonus_pct between 0 and 100),
  add column cashier_bonus_min bigint not null default 25000000 check (cashier_bonus_min >= 0);

create function cashier_bonus(p_month date) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date as d0),
  r as (select coalesce(sum(ti.net_amount), 0)::bigint as revenue
        from m, transactions t join transaction_items ti on ti.transaction_id = t.id
        where t.voided_at is null
          and t.created_at >= jkt(m.d0, '00:00') and t.created_at < jkt((m.d0 + interval '1 month')::date, '00:00'))
  select jsonb_build_object('month', m.d0, 'revenue', r.revenue, 'min', s.cashier_bonus_min, 'pct', s.cashier_bonus_pct,
    'bonus', case when r.revenue >= s.cashier_bonus_min then round(r.revenue * s.cashier_bonus_pct / 100) else 0 end)
  from m, r, settings s
  where auth_role() in ('manager', 'cashier');
$$;
revoke execute on function cashier_bonus(date) from public, anon;
grant execute on function cashier_bonus(date) to authenticated;
