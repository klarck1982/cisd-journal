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
import com.dukascopy.api.indicators.IntegerListDescription;
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
    private OptInputParameterInfo[] optInfo;
    private final boolean[] layerEnabled = {true, true, true, true, true, true};
    // 0 = Auto, 1..6 = 15m..W, 7 = Off.
    private int closureFocus = 0;
    private V2HtfPipeline pipeline;
    private String pipelineInstrument = "";
    private volatile VisualFrame frame;

    private static final class VisualFrame {
        final String instrument;
        final long sourceLastBarTime;
        final long marketClockTime;
        final long baseInterval;
        final HtfCandleBuilder.Snapshot[] layers;
        VisualFrame(String instrument, long sourceLastBarTime, long marketClockTime, long baseInterval, HtfCandleBuilder.Snapshot[] layers) {
            this.instrument = instrument;
            this.sourceLastBarTime = sourceLastBarTime;
            this.marketClockTime = marketClockTime;
            this.baseInterval = baseInterval;
            this.layers = layers;
        }
    }

    @Override public void onStart(IIndicatorContext context) {
        this.context = context;
        info = new IndicatorInfo("HigherTFCandlesV2", "HTF Candles V2 — Visual Test", "CISD V2", true, false, false, 1, 7, 1);
        info.setRecalculateAll(true);
        int[] layerValues = {0, 1};
        String[] layerNames = {"Off", "On"};
        optInfo = new OptInputParameterInfo[7];
        for (int i = 0; i < 6; i++)
            optInfo[i] = new OptInputParameterInfo("[V2] Show " + LABELS[i], OptInputParameterInfo.Type.OTHER,
                new IntegerListDescription(1, layerValues, layerNames));
        optInfo[6] = new OptInputParameterInfo("[V2] Candle Closure Focus", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(0, new int[]{0,1,2,3,4,5,6,7}, new String[]{"Auto","15m","30m","1H","4H","Daily","Weekly","Off"}));
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
        long baseInterval = context.getFeedDescriptor() == null ? 0 : context.getFeedDescriptor().getPeriod().getInterval();
        for (int i = 0; i < INTERVALS.length; i++) {
            // Like Pine ValidTimeframe: an HTF visual must be higher than the
            // chart's source period. Lower TF candles cannot be reconstructed
            // honestly from a higher-TF source bar.
            if (!layerEnabled[i]) continue;
            if (baseInterval > 0 && INTERVALS[i] <= baseInterval) continue;
            next[i] = pipeline.build(bars, sourceEnd, INTERVALS[i], 6);
        }
        long marketClock = System.currentTimeMillis();
        try {
            long tickTime = context.getHistory().getTimeOfLastTick(context.getFeedDescriptor().getInstrument());
            if (tickTime > 0) marketClock = tickTime;
        } catch (Exception ignored) { }
        frame = new VisualFrame(instrument, bars[sourceEnd].getTime(), marketClock, baseInterval, next);

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
        // Match Basic: Candle Closure belongs to one focus layer only — the
        // nearest valid HTF — so all vertical intervals have one cadence.
        int focusIndex = closureFocus == 0 ? -1 : closureFocus - 1;
        if (closureFocus != 7) {
            if (focusIndex >= 0 && focusIndex < current.layers.length && current.layers[focusIndex] != null)
                renderer.drawClosureSeries(g2, support, current.layers[focusIndex], new Color(105, 165, 255, 95));
            else if (focusIndex < 0) {
                for (int focus = 0; focus < current.layers.length; focus++) {
                    if (current.layers[focus] != null && current.layers[focus].current != null) {
                        renderer.drawClosureSeries(g2, support, current.layers[focus], new Color(105, 165, 255, 95));
                        break;
                    }
                }
            }
        }
        int offset = 24;
        // Render ascending HTF order from left to right: 4H → D → W on a 1H chart.
        for (int i = current.layers.length - 1; i >= 0; i--) {
            HtfCandleBuilder.Snapshot snapshot = current.layers[i];
            if (snapshot == null || snapshot.current == null) continue;
            V2HtfRenderer.Style style = new V2HtfRenderer.Style(10, 4, offset,
                new Color(38, 178, 104, 220), new Color(214, 82, 82, 220),
                new Color(30, 35, 40), new Color(30, 35, 40), new Color(20, 24, 28), Color.WHITE);
            renderer.drawClosure(g2, support, snapshot, new Color(105, 165, 255, 95));
            renderer.draw(g2, support, snapshot, formatLayerLabel(LABELS[i], snapshot) + formatRemaining(snapshot, current.marketClockTime), style);
            int count = snapshot.completed.size() + 1;
            offset += count * (style.candleWidth + style.candleGap) + 30;
        }
        return null;
    }

    private String formatRemaining(HtfCandleBuilder.Snapshot snapshot, long marketClockTime) {
        long remaining = snapshot.current.end - marketClockTime;
        long duration = snapshot.current.end - snapshot.current.start;
        // Historical charts and Replay must not show a fake wall-clock countdown.
        if (remaining <= 0 || remaining > duration) return "";
        long hours = remaining / (60L * 60 * 1000);
        long minutes = (remaining / (60L * 1000)) % 60;
        long seconds = (remaining / 1000) % 60;
        return "\n(" + String.format("%02d:%02d:%02d", hours, minutes, seconds) + ")";
    }

    private String formatLayerLabel(String label, HtfCandleBuilder.Snapshot snapshot) {
        TimeZone zone = TimeZone.getTimeZone("GMT-04:00");
        if ("D".equals(label) || "W".equals(label)) {
            SimpleDateFormat date = new SimpleDateFormat("dd MMM");
            date.setTimeZone(zone);
            return label + "\n" + date.format(new Date(snapshot.current.start)) + "→" + date.format(new Date(snapshot.current.end));
        }
        SimpleDateFormat time = new SimpleDateFormat("HH:mm");
        time.setTimeZone(zone);
        return label + "\n" + time.format(new Date(snapshot.current.start)) + "→" + time.format(new Date(snapshot.current.end));
    }

    @Override public IndicatorInfo getIndicatorInfo() { return info; }
    @Override public InputParameterInfo getInputParameterInfo(int i) { return inputs[i]; }
    @Override public OptInputParameterInfo getOptInputParameterInfo(int i) { return optInfo[i]; }
    @Override public OutputParameterInfo getOutputParameterInfo(int i) { return outputInfo[i]; }
    @Override public void setOptInputParameter(int i, Object value) {
        if (i >= 0 && i < 6) layerEnabled[i] = ((Integer) value) == 1;
        else if (i == 6) closureFocus = (Integer) value;
    }
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
    static final int DAILY_NATIVE_UTC4_HOUR = 18;

    private final Profile profile;
    private final int custom4HAnchor;

    TradingViewTimeEngine(Profile profile, int custom4HAnchor) {
        this.profile = profile == null ? Profile.AUTO : profile;
        this.custom4HAnchor = Math.max(0, Math.min(3, custom4HAnchor));
    }

    static final class SessionWindow {
        final long start, end;
        SessionWindow(long start, long end) { this.start = start; this.end = end; }
        boolean contains(long time) { return time >= start && time < end; }
    }

    private int dailyStartHour(String instrument) {
        String value = instrument == null ? "" : instrument.toUpperCase();
        return value.contains("EUR") ? 17 : 18;
    }

    private int dailyEndHour(String instrument) { return 16; }

    SessionWindow dailySession(long epochMillis, String instrument) {
        ZonedDateTime time = Instant.ofEpochMilli(epochMillis).atZone(DISPLAY_UTC_MINUS_4);
        int startHour = dailyStartHour(instrument);
        ZonedDateTime start = time.toLocalDate().atTime(startHour, 0).atZone(DISPLAY_UTC_MINUS_4);
        if (start.toInstant().toEpochMilli() > epochMillis) start = start.minusDays(1);
        ZonedDateTime end = start.toLocalDate().plusDays(1).atTime(dailyEndHour(instrument), 0).atZone(DISPLAY_UTC_MINUS_4);
        return new SessionWindow(start.toInstant().toEpochMilli(), end.toInstant().toEpochMilli());
    }

    boolean includes(long epochMillis, long intervalMillis, String instrument) {
        return intervalMillis != 24L * 60 * 60 * 1000 || dailySession(epochMillis, instrument).contains(epochMillis);
    }

    int fourHourAnchor(String instrument) {
        if (profile == Profile.GOLD) return 2;
        if (profile == Profile.FX_INDEX) return 1;
        if (profile == Profile.CUSTOM) return custom4HAnchor;
        return instrument != null && instrument.toUpperCase().contains("XAU") ? 2 : 1;
    }

    long start(long epochMillis, long intervalMillis, String instrument) {
        if (intervalMillis == 24L * 60 * 60 * 1000) return dailySession(epochMillis, instrument).start;
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
        if (intervalMillis == 24L * 60 * 60 * 1000) {
            // Start is a known session start; use its profile-defined close.
            ZonedDateTime start = Instant.ofEpochMilli(startMillis).atZone(DISPLAY_UTC_MINUS_4);
            String instrument = ""; // caller uses the matching session start; profile end is resolved in dailySession.
            int endHour = 16;
            return start.toLocalDate().plusDays(1).atTime(endHour, 0).atZone(DISPLAY_UTC_MINUS_4).toInstant().toEpochMilli();
        }
        ZonedDateTime start = Instant.ofEpochMilli(startMillis).atZone(DAILY_NEW_YORK);
        return start.plusDays(7).toInstant().toEpochMilli();
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
            if (!clock.includes(bar.time, interval, instrument)) continue;
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

    void drawClosureSeries(Graphics2D g, IIndicatorDrawingSupport support, HtfCandleBuilder.Snapshot snapshot, Color color) {
        if (snapshot == null || snapshot.current == null) return;
        List<HtfCandleBuilder.Candle> candles = new ArrayList<>(snapshot.completed);
        candles.add(snapshot.current);
        g.setColor(color);
        g.setStroke(new BasicStroke(1f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, new float[]{4f, 4f}, 0f));
        SimpleDateFormat clock = new SimpleDateFormat("HH:mm");
        clock.setTimeZone(TimeZone.getTimeZone("GMT-04:00"));
        g.setFont(g.getFont().deriveFont(Font.BOLD, 9f));
        for (int i = 0; i < candles.size(); i++) {
            HtfCandleBuilder.Candle candle = candles.get(i);
            int x = support.getXForTime(candle.start, false);
            if (x < 0 || x >= support.getChartWidth()) continue;
            g.drawLine(x, 76, x, support.getChartHeight());
            String text = "C" + (i + 1) + " " + clock.format(new Date(candle.start)) + "-" + clock.format(new Date(candle.end));
            g.drawString(text, x + 3, 73);
        }
        HtfCandleBuilder.Candle current = snapshot.current;
        int closeX = support.getXForTime(current.end, false);
        if (closeX >= 0 && closeX < support.getChartWidth()) g.drawLine(closeX, 76, closeX, support.getChartHeight());
    }

    void drawClosure(Graphics2D g, IIndicatorDrawingSupport support, HtfCandleBuilder.Snapshot snapshot, Color color) {
        if (snapshot == null || snapshot.current == null) return;
        int startX = support.getXForTime(snapshot.current.start, false);
        int endX = support.getXForTime(snapshot.current.end, false);
        g.setColor(color);
        g.setStroke(new BasicStroke(1f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, new float[]{4f, 4f}, 0f));
        if (startX >= 0 && startX < support.getChartWidth()) g.drawLine(startX, 76, startX, support.getChartHeight());
        if (endX >= 0 && endX < support.getChartWidth()) g.drawLine(endX, 76, endX, support.getChartHeight());
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
        String[] labelLines = label.split("\n");
        int labelWidth = 0;
        for (String line : labelLines) labelWidth = Math.max(labelWidth, g.getFontMetrics().stringWidth(line));
        int lineHeight = g.getFontMetrics().getHeight();
        int labelHeight = labelLines.length * lineHeight + 8;
        g.setColor(new Color(20, 25, 30, 190));
        g.fillRoundRect(labelX - 5, 7, labelWidth + 10, labelHeight, 5, 5);
        g.setColor(style.label);
        for (int line = 0; line < labelLines.length; line++)
            g.drawString(labelLines[line], labelX, 7 + g.getFontMetrics().getAscent() + line * lineHeight);

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
