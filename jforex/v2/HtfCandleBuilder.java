package com.dukascopy.indicators;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Deterministic HTF candle builder for V2.
 *
 * Given the same chronological source bars and timing engine, it always emits
 * the same completed candles plus one current candle. No rendering state is
 * stored here, so JForex redraws cannot corrupt the candle sequence.
 */
final class HtfCandleBuilder {
    static final class SourceBar {
        final long time;
        final double open, high, low, close;
        SourceBar(long time, double open, double high, double low, double close) {
            this.time = time; this.open = open; this.high = high; this.low = low; this.close = close;
        }
    }

    static final class Candle {
        final long start, end;
        final double open, high, low, close;
        final boolean completed;
        Candle(long start, long end, double open, double high, double low, double close, boolean completed) {
            this.start = start; this.end = end; this.open = open; this.high = high; this.low = low; this.close = close;
            this.completed = completed;
        }
    }

    static final class Snapshot {
        final List<Candle> completed;
        final Candle current;
        Snapshot(List<Candle> completed, Candle current) {
            this.completed = Collections.unmodifiableList(completed);
            this.current = current;
        }
    }

    private final TradingViewTimeEngine clock;
    private final long interval;
    private final String instrument;
    private final int maxCompleted;

    HtfCandleBuilder(TradingViewTimeEngine clock, long interval, String instrument, int maxCompleted) {
        this.clock = clock;
        this.interval = interval;
        this.instrument = instrument;
        this.maxCompleted = Math.max(1, maxCompleted);
    }

    Snapshot build(List<SourceBar> bars) {
        List<Candle> completed = new ArrayList<>();
        if (bars == null || bars.isEmpty()) return new Snapshot(completed, null);

        long activeStart = Long.MIN_VALUE;
        long activeEnd = Long.MIN_VALUE;
        double open = 0, high = 0, low = 0, close = 0;

        for (SourceBar bar : bars) {
            if (bar == null || bar.time <= 0) continue;
            long bucketStart = clock.start(bar.time, interval, instrument);
            long bucketEnd = clock.end(bucketStart, interval);
            if (activeStart == Long.MIN_VALUE || bucketStart != activeStart) {
                if (activeStart != Long.MIN_VALUE) {
                    completed.add(new Candle(activeStart, activeEnd, open, high, low, close, true));
                    if (completed.size() > maxCompleted) completed.remove(0);
                }
                activeStart = bucketStart;
                activeEnd = bucketEnd;
                open = bar.open; high = bar.high; low = bar.low; close = bar.close;
            } else {
                high = Math.max(high, bar.high);
                low = Math.min(low, bar.low);
                close = bar.close;
            }
        }

        Candle current = activeStart == Long.MIN_VALUE ? null
                : new Candle(activeStart, activeEnd, open, high, low, close, false);
        return new Snapshot(completed, current);
    }
}
