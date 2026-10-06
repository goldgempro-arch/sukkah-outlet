# Hand-off: FedEx Overcharge Ledger, to be built inside the quoting app

This file is a complete brief. It does not depend on any earlier conversation. Give the whole file, or just the prompt below, to the AI or developer who works on the quoting app (Lovable chat, or Claude Code in the quoting app repo).

## Copy-paste prompt

> Add a new feature to this app, "FedEx Overcharge Ledger". It compares what ShipRush quoted for each shipment with what FedEx actually billed, shows year-by-year history and charts, lets staff mark each overcharge as accepted or disputed, and produces a clean sheet (PDF and Excel) to send to FedEx.
>
> Build it as new pages and new database tables only. Do not change the existing quote tools, `price_blobs`, or the staff password gate. Put the pages behind the real Supabase login (the `_authenticated` layout), not only the shared staff password, because the data includes recipient names and shipping costs.
>
> Follow the rest of this brief exactly: file formats, business rules, tables, screens, report format and acceptance tests. A complete working reference implementation (single HTML file with all the logic) is in this repo at `shipping-audit/artifact.html`; port its logic rather than reinventing it. Ask me the open questions at the end before you start.

## 1. Goal

The company ships with FedEx but gets quotes and prints labels in ShipRush. FedEx bills later, and the bill often includes charges the quote did not (oversize, additional handling, dimensional weight changes, delivery area surcharges). Staff need to:

1. Upload the ShipRush shipment exports and the FedEx invoice detail export.
2. See, per shipment, quoted vs billed, and what FedEx charged on top.
3. Mark each overcharge as accepted (do not dispute) or track the dispute (filed, refunded, rejected, with the amount recovered and a note).
4. Download a clean table to send to FedEx listing only the shipments being disputed.
5. Come back later, including in following years, and see history and charts without uploading again.

Used about 2 to 3 times a year, by the same people who use the quoting app.

Do not touch: the quote tools (`/`, `/extension`, `/schach`, `/modular`, `/lookup`), `src/lib/quotes.ts`, the `price_blobs` and `user_roles` tables, `src/lib/gate.functions.ts`, `fedex-rate-quote.tsx`.

## 2. How the working reference behaves

Reference: `shipping-audit/artifact.html`. It is a single HTML file using SheetJS, ExcelJS, jsPDF and jspdf-autotable from cdnjs. Functions to port:

| Reference function | Job |
|---|---|
| `handleFiles` | Reads xlsx/csv files, detects ShipRush vs FedEx by header, normalizes rows, adds only new rows to the open audit |
| `analyze` | Joins ShipRush and FedEx data, computes quote, billed, difference, weights, dimensions, surcharge list |
| `computeSum` | Per-audit summary stored for the Home page |
| `renderHome` | Home page: tiles, charts, audit cards |
| `render` | Audit screen: summary strip, filters, ledger table |
| PDF / Excel / CSV click handlers | Report exports |
| Backup / restore handlers | JSON export and import of a whole audit |

## 3. Input file formats (from the real exports)

Detect by header row. Both can be `.xlsx` or `.csv`. Read the first sheet with the header on row 1. Header names can repeat (FedEx), so read rows as arrays (SheetJS `header: 1`), not as objects.

### ShipRush export
Detected when the header contains `Shipment Tracking Number`. One row per package. The shipment-level charge repeats on every package row of the same shipment.

| Column | Use |
|---|---|
| `Shipment Tracking Number` | Shipment key (master tracking number) |
| `Shipment Shipping Charges` | The quoted amount (take it once per tracking number, do not sum across package rows) |
| `Package Weight` | Weight of this package (sum across package rows for the shipment weight) |
| `Package Size Length`, `Package Size Width`, `Package Size Height` | Package dimensions, inches |
| `Shipment Date` | Ship date |
| `Order Number` | Order reference |
| `Ship To LastName` | Recipient shown in the UI. Store only the last name |

