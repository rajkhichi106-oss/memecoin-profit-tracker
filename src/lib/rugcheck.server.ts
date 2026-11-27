import type { RugChainResult, RugHolder, RugExtension } from "./rugcheck-types";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN_LEGACY = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: RugChainResult }>();

function getRpcUrl(): string | null {
  const g = globalThis as unknown as { __env__?: Record<string, string> };
  const url = process.env["FLUX_RPC_URL"] ?? g.__env__?.["FLUX_RPC_URL"] ?? "";
  return url.startsWith("https://") || url.startsWith("http://127.0.0.1") ? url : null;
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result as T;
}

type ParsedMint = {
  value: {
    owner: string;
    data: {
      parsed?: {
        type?: string;
        info?: {
          mintAuthority: string | null;
          freezeAuthority: string | null;
          decimals: number;
          supply: string;
          extensions?: { extension: string; state?: Record<string, unknown> }[];
        };
      };
    };
  } | null;
};

function describeExtensions(
  list: { extension: string; state?: Record<string, unknown> }[] | undefined,
): RugExtension[] {
  const out: RugExtension[] = [];
  for (const e of list ?? []) {
    switch (e.extension) {
      case "permanentDelegate":
        out.push({ name: "Permanent delegate", level: "bad", detail: "Can move or burn any holder's tokens" });
        break;
      case "nonTransferable":
        out.push({ name: "Non-transferable", level: "bad", detail: "Tokens cannot be sold or moved" });
        break;
      case "transferHook":
        out.push({ name: "Transfer hook", level: "warn", detail: "Custom program runs on every transfer" });
        break;
      case "transferFeeConfig": {
        const st = e.state as
          | { newerTransferFee?: { transferFeeBasisPoints?: number } }
          | undefined;
        const bps = st?.newerTransferFee?.transferFeeBasisPoints;
        out.push({
          name: "Transfer fee",
          level: bps !== undefined && bps >= 500 ? "bad" : "warn",
          detail: bps !== undefined ? `${(bps / 100).toFixed(2)}% on every transfer` : "Fee on transfers",
        });
        break;
      }
      case "defaultAccountState": {
        const st = e.state as { accountState?: string } | undefined;
        if (st?.accountState === "frozen") {
          out.push({ name: "Accounts start frozen", level: "bad", detail: "New holders are frozen by default" });
        }
        break;
      }
      case "confidentialTransferMint":
        out.push({ name: "Confidential transfers", level: "info", detail: "Balances can be hidden" });
        break;
      default:
        break;
    }
  }
  return out;
}

export async function loadRugChain(mint: string): Promise<RugChainResult> {
  const url = getRpcUrl();
  if (!url) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      error: "Rug check is not configured. Add the FLUX_RPC_URL secret in Cloudflare.",
    };
  }

  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  try {
    const [mintAcc, supplyRes, largestRes] = await Promise.all([
      rpc<ParsedMint>(url, "getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]),
      rpc<{ value: { uiAmountString: string; decimals: number } }>(url, "getTokenSupply", [mint, { commitment: "confirmed" }]),
      rpc<{ value: { address: string; uiAmountString: string }[] }>(url, "getTokenLargestAccounts", [mint, { commitment: "confirmed" }]),
    ]);

    const info = mintAcc.value?.data?.parsed?.info;
    if (!mintAcc.value || mintAcc.value.data.parsed?.type !== "mint" || !info) {
      return { ok: false, code: "NOT_A_MINT", error: "This address is not a token mint." };
    }

    const supply = Number(supplyRes.value.uiAmountString);
    const largest = largestRes.value.slice(0, 20);

    // Resolve token accounts -> owner wallets, then classify owners (wallet vs program/pool).
    const taccs = await rpc<{
      value: ({ data: { parsed?: { info?: { owner?: string } } } } | null)[];
    }>(url, "getMultipleAccounts", [largest.map((l) => l.address), { encoding: "jsonParsed" }]);
    const owners = taccs.value.map((a) => a?.data?.parsed?.info?.owner ?? "");
    const uniq = [...new Set(owners.filter(Boolean))];
    const ownerAccs = uniq.length
      ? await rpc<{ value: ({ owner: string } | null)[] }>(url, "getMultipleAccounts", [
          uniq,
          { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
        ])
      : { value: [] };
    const kindByOwner = new Map<string, "wallet" | "pool">();
    uniq.forEach((o, i) => {
      const acc = ownerAccs.value[i];
      kindByOwner.set(o, acc && acc.owner === SYSTEM_PROGRAM ? "wallet" : "pool");
    });

    const holders: RugHolder[] = largest.map((l, i) => ({
      tokenAccount: l.address,
      owner: owners[i] || l.address,
      pct: supply > 0 ? (Number(l.uiAmountString) / supply) * 100 : 0,
      kind: kindByOwner.get(owners[i] ?? "") ?? "pool",
    }));

    const value: RugChainResult = {
      ok: true,
      data: {
        mint,
        tokenProgram:
          mintAcc.value.owner === TOKEN_2022 ? "token-2022" : mintAcc.value.owner === TOKEN_LEGACY ? "spl-token" : "unknown",
        decimals: info.decimals,
        supply,
        mintAuthority: info.mintAuthority,
        freezeAuthority: info.freezeAuthority,
        extensions: describeExtensions(info.extensions),
        holders,
        fetchedAt: Date.now(),
      },
    };
    cache.set(mint, { at: Date.now(), value });
    return value;
  } catch (err) {
    // Never echo the RPC URL / key back to the browser.
    console.error("rugcheck failed", err instanceof Error ? err.message : "unknown");
    return { ok: false, code: "RPC_ERROR", error: "Could not reach the RPC node. Try again in a moment." };
  }
}
