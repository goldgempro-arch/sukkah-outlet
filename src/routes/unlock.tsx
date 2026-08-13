import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "Staff Access — Sukkah Outlet" },
      { name: "description", content: "Enter the staff password to access internal tools." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Staff Access — Sukkah Outlet" },
      { property: "og:description", content: "Internal staff tool. Password required." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnlockPage,
});

function UnlockPage() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await unlock({ data: { password } });
      if (res.ok) {
        await router.invalidate();
        await router.navigate({ to: "/", replace: true });
        return;
      }
      setError(res.reason ?? "Incorrect password. Please try again.");
    } catch (err) {
      // Surface the real cause -- a swallowed message here is impossible to debug
      // against a deployed build.
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="font-display text-lg font-semibold text-foreground">Staff Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the staff password to continue.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-password">Password</Label>
          <Input
            id="staff-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="mt-5 w-full" disabled={loading || !password}>
          {loading ? "Checking…" : "Enter"}
        </Button>
      </form>
    </div>
  );
}
