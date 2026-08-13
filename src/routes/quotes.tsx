import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteQuote, listQuotes, money, type Quote } from "@/lib/quotes";

export const Route = createFileRoute("/quotes")({
  head: () => ({
    meta: [
      { title: "Saved Quotes — Sukkah Outlet Staff Tools" },
      {
        name: "description",
        content:
          "Browse, search, copy and delete sukkah quotes saved from the pricing tool on this machine.",
      },
      { property: "og:title", content: "Saved Quotes — Sukkah Outlet Staff Tools" },
      {
        property: "og:description",
        content: "Every quote built with the pricing tool, searchable by customer, code or size.",
      },
    ],
  }),
  component: QuotesPage,
});

function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => setQuotes(listQuotes()), []);

  const q = query.trim().toLowerCase();
  const visible = q
    ? quotes.filter((quote) =>
        [
          quote.quote_id,
          quote.customer_name,
          quote.sukkah_code ?? "",
          quote.size ?? "",
          quote.color ?? "",
          quote.product_line,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : quotes;

  const remove = (id: string) => {
    setQuotes(deleteQuote(id));
    toast.success("Quote deleted");
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Quote copied");
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Saved Quotes"
        subtitle="Quotes saved from the pricing tool, stored locally in this browser."
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 px-6 py-8">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer, quote ID, code or size"
          className="h-11"
        />

        {visible.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {quotes.length === 0
              ? "No saved quotes yet — build one on the Pricing page and hit Save."
              : "No quotes match that search."}
          </p>
        )}

        <div className="space-y-3">
          {visible.map((quote) => (
            <Card key={quote.quote_id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-sm font-semibold text-foreground">
                      {quote.customer_name || "No customer name"}
                    </p>
                    <p className="code-text mt-0.5 text-xs text-muted-foreground">
                      {quote.quote_id} · {new Date(quote.created_at).toLocaleString()}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[
                        quote.product_line,
                        quote.size,
                        quote.color,
                        quote.mat_type,
                        quote.fedex ? "FedEx" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="code-text text-sm font-semibold text-foreground">
                      {money(quote.summary.subtotal)}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => copy(quote.text)}>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label={`Delete ${quote.quote_id}`}
                      onClick={() => remove(quote.quote_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenId((id) => (id === quote.quote_id ? null : quote.quote_id))}
                  className="text-sm text-accent underline underline-offset-2"
                >
                  {openId === quote.quote_id ? "Hide quote text" : "Show quote text"}
                </button>

                {openId === quote.quote_id && (
                  <pre className="code-text overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                    {quote.text}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}