FROM node:20-bookworm-slim AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

WORKDIR /app

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ARG NEXT_PUBLIC_APP_URL
ARG DATABASE_URL
ARG JWT_SECRET
ARG NEXTAUTH_SECRET
ARG NEXTAUTH_URL
ARG NEXT_PUBLIC_STUDIO_NAME
ARG NEXT_PUBLIC_STUDIO_TAGLINE
ARG NEXT_PUBLIC_STUDIO_EMAIL
ARG NEXT_PUBLIC_STUDIO_PHONE
ARG NEXT_PUBLIC_STUDIO_PHONE_DISPLAY
ARG NEXT_PUBLIC_STUDIO_ADDRESS
ARG NEXT_PUBLIC_STUDIO_WHATSAPP
ARG NEXT_PUBLIC_STUDIO_HOURS
ARG NEXT_PUBLIC_STUDIO_INSTAGRAM
ARG NEXT_PUBLIC_STUDIO_PINTEREST
ARG NEXT_PUBLIC_STUDIO_TIKTOK
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV DATABASE_URL=${DATABASE_URL}
ENV JWT_SECRET=${JWT_SECRET}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}
ENV NEXT_PUBLIC_STUDIO_NAME=${NEXT_PUBLIC_STUDIO_NAME}
ENV NEXT_PUBLIC_STUDIO_TAGLINE=${NEXT_PUBLIC_STUDIO_TAGLINE}
ENV NEXT_PUBLIC_STUDIO_EMAIL=${NEXT_PUBLIC_STUDIO_EMAIL}
ENV NEXT_PUBLIC_STUDIO_PHONE=${NEXT_PUBLIC_STUDIO_PHONE}
ENV NEXT_PUBLIC_STUDIO_PHONE_DISPLAY=${NEXT_PUBLIC_STUDIO_PHONE_DISPLAY}
ENV NEXT_PUBLIC_STUDIO_ADDRESS=${NEXT_PUBLIC_STUDIO_ADDRESS}
ENV NEXT_PUBLIC_STUDIO_WHATSAPP=${NEXT_PUBLIC_STUDIO_WHATSAPP}
ENV NEXT_PUBLIC_STUDIO_HOURS=${NEXT_PUBLIC_STUDIO_HOURS}
ENV NEXT_PUBLIC_STUDIO_INSTAGRAM=${NEXT_PUBLIC_STUDIO_INSTAGRAM}
ENV NEXT_PUBLIC_STUDIO_PINTEREST=${NEXT_PUBLIC_STUDIO_PINTEREST}
ENV NEXT_PUBLIC_STUDIO_TIKTOK=${NEXT_PUBLIC_STUDIO_TIKTOK}
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}

RUN npm run build

FROM node:20-bookworm-slim AS runner

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh \
    && mkdir -p ./uploads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "const port=process.env.PORT||3000;fetch(`http://127.0.0.1:${port}`).then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker/entrypoint.sh"]
