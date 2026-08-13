import { useEffect, useState, useSyncExternalStore } from "react";

import partsCatalog from "@/data/parts-catalog.json";
import syProducts from "@/data/sy-products.json";
import dlProducts from "@/data/dl-products.json";
import standaloneMats from "@/data/standalone-mats.json";
import fedexMats from "@/data/fedex-mat-sets.json";
import deliveryRegions from "@/data/delivery-regions.json";
import zipToRegion from "@/data/zip-to-region.json";
import schachMats from "@/data/schach-mats.json";
import schachMatsFedex from "@/data/schach-mats-fedex.json";
import schachBpns from "@/data/schach-bpns.json";

import type { Product, StandaloneMat, FedexMat } from "@/lib/products-db";
import type { DeliveryRegion, ZipEntry } from "@/lib/delivery-zones";
import type { MatEntry, BpnsEntry } from "@/lib/schach-engine";

export type Catalog = Record<string, { desc: string | null; price: number | null }>;

export interface AppData {
  "parts-catalog": Catalog;
  "sy-products": Product[];
  "dl-products": Product[];
  "standalone-mats": StandaloneMat[];
  "fedex-mat-sets": FedexMat[];
  "delivery-regions": DeliveryRegion[];
  "zip-to-region": ZipEntry[];
  "schach-mats": Record<string, MatEntry[]>;
  "schach-mats-fedex": Record<string, MatEntry[]>;
  "schach-bpns": Record<string, BpnsEntry>;
}

const DEFAULT_DATA: AppData = {
  "parts-catalog": partsCatalog as Catalog,
  "sy-products": syProducts as Product[],
  "dl-products": dlProducts as Product[],
  "standalone-mats": standaloneMats as StandaloneMat[],
  "fedex-mat-sets": fedexMats as FedexMat[],
  "delivery-regions": deliveryRegions as DeliveryRegion[],
  "zip-to-region": zipToRegion as ZipEntry[],
  "schach-mats": schachMats as Record<string, MatEntry[]>,
  "schach-mats-fedex": schachMatsFedex as Record<string, MatEntry[]>,
  "schach-bpns": schachBpns as Record<string, BpnsEntry>,
};

let currentData: AppData = DEFAULT_DATA;
let listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function setData(next: AppData) {
  currentData = next;
  emit();
}

export function getData(): AppData {
  return currentData;
}

export function getBlob<K extends keyof AppData>(key: K): AppData[K] {
  return currentData[key];
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getData, getData);
}

export function useDataLoading(): [AppData, boolean] {
  const data = useData();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // If data is not default, assume it's loaded.
    if (data !== DEFAULT_DATA) {
      setLoading(false);
    }
  }, [data]);
  return [data, loading];
}

export function resetData() {
  currentData = DEFAULT_DATA;
  emit();
}
