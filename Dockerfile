# PRASYARAT: `next build` meng-prerender halaman publik dari tabel settings, jadi proyek Supabase klien harus sudah
# dibuat, dimigrasi, dan terisi (provisioning) SEBELUM image di-build, dan mesin build harus bisa menjangkaunya.
# Satu image per klien: nilai NEXT_PUBLIC_* beku saat build, jadi dikirim lewat --build-arg.
#   docker build -t klien-a:1.0 --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_BRAND="Nama Klien" .
# Rahasia server (SUPABASE_SECRET_KEY, PUSH_SECRET, WABLAS_*, dst.) TIDAK masuk image: beri lewat `docker run --env-file`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_BRAND
ARG NEXT_PUBLIC_BRAND_INITIALS
ARG NEXT_PUBLIC_BRAND_TAGLINE
ARG NEXT_PUBLIC_BRAND_LINES
ARG NEXT_PUBLIC_ACCENT
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
