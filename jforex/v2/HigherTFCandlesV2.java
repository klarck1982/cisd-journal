package com.dukascopy.indicators;

import com.dukascopy.api.IBar;
import com.dukascopy.api.ITimedData;
import com.dukascopy.api.indicators.IDrawingIndicator;
import com.dukascopy.api.indicators.IIndicator;
import com.dukascopy.api.indicators.IIndicatorContext;
import com.dukascopy.api.indicators.IIndicatorDrawingSupport;
import com.dukascopy.api.indicators.IndicatorInfo;
import com.dukascopy.api.indicators.IndicatorResult;
import com.dukascopy.api.indicators.InputParameterInfo;
import com.dukascopy.api.indicators.OptInputParameterInfo;
import com.dukascopy.api.indicators.OutputParameterInfo;
import java.awt.Color;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.Shape;
import java.awt.Stroke;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.Collections;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.awt.BasicStroke;
import java.awt.Font;
import java.awt.Rectangle;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.TimeZone;

/**
 * Visual-only V2. No CISD, files, sounds or desktop integration are permitted
 * until HTF candles match the Pine reference in live visual testing.
 */
public class HigherTFCandlesV2 implements IIndicator, IDrawingIndicator {
    private static final long[] INTERVALS = {
        15L * 60 * 1000, 30L * 60 * 1000, 60L * 60 * 1000,
        4L * 60 * 60 * 1000, 24L * 60 * 60 * 1000, 7L * 24 * 60 * 60 * 1000
    };
    private static final String[] LABELS = {"15m", "30m", "1H", "4H", "D", "W"};
    private IIndicatorContext context;
    private IBar[] bars;
    private Object[] outputs = new Object[1];
    private IndicatorInfo info;
    private InputParameterInfo[] inputs;
    private OutputParameterInfo[] outputInfo;
    private V2HtfPipeline pipeline;
    private String pipelineInstrument = "";
    private volatile VisualFrame frame;

    private static final class VisualFrame {
        final String instrument;
        final long sourceLastBarTime;
        final HtfCandleBuilder.Snapshot[] layers;
        VisualFrame(String instrument, long sourceLastBarTime, HtfCandleBuilder.Snapshot[] layers) {
            this.instrument = instrument;
            this.sourceLastBarTime = sourceLastBarTime;
            this.layers = layers;
        }
    }

    @Override public void onStart(IIndicatorContext context) {
        this.context = context;
        info = new IndicatorInfo("HigherTFCandlesV2", "HTF Candles V2 — Visual Test", "CISD V2", true, false, false, 1, 0, 1);
        info.setRecalculateAll(true);
        inputs = new InputParameterInfo[]{new InputParameterInfo("Chart Bars", InputParameterInfo.Type.BAR)};
        outputInfo = new OutputParameterInfo[]{new OutputParameterInfo("V2 Canvas", OutputParameterInfo.Type.DOUBLE, OutputParameterInfo.DrawingStyle.LINE)};
        outputInfo[0].setDrawnByIndicator(true);
        outputInfo[0].setShowOutput(true);
        outputInfo[0].setColor(new Color(0, 0, 0, 0));
        // FeedDescriptor can be null during JForex onStart; bind the actual
        // instrument lazily in calculate when the feed is available.
        pipeline = new V2HtfPipeline(TradingViewTimeEngine.Profile.AUTO, 1, "");
    }

    @Override public IndicatorResult calculate(int startIndex, int endIndex) {
        if (bars == null || bars.length == 0 || endIndex < 0) return new IndicatorResult(0, 0);
        String instrument = context.getFeedDescriptor() == null ? "" : context.getFeedDescriptor().getInstrument().toString();
        if (!instrument.equals(pipelineInstrument)) {
            pipelineInstrument = instrument;
            pipeline = new V2HtfPipeline(TradingViewTimeEngine.Profile.AUTO, 1, instrument);
        }

        // Full input history is available because V2 explicitly requests
        // recalculateAll. Build every layer here, then atomically publish one
        // immutable frame for the renderer.
        HtfCandleBuilder.Snapshot[] next = new HtfCandleBuilder.Snapshot[INTERVALS.length];
        int sourceEnd = Math.min(endIndex, bars.length - 1);
        for (int i = 0; i < INTERVALS.length; i++) next[i] = pipeline.build(bars, sourceEnd, INTERVALS[i], 6);
        frame = new VisualFrame(instrument, bars[sourceEnd].getTime(), next);

        int length = endIndex - startIndex + 1;
        double[] canvas = outputs[0] instanceof double[] && ((double[]) outputs[0]).length == length ? (double[]) outputs[0] : new double[length];
        for (int i = 0; i < length; i++) canvas[i] = bars[startIndex + i].getClose();
        outputs[0] = canvas;
        return new IndicatorResult(startIndex, length);
    }

