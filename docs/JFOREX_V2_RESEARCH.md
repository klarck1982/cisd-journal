# JForex HTF V2 — Research Notes (No implementation decisions yet)

## Goal

Build a new Higher Timeframe candle renderer for JForex that uses Pine Script as
its visual/timing reference, without changing CISD, sounds, CSV, or the Windows
application until visual parity is proven.

## Confirmed JForex contract

1. `IIndicator.calculate(startIndex, endIndex)` must fill outputs only for the
   requested calculation range.
2. `IDrawingIndicator.drawOutput()` may be called whenever the chart surface is
   redrawn. It must be treated as rendering-only; it must not emit alerts,
   write files, or advance signal state.
3. `IIndicatorContext.getHistory()` is available to custom indicators when a
   controlled external history range is actually needed.
4. `IndicatorInfo.setRecalculateAll(true)` tells JForex to recalculate over all
   chart data instead of only the arriving candle.

## Empirical JForex lifecycle result

The `V2LifecycleDiagnostic` was compiled and tested on live JForex charts.
With `setRecalculateAll(true)`:

| Chart | calculate range | input bars | draw support bars | visible bars |
|---|---:|---:|---:|---:|
| USA30 15m | 0–1705 | 1706 | 60 | 59 |
| USA30 1H | 0–119 | 120 | 56 | 55 |
| USA500 1H | 0–237 | 238 | 56 | 55 |

### Consequence

- `calculate()` receives the full available source history and is the correct
  place to build the immutable HTF `VisualFrame`.
- `IIndicatorDrawingSupport.getCandles()` exposes only the drawing/visible
  range. It is correct for pixel coordinates and screen dimensions, but it is
  **not** the source for HTF aggregation.
- The earlier V2 branch that built snapshots in `drawOutput()` from support
  candles is invalid and must be discarded.

## Basic failure modes observed

- HTF layer state is mutable and is updated from `calculate()` ranges that can
  differ after changing settings, instruments, or timeframes.
- Retest sound is triggered from `drawOutput()`, which turns redraws into state
  transitions and sound events.
- Candle Closure boundaries use a separate timezone from the HTF aggregation
  calculation.
- The old final period is 7 hours, not Weekly.

## Pine reference model

Pine keeps an independent candle array per HTF:

1. Detect a new HTF boundary (`Monitor`).
2. Add a new candle only at that boundary.
3. Update the latest candle only (`Update`).
4. Position ready-made candles (`Reorder`).
5. Draw only on the final/realtime bar.

The renderer does not mutate candle construction state.

## Timing requirements approved by product owner

- Daily boundary: Midnight New York.
- Weekly boundary: TradingView-style weekly boundary, New York session reference.
- TradingView display profile used for comparison: UTC-4.
- 4H profile, XAU: 02 / 06 / 10 / 14 / 18 / 22 UTC-4.
- 4H profile, EURUSD and SPX500: 01 / 05 / 09 / 13 / 17 / 21 UTC-4.
- The candle body, timer, Candle Closure lines and labels must use one resolved
  boundary source.

## V2 output-frame design

V2 does **not** use a mutable global layer list that is incrementally changed by
whatever range JForex happened to request.

On each controlled full recalculation:

```
full input IBar[]
  → boundary resolver
  → six pure HTF builders
  → immutable VisualFrame
  → output anchor values for requested range
```

`VisualFrame` contains only the final snapshots needed by the right-side visual
renderer (completed candles, current candle, resolved start/end, timer source).
It is atomically replaced only after all six builders complete successfully.

`drawOutput()` receives the latest completed `VisualFrame` and only renders it.
It uses drawing support only for pixel transforms, chart dimensions, visible
range and right-side placement. It never creates candles, changes state, plays
a sound, writes a file, or reads history.

Output arrays are still filled for every requested JForex range. They act as a
valid chart anchor and preserve the `IIndicator` contract; the right-side HTF
visual itself comes from the immutable frame.

## VisualFrame contract

```
VisualFrame
  sourceInstrument
  sourcePeriod
  sourceLastBarTime
  configurationFingerprint
  createdAt
  layers[]

LayerFrame
  timeframeLabel
  resolvedStart
  resolvedEnd
  completedCandles[]
  currentCandle
```

Every candle stored in a frame is immutable. The renderer may calculate pixel
coordinates and a countdown string, but never changes OHLC, start, end, or the
layer list.

## Frame invalidation rules

A new frame is required when any of the following changes:

1. **Instrument changes** — detected through `IChartInstrumentsListener` and
   through the feed descriptor key.
2. **Base chart period changes** — feed descriptor period differs from the key
   stored in the frame.
3. **Optional visual/timing input changes** — every setter marks the frame
   dirty; no setter rebuilds or draws immediately.
4. **A new base bar arrives** — source last-bar time is newer than the frame's
   `sourceLastBarTime`.
5. **The final source bar updates** — same bar time, new high/low/close; V2
   rebuilds the frame so the current HTF candle remains live.

`calculate()` is the only location allowed to clear the dirty flag and atomically
replace the frame.

## Rendering contract

- Renderer reads only the latest non-null `VisualFrame`.
- Renderer uses `IIndicatorDrawingSupport` for pixel transforms, visible chart
  size, and right-side placement.
- Timer is derived as `layer.resolvedEnd - now`; it does not mutate a candle.
- Candle Closure uses `resolvedStart` and `resolvedEnd` from the same layer,
  never `start + a generic interval`.
- Drawing must not call history, write files, emit sound, or update CISD state.

## V2 non-negotiable architecture

```
Full calculate input
       ↓
HTF boundary resolver
       ↓
Pure per-layer candle builders
       ↓
Immutable VisualFrame (atomic swap in calculate)
       ↓
Renderer using drawing support only for coordinates
       ↓
CISD adapter (later)
```

## V2 rules before coding resumes

- No sound/file/CSV/shared-panel logic in rendering callbacks.
- `IndicatorInfo.setRecalculateAll(true)` is required for the visual-only phase.
- No visual test should be sent to the user until it has a valid output anchor
  and immutable VisualFrame matching JForex's calculate/draw contract.
- Basic remains the production reference.

## Next research task

Write the exact `VisualFrame` data model and frame invalidation implementation
for instrument change, timeframe change, optional-input change, and a new base
bar, then replace the invalid experimental V2 renderer in one controlled pass.
