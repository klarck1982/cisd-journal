package com.dukascopy.indicators;

import com.dukascopy.api.IBar;
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
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.Shape;
import java.awt.Stroke;
import java.util.List;
import java.util.Map;

/**
 * V2 research tool. It intentionally draws no HTF candles.
 * It reveals the actual JForex calculate/draw lifecycle before V2 renderer
 * code is allowed back onto a chart.
 */
public class V2LifecycleDiagnostic implements IIndicator, IDrawingIndicator {
    private IBar[] bars;
    private double[] output;
    private IndicatorInfo info;
    private InputParameterInfo[] inputInfo;
    private OutputParameterInfo[] outputInfo;
    private volatile String frameInfo = "Waiting for calculation";
    private int redrawToken = 0;

    @Override public void onStart(IIndicatorContext context) {
        info = new IndicatorInfo("V2LifecycleDiagnostic", "V2 Lifecycle Diagnostic", "CISD V2 Research", true, false, false, 1, 0, 1);
        info.setRecalculateAll(true);
        info.setRecalculateOnNewCandleOnly(false);
        inputInfo = new InputParameterInfo[]{new InputParameterInfo("Chart Bars", InputParameterInfo.Type.BAR)};
        outputInfo = new OutputParameterInfo[]{new OutputParameterInfo("Anchor", OutputParameterInfo.Type.DOUBLE, OutputParameterInfo.DrawingStyle.LINE)};
        outputInfo[0].setDrawnByIndicator(true);
        outputInfo[0].setShowOutput(true);
        outputInfo[0].setColor(new Color(0, 0, 0, 0));
    }

    @Override public IndicatorResult calculate(int startIndex, int endIndex) {
        if (bars == null || bars.length == 0 || startIndex > endIndex) return new IndicatorResult(0, 0);
        int count = endIndex - startIndex + 1;
        if (output == null || output.length != count) output = new double[count];
        for (int i = 0; i < count; i++) output[i] = bars[startIndex + i].getClose();
        long first = bars[0].getTime();
        long last = bars[Math.min(endIndex, bars.length - 1)].getTime();
        frameInfo = "calculate: start=" + startIndex + " end=" + endIndex + " inputBars=" + bars.length
                + " first=" + first + " last=" + last;
        return new IndicatorResult(startIndex, count);
    }

    @Override public Point drawOutput(Graphics g, int outputIdx, Object values, Color color, Stroke stroke,
                                      IIndicatorDrawingSupport support, List<Shape> shapes, Map<Color, List<Point>> handles) {
        if (outputIdx != 0) return null;
        Graphics2D g2 = (Graphics2D) g;
        g2.setFont(g2.getFont().deriveFont(Font.BOLD, 11f));
        g2.setColor(new Color(20, 25, 35, 220));
        g2.fillRect(10, 25, Math.min(support.getChartWidth() - 20, 680), 48);
        g2.setColor(Color.WHITE);
        g2.drawString("V2 diagnostic redraw=" + (++redrawToken) + " visible=" + support.getNumberOfCandlesOnScreen()
                + " supportBars=" + support.getCandles().length, 18, 44);
        g2.drawString(frameInfo, 18, 63);
        return null;
    }

    @Override public IndicatorInfo getIndicatorInfo() { return info; }
    @Override public InputParameterInfo getInputParameterInfo(int i) { return inputInfo[i]; }
    @Override public OptInputParameterInfo getOptInputParameterInfo(int i) { return null; }
    @Override public OutputParameterInfo getOutputParameterInfo(int i) { return outputInfo[i]; }
    @Override public void setInputParameter(int i, Object value) { bars = (IBar[]) value; }
    @Override public void setOptInputParameter(int i, Object value) { }
    @Override public void setOutputParameter(int i, Object value) { output = (double[]) value; }
    @Override public int getLookback() { return 0; }
    @Override public int getLookforward() { return 0; }
}
