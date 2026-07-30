# HigherTFCandles V2

A clean rebuild of the HTF visual engine, using the Pine Script as the visual
and timing reference while keeping Basic untouched.

## Build order
1. TradingView time engine (UTC-4 display profiles, Midnight New York daily).
2. Deterministic HTF candle builder.
3. Renderer and Candle Closure labels.
4. CISD and desktop integration only after visual parity is verified.

Do not use this V2 folder in live trading until its visual phases are validated.
