# ---- Stage 1: Build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time env vars (public vars are baked into the bundle)
ARG NEXT_PUBLIC_MAPBOX_KEY=""
ENV NEXT_PUBLIC_MAPBOX_KEY=$NEXT_PUBLIC_MAPBOX_KEY

RUN npm run build

# ---- Stage 2: Run ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed to run
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./

EXPOSE 3000

CMD ["npm", "start"]
