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
3. `IIndicatorDrawingSupport.getCandles()` returns candles corresponding to the
   output values for the current drawing operation. It is a drawing reference,
   not a replacement for a controlled history/recalculation model.
4. `IIndicatorContext.getHistory()` is available to custom indicators. It is
   the correct API when V2 explicitly needs a controlled history range.
5. `IndicatorInfo.setRecalculateAll(true)` tells JForex to recalculate over all
   available chart data instead of only the arriving candle. This is appropriate
   for a deterministic visual HTF renderer whose final frame depends on prior
   base bars.

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
input IBar[]
  → boundary resolver
  → six pure HTF builders
  → immutable VisualFrame
  → output anchor values for requested range
```

`VisualFrame` contains only the final snapshots needed by the right-side visual
renderer (completed candles, current candle, resolved start/end, timer source).
It is atomically replaced only after all six builders complete successfully.

`drawOutput()` receives the latest completed `VisualFrame` and only renders it.
It never creates candles, changes state, plays a sound, writes a file, or reads
history.

Output arrays are still filled for every requested JForex range. They act as a
valid chart anchor and preserve the `IIndicator` contract; the right-side HTF
visual itself comes from the immutable frame.

## V2 non-negotiable architecture

```
Feed/history acquisition
       ↓
HTF boundary resolver
       ↓
Pure per-layer candle builders
       ↓
Immutable VisualFrame (atomic swap)
       ↓
Renderer
       ↓
CISD adapter (later)
```

## V2 rules before coding resumes

- No sound/file/CSV/shared-panel logic in rendering callbacks.
- `IndicatorInfo.setRecalculateAll(true)` must be evaluated and used for the
  visual-only phase so a settings change produces a full deterministic frame.
- No visual test should be sent to the user until it has a valid output anchor
  and immutable VisualFrame matching JForex's calculate/draw contract.
- Basic remains the production reference.

## Next research task

Write the exact `VisualFrame` data model and define frame invalidation rules for
instrument change, timeframe change, optional-input change, and a new base bar.
