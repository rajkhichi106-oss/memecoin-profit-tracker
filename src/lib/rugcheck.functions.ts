import { createServerFn } from "@tanstack/react-start";

import type { RugChainResult } from "./rugcheck-types";

export type { RugChainResult, RugChainData, RugHolder, RugExtension } from "./rugcheck-types";

const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const getRugCheck = createServerFn({ method: "GET" })
  .inputValidator((input: { mint: string }) => {
    const mint = (input?.mint ?? "").trim();
    if (!SOL_ADDRESS_RE.test(mint)) throw new Error("INVALID_MINT");
    return { mint };
  })
  .handler(async ({ data }): Promise<RugChainResult> => {
    const { loadRugChain } = await import("./rugcheck.server");
    return loadRugChain(data.mint);
  });
