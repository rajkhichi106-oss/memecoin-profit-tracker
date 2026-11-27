# Deploy: GitHub → Cloudflare Workers

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Import a repository (Workers Builds).
   - Build command: `npm install --legacy-peer-deps && npm run build`
   - Deploy command: `npx wrangler deploy`
   - Worker name must be `memecoin-profit-tracker` (set in vite.config.ts).
3. No environment variables or Supabase needed — the app only calls public market-data APIs.
4. Update the `memcoin-profit-tracker.lovable.app` URLs in `src/routes/index.tsx` and
   `src/routes/sitemap[.]xml.ts` to your real domain.