Rule: group rows by `Shipment Tracking Number`. First row supplies the quote. Count rows as packages, sum weights, list each package's `LxWxH`. Keep the first occurrence of a tracking number when merging more files into an audit.

### FedEx invoice detail export
Detected when the header contains `Express or Ground Tracking ID`.

| Column | Use |
|---|---|
| `Invoice Number` | Invoice id (shown, used for dedupe) |
| `Express or Ground Tracking ID` | Package tracking number |
| `TDMasterTrackingID` | Master tracking number for multi-package shipments. Blank for single packages, in which case use the package tracking id |
| `Net Charge Amount` | Package total billed. Only rows with a non-blank value are package rows. Other rows are continuation lines and must be ignored. Values can contain thousands commas |
| `Rated Weight Amount` | Billed weight for the package |
| `Dim Length`, `Dim Width`, `Dim Height` | Billed dimensions (blank for international) |
| `Ground Service` | Service name (fallback `Service Type`) |
| `Shipment Date` | Ship date |
| repeated pairs `Tracking ID Charge Description` + `Tracking ID Charge Amount` | The itemized charges for the package. There are many such pairs across the row. Read every column whose header equals `Tracking ID Charge Description` and the cell right after it as the amount |

Rule: package row = non-blank `Net Charge Amount`. Dedupe package rows by `Invoice Number + Express or Ground Tracking ID`. Group package rows under the master key (`TDMasterTrackingID` or the package id). For a shipment: billed total = sum of `Net Charge Amount` over its package rows; billed weight = sum of rated weights; billed dimensions = list of per-package dims; charges = sum of amounts by description across packages.

## 4. Business rules

- Match key: ShipRush `Shipment Tracking Number` equals the FedEx master key.
- `quote` = ShipRush shipment charge. `billed` = FedEx billed total for the master key. `difference = billed - quote`.
- An overcharge is a shipment with `difference > threshold`. Default threshold **$0.50**, editable, saved per audit.
- Differences below zero are "billed less than quoted" and shown, but are not overcharges.
- Charges to review per shipment: every FedEx charge description that matches this case-insensitive regex and does not match the "normal" list, with a non-zero amount:
  - Flag: `/oversize|add'?l handling|additional handling|large package|address correction|delivery area|^das|residential|saturday|demand|signature|declared value|duplicate|adjust/i`
  - Normal (not flagged): `/^(fuel surcharge|discount|grace discount|earned discount|performance pricing|residential delivery|weekday delivery)$/i`
- Extra notes per shipment: if both sides have exactly 1 package and billed weight is more than shipped weight + 0.5 lb, note "billed X lb vs shipped Y lb". If package counts differ, note "N pkg in ShipRush, M billed".
- Status of an overcharge: accepted (checkbox), or disposition `open` (default), `filed`, `refunded`, `rejected`.
  - "To dispute" = overcharge that is not accepted and not refunded and not rejected (so open and filed).
  - "Accepted" = checkbox ticked.
- Spent with FedEx = sum of `Net Charge Amount` over all deduplicated FedEx package rows in the audit, including shipments that are not in ShipRush.
- Unmatched lists: ShipRush shipments not on the FedEx invoice, and FedEx shipments not in the ShipRush files. Show them in a collapsed section on the audit screen. Never treat them as overcharges.
- Uploads are additive: adding files to an audit never deletes data and never double counts (ShipRush dedupe by tracking number, FedEx by invoice + tracking).

## 5. Data model (new Supabase tables)

Create these through the Supabase / Lovable dashboard (this repo has no migrations folder). Enable row level security on all of them. No public (anon) access.

### `fedex_audits`
| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| name | text not null | e.g. "Sept 2026 invoices" |
| year | int not null | used to group by year |
| created_by | uuid references auth.users | |
| created_at | timestamptz default now() | |
| tol | numeric default 0.5 | ignore-under threshold, saved per audit |
| include_accepted | boolean default false | whether reports include accepted rows |
| summary | jsonb | cached totals, see below |

