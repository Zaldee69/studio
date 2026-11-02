-- Audit tumpang tindih TT-13 (1 Nov): Inventaris → Resep menghitung komisi selalu dipotong HPP, padahal aturan berlaku
-- (settings.commission_deduct_hpp, prod: tidak dipotong) → laba kontribusi per layanan terlihat lebih besar dari kenyataan.
create or replace view service_margins with (security_invoker = true) as
 WITH h AS (
         SELECT s.id, s.name, s.category, s.price, s.active,
            (COALESCE(round(sum((sm.qty * i.unit_cost))), (0)::numeric))::bigint AS hpp
           FROM ((services s
             LEFT JOIN service_materials sm ON ((sm.service_id = s.id)))
             LEFT JOIN inventory_items i ON ((i.id = sm.item_id)))
          WHERE (s.category <> 'retail'::service_category)
          GROUP BY s.id
        ), c AS (
         SELECT h.*, (round(((GREATEST((0)::bigint, h.price - CASE WHEN st.commission_deduct_hpp THEN h.hpp ELSE 0 END) * st.commission_pct))::numeric / 100.0))::bigint AS commission
           FROM h, settings st
        )
 SELECT c.id, c.name, c.category, c.price, c.active, c.hpp,
    (c.price - c.hpp) AS margin,
        CASE
            WHEN (c.price > 0) THEN round(((((c.price - c.hpp))::numeric * 100.0) / (c.price)::numeric), 1)
            ELSE (0)::numeric
        END AS margin_pct,
    c.commission,
    ((c.price - c.hpp) - c.commission) AS contribution
   FROM c;
