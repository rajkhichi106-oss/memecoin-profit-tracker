import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    cloudflare: { wrangler: { name: "memecoin-profit-tracker" } },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