`summary` shape (recompute and save whenever rows, marks or threshold change): `{ billed, quoted, shipments, overCount, overTotal, by: { open, accepted, filed, refunded, rejected }, byCharge: { "<description>": amount, ... top 12 }, recovered }`, money rounded to 2 decimals. `by.*` are dollar sums of overcharge differences by status.

### `fedex_audit_rows`
Parsed rows stored as chunks, not one table row per shipment (about 800 FedEx packages and 500 ShipRush rows per audit). Columns: `audit_id uuid references fedex_audits on delete cascade`, `kind text check (kind in ('sr','fx'))`, `n int` (chunk number), `rows jsonb` (up to 150 rows), primary key `(audit_id, kind, n)`. When saving an audit, rewrite all chunks for that kind and delete leftover chunks with higher `n`.

Row shapes (short keys, identical to the backup file):
- ShipRush row `sr`: `{ t: tracking, q: quote, w: weight, d: "YYYY-MM-DD", o: order number, n: recipient last name, dm: "LxWxH" }`
- FedEx row `fx`: `{ i: invoice number, t: package tracking, m: master tracking, n: net charge, r: rated weight, dm: "LxWxH" or "", s: ship date, c: [[description, amount], ...] }`

### `fedex_audit_marks`
One row per shipment that someone acted on. Primary key `(audit_id, tracking)`.
| column | type |
|---|---|
| audit_id | uuid references fedex_audits on delete cascade |
| tracking | text (master tracking number) |
| accepted | boolean default false |
| disp | text check (disp in ('open','filed','refunded','rejected')) default 'open' |
| recovered | numeric |
| note | text |
| updated_by | uuid references auth.users |
| updated_at | timestamptz default now() |

Separate rows per shipment so two people editing different shipments never overwrite each other. Last write wins per shipment.

### Access (RLS)
- Select, insert, update: authenticated users who are allowed to use the audit feature. Simplest: reuse `has_role(auth.uid(), 'admin')`, or add a new `app_role` value such as `staff` and give it to the same people who use the quoting app (see open questions).
- Delete audit: admin only. Deleting an audit cascades to rows and marks.
- Never expose the service role key to the browser. Do not store addresses, phone numbers or emails. Recipient last name, tracking, order number, weights, dimensions and charges only.

## 6. Where it goes in the app (follow existing patterns)

- New routes under `src/routes/_authenticated/` so they require the Supabase login:
  - `audit.tsx` is the Home page (history and charts).
  - `audit.$auditId.tsx` is one audit's ledger.
- Add a sidebar entry in `src/components/app-sidebar.tsx`, in the `records` array, for example `{ title: "FedEx Audit", url: "/audit", icon: Truck }`.
- Server functions in a new `src/lib/audit.functions.ts`, following `src/lib/admin.functions.ts`: `createServerFn(...).middleware([requireSupabaseAuth]).inputValidator(zod).handler(...)`. Functions: list audits, create audit, save rows (chunked), load rows, upsert a mark, update settings and summary, delete audit, import backup.
- Parse the uploaded files in the browser with SheetJS (`xlsx` package). Exports: ExcelJS for the styled workbook, jsPDF with jspdf-autotable for the PDF. Add these dependencies. Use the browser download mechanism for saves.
- UI with the existing shadcn components (card, table, checkbox, select, input, tabs, alert-dialog), sonner toasts, TanStack Query for data. Charts are simple hand-built SVG or CSS bars like the reference; Recharts is fine if it is already installed.
- Refresh marks for other users by refetching on focus and on an interval of about 30 seconds, or with Supabase realtime on `fedex_audit_marks`.
- Light and dark mode via the app's existing theme tokens.

## 7. Screens and behavior checklist

