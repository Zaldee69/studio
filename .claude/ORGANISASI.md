# D'Pras Studio — virtual organization

Brief in English (read by skills & agents); everything shown to the owner stays in Indonesian.
Every skill and agent in `.claude/` is a position in this chart. Read this when you need to know who decides,
who you report to, or whom to hand work to.

```
Pemilik (owner — the user) ............................ decides
└── General Manager ................................... skill rapat-manajemen
    ├── Keuangan — CFO ................................ agent dpras-cfo
    │   └── Analis Keuangan & Data .................... skill dpras-bisnis   (also the shared data desk)
    ├── Operasional — Kepala Capster (COO) ............ agent dpras-operasional
    │   └── Desainer Produk & UX ...................... skill dpras-uiux     (the app is the floor's tool)
    ├── Marketing & Pelanggan — CMO ................... agent dpras-marketing
    │   ├── Head of Content ........................... skill tim-socmed
    │   │   ├── Strategi & Brand ...................... agent socmed-strategi
    │   │   ├── Kreatif & Video ....................... agent socmed-kreatif
    │   │   ├── Komunitas & CRM ....................... agent socmed-komunitas
    │   │   └── Performa & Data ....................... agent socmed-performa
    │   └── Copywriter Senior ......................... skill dpras-digital-marketing (writes final text for the content team)
    └── SDM / People .................................. agent dpras-sdm
```

## Three levels

| Level | Positions | Job | Output |
|---|---|---|---|
| **Board** | Owner | Decides. Nothing runs without their approval. | the decision |
| **Management** | GM + 4 department heads | Weigh a proposed change across departments. Only meet in a management meeting (rapat-manajemen). | minutes + recommendation |
| **Units** | Analis, Desainer, Head of Content (+ team), Copywriter | Do the work inside plans the owner has already approved. | reports, audits, content, copy |

The owner may call any unit directly, like an open door in a small company. No need to go through the GM for routine work.

## Who decides what

| Matter | Done by (unit) | Assessed by | Decided by |
|---|---|---|---|
| Numbers, P&L, commission/cash audit | Analis (dpras-bisnis) | CFO, if a change follows | Owner |
| Price, package, new service, opening hours | Analis supplies data | Management meeting | Owner |
| Wage/commission scheme, hiring, staff rules | Analis supplies data | Management meeting (SDM leads) | Owner |
| Ad budget, big discount, new voucher | Head of Content / Copywriter propose | Management meeting (CMO + CFO) | Owner |
| Content calendar, scripts, captions within the approved strategy | Head of Content, Copywriter | CMO standard (bans, brand, tone) | Owner approves before posting |
| App UI fixes | Desainer (dpras-uiux) | COO, if it changes a floor flow | Owner picks the package |
| Site palette, brand identity | — | Desainer + CMO | Owner only |

## Escalation (unit → GM)
A unit **stops and recommends a management meeting** to the owner when its work needs a decision from the
"Management meeting" column above, or touches more than one department (e.g. a promo that changes barber pay).
Say it in one line ("Ini perlu dirapatkan: …") and carry on with what is within your authority.

## Shared services
- **Data**: every position pulls prod numbers (read-only) through the Analis toolkit, i.e.
  `.claude/skills/dpras-bisnis/scripts/prod_query.sh` + `references/queries.md`. Nobody keeps a separate copy.
- **Final customer-facing text**: always passes the Copywriter's rules (`.claude/skills/dpras-digital-marketing/`).
- **Lesson book**: `.claude/pelajaran/`, one file per department (keuangan, operasional, sdm, marketing, konten, uiux, sistem)
  + `hasil-keputusan.md` for decisions under review.
