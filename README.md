# LinkedIn Copilot (Sandbox + GitHub)

## Quick start (sandbox)

This sandbox exposes port 3000. Run the dev server in `/home/vibecode/workspace/linkedincopilot` (or this repo) and open the preview.

```sh
npm i
npm run dev
```

## Environment variables

Set these in `.env` (do not commit):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Deployment (Vercel)

1. Push this repo to GitHub.
2. In Vercel, **Import Project** and select the repo.
3. Set:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm ci`
4. Add the same environment variables used locally.
5. Add your domain (ex: `www.linkedincopilot.io`) in Vercel and follow the DNS records shown in the Vercel UI.

## Supabase CI (migrations + functions)

This repo includes a GitHub Actions workflow at `.github/workflows/supabase-deploy.yml` that runs on push to `main` (for changes under `supabase/**`).

Required GitHub repo secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` (example: `gdwpkojugtggozyofpmw`)
- `SUPABASE_DB_URL` (percent-encoded connection string, e.g. `postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres`)

Once secrets are set, pushing to `main` will:

- Apply new migrations to the remote database.
- Deploy all functions under `supabase/functions`.

## Stripe (subscriptions)

Set these **Supabase function secrets** (Dashboard → Project → Settings → Functions → Secrets):

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_AGENCY`
- `STRIPE_PRODUCT_PRO` (optional)
- `STRIPE_PRODUCT_AGENCY` (optional)
- `APP_BASE_URL` (e.g. `https://linkedincopilot.io`)

Webhook endpoint to configure in Stripe:

```
https://<PROJECT_REF>.functions.supabase.co/stripe-webhook
```

Recommended events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