### Home (`/audit`)
- Header with year filter chips (All years plus each year) and a "New audit" button.
- Four tiles for the selected range:
  1. Spent with FedEx (sum of `billed`), note "Total billed on your invoices".
  2. Overcharged (sum of `overTotal`), note with percent of spend.
  3. Still to dispute (sum of `by.open + by.filed`).
  4. Recovered (sum of `recovered`).
- Chart "Spent by year": one column per year, total spend, with the overcharged part as a segment on top. Value above each column and "$X over, Y%" under the label. Clicking a column filters the page to that year (click again to clear).
- Chart "Overcharge rate for each audit": column per audit, percent of that audit's spend that was overcharged, labeled with amounts.
- Chart "What happened to the overcharges": one stacked bar split into To dispute, Accepted, Filed, Refunded, Rejected, with a list of dollars and percent.
- Chart "Where the extra charges come from": top 6 charge descriptions by dollars (horizontal bars).
- "All audits": cards grouped by year with name, shipments compared, started date, spent, overcharged, to dispute, recovered and an Open button.
- "Show the numbers as a table" disclosure with the same data in a table.
- Empty state when there are no audits: explain what an audit is and offer "Start your first audit".
- Tooltips on chart marks with exact dollars. Readable at phone width.

### Audit screen (`/audit/$auditId`)
- Audit switcher (grouped by year), New audit (name and year), Delete audit (admin only, with an in-page confirmation).
- Drop zone for ShipRush and FedEx files. Additive and deduped. Show a line per file read and how many new rows were added. Saves automatically.
- Summary strip: shipments compared, quoted, billed, overcharged, accepted, to dispute, recovered.
- Filter chips: All, To dispute, Accepted, Filed, Refunded, Rejected.
- "Ignore under $" number (default 0.50) and "include accepted in reports" checkbox. Both are saved on the audit and restored when it is opened again. Do not overwrite the field while the user is typing.
- Ledger table, sortable by clicking headers, default sort by difference descending. Columns: Accept checkbox, Tracking (all package numbers, one per line), Recipient, Shipped, Quoted, Billed, Difference, Ship weight, Billed weight, FedEx charges to review (as chips), Status select, Recovered, Note. Accepted rows are visually muted. Show who last changed a mark.
- Actions: PDF report, Excel report, CSV, Back up audit (JSON), Restore backup (JSON).
- Collapsed "not matched" section described in section 4.
- View-only users can read but not change anything. Show a banner.

## 8. The report to send to FedEx

Table only. No title, no summary boxes, no headings, no dates or footers added by the app.

- Rows: overcharged shipments (difference above the threshold), sorted by overcharge descending. Exclude accepted shipments unless "include accepted" is ticked.
- Columns, in order: Tracking (all package numbers, one per line), Recipient, Shipped (date), Shipped weight (lb), Shipped size (in), Billed weight (lb), Billed size (in), Quoted, Billed, Overcharge. Sizes are `LxWxH`, joined with " / " for multiple packages.
- Final row: "Total overcharged" with the sum in the last column.
- Excel: one sheet "Overcharges", header in row 1 (bold, shaded, frozen), tracking numbers stored as text (so Excel does not turn them into 8.76E+11), weights as `0" lb"`, money as `$#,##0.00`, overcharge in red bold, total as a `SUM` formula, landscape and fit to one page wide.
- PDF: landscape letter, same table, 7 to 8 pt text, no browser print header or footer (generate with jsPDF, do not use `window.print`).
- CSV (not for FedEx, for staff): the visible table plus accepted, status, recovered and note. Write tracking as `="..."` text and add a UTF-8 BOM.
- If nothing is left to report (everything accepted), say so instead of producing an empty file.

## 9. Security and access notes

