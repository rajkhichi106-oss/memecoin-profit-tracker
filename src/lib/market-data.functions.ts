import { createServerFn } from "@tanstack/react-start";

import { fetchSolPrice, fetchTokenData, fetchWalletTrades } from "./market-data.server";
import type {
  SolPriceResult,
  TokenData,
  TokenDataResult,
  WalletTrade,
  WalletTradesResult,
} from "./market-data.types";

export type { SolPriceResult, TokenData, TokenDataResult, WalletTrade, WalletTradesResult };

const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const getTokenData = createServerFn({ method: "GET" })
  .inputValidator((input: { ca: string }) => {
    const ca = (input?.ca ?? "").trim();
    if (!SOL_ADDRESS_RE.test(ca)) throw new Error("INVALID_CA");
    return { ca };
  })
  .handler(async ({ data }): Promise<TokenDataResult> => fetchTokenData(data.ca));

export const getSolPrice = createServerFn({ method: "GET" }).handler(
  async (): Promise<SolPriceResult> => fetchSolPrice(),
);

export const getWalletTrades = createServerFn({ method: "GET" })
  .inputValidator((input: { wallet: string }) => {
    const wallet = (input?.wallet ?? "").trim();
    if (!SOL_ADDRESS_RE.test(wallet)) throw new Error("INVALID_WALLET");
    return { wallet };
  })
  .handler(async ({ data }): Promise<WalletTradesResult> => fetchWalletTrades(data.wallet));
