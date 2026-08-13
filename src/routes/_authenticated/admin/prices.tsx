import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, AlertTriangle, Download } from "lucide-react";
import JSZip from "jszip";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { listPriceBlobs, updatePriceBlob } from "@/lib/admin.functions";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/_authenticated/admin/prices")({
  head: () => ({
    meta: [
      { title: "Price Admin — Sukkah Outlet" },
      { name: "description", content: "Edit and synchronize prices for the Sukkah Outlet ERP." },
      { property: "og:title", content: "Price Admin — Sukkah Outlet" },
      { property: "og:description", content: "Edit and synchronize prices for the Sukkah Outlet ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PriceAdminPage,
});

const BLOB_KEYS = [
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
] as const;

type BlobKey = (typeof BLOB_KEYS)[number];

function PriceAdminPage() {
  const data = useData();
  const navigate = useNavigate();
  const [key, setKey] = useState<BlobKey>("parts-catalog");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: auth }) => {
      if (!auth.user) navigate({ to: "/auth", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    setValue(JSON.stringify(data[key], null, 2));
  }, [key, data]);

  useEffect(() => {
    listPriceBlobs()
      .then((rows) => {
        const row = rows.find((r) => r.key === key);
        if (row?.updated_at) setUpdatedAt(row.updated_at);
      })
      .catch(() => null);
  }, [key]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (e) {
        setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
        setSaving(false);
        return;
      }
      await updatePriceBlob({ data: { key, data: parsed } });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const rows = await listPriceBlobs();
      const zip = new JSZip();
      for (const row of rows) {
        zip.file(`${row.key}.json`, JSON.stringify(row.data, null, 2));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sukkah-prices-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Price Admin"
        subtitle="Edit the JSON price blobs below. Changes save to the live database and update the web app immediately."
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-64 space-y-1.5">
          <Label htmlFor="blob">Price table</Label>
          <Select value={key} onValueChange={(v) => setKey(v as BlobKey)}>
            <SelectTrigger id="blob">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLOB_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {updatedAt && (
          <p className="text-sm text-muted-foreground">Last saved: {new Date(updatedAt).toLocaleString()}</p>
        )}
      </div>
      <Tabs defaultValue="editor" className="w-full">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="help">Help</TabsTrigger>
        </TabsList>
        <TabsContent value="editor" className="space-y-4">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-[500px] font-mono text-sm"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save to live database"}
            </Button>
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exporting..." : "Export to JSON (zip)"}
            </Button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
            {error && (
              <span className="inline-flex items-center text-sm text-destructive">
                <AlertTriangle className="mr-1 h-4 w-4" />
                {error}
              </span>
            )}
          </div>
        </TabsContent>
        <TabsContent value="help" className="space-y-4 text-sm text-muted-foreground">
          <p>
            Edit the JSON directly. Each top-level key is a price table. The web app reads from the
            database automatically; the desktop .exe reads from the static JSON files in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">src/data/</code>.
          </p>
          <p>
            After saving prices here, click{" "}
            <strong className="text-foreground">Export to JSON</strong> to update the local files,
            then rebuild the .exe.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
