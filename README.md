# Marketplace Intelligence

A JavaScript, Next.js App Router, and Tailwind CSS local-first app for importing marketplace CSV/XLS/XLSX reports, auditing settlements, and investigating returns. Data processing is deterministic; the app does not connect to marketplace APIs. An optional Gemini AI assistant (Google Gemini API, free tier) answers questions about the imported data and writes stock advice when configured. Excel parsing uses a maintained SheetJS-compatible release because the npm `xlsx` package version is affected by published security advisories.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. To create a production build, run `npm run build`, then `npm start`.

## Data storage and environment

By default, the app stores imports and the selected interface language in `data/store.json` through the server-side `/api/store` route. To use a Neon Postgres database instead (free plan, no card), copy `.env.example` to `.env.local` and set `DATABASE_URL` to the connection string from the Neon console. When `DATABASE_URL` is set, the whole dataset is one JSON row in the `app_store` table, which the app creates on first use; otherwise it uses the local JSON file. `LOCAL_STORE_PATH` changes the local file location.

Keep the actual connection string in `.env.local`; never commit it or expose it through a `NEXT_PUBLIC_` variable. The `.env*` files are ignored by Git. On Vercel the file system is read-only, so set `DATABASE_URL` in the project environment variables and redeploy; without it, saves fail.

This MVP stores one shared dataset and has no user accounts or per-user data isolation. `src/proxy.js` guards every page and `/api/store` with one shared password (HTTP Basic Auth): set `APP_PASSWORD` in `.env.local` and in the Vercel project. Locally the app stays open without it; on Vercel it answers 503 until it is set. Do not use it for multiple users until real accounts and access controls are implemented.

The whole workspace is saved in one request, so a save is refused with a clear message above 4 MB (Vercel accepts request bodies up to 4.5 MB). This fits roughly 10,000 order rows in total.

## Demo and sample files

On Overview, choose **Load demo data**. Fictional reports are generated and sent through the same column recognition, row mapping, validation, and calculation functions used by uploaded data. The demo has 120 orders, payment transactions, 24 return records, feedback, and six products. Its payment report intentionally contains two changed amounts and a duplicate payment.

The generated CSV samples are in `public/samples/` and are downloadable from Help. The returns sample uses clearly fictional buyer identities, reserved example.com email addresses, and non-routable 202-555 numbers; Telegram values are intentionally invalid examples. It contains no marketplace conversation or account links. Regenerate the samples with:

```powershell
npm run samples
```

The Products page combines product/inventory imports with dated order history. It can show cards, rows, or a compact list; product details include weekly, monthly, and yearly unit sales, descriptions, offers, and popularity by yearly sales. Seller-edited stock is saved as a product-keyed override in the same local store (or database record) as imports. The product sample includes stock, descriptions, and sample promotions; demo order dates roll across the last year so each sales period can be explored.

To change the file used for current inventory, open Settings and choose a CSV or Excel inventory file. The file must have recognizable product-name or SKU and stock-quantity columns, and every row must contain a non-negative whole-number stock quantity. Replacing the inventory source preserves order history and other reports, but removes previous product imports and manual stock edits. Files are parsed in the browser and saved with the local workspace.

## Import workflow

Choose a report type, then select or drop a CSV, XLSX, or XLS file (up to 10 MB / 100,000 rows). The importer guesses the report type from the file name and, when the name is generic, from recognizable columns; you can still change the report-type dropdown yourself. Confirm the proposed column mappings; ambiguous amount columns are not mapped automatically. Review the preview and warnings, then import. Returns require an order ID and a return reason or customer-feedback column; customer details, marketplace reference, stock quantity, and conversation URL are optional. Rows with missing values and duplicates are retained, not silently discarded. Original row values and unmapped fields are retained with each standardized row.

Payments are matched by order ID. Expected values use order totals (or quantity × unit price) plus signed, explicitly categorized settlement adjustments; see the auditor for the calculation explanation. Return reason categories are keyword suggestions and editable. Returns can be filtered, searched, sorted, and explored by clicking chart categories. The detail view shows the imported explanation and customer fields as provided; it does not invent missing contacts or marketplace links. A conversation link is only opened when a valid HTTP(S) URL was included in the imported report. Return rate is only available when order data is imported.

The dashboard's local stock signals use explainable rules over dated order quantities and imported stock levels. Treat these as directional indicators, not forecasts or purchase orders.

The optional AI panel has two parts, both running on Google `gemini-3.8-flash` through the official `@google/genai` SDK (Interactions API, `store: false`). If the main model is out of free quota (HTTP 429), missing (404) or down (5xx), the request is retried on the backup `gemini-3.5-flash-lite`, and the main model is skipped for the next minute. Chat falls back only while no text has been shown, so one answer never mixes two models. Key and request errors are not retried. Both models are listed in `GEMINI_MODELS` in `src/lib/gemini.js`:

- **Chat** (`/api/chat`, streamed): ask about sales, returns, payments or stock. Gemini receives an aggregate workspace summary built by `buildWorkspaceSummary` in `src/lib/data.js` (monthly totals, payment check results, return reason counts, product names, SKUs and stock levels) plus the conversation. Customer names, contacts, IDs and feedback text are never sent.
- **Stock analysis** (`/api/analytics`): product, stock and dated unit-sales data, returned as schema-constrained JSON and re-validated with Zod. Seasonality is considered only when the history or the seller-provided market context supports it.

The model runs on the Gemini API free tier: no card is needed, but Google applies per-project request limits (see AI Studio) and may use free-tier prompts to improve its products. Treat answers as hypotheses, not forecasts or purchase orders. Create a free key at aistudio.google.com, put it in the ignored `.env.local` as `GEMINI_API_KEY=...` (and in the Vercel project environment variables when deployed), then restart or redeploy the app.

Use the language selector to choose English, Russian, or Uzbek for application labels and analysis. Imported source values are not translated or modified.

## Checks

```powershell
npm test
npm run lint
npm run build
```

## Limitations

- Local JSON and Neon Postgres storage in this MVP are for a single-user development/demo deployment; the app has one shared password, not user accounts or multi-user data isolation.
- Login/register routes explain that authentication is not configured; they do not collect credentials.
- Currency is not detected or converted. Amounts remain in the source report's units.
- Matching and return categories are deterministic and depend on the imported fields and marketplace report semantics.
- The project intentionally has no live marketplace messaging or external AI integration. Local inventory recommendations are deterministic and depend on the imported data's dates, product identifiers, and stock quantities.
