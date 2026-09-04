# Multiple entries for the active token

## User-visible changes
- Keep the existing panel and controls, but make each submitted buy a separate saved entry for the same token.
- Show every active entry's live entry market cap, investment, current value, and net profit.
- Add a compact “+ Add Entry” control for the active coin and show a combined live summary in SOL, USD, and INR.
- Update expected-market-cap results per entry and add combined expected value and net profit.
- Preserve each entry’s fee snapshot and timestamp; keep existing recent history entries intact.

## Technical approach
- Add a single entry model and centralized aggregation helpers alongside `calculateProfit` in `src/lib/profit.ts`.
- Extend the existing hook with session/localStorage-backed entries keyed by token address. A normal check appends an entry; an explicit add-entry action captures the current form values as a new entry without another market-data request.
- Derive live and target rows from the same `calculateProfit` utility, using each entry’s own fees and entry market cap. Reuse the current token refresh and FX state.
- Update `ResultCard` and `TargetSection` to render per-entry rows plus combined totals while preserving the existing styling and layout. Keep the chart based on the aggregate target values.
- Extend history persistence with unique IDs and entry fee metadata without removing or replacing existing records.

## Validation
- Run the project typecheck and inspect the current build diagnostics.
- Use the running preview to verify: first check creates entry 1, Add Entry creates entry 2 for the same CA, live refresh updates both, target output includes both, and prior history remains visible.
