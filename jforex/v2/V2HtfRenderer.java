package com.dukascopy.indicators;

import com.dukascopy.api.indicators.IIndicatorDrawingSupport;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.util.ArrayList;
import java.util.List;

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
        g.setColor(style.label);
        g.drawString(label, chartRight - total * (style.candleWidth + style.candleGap), 18);

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
