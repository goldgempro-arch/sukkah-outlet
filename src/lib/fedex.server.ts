/**
 * FedEx live rating (SANDBOX). Server-only: OAuth token exchange and the Rate
 * and Transit Times call never run in the browser.
 */

const FEDEX_BASE = "https://apis-sandbox.fedex.com";
const TOKEN_URL = `${FEDEX_BASE}/oauth/token`;
const RATE_URL = `${FEDEX_BASE}/rate/v1/rates/quotes`;

const RATE_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

export interface FedexPackage {
  weightLb: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  qty?: number | undefined;
}

export interface FedexRateInput {
  destPostalCode: string;
  destCountryCode?: string | undefined;
  destStateCode?: string | null | undefined;
  destCity?: string | null | undefined;
  destResidential?: boolean | undefined;
  shipDate?: string | null | undefined; // YYYY-MM-DD
  packages: FedexPackage[];
}

export interface FedexQuote {
  serviceType: string;
  serviceName: string;
  amount: number;
  currency: string;
  transitTime: string | null;
  deliveryDate: string | null;
}

export interface FedexRateResponse {
  source: "live" | "cache" | "fallback";
  quotes: FedexQuote[];
  error: string | null;
}

interface TokenState {
  token: string;
  expiresAt: number;
}

// Module-scope caches: per-isolate, which is exactly the short-lived,
// best-effort window we want (no cross-request correctness dependency).
let tokenState: TokenState | null = null;
let tokenInFlight: Promise<string> | null = null;
const rateCache = new Map<string, { at: number; quotes: FedexQuote[] }>();

function creds() {
  const clientId = process.env["FEDEX_CLIENT_ID"];
  const clientSecret = process.env["FEDEX_CLIENT_SECRET"];
  const accountNumber = process.env["FEDEX_ACCOUNT_NUMBER"];
  if (!clientId || !clientSecret || !accountNumber) {
    throw new Error("FedEx credentials are not configured");
  }
  return { clientId, clientSecret, accountNumber };
}

function origin() {
  return {
    postalCode: process.env["FEDEX_ORIGIN_ZIP"] ?? "11219",
    stateOrProvinceCode: process.env["FEDEX_ORIGIN_STATE"] ?? "NY",
    countryCode: process.env["FEDEX_ORIGIN_COUNTRY"] ?? "US",
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenState && tokenState.expiresAt > now + 60_000) return tokenState.token;
  if (tokenInFlight) return tokenInFlight;

  const { clientId, clientSecret } = creds();
  tokenInFlight = (async () => {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });
    const res = await fetchWithTimeout(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
      RATE_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`FedEx OAuth failed (${res.status})`);
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("FedEx OAuth returned no token");
    tokenState = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return json.access_token;
  })().finally(() => {
    tokenInFlight = null;
  });

  try {
    return await tokenInFlight;
  } catch (err) {
    tokenState = null;
    throw err;
  }
}

function cacheKey(input: FedexRateInput): string {
  const pkgs = input.packages
    .map((p) => `${p.qty ?? 1}:${p.weightLb}x${p.lengthIn}x${p.widthIn}x${p.heightIn}`)
    .join("|");
  return [
    input.destPostalCode.trim(),
    input.destCountryCode ?? "US",
    input.destStateCode ?? "",
    input.destResidential ? "res" : "com",
    input.shipDate ?? "",
    pkgs,
  ].join("~");
}

