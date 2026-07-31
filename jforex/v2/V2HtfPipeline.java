package com.dukascopy.indicators;

import com.dukascopy.api.IBar;
import java.util.ArrayList;
import java.util.List;

/** Bridge between JForex bars and V2's pure HTF candle snapshots. */
final class V2HtfPipeline {
    private final TradingViewTimeEngine clock;
    private final String instrument;

    V2HtfPipeline(TradingViewTimeEngine.Profile profile, int custom4HAnchor, String instrument) {
        this.clock = new TradingViewTimeEngine(profile, custom4HAnchor);
        this.instrument = instrument;
    }

    HtfCandleBuilder.Snapshot build(IBar[] bars, int endIndex, long interval, int maxCompleted) {
        List<HtfCandleBuilder.SourceBar> source = new ArrayList<>();
        for (int i = 0; bars != null && i <= endIndex && i < bars.length; i++) {
            IBar bar = bars[i];
            if (bar == null || bar.getTime() <= 0) continue;
            source.add(new HtfCandleBuilder.SourceBar(bar.getTime(), bar.getOpen(), bar.getHigh(), bar.getLow(), bar.getClose()));
        }
        return new HtfCandleBuilder(clock, interval, instrument, maxCompleted).build(source);
    }
}
