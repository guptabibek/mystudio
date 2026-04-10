# Linux VPS Deployment

This repository now includes a production Docker stack for a Linux VPS:

- `Dockerfile` builds the Next.js app and keeps Prisma available for migrations.
- `docker-compose.prod.yml` runs only the app container.
- The app uses the external PostgreSQL and Redis endpoints already configured in `.env`.
- `npm run deploy:prod` runs a small `.env` preflight and deploys the container.

## 1. Prepare the VPS

On the VPS, install Docker Engine, the Docker Compose plugin, and Node.js/npm.

Open whichever host port you want to expose. By default the stack publishes the app on port `3000`.

## 2. Copy the repo and review `.env`

```bash
git clone <your-repo-url> photostudio-platform
cd photostudio-platform
```

This deploy flow uses the existing `.env` file directly.

Before deploying, make sure these values in `.env` point to the VPS/public host instead of localhost:

- `NEXTAUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `CORS_ORIGINS`
- `ESEWA_CALLBACK_BASE_URL`
- `ESEWA_SUCCESS_URL`
- `ESEWA_FAILURE_URL`
- `NEXTAUTH_SECRET`
- `JWT_SECRET`
- `DATABASE_URL`
- `REDIS_URL`

If you use Stripe, set both `STRIPE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the same publishable key.

## 3. Deploy

Run the production deploy from the project root:

```bash
npm run deploy:prod
```

What this does:

- builds the app image with the public `NEXT_PUBLIC_*` values baked into the Next build
- uses `.env` for runtime configuration
- connects to the external PostgreSQL and Redis services already configured there
- runs `prisma migrate deploy` before the app process starts
- publishes the app on `http://<server-ip>:3000` unless you override `APP_PORT`

## 4. Verify

Check container status:

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
```

Tail logs if anything is not healthy:

```bash
npm run deploy:prod:logs
```

Basic smoke check:

```bash
curl -I http://127.0.0.1:3000
```

## 5. Redeploy after code changes

From the repo directory on the VPS:

```bash
git pull
npm run deploy:prod
```

## Notes

- Uploaded photos and payment proofs persist in the `uploads_data` Docker volume.
- The deploy script warns if `.env` still contains `localhost` URLs for production-sensitive settings.
- If you want the app reachable on port `80`, add `APP_PORT=80` to `.env` before deploying.
- TLS is not handled by this stack. If you need HTTPS, terminate it with your host-level proxy, load balancer, or CDN.