function prettyService(serviceType: string, serviceName?: string | null): string {
  if (serviceName) return serviceName;
  return serviceType
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface RawRateReply {
  output?: {
    rateReplyDetails?: Array<{
      serviceType?: string;
      serviceName?: string;
      commit?: {
        dateDetail?: { dayOfWeek?: string; dayFormat?: string };
        label?: string;
      };
      operationalDetail?: { transitTime?: string; deliveryDate?: string };
      ratedShipmentDetails?: Array<{
        totalNetCharge?: number;
        totalNetChargeWithDutiesAndTaxes?: number;
        currency?: string;
      }>;
    }>;
  };
  errors?: Array<{ message?: string }>;
}

type RateDetail = NonNullable<NonNullable<RawRateReply["output"]>["rateReplyDetails"]>[number];

function commitLabel(d: RateDetail): string | null {
  const transit = d.operationalDetail?.transitTime;
  if (transit) return transit.replace(/_/g, " ").toLowerCase();
  const detail = d.commit?.dateDetail;
  if (detail?.dayFormat) {
    const date = new Date(detail.dayFormat);
    if (!Number.isNaN(date.getTime())) {
      return `arrives ${detail.dayOfWeek ?? ""} ${date.toISOString().slice(0, 10)}`.trim();
    }
  }
  return d.commit?.label ?? null;
}

function buildPayload(input: FedexRateInput, accountNumber: string) {
  const o = origin();
  const packages = input.packages.flatMap((p) =>
    Array.from({ length: Math.max(1, Math.round(p.qty ?? 1)) }, () => ({
      weight: { units: "LB", value: Math.max(1, p.weightLb) },
      dimensions: {
        length: Math.max(1, Math.round(p.lengthIn)),
        width: Math.max(1, Math.round(p.widthIn)),
        height: Math.max(1, Math.round(p.heightIn)),
        units: "IN",
      },
    })),
  );
  return {
    accountNumber: { value: accountNumber },
    rateRequestControlParameters: { returnTransitTimes: true },
    requestedShipment: {
      shipper: { address: o },
      recipient: {
        address: {
          postalCode: input.destPostalCode.trim(),
          countryCode: input.destCountryCode ?? "US",
          ...(input.destStateCode ? { stateOrProvinceCode: input.destStateCode } : {}),
          ...(input.destCity ? { city: input.destCity } : {}),
          residential: input.destResidential ?? true,
        },
      },
      shipDateStamp: input.shipDate ?? new Date().toISOString().slice(0, 10),
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
      rateRequestType: ["ACCOUNT", "LIST"],
      packagingType: "YOUR_PACKAGING",
      requestedPackageLineItems: packages,
    },
  };
}

export async function fetchFedexRates(input: FedexRateInput): Promise<FedexRateResponse> {
  const key = cacheKey(input);
  const hit = rateCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { source: "cache", quotes: hit.quotes, error: null };
  }

  try {
    const { accountNumber } = creds();
    const token = await getAccessToken();
    const res = await fetchWithTimeout(
      RATE_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-locale": "en_US",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildPayload(input, accountNumber)),
      },
      RATE_TIMEOUT_MS,
    );

    if (res.status === 401) tokenState = null;
    const json = (await res.json().catch(() => ({}))) as RawRateReply;
    if (!res.ok) {
      const msg = json.errors?.[0]?.message ?? `FedEx rating failed (${res.status})`;
      throw new Error(msg);
    }

    const quotes: FedexQuote[] = (json.output?.rateReplyDetails ?? [])
      .map((d) => {
        const rated = d.ratedShipmentDetails ?? [];
        const amount = rated
          .map((r) => r.totalNetCharge ?? r.totalNetChargeWithDutiesAndTaxes ?? 0)
          .filter((n) => n > 0)
          .sort((a, b) => a - b)[0];
        return {
          serviceType: d.serviceType ?? "UNKNOWN",
          serviceName: prettyService(d.serviceType ?? "UNKNOWN", d.serviceName),
          amount: amount ?? 0,
          currency: rated[0]?.currency ?? "USD",
          transitTime: commitLabel(d),
          deliveryDate:
            d.operationalDetail?.deliveryDate ?? d.commit?.dateDetail?.dayFormat ?? null,
        };
      })
      .filter((q) => q.amount > 0)
      .sort((a, b) => a.amount - b.amount);

    if (!quotes.length) throw new Error("FedEx returned no rates for this shipment");

    rateCache.set(key, { at: Date.now(), quotes });
    return { source: "live", quotes, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "FedEx request failed";
    console.error("[fedex] rate lookup failed:", message);
    // Stale-but-usable cache beats a blocked quote.
    if (hit) return { source: "cache", quotes: hit.quotes, error: message };
    return { source: "fallback", quotes: [], error: message };
  }
}