import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { REGIONS } from "@/lib/delivery-zones";
import { CATALOG } from "@/lib/prices";
import {
  DL_PRODUCTS,
  FEDEX_MATS,
  STANDALONE_MATS,
  SY_PRODUCTS,
} from "@/lib/products-db";
import { money } from "@/lib/quotes";

export const Route = createFileRoute("/data")({
  head: () => ({
    meta: [
      { title: "Reference Data — Sukkah Outlet Staff Tools" },
      {
        name: "description",
        content:
          "Browse and export the underlying data: parts catalog, SY and Deluxe products, mats and delivery regions.",
      },
      { property: "og:title", content: "Reference Data — Sukkah Outlet Staff Tools" },
      {
        property: "og:description",
        content: "Every product, mat and delivery region behind the pricing tools, in one table.",
      },
    ],
  }),
  component: DataPage,
});

interface Dataset {
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

const DATASETS: Record<string, Dataset> = {
  catalog: {
    label: "Parts catalog",
    columns: ["code", "desc", "price"],
    rows: Object.entries(CATALOG()).map(([code, e]) => ({
      code,
      desc: e.desc,
      price: e.price,
    })),
  },
  sy: {
    label: "SY / EZ products",
    columns: ["code", "size", "color", "mat", "fedex", "price", "desc"],
    rows: SY_PRODUCTS() as unknown as Record<string, unknown>[],
  },
  dl: {
    label: "Deluxe products",
    columns: ["code", "size", "color", "mat", "fedex", "price", "desc"],
    rows: DL_PRODUCTS() as unknown as Record<string, unknown>[],
  },
  mats: {
    label: "Standalone mats",
    columns: ["code", "size", "mat_type", "price", "desc"],
    rows: STANDALONE_MATS() as unknown as Record<string, unknown>[],
  },
  fedexMats: {
    label: "FedEx mat sets",
    columns: ["code", "line", "size", "mat_type", "price", "desc"],
    rows: FEDEX_MATS() as unknown as Record<string, unknown>[],
  },
  regions: {
    label: "Delivery regions",
    columns: Object.keys(REGIONS()[0] ?? {}),
    rows: REGIONS() as unknown as Record<string, unknown>[],
  },
};

const PAGE_SIZE = 100;

function cellText(value: unknown, column: string): string {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (column === "price" && typeof value === "number") return money(value);
  return String(value);
}

function toCsv(dataset: Dataset): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = dataset.columns.join(",");
  const body = dataset.rows.map((r) => dataset.columns.map((c) => escape(r[c])).join(","));
  return [head, ...body].join("\n");
}

function DataPage() {
  const [key, setKey] = useState("catalog");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  const dataset = DATASETS[key] as Dataset;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dataset.rows;
    return dataset.rows.filter((r) =>
      dataset.columns.some((c) => String(r[c] ?? "").toLowerCase().includes(q)),
    );
  }, [dataset, query]);

  const download = () => {
    const blob = new Blob([toCsv({ ...dataset, rows })], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Reference Data"
        subtitle="Everything the pricing tools read from — searchable and exportable."
        actions={
          <Button variant="outline" onClick={download}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-8">
        <div className="flex flex-wrap gap-3">
          <Select
            value={key}
            onValueChange={(v) => {
              setKey(v);
              setShown(PAGE_SIZE);
            }}
          >
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DATASETS).map(([k, d]) => (
                <SelectItem key={k} value={k}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE_SIZE);
            }}
            placeholder="Filter rows"
            className="max-w-sm"
          />
          <span className="self-center text-sm text-muted-foreground">
            {rows.length.toLocaleString()} rows
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {dataset.columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap capitalize">
                    {c.replace(/_/g, " ")}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, shown).map((row, i) => (
                <TableRow key={i}>
                  {dataset.columns.map((c) => (
                    <TableCell
                      key={c}
                      className={c === "code" ? "code-text font-medium text-accent" : ""}
                    >
                      {cellText(row[c], c)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {shown < rows.length && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setShown((s) => s + PAGE_SIZE)}>
              Show more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}