    @Override public Point drawOutput(Graphics g, int outputIdx, Object values, Color color, Stroke stroke,
                                      IIndicatorDrawingSupport support, List<Shape> shapes, Map<Color, List<Point>> handles) {
        if (outputIdx != 0) return null;
        Graphics2D g2 = (Graphics2D) g;
        VisualFrame current = frame;
        if (current == null) return null;
        V2HtfRenderer renderer = new V2HtfRenderer();
        int offset = 24;
        for (int i = 0; i < current.layers.length; i++) {
            HtfCandleBuilder.Snapshot snapshot = current.layers[i];
            if (snapshot == null || snapshot.current == null) continue;
            V2HtfRenderer.Style style = new V2HtfRenderer.Style(10, 4, offset,
                new Color(38, 178, 104, 220), new Color(214, 82, 82, 220),
                new Color(30, 35, 40), new Color(30, 35, 40), new Color(20, 24, 28), Color.WHITE);
            renderer.draw(g2, support, snapshot, formatLayerLabel(LABELS[i], snapshot), style);
            int count = snapshot.completed.size() + 1;
            offset += count * (style.candleWidth + style.candleGap) + 30;
        }
        return null;
    }

    private String formatLayerLabel(String label, HtfCandleBuilder.Snapshot snapshot) {
        TimeZone zone = TimeZone.getTimeZone("GMT-04:00");
        if ("D".equals(label) || "W".equals(label)) {
            SimpleDateFormat date = new SimpleDateFormat("dd MMM");
            date.setTimeZone(zone);
            return label + "  " + date.format(new Date(snapshot.current.start)) + "→" + date.format(new Date(snapshot.current.end));
        }
        SimpleDateFormat time = new SimpleDateFormat("HH:mm");
        time.setTimeZone(zone);
        return label + "  " + time.format(new Date(snapshot.current.start)) + "→" + time.format(new Date(snapshot.current.end));
    }

    @Override public IndicatorInfo getIndicatorInfo() { return info; }
    @Override public InputParameterInfo getInputParameterInfo(int i) { return inputs[i]; }
    @Override public OptInputParameterInfo getOptInputParameterInfo(int i) { return null; }
    @Override public OutputParameterInfo getOutputParameterInfo(int i) { return outputInfo[i]; }
    // V2 visual phase has no user options yet, but JForex requires this hook.
    @Override public void setOptInputParameter(int i, Object value) { }
    @Override public void setInputParameter(int i, Object value) { bars = (IBar[]) value; }
    @Override public void setOutputParameter(int i, Object value) { outputs[i] = value; }
    @Override public int getLookback() { return 0; }
    @Override public int getLookforward() { return 0; }
}


/**
 * Pure timing engine for HigherTFCandles V2.
 *
 * It deliberately has no JForex drawing, CISD, sound or file access. That
 * makes time boundaries testable before they are allowed to affect a chart.
 */
final class TradingViewTimeEngine {
    enum Profile { AUTO, GOLD, FX_INDEX, CUSTOM }

    static final ZoneId DISPLAY_UTC_MINUS_4 = ZoneId.of("Etc/GMT+4");
    static final ZoneId DAILY_NEW_YORK = ZoneId.of("America/New_York");

    private final Profile profile;
    private final int custom4HAnchor;

    TradingViewTimeEngine(Profile profile, int custom4HAnchor) {
        this.profile = profile == null ? Profile.AUTO : profile;
        this.custom4HAnchor = Math.max(0, Math.min(3, custom4HAnchor));
    }

    int fourHourAnchor(String instrument) {
        if (profile == Profile.GOLD) return 2;
        if (profile == Profile.FX_INDEX) return 1;
        if (profile == Profile.CUSTOM) return custom4HAnchor;
        return instrument != null && instrument.toUpperCase().contains("XAU") ? 2 : 1;
    }

