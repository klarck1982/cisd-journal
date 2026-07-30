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
   output values for the current drawing operation. This is the correct drawing
   reference; it is not automatically a complete feed-history API.
4. `IIndicatorContext.getHistory()` is available to custom indicators. It is
   the correct API when V2 explicitly needs a controlled history range.

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

## V2 non-negotiable architecture

```
Feed/history acquisition
       ↓
HTF boundary resolver
       ↓
Per-layer state machine
       ↓
Per-bar output snapshot cache
       ↓
Renderer
       ↓
CISD adapter (later)
```

## V2 rules before coding resumes

- No sound/file/CSV/shared-panel logic in rendering callbacks.
- No global snapshot used as a substitute for an output-range cache.
- No visual test should be sent to the user until it has an explicit output
  cache matching JForex's `calculate()` range contract.
- Basic remains the production reference.

## Next research task

Design the exact per-bar output cache: which immutable HTF snapshot is assigned
to each base-bar index, how it is invalidated after an instrument/timeframe or
option change, and how the renderer selects the visible snapshot without
rebuilding state.