- The staff password gate (`/unlock`) is a shared secret with no per-person identity. It cannot be the only protection. The audit routes and server functions must require the Supabase login (`requireSupabaseAuth`) and database RLS.
- Validate all server function inputs with zod, including size limits (row counts, string lengths, jsonb size) and the allowed `disp` values.
- Do not log row contents. Do not put any audit data in URLs.
- Uploaded files are parsed in the browser. Only normalized rows with the short keys above are sent to the server.
- Keep chunk size at about 150 rows so each jsonb value stays small.

## 10. Moving the existing data

The current live version is a claude.ai page (https://claude.ai/artifact/Y7EJ5jcEB6u4DcqQy3qnJd). Its "Back up audit" button downloads a JSON file for one audit. Build "Restore backup" in the new app to import it as a new audit.

Backup file format:

```json
{
  "app": "fedex-overcharge-ledger",
  "v": 1,
  "name": "Sept 2026 invoices",
  "year": 2026,
  "sr": [ { "t": "876318255395", "q": 38.73, "w": 15, "d": "2026-08-26", "o": "84933", "n": "GREENBERG", "dm": "73×6×4" } ],
  "fx": [ { "i": "946087162", "t": "876530158939", "m": "876530158939", "n": 65.61, "r": 86, "dm": "93×9×7", "s": "20260831", "c": [["Fuel Surcharge", 14.05], ["Discount", -24.79]] } ],
  "status": { "877717348342": { "accepted": false, "disp": "filed", "rec": 25.5, "note": "called FedEx", "by": "<user id>", "at": "2026-10-05T19:27:59Z" } }
}
```

Import creates a new audit with the name plus " (restored)", writes the chunks, writes one mark per `status` entry (map `rec` to `recovered`, `by` is not carried over, use the importing user), then recomputes the summary.

## 11. Acceptance tests

Use the real exports: six ShipRush reports named `ShipRush_Report_Sep25_*.XLSX` (August 26 to September 24, 2026) and one `FedEx_invoice_2026-10-05_11_12.XLSX` (811 package rows). Ask the owner for these files, they are not in the repository.

1. Create an audit "Sept 2026 invoices", year 2026. Upload all seven files at once.
2. Expect: ShipRush shipments 535, matched shipments 529, FedEx packages 811. Total quoted for matched shipments $41,209.30. Total billed for matched shipments $42,995.57. Spent with FedEx (all invoice packages) about $50,885.32.
3. With threshold $0.50: 26 overcharged shipments, total overcharged $1,909.97. With threshold $2.00: 19 overcharged shipments, total $1,901.29.
4. Largest overcharges include tracking 877717348342 (+$210.93, 4 packages, oversize charge $160.00), 877180801479 (+$192.12, oversize $165.00), 876537759925 (+$179.50, 5 packages).
5. Multi-package shipment 877717348342 lists all four package tracking numbers in one cell.
6. Upload the same seven files again: nothing is added and totals do not change.
7. Tick Accept on the first row (876334751654, +$222.22): Accepted shows $222.22 and To dispute drops by the same amount. The FedEx report no longer includes that row. Ticking "include accepted" brings it back.
8. Set a row to Filed, Recovered 25.50, note "called FedEx". Reload the page: the values are still there.
9. Change the threshold to 2.00 and reload: the field shows 2.00.
10. Home shows the audit card, the tiles match the audit screen, the year chart shows 2026. Add two restored older audits and the year filter and charts update.
11. Excel opens with tracking numbers as text and the total row equals the sum of the column. PDF has no title or boxes and ends with the total row.
12. Sign out and open `/audit`: the app redirects to the login. A user without the right role cannot read the tables (RLS).

## 12. Open questions to answer before building

1. Who gets access: everyone with the quoting app login, or only some people? Reuse the `admin` role or add a `staff` role?
2. Should every logged-in user be able to delete an audit, or admins only (the reference assumes admins only)?
3. Where is the app hosted and how are database changes applied (Lovable, Supabase dashboard, a migration tool)?
4. Should it later compare the live FedEx quote the app produced for a customer against ShipRush and FedEx billed amounts?
5. Should the claude.ai version be retired once this ships?
