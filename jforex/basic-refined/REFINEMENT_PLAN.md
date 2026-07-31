# Basic Refined — HTF State Stability Plan

## Scope

This plan changes only HTF layer state management. It must not change CISD
conditions, sounds, retest behavior, CSV, Shared CISD, Windows integration, or
Basic's output/drawing contract.

## Confirmed root cause

`setOptInputParameter()` calls a setter and saves settings, but HTF layer
setters do not invalidate the existing `LayerData` state.

When JForex subsequently recalculates a range (often after an option,
instrument, or timeframe change), `processChartBar()` can receive historical
bars while `LayerData.currentCandleActive` and `currentPeriodStart` still refer
to a later calculation. This mixes time directions in the same mutable layer.

`lastCalculatedIndex` exists but is not used to protect this lifecycle.

## Conservative fix design

### 1. Add a dedicated HTF dirty flag

`htfStateDirty` is set only by setters that affect HTF construction or placement:

- Layer enable
- Layer timeframe
- Layer candle count
- Layer position
- Layer offset
- Chart timezone

It is **not** set by CISD, sound, CSV, or presentation-only settings.

### 2. Detect chart identity changes

At `calculate()` compare:

- feed instrument
- base period
- resolved chart timezone

with the last HTF build key. Any change marks `htfStateDirty`.

### 3. Rebuild layers safely

When dirty:

1. Clear only HTF `LayerData` state.
2. Rebuild enabled layers using `bars[0..endIndex]` in chronological order.
3. Mark HTF clean.
4. Continue normal output generation for the requested `startIndex..endIndex`.

This is allowed because indicators may read before `startIndex`; only output
arrays must remain limited to the requested output range.

### 4. Normal incremental calculation

When not dirty, retain existing Basic behavior initially. No use of
`lastCalculatedIndex` is introduced in the first conservative patch.

### 5. Guardrails

- No calls to `detectCISDFinal` are added during HTF rebuild.
- No sound or file write occurs in the rebuild path.
- No modifications to `drawOutput()` in the first patch.
- A debug console message logs only `HTF rebuild reason` during validation.

## Validation

1. Add indicator, then change a visual layer option.
2. Change instrument.
3. Change chart timeframe.
4. Confirm HTF candle count/order remains stable.
5. Confirm no new sound/CISD/CSV behavior changes.
6. Compare rendering with Basic on unchanged settings.
