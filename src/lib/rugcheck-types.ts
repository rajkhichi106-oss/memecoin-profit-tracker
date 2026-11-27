export type RugExtension = { name: string; level: "info" | "warn" | "bad"; detail: string };

export type RugHolder = {
  tokenAccount: string;
  owner: string;
  pct: number;
  kind: "wallet" | "pool";
};

export type RugChainData = {
  mint: string;
  tokenProgram: "spl-token" | "token-2022" | "unknown";
  decimals: number;
  supply: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: RugExtension[];
  holders: RugHolder[];
  fetchedAt: number;
};

export type RugChainResult =
  | { ok: true; data: RugChainData }
  | { ok: false; code: "NOT_CONFIGURED" | "RPC_ERROR" | "NOT_A_MINT"; error: string };
