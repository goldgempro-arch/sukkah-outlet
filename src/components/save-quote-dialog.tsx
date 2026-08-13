import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveQuote, type Quote } from "@/lib/quotes";

/**
 * "Save quote" button that always asks for a customer name first, so saved
 * quotes are never stored with a blank customer_name.
 */
export function SaveQuoteDialog({
  buildQuote,
  disabled,
  label = "Save quote",
  variant = "outline",
  size = "sm",
}: {
  /** Returns the quote to persist, or null when it can't be built. */
  buildQuote: (customerName: string) => Quote | null;
  disabled?: boolean;
  label?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const quote = buildQuote(trimmed);
    if (!quote) {
      toast.error("Nothing to save yet.");
      return;
    }
    saveQuote({ ...quote, customer_name: trimmed });
    toast.success(`Quote saved for ${trimmed}`);
    setName("");
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setName("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save quote</DialogTitle>
          <DialogDescription>
            Enter the customer name this quote belongs to. It shows up on the Saved Quotes page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="save-quote-customer">Customer name</Label>
          <Input
            id="save-quote-customer"
            autoFocus
            value={name}
            placeholder="e.g. Cohen family"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!name.trim()}>
            Save quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
