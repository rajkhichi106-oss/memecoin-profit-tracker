import { createServerFn } from "@tanstack/react-start";

import type {
  FxRateResult,
  SolPriceResult,
  TokenDataResult,
  WalletTradesResult,
} from "./market-data-types";

export type {
  TokenData,
  TokenDataResult,
  SolPriceResult,
  FxRateResult,
  WalletTrade,
  WalletTradesResult,
} from "./market-data-types";

const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const getTokenData = createServerFn({ method: "GET" })
  .inputValidator((input: { ca: string; pairAddress?: string }) => {
    const ca = (input?.ca ?? "").trim();
    if (!SOL_ADDRESS_RE.test(ca)) throw new Error("INVALID_CA");
    const pairAddress = (input?.pairAddress ?? "").trim();
    return { ca, pairAddress: SOL_ADDRESS_RE.test(pairAddress) ? pairAddress : "" };
  })
  .handler(async ({ data }): Promise<TokenDataResult> => {
    const { loadTokenData } = await import("./market-data.server");
    return loadTokenData(data.ca, data.pairAddress || undefined);
  });


export const getSolPrice = createServerFn({ method: "GET" }).handler(
  async (): Promise<SolPriceResult> => {
    const { loadSolPrice } = await import("./market-data.server");
    return loadSolPrice();
  },
);

export const getFxRate = createServerFn({ method: "GET" }).handler(
  async (): Promise<FxRateResult> => {
    const { loadFxRate } = await import("./market-data.server");
    return loadFxRate();
  },
);

export const getWalletTrades = createServerFn({ method: "GET" })
  .inputValidator((input: { wallet: string; limit?: number }) => {
    const wallet = (input?.wallet ?? "").trim();
    if (!SOL_ADDRESS_RE.test(wallet)) throw new Error("INVALID_WALLET");
    const limit = Math.min(Math.max(input?.limit ?? 20, 1), 30);
    return { wallet, limit };
  })
  .handler(async ({ data }): Promise<WalletTradesResult> => {
    const { loadWalletTrades } = await import("./market-data.server");
    return loadWalletTrades(data.wallet, data.limit);
  });
