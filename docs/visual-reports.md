# LITA: visual reports in the embedded chat

The **Crear reporte visual · PNG** action appears in Transactions and Banks, even when no AI provider is configured. It generates a single 1080×1490 PNG entirely inside the user's browser; no image-generation model is needed for valid figures.

## Spending forecasts

1. LTC's authenticated `lita:forecast:request` reply contains only six completed months of **aggregate** expenses, income and category spending; never raw transactions.
2. `parseSpendingVisualReport` accepts ARS and USD independently only if each has 3+ expense-observed months and valid low/base/high values. Missing months remain unknown, never zero. It displays category projections and hypothetical income minus expense when available.
3. The report supports 1-, 3- and 6-month **nominal scenario extrapolations**. Future price changes, inflation, seasonality, unsaved expenses and FX conversions are not modeled. The baseline is the host's weighted mean; low/high are historical extrema, not prediction confidence bounds.
4. `renderVisualReport` draws amounts and bars through Canvas, from validated numeric input. No generative model is allowed to invent data.

## Banks

The bank report uses the existing `monthlyCardSpending.byCurrency[].months` transaction-date-paid-statement history with at least three recorded statement months per currency. It shows minimum, simple average and maximum *historical monthly* paid statements (not known next due amounts). PDF line items, manual purchases and the current partial cycle are excluded. The report correctly avoids USD/ARS aggregation.

## Optional runonweb artwork

Explicit opt-in button **Generar ilustración con IA local** sends only a random requestId to trusted LTC host. No financial numbers, user prompt, or categories are sent to the model. LTC uses a fixed nonsensitive decorative prompt with `runonweb/image`, Bonsai Image 4B binary (~3.4 GB), WebGPU-only, and sends back one PNG Blob via authenticated `postMessage`. The model downloads on the device, not a server. GPU/memory failure preserves normal report export. The generated PNG is placed only in a small reserved portion of the Canvas (never in the numeric chart).

## Privacy and compatibility

- No Firestore writes, storage of image data, raw transactions or server-side rendering.
- Secure iframe origin/source checks precede the bridge. Hidden amounts block the report and image request.
- Preview and PNG are in-memory object URLs and revoked when the report closes/changes.
- Standalone Lita lacks the authenticated LTC data bridge and won't make up a report.
- Android browsers without WebGPU can use **Descargar PNG** without running the model.

## QA

```sh
node --test tests/visual-report.test.mjs tests/spending-forecast.test.mjs
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

Merge the LTC host PR **before** the Lita PR. Smoke-test real signed-in transactions, bank statements, an empty account, privacy mode, ARS/USD separation, long category names, Android with no WebGPU, and optional desktop WebGPU generation. The heavyweight image model cannot be tested in GitHub Actions without a compatible GPU.


## WebGPU diagnostic and mobile limitations

The *optional* illustrative header is generated with runonweb's Bonsai Image 4B (~3.4 GB) **locally in the user's browser**, not on Vercel. The deterministic Canvas report and PNG download do not depend on AI or WebGPU.

On opening the report Lita requests a **capability preflight** from its trusted LTC iframe parent. If WebGPU is absent, there is no GPU adapter, or browser-reported device memory is less than 8 GB, the button is disabled and the concrete explanation shown. This limit is a conservative LTC heuristic, **not a guaranteed minimum hardware spec from the vendor**. On compatible devices, the button loads the model on demand. Failures from GPU memory, model download, and browser storage arrive as sanitized explanations through `lita:illustration:result.reason` and are displayed, rather than being replaced by "No se pudo generar". Timeouts also have an actionable message.

Users can cross-check support at https://runonweb.ai/models/image on the **same device and browser**. If the official demo also cannot generate an image, local model execution may be unavailable on that hardware. No automatic cloud image generation or provider expense is introduced and no finance data is sent to the model.


## Failure-phase diagnostics and no-AI decoration

A WebGPU adapter is only a preflight; it cannot verify whether the **Bonsai Image 4B** model can download and load all weights and execute on the GPU. LTC now sends the permitted stages `runtime`, `weights`, `generating`, and `validation` with sanitized progress, and returns failure descriptions identifying the stage, rather than claiming that all WebGPU-compatible phones can run the model. The runtime does not transmit the user's values or categories.

The report also offers **«Aplicar diseño ligero (sin IA)»** via `src/lib/localReportArtwork.ts`, a 512×512 deterministic, textured Canvas decoration with gradients and gentle relief. It requires no model, no external requests, and no WebGPU. This is **never labeled generative AI**. Both options decorate only the reserved report header: finance amounts and diagrams stay Canvas-computed. The ordinary PNG remains usable without any decoration.

Browser GPU execution of the 3.4 GB model is not tested in CI; use the same-device official demo and a real phone/desktop test.
