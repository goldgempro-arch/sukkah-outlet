import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { AppData } from "@/lib/data-store";
import type { Database } from "@/integrations/supabase/types";

const blobKeys: (keyof AppData)[] = [
  "parts-catalog",
  "sy-products",
  "dl-products",
  "standalone-mats",
  "fedex-mat-sets",
  "delivery-regions",
  "zip-to-region",
  "schach-mats",
  "schach-mats-fedex",
  "schach-bpns",
];

function createPublicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getPriceBlobs = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("price_blobs").select("key, data").in("key", blobKeys);
  if (error) throw error;

  const result: Partial<AppData> = {};
  for (const row of data ?? []) {
    const key = row.key as keyof AppData;
    if (blobKeys.includes(key)) {
      (result as Record<string, unknown>)[key] = row.data;
    }
  }

  // Ensure every key is present; fall back to empty defaults so the client never crashes.
  for (const key of blobKeys) {
    if (!(key in result)) {
      (result as Record<string, unknown>)[key] = Array.isArray(DEFAULT_DATA[key]) ? [] : {};
    }
  }

  return result as AppData;
});

const DEFAULT_DATA: Record<keyof AppData, unknown> = {
  "parts-catalog": {},
  "sy-products": [],
  "dl-products": [],
  "standalone-mats": [],
  "fedex-mat-sets": [],
  "delivery-regions": [],
  "zip-to-region": [],
  "schach-mats": {},
  "schach-mats-fedex": {},
  "schach-bpns": {},
};