    long start(long epochMillis, long intervalMillis, String instrument) {
        if (intervalMillis == 24L * 60 * 60 * 1000) return dailyStart(epochMillis);
        if (intervalMillis == 7L * 24 * 60 * 60 * 1000) return weeklyStart(epochMillis);

        ZonedDateTime time = Instant.ofEpochMilli(epochMillis).atZone(DISPLAY_UTC_MINUS_4);
        ZonedDateTime midnight = time.toLocalDate().atStartOfDay(DISPLAY_UTC_MINUS_4);
        long anchor = intervalMillis == 4L * 60 * 60 * 1000 ? fourHourAnchor(instrument) * 60L * 60 * 1000 : 0;
        long elapsed = epochMillis - midnight.toInstant().toEpochMilli() - anchor;
        if (elapsed < 0) elapsed += 24L * 60 * 60 * 1000;
        long result = midnight.toInstant().toEpochMilli() + anchor + (elapsed / intervalMillis) * intervalMillis;
        return result > epochMillis ? result - intervalMillis : result;
    }

    long end(long startMillis, long intervalMillis) {
        if (intervalMillis < 24L * 60 * 60 * 1000) return startMillis + intervalMillis;
        ZonedDateTime start = Instant.ofEpochMilli(startMillis).atZone(DAILY_NEW_YORK);
        return start.plusDays(intervalMillis == 24L * 60 * 60 * 1000 ? 1 : 7).toInstant().toEpochMilli();
    }

    private long dailyStart(long epochMillis) {
        ZonedDateTime time = Instant.ofEpochMilli(epochMillis).atZone(DAILY_NEW_YORK);
        return time.toLocalDate().atStartOfDay(DAILY_NEW_YORK).toInstant().toEpochMilli();
    }

    private long weeklyStart(long epochMillis) {
        ZonedDateTime time = Instant.ofEpochMilli(epochMillis).atZone(DAILY_NEW_YORK);
        int back = (time.getDayOfWeek().getValue() - DayOfWeek.MONDAY.getValue() + 7) % 7;
        return time.toLocalDate().minusDays(back).atStartOfDay(DAILY_NEW_YORK).toInstant().toEpochMilli();
    }
}


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


/** Draws immutable V2 snapshots. It never mutates candle data. */
final class V2HtfRenderer {
    static final class Style {
        final int candleWidth, candleGap, rightOffset;
        final Color bullBody, bearBody, bullWick, bearWick, border, label;
        Style(int candleWidth, int candleGap, int rightOffset, Color bullBody, Color bearBody,
              Color bullWick, Color bearWick, Color border, Color label) {
            this.candleWidth = candleWidth; this.candleGap = candleGap; this.rightOffset = rightOffset;
            this.bullBody = bullBody; this.bearBody = bearBody; this.bullWick = bullWick;
            this.bearWick = bearWick; this.border = border; this.label = label;
        }
    }

    void draw(Graphics2D g, IIndicatorDrawingSupport support, HtfCandleBuilder.Snapshot snapshot,
              String label, Style style) {
        if (snapshot == null || snapshot.current == null) return;
        List<HtfCandleBuilder.Candle> candles = new ArrayList<>(snapshot.completed);
        candles.add(snapshot.current);
        int chartRight = support.getChartWidth() - style.rightOffset;
        int total = candles.size();
        g.setFont(g.getFont().deriveFont(Font.BOLD, 10f));
        int labelX = chartRight - total * (style.candleWidth + style.candleGap);
        int labelWidth = g.getFontMetrics().stringWidth(label) + 10;
        g.setColor(new Color(20, 25, 30, 190));
        g.fillRoundRect(labelX - 5, 9, labelWidth, 16, 5, 5);
        g.setColor(style.label);
        g.drawString(label, labelX, 21);

        for (int i = 0; i < total; i++) {
            HtfCandleBuilder.Candle candle = candles.get(i);
            int x = chartRight - (total - i) * (style.candleWidth + style.candleGap);
            int yHigh = (int) support.getYForValue(candle.high);
            int yLow = (int) support.getYForValue(candle.low);
            int yOpen = (int) support.getYForValue(candle.open);
            int yClose = (int) support.getYForValue(candle.close);
            boolean bull = candle.close >= candle.open;
            int top = Math.min(yOpen, yClose);
            int bottom = Math.max(yOpen, yClose);
            int center = x + style.candleWidth / 2;
            g.setColor(bull ? style.bullWick : style.bearWick);
            g.setStroke(new BasicStroke(1f));
            g.drawLine(center, yHigh, center, yLow);
            g.setColor(bull ? style.bullBody : style.bearBody);
            g.fillRect(x, top, style.candleWidth, Math.max(1, bottom - top));
            g.setColor(style.border);
            g.draw(new Rectangle(x, top, style.candleWidth, Math.max(1, bottom - top)));
        }
    }
}
