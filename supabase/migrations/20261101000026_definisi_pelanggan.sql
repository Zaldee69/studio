-- Audit tumpang tindih Gelombang 4 (1 Nov):
--  • TT-11: "Perlu follow-up" (Beranda, Analitik) ikut menghitung pelanggan yang sudah dihapus; cek tengah minggu & AI tidak.
--    Sekarang customer_stats.is_churn = false untuk pelanggan terhapus → semua layar memakai definisi yang sama.
--  • TT-10: ringkasan Senin menghitung "pelanggan ber-WA"; layar lain "transaksi dengan pelanggan tercatat" → disamakan.
create or replace view customer_stats with (security_invoker = false) as
 SELECT c.id AS customer_id,
    (COALESCE(t.ltv, (0)::numeric))::bigint AS lifetime_value,
    (COALESCE(t.visits, (0)::bigint))::integer AS visit_count,
    t.last_at AS last_visit_at,
    ((COALESCE(d.credited, (0)::numeric) - COALESCE(t.used, (0)::numeric)))::bigint AS deposit_balance,
    COALESCE((t.last_at < (now() - make_interval(weeks => ( SELECT public_settings.churn_weeks
           FROM public_settings)))), false) AND c.deleted_at IS NULL AS is_churn
   FROM ((customers c
     LEFT JOIN ( SELECT transactions.customer_id,
            sum(transactions.total) AS ltv,
            count(*) AS visits,
            max(transactions.created_at) AS last_at,
            sum(transactions.deposit_used) AS used
           FROM transactions
          WHERE (transactions.voided_at IS NULL)
          GROUP BY transactions.customer_id) t ON ((t.customer_id = c.id)))
     LEFT JOIN ( SELECT deposit_topups.customer_id,
            sum(deposit_topups.amount_credited) AS credited
           FROM deposit_topups
          GROUP BY deposit_topups.customer_id) d ON ((d.customer_id = c.id)))
  WHERE ((auth_role() = ANY (ARRAY['manager'::app_role, 'cashier'::app_role])) OR (c.id = my_customer_id()));

do $$
declare def text; old text;
begin
  select pg_get_functiondef('weekly_summary_text()'::regprocedure) into def;
  old := def;
  def := replace(def, $a$count(*) filter (where c.whatsapp is not null and c.whatsapp <> '')$a$, $a$count(t.customer_id)$a$);
  def := replace(def, $a$\nPelanggan ber-WA: %s%% dari transaksi$a$, $a$\nTransaksi dengan pelanggan: %s%%$a$);
  def := replace(def, $a$from transactions t left join customers c on c.id = t.customer_id where t.voided_at$a$, $a$from transactions t where t.voided_at$a$);
  if def = old or position('ber-WA' in def) > 0 or position('c.whatsapp' in def) > 0 then
    raise exception 'Patch weekly_summary_text tidak lengkap';
  end if;
  execute def;
end $$;
