package com.dukascopy.indicators;

import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.Stroke;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;

import javax.sound.sampled.*;

import com.dukascopy.api.*;
import com.dukascopy.api.indicators.*;

public class HigherTFCandles implements IIndicator, IDrawingIndicator {

    private IIndicatorContext context;

    // ---------- Constants ----------
    private static final int MAX_CANDLES = 10;
    private static final int MAX_LAYERS = 3;
    private static final int MAX_CISD_STORED = 3;

    private static final int PERIOD_COUNT = 6;
    private static final long[] PERIOD_INTERVALS = {
        15 * 60 * 1000L,
        30 * 60 * 1000L,
        60 * 60 * 1000L,
        4 * 60 * 60 * 1000L,
        24 * 60 * 60 * 1000L,
        7 * 60 * 60 * 1000L
    };
    private static final String[] PERIOD_NAMES = {
        "15 Mins", "30 Mins", "1 Hour", "4 Hours", "Daily", "7 Hours"
    };
    private static final String[] SHORT_LABELS = {
        "15m", "30m", "1H", "4H", "D", "7H"
    };

    // ---------- SMT Divergence (Pivot-based) ----------
    private static final String[] SMT_INSTRUMENTS = {
        "USATECH.IDX/USD", "USA500.IDX/USD", "USA30.IDX/USD",
        "EUR/USD", "GBP/USD",
        "XAU/USD", "XAU/EUR"
    };
    private static final Color SMT_BULLISH_COLOR = new Color(0, 200, 50, 200);
    private static final Color SMT_BEARISH_COLOR = new Color(255, 60, 60, 200);
    private static final Stroke SMT_LINE_STROKE = new BasicStroke(1.5f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, new float[]{6f, 4f}, 0f);
    private static final int SMT_LOOKBACK = 50; // candles to search for pivots
    // --------------------------------------------

    private static final int[] POSITION_VALUES = {0, 1, 2};
    private static final String[] POSITION_NAMES = {"Left", "Overlap", "Right"};
    private static final int[] BOOLEAN_VALUES = {0, 1};
    private static final String[] BOOLEAN_NAMES = {"No", "Yes"};
    private static final int[] SESSION_FILTER_VALUES = {0, 1, 2, 3};
    private static final String[] SESSION_FILTER_NAMES = {"All", "London + NY", "London Only", "NY Only"};
    // MIN_RR_VALUES and MIN_RR_NAMES REMOVED
    private static final int[] TIMEZONE_VALUES = {0, 1, 2, 3, 4, 5};
    private static final String[] TIMEZONE_NAMES = {"GMT", "EET", "New York", "Brussels", "GMT+3 (TradingView)", "UTC-4 (TradingView)"};
    private static final int[] HTF_PROFILE_VALUES = {0, 1, 2, 3};
    private static final String[] HTF_PROFILE_NAMES = {"Auto by Instrument", "Gold", "FX / Index", "Custom"};
    private static final String[] SOUND_FILES = {"alert.wav", "retest.wav", "None"};
    private static final String[] SOUND_NAMES = {"alert.wav", "retest.wav", "None"};
    private static final int[] CISD_SENSITIVITY_VALUES = {0, 1, 2};
    private static final String[] CISD_SENSITIVITY_NAMES = {"Low (min 3 candles)", "Medium (min 2 candles)", "High (min 1 candle)"};

    // CISD Grade: auto-configure filters presets
    private static final int[] CISD_GRADE_VALUES = {0, 1, 2};
    private static final String[] CISD_GRADE_NAMES = {"Standard", "Premium", "Ultimate"};

    private static final int[] CANDLE_COLOR_SCHEME_VALUES = {0, 1};
    private static final String[] CANDLE_COLOR_SCHEME_NAMES = {"Green + Black", "White + Black"};

    private static final int[] MOMENTUM_FILTER_VALUES = {0, 1, 2, 3};
    private static final String[] MOMENTUM_FILTER_NAMES = {"Off", "Low", "Medium", "High"};
    private static final int[] VOLUME_FILTER_VALUES = {0, 1};
    private static final String[] VOLUME_FILTER_NAMES = {"No", "Yes"};

    private static final int[] TREND_FILTER_VALUES = {0, 1, 2};
    private static final String[] TREND_FILTER_NAMES = {"Off", "EMA 50", "EMA 200"};

    private static final int[] HIGHER_TF_CONFIRMATION_VALUES = {0, 1, 2, 3};
    private static final String[] HIGHER_TF_CONFIRMATION_NAMES = {"Off", "Layer 1", "Layer 2", "Layer 3"};

    private static final int[] HORIZONTAL_LEVELS_VALUES = {0, 1, 2};
    private static final String[] HORIZONTAL_LEVELS_NAMES = {"PDH/PDL", "HTF Swings", "Both"};

    private static final int[] RESET_STATS_VALUES = {0, 1};
    private static final String[] RESET_STATS_NAMES = {"No", "Reset"};

    private static final int[] FIB_RETRACEMENT_VALUES = {0, 1, 2, 3, 4};
    private static final String[] FIB_RETRACEMENT_NAMES = {"None", "Fib 23.6%", "Fib 38.2%", "Fib 50%", "Fib 61.8%"};
    private static final double[] FIB_RATIOS = {0.0, 0.236, 0.382, 0.50, 0.618};

    private static final int[] MARKET_STRUCTURE_VALUES = {0, 1};
    private static final String[] MARKET_STRUCTURE_NAMES = {"Off", "On"};

    private static final int[] CLOSURE_SHADE_MODE_VALUES = {0, 1, 2};
    private static final String[] CLOSURE_SHADE_MODE_NAMES = {"No", "EQ Only", "Balance Rebound"};

    private static final int[] EQ_LAYER_VALUES = {0, 1, 2, 3};
    private static final String[] EQ_LAYER_NAMES = {"None", "Layer 1", "Layer 2", "Layer 3"};

    private static final int[] MAX_HISTORY_SHADES_VALUES = {1, 2, 3, 4, 5, 6};
    private static final String[] MAX_HISTORY_SHADES_NAMES = {"1", "2", "3", "4", "5", "6"};

    private static final Color[] CLOSURE_COLORS = {
        Color.BLUE, Color.RED, Color.GREEN, Color.GRAY, Color.BLACK,
        Color.WHITE, Color.ORANGE, Color.MAGENTA, Color.CYAN, Color.PINK,
        Color.YELLOW, Color.DARK_GRAY, Color.LIGHT_GRAY, new Color(128,0,128), new Color(0,128,128)
    };
    private static final String[] CLOSURE_COLOR_NAMES = {
        "Blue", "Red", "Green", "Gray", "Black",
        "White", "Orange", "Magenta", "Cyan", "Pink",
        "Yellow", "Dark Gray", "Light Gray", "Purple", "Teal"
    };
    private static final int[] LINE_STYLES = {0, 1, 2};
    private static final String[] LINE_STYLE_NAMES = {"Solid", "Dashed", "Dotted"};

    private static final Color EP_COLOR = new Color(0, 150, 255);
    private static final Color SL_COLOR = new Color(255, 60, 60);
    private static final Color TP_COLOR = new Color(0, 180, 0);
    private Color BULLISH_BODY_COLOR = new Color(0, 180, 0);
    private Color BEARISH_BODY_COLOR = new Color(30, 30, 30);
    private static final Color BORDER_COLOR = Color.BLACK;
    private static final Color WICK_COLOR = Color.BLACK;

    // CISD line colors – new professional colors
    private static final Color CISD_BULLISH_COLOR = new Color(0, 120, 255);   // Blue
    private static final Color CISD_BEARISH_COLOR = new Color(255, 60, 60);  // Red
    private static final Color RETEST_COLOR = new Color(100, 150, 255);
    private static final Color STAR_COLOR = new Color(255, 215, 0);
    private static final Color HIGHER_TF_ALIGNED_COLOR = new Color(255, 215, 0);
    private static final Color LABEL_BG_COLOR = new Color(30, 30, 30, 220);

    private static final Color PDH_COLOR = new Color(180, 180, 180, 180);
    private static final Color PDL_COLOR = new Color(180, 180, 180, 180);
    private static final Color SWING_H_COLOR = new Color(220, 80, 80, 180);
    private static final Color SWING_L_COLOR = new Color(80, 120, 220, 180);

    // Candle Closure Shade colors - alpha set to 30
    private static final Color EQ_SHADE_BULLISH = new Color(0, 255, 0, 10);
    private static final Color EQ_SHADE_BEARISH = new Color(255, 0, 0, 10);
    private static final Color REBOUND_BULLISH_COLOR = new Color(0, 255, 0, 10);
    private static final Color REBOUND_BEARISH_COLOR = new Color(255, 0, 0, 10);

    private static final Object sharedFileLock = new Object();
    // smtFileLock REMOVED

    private interface OptInputSetter {
        void set(Object value);
    }
    private OptInputSetter[] optSetters;

    private static class LayerData {
        boolean enabled = false;
        int periodIndex = 0;
        int candlesToShow = 4;
        int positionOption = 2;
        int candleOffset = 5;
        // smtDetecting REMOVED
        List<CandleData> historicalCandles = new ArrayList<>();
        double currentOpen = Double.NaN, currentHigh = Double.NaN, currentLow = Double.NaN, currentClose = Double.NaN;
        long currentPeriodStart = 0;
        boolean currentCandleActive = false;
        boolean lsActive = false;
        double lsPrice = Double.NaN;
        long lsStartTime = 0, lsEndTime = 0;
        boolean lsBullish = true;
    }

    // SmtCandle and SmtSignal classes REMOVED

    private boolean showTimer = true;
    private boolean showClosure = true;
    private int closureColorIndex = 0;
    private int closureStyleIndex = 1;
    private int closureWidth = 1;
    private int closureShadeMode = 1;
    private int maxHistoryShades = 3;
    // showRiskReward field REMOVED
    private boolean showCISD = true;
    private String cisdAlertSound = "alert.wav";
    private String cisdRetestSound = "retest.wav";
    private int cisdSensitivity = 1;
    private boolean ignoreInsideBars = true;
    private int candleBodyScale = 100;
    private int candleColorScheme = 0;
    private int momentumFilter = 0;
    private boolean volumeFilterEnabled = false;
    private double minVolumeRatio = 1.2;
    // CISD Grade: 0=Standard(manual), 1=Premium(auto), 2=Ultimate(auto)
    private int cisdGrade = 0;

    private int chartTimezone = 5;
    // 4H opening profiles observed from the Pine/TradingView reference.
    private int htfTimingProfile = 0;
    private int custom4HAnchorHour = 1;
    private int layerSpacing = 3;
    // chartSpacing field REMOVED

    private boolean enableLog = false;
    private int activeSessions = 1;
    // minRRFilter field REMOVED

    private int trendFilter = 0;
    private int higherTFConfirmation = 0;
    private int horizontalLevelsMode = 0;
    private boolean showStatsPanel = true;
    private int resetStats = 0;
    private int minRetracement = 0;
    private int marketStructureFilter = 0;
    private int eqLineLayer = 0;

    private boolean smtEnabled = false;

    private LayerData[] layers = new LayerData[MAX_LAYERS];
    {
        for (int i = 0; i < MAX_LAYERS; i++) layers[i] = new LayerData();
        layers[0].enabled = true; layers[0].periodIndex = 3; layers[0].candlesToShow = 6; layers[0].candleOffset = 10;
        layers[1].enabled = true; layers[1].periodIndex = 5; layers[1].candlesToShow = 3;
        layers[2].enabled = true; layers[2].periodIndex = 4; layers[2].candlesToShow = 3;
    }

    private static class PendingCisdSetup {
        double triggerOpen, stopLevel;
        long waveStartTime;
        int waveStartIdx = -1;
        boolean active;
        PendingCisdSetup() { active = false; }
    }
    private PendingCisdSetup pendingBullish = new PendingCisdSetup();
    private PendingCisdSetup pendingBearish = new PendingCisdSetup();

    private int cisdStoredCount = 0;
    private long[] cisdStoredStartTimes = new long[MAX_CISD_STORED];
    private long[] cisdStoredEndTimes = new long[MAX_CISD_STORED];
    private double[] cisdStoredLevels = new double[MAX_CISD_STORED];
    private boolean[] cisdStoredBullish = new boolean[MAX_CISD_STORED];
    private double[] cisdStoredStopLevels = new double[MAX_CISD_STORED];
    private long[] cisdStoredActivationTime = new long[MAX_CISD_STORED];
    private long[] cisdStoredDeactivationTime = new long[MAX_CISD_STORED];
    private long[] cisdStoredBreakoutTime = new long[MAX_CISD_STORED];
    private boolean[] cisdStoredLogged = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredRetestPlayed = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredConfirmed = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredHigherTFAligned = new boolean[MAX_CISD_STORED];
    private String[] cisdStoredConfirmingTFLabel = new String[MAX_CISD_STORED];
    private boolean[] cisdStoredFibPassed = new boolean[MAX_CISD_STORED];
    private String[] cisdStoredFibLabel = new String[MAX_CISD_STORED];
    private boolean[] cisdStoredTrendPassed = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredMomentumPassed = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredVolumePassed = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredMarketStructurePassed = new boolean[MAX_CISD_STORED];
    private String[] cisdStoredFilterSymbols = new String[MAX_CISD_STORED];

    // New: store whether each filter was actually enabled at signal time
    private boolean[] cisdStoredTrendActive = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredFibActive = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredMSActive = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredHTFActive = new boolean[MAX_CISD_STORED];
    private boolean[] cisdStoredMomVolActive = new boolean[MAX_CISD_STORED];

    private long lastAlertStartTime = 0;
    private double lastAlertLevel = Double.NaN;
    private long lastChartPeriodMs = -1;
    private long latestBarTime = 0;
    private int lastCalculatedIndex = -1;
    private long lastCheckedRetestTime = 0;
    private long fibCacheWaveStart = -1;
    private double[] fibCacheResult = null;


    private static class CisdEntry {
        long startTime, endTime, activationTime, deactivationTime, breakoutTime;
        double level, stopLevel;
        boolean bullish, logged, retestPlayed, confirmed;
        boolean higherTFAligned; String confirmingTFLabel;
        boolean fibPassed; String fibLabel;
        boolean trendPassed, momentumPassed, volumePassed, marketStructurePassed;
        String filterSymbols;
        boolean trendActive, fibActive, msActive, htfActive, momVolActive;
        CisdEntry(long s, long e, double l, double sl, boolean b, long act, long deact, long brt,
                  boolean lg, boolean rp, boolean conf, boolean htf, String ctfl,
                  boolean fp, String fl, boolean tp, boolean mp, boolean vp, boolean msp, String fs,
                  boolean ta, boolean fa, boolean msa, boolean htfa, boolean mva) {
            startTime=s; endTime=e; level=l; stopLevel=sl; bullish=b;

            activationTime=act; deactivationTime=deact; breakoutTime=brt; logged=lg; retestPlayed=rp; confirmed=conf;
            higherTFAligned=htf; confirmingTFLabel=ctfl;
            fibPassed=fp; fibLabel=fl;
            trendPassed=tp; momentumPassed=mp; volumePassed=vp; marketStructurePassed=msp;
            filterSymbols=fs;
            trendActive=ta; fibActive=fa; msActive=msa; htfActive=htfa; momVolActive=mva;
        }
    }
    private Map<Long, List<CisdEntry>> cisdStorage = new HashMap<>();

    private List<String[]> smtSignals = new ArrayList<>();

    private IndicatorInfo indicatorInfo;
    private InputParameterInfo[] inputParameterInfos;
    private OptInputParameterInfo[] optInputParameterInfos;
    private OutputParameterInfo[] outputParameterInfos;
    private IBar[][] inputs = new IBar[1][];
    private Object[] outputs;
    private Calendar chartCalendar;
    private SimpleDateFormat nyTimeFormat, dayFormat;
    private TimeZone nyTimeZone;

    private boolean sharedCISDAlerts = true;
    private boolean showEntryPrice = true;
    private int maxSharedLines = 5;
    private List<String[]> sharedAlertLines = new ArrayList<>();

    private boolean saveLoadCISD = true;
    private boolean cisdLoaded = false;
    private Timer settingsSaveTimer = null;
    private long sharedFileLastModified = 0;
    // Decisions are written by CISD Journal, never into the original signal file.
    private final Map<String, String> journalDecisions = new HashMap<>();
    private long journalDecisionsLastModified = 0;

    @Override
    public void onStart(IIndicatorContext context) {
        this.context = context;
        outputs = new Object[MAX_CANDLES * 4];
        
        nyTimeZone = TimeZone.getTimeZone("America/New_York");
        nyTimeFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        nyTimeFormat.setTimeZone(nyTimeZone);
        dayFormat = new SimpleDateFormat("EEEE");
        dayFormat.setTimeZone(nyTimeZone);

        chartCalendar = Calendar.getInstance(getTimezone());

        inputParameterInfos = new InputParameterInfo[]{
            new InputParameterInfo("Chart Bars", InputParameterInfo.Type.BAR)
        };

        List<OptInputParameterInfo> optList = new ArrayList<>();
        List<OptInputSetter> setterList = new ArrayList<>();

        for (int l = 0; l < MAX_LAYERS; l++) {
            int ln = l + 1;
            final int layerIdx = l;
            optList.add(new OptInputParameterInfo("[Layer " + ln + "] Enable", OptInputParameterInfo.Type.OTHER,
                new IntegerListDescription(layers[l].enabled ? 1 : 0, BOOLEAN_VALUES, BOOLEAN_NAMES)));
            setterList.add(v -> layers[layerIdx].enabled = ((Integer) v) == 1);

            optList.add(new OptInputParameterInfo("[Layer " + ln + "] Timeframe", OptInputParameterInfo.Type.OTHER,
                new IntegerListDescription(layers[l].periodIndex, getPeriodIndexes(), PERIOD_NAMES)));
            setterList.add(v -> layers[layerIdx].periodIndex = (Integer) v);

            optList.add(new OptInputParameterInfo("[Layer " + ln + "] Candles", OptInputParameterInfo.Type.OTHER,
                new IntegerRangeDescription(layers[l].candlesToShow, 1, MAX_CANDLES, 1)));
            setterList.add(v -> layers[layerIdx].candlesToShow = (Integer) v);

            optList.add(new OptInputParameterInfo("[Layer " + ln + "] Position", OptInputParameterInfo.Type.OTHER,
                new IntegerListDescription(layers[l].positionOption, POSITION_VALUES, POSITION_NAMES)));
            setterList.add(v -> layers[layerIdx].positionOption = (Integer) v);

            optList.add(new OptInputParameterInfo("[Layer " + ln + "] Offset", OptInputParameterInfo.Type.OTHER,
                new IntegerRangeDescription(layers[l].candleOffset, 0, 50, 1)));
            setterList.add(v -> layers[layerIdx].candleOffset = (Integer) v);

            // [Layer " + ln + "] SMT Detecting optInput REMOVED
        }

        optList.add(new OptInputParameterInfo("[Display] Show Timer", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> showTimer = ((Integer) v) == 1);

        optList.add(new OptInputParameterInfo("[Display] Candle Body Scale (%)", OptInputParameterInfo.Type.OTHER,
            new IntegerRangeDescription(100, 50, 200, 10)));
        setterList.add(v -> candleBodyScale = (Integer) v);

        optList.add(new OptInputParameterInfo("[Display] Candle Color Scheme", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(0, CANDLE_COLOR_SCHEME_VALUES, CANDLE_COLOR_SCHEME_NAMES)));
        setterList.add(v -> {
            candleColorScheme = (Integer) v;
            applyColorSchemeFromSetting();
        });

        optList.add(new OptInputParameterInfo("[Display] Candle Closure", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> showClosure = ((Integer) v) == 1);

        optList.add(new OptInputParameterInfo("[Display] Closure Line Color", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(0, getColorIndexes(), CLOSURE_COLOR_NAMES)));
        setterList.add(v -> closureColorIndex = (Integer) v);

        optList.add(new OptInputParameterInfo("[Display] Closure Line Style", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, LINE_STYLES, LINE_STYLE_NAMES)));
        setterList.add(v -> closureStyleIndex = (Integer) v);

        optList.add(new OptInputParameterInfo("[Display] Closure Line Width", OptInputParameterInfo.Type.OTHER,
            new IntegerRangeDescription(1, 1, 5, 1)));
        setterList.add(v -> closureWidth = (Integer) v);

        optList.add(new OptInputParameterInfo("[Display] Candle Closure Shade", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(closureShadeMode, CLOSURE_SHADE_MODE_VALUES, CLOSURE_SHADE_MODE_NAMES)));
        setterList.add(v -> closureShadeMode = (Integer) v);

        optList.add(new OptInputParameterInfo("[Display] Max History Shades", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(maxHistoryShades, MAX_HISTORY_SHADES_VALUES, MAX_HISTORY_SHADES_NAMES)));
        setterList.add(v -> maxHistoryShades = (Integer) v);

        // [Display] Show Risk Reward optInput REMOVED

        optList.add(new OptInputParameterInfo("[Display] Show EQ Line", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(eqLineLayer, EQ_LAYER_VALUES, EQ_LAYER_NAMES)));
        setterList.add(v -> eqLineLayer = (Integer) v);

        optList.add(new OptInputParameterInfo("[Display] Show PDH/PDL & HTF Swings", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(horizontalLevelsMode, HORIZONTAL_LEVELS_VALUES, HORIZONTAL_LEVELS_NAMES)));
        setterList.add(v -> horizontalLevelsMode = (Integer) v);

        optList.add(new OptInputParameterInfo("[Display] Show Stats Panel", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(showStatsPanel ? 1 : 0, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> showStatsPanel = ((Integer) v) == 1);

        optList.add(new OptInputParameterInfo("[Display] Reset Statistics", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(0, RESET_STATS_VALUES, RESET_STATS_NAMES)));
        setterList.add(v -> {
            int val = (Integer) v;
            if (val == 1) saveSettings();
        });

        optList.add(new OptInputParameterInfo("[CISD] Reset CISD Signals", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(0, RESET_STATS_VALUES, RESET_STATS_NAMES)));
        setterList.add(v -> { if ((Integer) v == 1) resetCISDData(); });

        optList.add(new OptInputParameterInfo("[CISD] Momentum Filter", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(momentumFilter, MOMENTUM_FILTER_VALUES, MOMENTUM_FILTER_NAMES)));
        setterList.add(v -> momentumFilter = (Integer) v);

        optList.add(new OptInputParameterInfo("[CISD] Volume Filter", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(volumeFilterEnabled ? 1 : 0, VOLUME_FILTER_VALUES, VOLUME_FILTER_NAMES)));
        setterList.add(v -> volumeFilterEnabled = ((Integer) v) == 1);

        optList.add(new OptInputParameterInfo("[CISD] Trend Filter", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(trendFilter, TREND_FILTER_VALUES, TREND_FILTER_NAMES)));
        setterList.add(v -> trendFilter = (Integer) v);

        optList.add(new OptInputParameterInfo("[CISD] Higher TF Confirmation", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(higherTFConfirmation, HIGHER_TF_CONFIRMATION_VALUES, HIGHER_TF_CONFIRMATION_NAMES)));
        setterList.add(v -> higherTFConfirmation = (Integer) v);

        optList.add(new OptInputParameterInfo("[CISD] Min Retracement %", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(minRetracement, FIB_RETRACEMENT_VALUES, FIB_RETRACEMENT_NAMES)));
        setterList.add(v -> minRetracement = (Integer) v);

        optList.add(new OptInputParameterInfo("[CISD] Market Structure", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(marketStructureFilter, MARKET_STRUCTURE_VALUES, MARKET_STRUCTURE_NAMES)));
        setterList.add(v -> marketStructureFilter = (Integer) v);


        // --- CISD Grade: auto-preset for filters ---
        optList.add(new OptInputParameterInfo("[CISD] Grade", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(cisdGrade, CISD_GRADE_VALUES, CISD_GRADE_NAMES)));
        setterList.add(v -> {
            cisdGrade = (Integer) v;
            applyCisdGrade(cisdGrade);
        });
        optList.add(new OptInputParameterInfo("[CISD] Detection", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> showCISD = ((Integer) v) == 1);


        // --- SMT Detection ---
        optList.add(new OptInputParameterInfo("[SMT] Detection (Pivot-based)", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(smtEnabled ? 1 : 0, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> smtEnabled = ((Integer) v) == 1);

        optList.add(new OptInputParameterInfo("[CISD] Alert Sound", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(0, getSoundIndexes(), SOUND_NAMES)));
        setterList.add(v -> cisdAlertSound = SOUND_FILES[(Integer) v]);

        optList.add(new OptInputParameterInfo("[CISD] Retest Sound", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, getSoundIndexes(), SOUND_NAMES)));
        setterList.add(v -> cisdRetestSound = SOUND_FILES[(Integer) v]);

        optList.add(new OptInputParameterInfo("[CISD] Min Wave Length", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, CISD_SENSITIVITY_VALUES, CISD_SENSITIVITY_NAMES)));
        setterList.add(v -> cisdSensitivity = (Integer) v);

        optList.add(new OptInputParameterInfo("[CISD] Ignore Inside Bars", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> ignoreInsideBars = ((Integer) v) == 1);

        optList.add(new OptInputParameterInfo("[CISD] Save/Load CISD", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> saveLoadCISD = ((Integer) v) == 1);

        optList.add(new OptInputParameterInfo("[CISD] Shared CISD Alerts", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> sharedCISDAlerts = ((Integer) v) == 1);

        optList.add(new OptInputParameterInfo("[CISD] Max Shared Alerts", OptInputParameterInfo.Type.OTHER,
            new IntegerRangeDescription(5, 1, 5, 1)));
        setterList.add(v -> maxSharedLines = (Integer) v);

        optList.add(new OptInputParameterInfo("[CISD] Show Entry Price", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> showEntryPrice = ((Integer) v) == 1);

        optList.add(new OptInputParameterInfo("[Sessions/Log] Active Sessions", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(1, SESSION_FILTER_VALUES, SESSION_FILTER_NAMES)));
        setterList.add(v -> activeSessions = (Integer) v);

        optList.add(new OptInputParameterInfo("[Sessions/Log] Enable Log", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(0, BOOLEAN_VALUES, BOOLEAN_NAMES)));
        setterList.add(v -> {
            int val = (Integer) v;
            if (val == 1 && !enableLog) {
                resetCISDData();
            } else {
                enableLog = (val == 1);
            }
        });

        optList.add(new OptInputParameterInfo("[Advanced] Chart Timezone", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(5, TIMEZONE_VALUES, TIMEZONE_NAMES)));
        setterList.add(v -> {
            chartTimezone = (Integer) v;
            chartCalendar = Calendar.getInstance(getTimezone());
        });

        optList.add(new OptInputParameterInfo("[Advanced] TradingView 4H Profile", OptInputParameterInfo.Type.OTHER,
            new IntegerListDescription(htfTimingProfile, HTF_PROFILE_VALUES, HTF_PROFILE_NAMES)));
        setterList.add(v -> htfTimingProfile = (Integer) v);
        optList.add(new OptInputParameterInfo("[Advanced] Custom 4H Start Hour", OptInputParameterInfo.Type.OTHER,
            new IntegerRangeDescription(custom4HAnchorHour, 0, 3, 1)));
        setterList.add(v -> custom4HAnchorHour = (Integer) v);

        optList.add(new OptInputParameterInfo("[Advanced] Layer Spacing", OptInputParameterInfo.Type.OTHER,
            new IntegerRangeDescription(3, 0, 20, 1)));
        setterList.add(v -> layerSpacing = (Integer) v);

        // [Advanced] Chart Spacing optInput REMOVED

        // [Advanced] Min R:R Filter optInput REMOVED

        optInputParameterInfos = optList.toArray(new OptInputParameterInfo[0]);
        optSetters = setterList.toArray(new OptInputSetter[0]);

        indicatorInfo = new IndicatorInfo(
            "HigherTFCandles", "Multi Higher TF Candles", "Custom",
            true, false, false, 1, optInputParameterInfos.length, MAX_CANDLES * 4
        );

        outputParameterInfos = new OutputParameterInfo[MAX_CANDLES * 4];
        String[] ohlc = {"Open","High","Low","Close"};
        for (int c = 0; c < MAX_CANDLES; c++) {
            for (int vt = 0; vt < 4; vt++) {
                int idx2 = c * 4 + vt;
                outputParameterInfos[idx2] = new OutputParameterInfo(
                    "C" + (c + 1) + " " + ohlc[vt],
                    OutputParameterInfo.Type.DOUBLE,
                    OutputParameterInfo.DrawingStyle.LINE
                );
                outputParameterInfos[idx2].setDrawnByIndicator(true);
                outputParameterInfos[idx2].setShowOutput(vt == 0);
                if (vt == 0) {
                    outputParameterInfos[idx2].setColor(new Color(0, 0, 0, 0));
                    outputParameterInfos[idx2].setOpacityAlpha(1.0f);
                }
            }
        }

        loadSettings();
        applyColorSchemeFromSetting();

        if (sharedCISDAlerts) {
            updateSharedAlertsFromFile();
        }
    }

    // Labels and intraday boundaries follow the selected TradingView display zone.
    private TimeZone getTimezone() {
        switch (chartTimezone) {
            case 0: return TimeZone.getTimeZone("GMT");
            case 1: return TimeZone.getTimeZone("EET");
            case 2: return TimeZone.getTimeZone("America/New_York");
            case 3: return TimeZone.getTimeZone("Europe/Brussels");
            case 4: return TimeZone.getTimeZone("GMT+03:00");
            default: return TimeZone.getTimeZone("GMT-04:00");
        }
    }

    private int get4HAnchorHour() {
        if (htfTimingProfile == 1) return 2; // Gold: 02-06-10... UTC-4
        if (htfTimingProfile == 2) return 1; // FX/Index: 01-05-09... UTC-4
        if (htfTimingProfile == 3) return custom4HAnchorHour;
        String instrument = context.getFeedDescriptor().getInstrument().toString().toUpperCase();
        return instrument.contains("XAU") ? 2 : 1;
    }

    private Calendar newYorkCalendar(long timeMillis) {
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("America/New_York"));
        cal.setTimeInMillis(timeMillis);
        cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        return cal;
    }

    private int[] getPeriodIndexes() { int[] idxs = new int[PERIOD_COUNT]; for (int i = 0; i < PERIOD_COUNT; i++) idxs[i] = i; return idxs; }
    private int[] getColorIndexes() { int[] idxs = new int[CLOSURE_COLORS.length]; for (int i = 0; i < CLOSURE_COLORS.length; i++) idxs[i] = i; return idxs; }
    private int[] getSoundIndexes() { return new int[]{0, 1, 2}; }
    private long getPeriodInterval(int periodIndex) { return PERIOD_INTERVALS[periodIndex]; }

    private void applyColorSchemeFromSetting() {
        if (candleColorScheme == 0) {
            BULLISH_BODY_COLOR = new Color(0, 180, 0);
            BEARISH_BODY_COLOR = new Color(30, 30, 30);
        } else {
            BULLISH_BODY_COLOR = Color.WHITE;
            BEARISH_BODY_COLOR = new Color(30, 30, 30);
        }
    }


    /**
     * Auto-configure CISD filters based on selected Grade.
     * Grade 0=Standard (manual), 1=Premium (auto), 2=Ultimate (auto)
     */
    private void applyCisdGrade(int grade) {
        if (grade == 0) {
            // Standard: do NOT override anything, keep user manual settings
            return;
        }
        if (grade == 1) {
            // Premium: moderate filters
            trendFilter = 1;             // EMA 50
            minRetracement = 1;          // Fib 23.6%
            marketStructureFilter = 1;   // On
            higherTFConfirmation = 1;    // Layer 1
            momentumFilter = 1;          // Low
            volumeFilterEnabled = false; // Off (tick volume unreliable)
        } else if (grade == 2) {
            // Ultimate: strong filters
            trendFilter = 2;             // EMA 200
            minRetracement = 3;          // Fib 50%
            marketStructureFilter = 1;   // On
            higherTFConfirmation = 1;    // Layer 1
            momentumFilter = 2;          // Medium
            volumeFilterEnabled = true;  // On
        }
        scheduleSettingsSave();
    }

    private void resetCISDData() {
        try {
            cisdStoredCount = 0;
            sharedAlertLines.clear();
            File sharedFile = new File(getSharedCISDPath());
            if (sharedFile.exists()) sharedFile.delete();
            File backupFile = new File(context.getFilesDir(), "cisd_backup.ser");
            if (backupFile.exists()) backupFile.delete();
            File signalFile = new File(context.getFilesDir(), "HigherTF_Signals.csv");
            if (signalFile.exists()) signalFile.delete();
            File decisionsFile = new File(context.getFilesDir(), "CISD_Journal_Decisions.csv");
            if (decisionsFile.exists()) decisionsFile.delete();
            journalDecisions.clear();
            journalDecisionsLastModified = 0;
            context.getConsole().getOut().println("CISD chart, signal history and Journal decisions have been reset.");
        } catch (Exception e) {
            context.getConsole().getErr().println("Error during CISD reset: " + e.getMessage());
        }
    }

    private void scheduleSettingsSave() {
        if (settingsSaveTimer != null) settingsSaveTimer.cancel();
        settingsSaveTimer = new Timer();
        settingsSaveTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                saveSettings();
            }
        }, 2000);
    }

    @Override
    public void setOptInputParameter(int index, Object value) {
        optSetters[index].set(value);
        scheduleSettingsSave();
    }

    private boolean isSessionAllowed(long timeMillis) {
        if (activeSessions == 0) return true;
        Calendar cal = Calendar.getInstance(nyTimeZone);
        cal.setTimeInMillis(timeMillis);
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        String session;
        if (hour >= 18 || hour < 1) session = "Asia";
        else if (hour >= 1 && hour < 8) session = "London";
        else if (hour >= 8 && hour < 17) session = "NY";
        else session = "Closed";
        switch (activeSessions) {
            case 1: return session.equals("London") || session.equals("NY");
            case 2: return session.equals("London");
            case 3: return session.equals("NY");
            default: return true;
        }
    }

    private boolean isRRValid(double entry, double stop) {
        double risk = Math.abs(entry - stop);
        return risk > 0.00001;
    }

    private void trimCisdStorageIfNeeded() {
        if (cisdStorage.size() > 5) {
            Long oldest = null;
            for (Long p : cisdStorage.keySet()) {
                if (oldest == null || p < oldest) oldest = p;
            }
            if (oldest != null) cisdStorage.remove(oldest);
        }
    }

    private boolean isBearishBar(IBar bar) { return bar.getClose() < bar.getOpen(); }
    private boolean isBullishBar(IBar bar) { return bar.getClose() > bar.getOpen(); }
    private boolean isInsideBar(IBar current, IBar previous) {
        return current.getHigh() <= previous.getHigh() && current.getLow() >= previous.getLow();
    }

    private int[] findWave(IBar[] bars, int startIdx, int maxLookback, boolean bearishWave) {
        int waveEnd = -1, waveStart = -1;
        for (int i = startIdx; i >= 0 && (startIdx - i) <= maxLookback; i--) {
            boolean condition = bearishWave ? isBearishBar(bars[i]) : isBullishBar(bars[i]);
            if (!condition) {
                if (ignoreInsideBars && i > 0 && isInsideBar(bars[i], bars[i-1])) continue;
                if (waveEnd != -1) break;
            } else {
                if (waveEnd == -1) waveEnd = i;
                waveStart = i;
            }
        }
        if (waveEnd != -1) return new int[]{waveStart, waveEnd};
        return new int[]{-1, -1};
    }

    private boolean isDuplicateSignal(long startTime, double entry) {
        for (int i = 0; i < cisdStoredCount; i++) {
            if (cisdStoredStartTimes[i] == startTime && Math.abs(cisdStoredLevels[i] - entry) < 1e-6)
                return true;
        }
        return false;
    }

    private boolean checkHigherTFAlignment(boolean bullish) {
        if (higherTFConfirmation == 0) return false;
        int layerIdx = higherTFConfirmation - 1;
        if (layerIdx < 0 || layerIdx >= MAX_LAYERS) return false;
        LayerData layer = layers[layerIdx];
        if (!layer.enabled || layer.historicalCandles.isEmpty()) return false;
        CandleData lastCandle = layer.historicalCandles.get(layer.historicalCandles.size() - 1);
        if (lastCandle == null || !lastCandle.completed) return false;
        boolean candleBullish = lastCandle.close > lastCandle.open;
        return bullish == candleBullish;
    }

    private double[] computeFibRetracement(IBar[] bars, int waveStartIdx, int waveEndIdx, boolean isBearishWave) {
        if (waveStartIdx < 0 || waveStartIdx >= bars.length || waveEndIdx < 0 || waveEndIdx >= bars.length) return new double[]{-1, 0};
        long currentWaveStartTime = bars[waveStartIdx].getTime();
        if (currentWaveStartTime == fibCacheWaveStart && fibCacheResult != null) {
            return fibCacheResult;
        }
        int oppositeEnd = waveStartIdx - 1;
        if (oppositeEnd < 0) {
            fibCacheResult = new double[]{-1, 0};
            fibCacheWaveStart = currentWaveStartTime;
            return fibCacheResult;
        }
        int[] oppositeWave = findWave(bars, oppositeEnd, 200, !isBearishWave);
        if (oppositeWave[0] == -1) {
            fibCacheResult = new double[]{-1, 0};
            fibCacheWaveStart = currentWaveStartTime;
            return fibCacheResult;
        }
        double oppositeHigh = Double.MIN_VALUE, oppositeLow = Double.MAX_VALUE;
        for (int i = oppositeWave[0]; i <= oppositeWave[1]; i++) {
            oppositeHigh = Math.max(oppositeHigh, bars[i].getHigh());
            oppositeLow = Math.min(oppositeLow, bars[i].getLow());
        }
        double oppositeLength = oppositeHigh - oppositeLow;
        if (oppositeLength <= 0) {
            fibCacheResult = new double[]{-1, 0};
            fibCacheWaveStart = currentWaveStartTime;
            return fibCacheResult;
        }
        double currentWaveOpen = bars[waveStartIdx].getOpen();
        double currentWaveExtreme = isBearishWave ?
            Double.MAX_VALUE : -Double.MAX_VALUE;
        for (int i = waveStartIdx; i <= waveEndIdx; i++) {
            if (isBearishWave) currentWaveExtreme = Math.min(currentWaveExtreme, bars[i].getLow());
            else currentWaveExtreme = Math.max(currentWaveExtreme, bars[i].getHigh());
        }
        double retracementDepth = isBearishWave ?
            (currentWaveOpen - currentWaveExtreme) : (currentWaveExtreme - currentWaveOpen);
        if (retracementDepth < 0) {
            fibCacheResult = new double[]{-1, 0};
            fibCacheWaveStart = currentWaveStartTime;
            return fibCacheResult;
        }
        double ratio = retracementDepth / oppositeLength;
        fibCacheResult = new double[]{ratio, oppositeLength};
        fibCacheWaveStart = currentWaveStartTime;
        return fibCacheResult;
    }

    private boolean checkMarketStructure(IBar[] bars, boolean bullish) {
        int recent = Math.min(50, bars.length);
        List<Integer> pivots = new ArrayList<>();
        for (int i = 2; i < bars.length - 2 && i < recent; i++) {
            if (bullish) {
                if (bars[i].getLow() < bars[i-1].getLow() && bars[i].getLow() < bars[i+1].getLow()) pivots.add(i);
            } else {
                if (bars[i].getHigh() > bars[i-1].getHigh() && bars[i].getHigh() > bars[i+1].getHigh()) pivots.add(i);
            }
        }
        if (pivots.size() < 2) return false;
        int idx1 = pivots.get(pivots.size() - 2);
        int idx2 = pivots.get(pivots.size() - 1);
        if (bullish) return bars[idx2].getLow() > bars[idx1].getLow();
        else return bars[idx2].getHigh() < bars[idx1].getHigh();
    }


    // ================== SMT Divergence (Pivot-based) ==================
    /**
     * Resolve a symbol string (e.g. "EUR/USD") to a JForex Instrument.
     * JForex enum uses "EURUSD" format, not "EUR/USD".
     */
    private Instrument resolveInstrument(String symbol) {
        String clean = symbol.replace("/", "_").replace(".", "_");
        try {
            return Instrument.valueOf(clean);
        } catch (Exception e) {
            // Try with just removing slash
            try {
                return Instrument.valueOf(symbol.replace("/", "").replace(".", ""));
            } catch (Exception e2) {
                return null;
            }
        }
    }

    /**
     * Check if two instruments are correlated for SMT comparison.
     */

    private boolean areInstrumentsCorrelated(String inst1, String inst2) {
        if (inst1.contains("XAU") && inst2.contains("XAU")) return true;
        boolean isForex1 = inst1.equals("EUR/USD") || inst1.equals("GBP/USD");
        boolean isForex2 = inst2.equals("EUR/USD") || inst2.equals("GBP/USD");
        if (isForex1 && isForex2) return true;
        boolean isIndex1 = inst1.contains(".IDX");
        boolean isIndex2 = inst2.contains(".IDX");
        if (isIndex1 && isIndex2) return true;
        return false;
    }

    /**
     * Find the last 2 swing highs or lows from a set of bars.
     * Returns arrays of [index1, price1, index2, price2] or null if not enough pivots.
     */
    private double[] findLastTwoSwings(IBar[] bars, boolean findHighs) {
        if (bars == null || bars.length < 5) return null;
        int limit = Math.min(SMT_LOOKBACK, bars.length);
        // Collect pivot indices - require only 1 bar each side (less strict)
        List<Integer> pivotIdxs = new ArrayList<>();
        List<Double> pivotPrices = new ArrayList<>();
        for (int i = 1; i < limit - 1; i++) {
            if (findHighs) {
                if (bars[i].getHigh() > bars[i-1].getHigh() && bars[i].getHigh() >= bars[i+1].getHigh()) {
                    // Also check second bar if available
                    boolean stronger = (i+2 < limit) ? bars[i].getHigh() >= bars[i+2].getHigh() : true;
                    if (stronger) {
                        pivotIdxs.add(i);
                        pivotPrices.add(bars[i].getHigh());
                    }
                }
            } else {
                if (bars[i].getLow() < bars[i-1].getLow() && bars[i].getLow() <= bars[i+1].getLow()) {
                    boolean stronger = (i+2 < limit) ? bars[i].getLow() <= bars[i+2].getLow() : true;
                    if (stronger) {
                        pivotIdxs.add(i);
                        pivotPrices.add(bars[i].getLow());
                    }
                }
            }
        }
        if (pivotIdxs.size() < 2) return null;
        // Return last 2 pivots
        int size = pivotIdxs.size();
        return new double[] {
            pivotIdxs.get(size-2), pivotPrices.get(size-2),
            pivotIdxs.get(size-1), pivotPrices.get(size-1)
        };
    }

    /**
     * Detect SMT divergence between current instrument and correlated instruments.
     * Uses bar data from history (no CSV, no threads).
     * Returns list of SMT signal descriptions for drawing.
     */
    private List<String[]> detectSmtDivergence(IBar[] chartBars) {
        List<String[]> signals = new ArrayList<>();
        if (!smtEnabled) return signals;

        String myInstrument = context.getFeedDescriptor().getInstrument().toString();
        boolean iAmIncluded = false;
        for (String s : SMT_INSTRUMENTS) {
            if (s.equals(myInstrument)) { iAmIncluded = true; break; }
        }
        if (!iAmIncluded) return signals;

        IHistory history = context.getHistory();
        Period chartPeriod = context.getFeedDescriptor().getPeriod();
        long now = System.currentTimeMillis();
        // Use 120 bars to ensure we have enough data
        long startTime = now - (120 * chartPeriod.getInterval());
        long endTime = now;

        // Get bars for current instrument - try BID then ASK
        List<IBar> myList = null;
        try { myList = history.getBars(context.getFeedDescriptor().getInstrument(), chartPeriod, OfferSide.BID, startTime, endTime); } catch (Exception e1) {}
        if (myList == null || myList.isEmpty()) {
            try { myList = history.getBars(context.getFeedDescriptor().getInstrument(), chartPeriod, OfferSide.ASK, startTime, endTime); } catch (Exception e2) {}
        }
        IBar[] myBars = (myList == null || myList.isEmpty()) ? null : myList.toArray(new IBar[0]);
        if (myBars == null || myBars.length < 20) return signals;

        for (String other : SMT_INSTRUMENTS) {
            if (other.equals(myInstrument)) continue;
            if (!areInstrumentsCorrelated(myInstrument, other)) continue;

            Instrument otherInst = resolveInstrument(other);
            if (otherInst == null) continue;

            List<IBar> otherList = null;
            try { otherList = history.getBars(otherInst, chartPeriod, OfferSide.BID, startTime, endTime); } catch (Exception e3) {}
            if (otherList == null || otherList.isEmpty()) {
                try { otherList = history.getBars(otherInst, chartPeriod, OfferSide.ASK, startTime, endTime); } catch (Exception e4) {}
            }
            IBar[] otherBars = (otherList == null || otherList.isEmpty()) ? null : otherList.toArray(new IBar[0]);
            if (otherBars == null || otherBars.length < 20) continue;

            // Simple approach: divide into first 40% and last 40%
            int total = Math.min(myBars.length, otherBars.length);
            int firstPartEnd = total / 4;
            int lastPartStart = total - firstPartEnd;
            
            // Find highest high and lowest low in each part for MY instrument
            double myFirstHigh = -1e10, myLastHigh = -1e10;
            double myFirstLow = 1e10, myLastLow = 1e10;
            for (int i = 0; i < firstPartEnd; i++) {
                if (myBars[i].getHigh() > myFirstHigh) myFirstHigh = myBars[i].getHigh();
                if (myBars[i].getLow() < myFirstLow) myFirstLow = myBars[i].getLow();
            }
            for (int i = lastPartStart; i < total; i++) {
                if (myBars[i].getHigh() > myLastHigh) myLastHigh = myBars[i].getHigh();
                if (myBars[i].getLow() < myLastLow) myLastLow = myBars[i].getLow();
            }

            // Same for OTHER instrument
            double othFirstHigh = -1e10, othLastHigh = -1e10;
            double othFirstLow = 1e10, othLastLow = 1e10;
            for (int i = 0; i < firstPartEnd; i++) {
                if (otherBars[i].getHigh() > othFirstHigh) othFirstHigh = otherBars[i].getHigh();
                if (otherBars[i].getLow() < othFirstLow) othFirstLow = otherBars[i].getLow();
            }
            for (int i = lastPartStart; i < total; i++) {
                if (otherBars[i].getHigh() > othLastHigh) othLastHigh = otherBars[i].getHigh();
                if (otherBars[i].getLow() < othLastLow) othLastLow = otherBars[i].getLow();
            }

            long t1 = myBars[firstPartEnd].getTime();
            long t2 = myBars[total-1].getTime();
            double threshold = 0.0001; // for 5-digit brokers

            // BEARISH: my highs rising, other highs falling
            if (myLastHigh > myFirstHigh + threshold && othLastHigh < othFirstHigh - threshold) {
                signals.add(new String[]{t1 + "," + t2,
                    String.valueOf(myFirstHigh), String.valueOf(myLastHigh),
                    other, "bearish", othFirstHigh + "," + othLastHigh});
            }

            // BULLISH: my lows falling, other lows rising
            if (myLastLow < myFirstLow - threshold && othLastLow > othFirstLow + threshold) {
                signals.add(new String[]{t1 + "," + t2,
                    String.valueOf(myFirstLow), String.valueOf(myLastLow),
                    other, "bullish", othFirstLow + "," + othLastLow});
            }

            // Also check swing pivots for additional confirmation
            double[] myHighs = findLastTwoSwings(myBars, true);
            double[] myLows = findLastTwoSwings(myBars, false);

            if (myHighs != null) {
                double[] otherHighs = findLastTwoSwings(otherBars, true);
                if (otherHighs != null) {
                    if (myHighs[3] > myHighs[1] && otherHighs[3] < otherHighs[1]) {
                        long st1 = myBars[(int)myHighs[0]].getTime();
                        long st2 = myBars[(int)myHighs[2]].getTime();
                        signals.add(new String[]{st1 + "," + st2,
                            String.valueOf(myHighs[1]), String.valueOf(myHighs[3]),
                            other, "bearish_p", String.valueOf(otherHighs[1]) + "," + String.valueOf(otherHighs[3])});
                    }
                }
            }

            if (myLows != null) {
                double[] otherLows = findLastTwoSwings(otherBars, false);
                if (otherLows != null) {
                    if (myLows[3] < myLows[1] && otherLows[3] > otherLows[1]) {
                        long st1 = myBars[(int)myLows[0]].getTime();
                        long st2 = myBars[(int)myLows[2]].getTime();
                        signals.add(new String[]{st1 + "," + st2,
                            String.valueOf(myLows[1]), String.valueOf(myLows[3]),
                            other, "bullish_p", String.valueOf(otherLows[1]) + "," + String.valueOf(otherLows[3])});
                    }
                }
            }
        }
        return signals;
    }

    /**
     * Draw SMT divergence lines on the chart.
     */
    private void drawSmtDivergence(Graphics2D g2, IIndicatorDrawingSupport support, Font oldFont,
                                   List<String[]> signals) {
        if (signals == null || signals.isEmpty()) return;

        g2.setStroke(SMT_LINE_STROKE);
        g2.setFont(oldFont.deriveFont(Font.PLAIN, 9f));
        FontMetrics fm = g2.getFontMetrics();

        for (String[] sig : signals) {
            String[] times = sig[0].split(",");
            long t1 = Long.parseLong(times[0]);
            long t2 = Long.parseLong(times[1]);
            double yVal1 = Double.parseDouble(sig[1]);
            double yVal2 = Double.parseDouble(sig[2]);
            String otherInst = sig[3];
            boolean isBullish = "bullish".equals(sig[4]);

            int x1 = support.getXForTime(t1, false);
            int x2 = support.getXForTime(t2, false);
            if (x1 < 0 || x2 < 0) continue;

            int y1 = (int) support.getYForValue(yVal1);
            int y2 = (int) support.getYForValue(yVal2);
            if (y1 < 0 || y2 < 0 || y1 >= support.getChartHeight() || y2 >= support.getChartHeight()) continue;

            g2.setColor(isBullish ? SMT_BULLISH_COLOR : SMT_BEARISH_COLOR);
            g2.drawLine(x1, y1, x2, y2);

            // Label
            String label = "SMT_" + otherInst.replace(".IDX/USD","").replace("/USD","").replace("/EUR","");
            int midX = (x1 + x2) / 2;
            int midY = (y1 + y2) / 2;

            int textWidth = fm.stringWidth(label);
            int labelX = midX - textWidth / 2;
            int labelY = isBullish ? midY + 14 : midY - 4;

            // Background for text
            g2.setColor(new Color(30, 30, 30, 180));
            g2.fillRect(labelX - 2, labelY - fm.getAscent() - 2, textWidth + 4, fm.getHeight() + 4);
            g2.setColor(isBullish ? SMT_BULLISH_COLOR : SMT_BEARISH_COLOR);
            g2.drawString(label, labelX, labelY);
        }
    }
    // ================== End SMT Methods ==================

    @Override
    public IndicatorResult calculate(int startIndex, int endIndex) {
        if (inputs[0] == null || inputs[0].length == 0) return new IndicatorResult(0, 0);

        if (saveLoadCISD && !cisdLoaded) {
            loadCisdFromFile();
            cisdLoaded = true;
        }

        IBar[] bars = inputs[0];

        long currentPeriodMs = getCurrentChartPeriodMs();
        if (currentPeriodMs != lastChartPeriodMs) {
            if (lastChartPeriodMs > 0 && cisdStoredCount > 0) {
                List<CisdEntry> list = new ArrayList<>();
                for (int i = 0; i < cisdStoredCount; i++)
                    list.add(new CisdEntry(cisdStoredStartTimes[i], cisdStoredEndTimes[i], cisdStoredLevels[i],
                            cisdStoredStopLevels[i], cisdStoredBullish[i], cisdStoredActivationTime[i],
                            cisdStoredDeactivationTime[i], cisdStoredBreakoutTime[i], cisdStoredLogged[i],
                            cisdStoredRetestPlayed[i], cisdStoredConfirmed[i],
                            cisdStoredHigherTFAligned[i], cisdStoredConfirmingTFLabel[i],
                            cisdStoredFibPassed[i], cisdStoredFibLabel[i],
                            cisdStoredTrendPassed[i], cisdStoredMomentumPassed[i], cisdStoredVolumePassed[i],
                            cisdStoredMarketStructurePassed[i], cisdStoredFilterSymbols[i],
                            cisdStoredTrendActive[i], cisdStoredFibActive[i], cisdStoredMSActive[i],
                            cisdStoredHTFActive[i], cisdStoredMomVolActive[i]));
                cisdStorage.put(lastChartPeriodMs, list);
                trimCisdStorageIfNeeded();
            }
            cisdStoredCount = 0;
            lastAlertStartTime = 0;
            lastAlertLevel = Double.NaN;
            List<CisdEntry> saved = cisdStorage.get(currentPeriodMs);
            if (saved != null) {
                cisdStoredCount = Math.min(saved.size(), MAX_CISD_STORED);
                for (int i = 0; i < cisdStoredCount; i++) {
                    CisdEntry e = saved.get(i);
                    cisdStoredStartTimes[i] = e.startTime;
                    cisdStoredEndTimes[i] = e.endTime;
                    cisdStoredLevels[i] = e.level;
                    cisdStoredBullish[i] = e.bullish;
                    cisdStoredStopLevels[i] = e.stopLevel;
                    cisdStoredActivationTime[i] = e.activationTime;
                    cisdStoredDeactivationTime[i] = e.deactivationTime;
                    cisdStoredBreakoutTime[i] = e.breakoutTime;
                    cisdStoredLogged[i] = e.logged;
                    cisdStoredRetestPlayed[i] = e.retestPlayed;
                    cisdStoredConfirmed[i] = e.confirmed;
                    cisdStoredHigherTFAligned[i] = e.higherTFAligned;
                    cisdStoredConfirmingTFLabel[i] = e.confirmingTFLabel;
                    cisdStoredFibPassed[i] = e.fibPassed;
                    cisdStoredFibLabel[i] = e.fibLabel;
                    cisdStoredTrendPassed[i] = e.trendPassed;
                    cisdStoredMomentumPassed[i] = e.momentumPassed;
                    cisdStoredVolumePassed[i] = e.volumePassed;
                    cisdStoredMarketStructurePassed[i] = e.marketStructurePassed;
                    cisdStoredFilterSymbols[i] = e.filterSymbols;
                    cisdStoredTrendActive[i] = e.trendActive;
                    cisdStoredFibActive[i] = e.fibActive;
                    cisdStoredMSActive[i] = e.msActive;
                    cisdStoredHTFActive[i] = e.htfActive;
                    cisdStoredMomVolActive[i] = e.momVolActive;
                }
            }
            for (LayerData layer : layers) {
                if (layer != null) {
                    layer.historicalCandles.clear();
                    layer.currentOpen = Double.NaN;
                    layer.currentHigh = Double.NaN;
                    layer.currentLow = Double.NaN;
                    layer.currentClose = Double.NaN;
                    layer.currentCandleActive = false;
                    layer.currentPeriodStart = 0;
                    layer.lsActive = false;
                }
            }
            lastChartPeriodMs = currentPeriodMs;
            lastCalculatedIndex = -1;
            fibCacheWaveStart = -1;
            fibCacheResult = null;
            pendingBullish.active = false; pendingBullish.waveStartIdx = -1;
            pendingBearish.active = false; pendingBearish.waveStartIdx = -1;
        }

        for (LayerData layer : layers) {
            if (!layer.enabled) continue;
            for (int i = startIndex; i <= endIndex && i < bars.length; i++) {
                if (bars[i].getTime() <= 0) continue;
                processChartBar(layer, bars[i]);
            }
        }

        int detectionIndex = endIndex;
        if (detectionIndex == bars.length - 1) {
            long barEndTime = bars[detectionIndex].getTime() + currentPeriodMs;
            if (System.currentTimeMillis() < barEndTime) {
                detectionIndex = Math.max(0, detectionIndex - 1);
            }
        }
        detectCISDFinal(bars, detectionIndex);

        updateCisdStates(bars[endIndex].getTime());

        latestBarTime = bars[endIndex].getTime();

        long chartInterval = context.getFeedDescriptor().getPeriod().getInterval();
        LayerData validPrimaryLayer = null;
        for (LayerData l : layers)
            if (l.enabled && getPeriodInterval(l.periodIndex) > chartInterval) { validPrimaryLayer = l; break; }
        if (validPrimaryLayer == null) validPrimaryLayer = layers[0];

        int length = endIndex - startIndex + 1;
        for (int i = 0; i < outputs.length; i++) {
            double[] arr = (double[]) outputs[i];
            if (arr == null || arr.length != length) outputs[i] = new double[length];
        }

        for (int idx = startIndex, arrIdx = 0; idx <= endIndex; idx++, arrIdx++) {
            List<CandleData> displayList = new ArrayList<>(validPrimaryLayer.historicalCandles);
            if (validPrimaryLayer.currentCandleActive)
                displayList.add(new CandleData(validPrimaryLayer.currentOpen, validPrimaryLayer.currentHigh,
                        validPrimaryLayer.currentLow, validPrimaryLayer.currentClose, validPrimaryLayer.currentPeriodStart, false));
            while (displayList.size() > validPrimaryLayer.candlesToShow) displayList.remove(0);
            for (int c = 0; c < MAX_CANDLES; c++) {
                CandleData cd = (c < displayList.size()) ? displayList.get(c) : null;
                int base = c * 4;
                ((double[]) outputs[base])[arrIdx] = (cd != null) ? cd.open : Double.NaN;
                ((double[]) outputs[base + 1])[arrIdx] = (cd != null) ? cd.high : Double.NaN;
                ((double[]) outputs[base + 2])[arrIdx] = (cd != null) ? cd.low : Double.NaN;
                ((double[]) outputs[base + 3])[arrIdx] = (cd != null) ? cd.close : Double.NaN;
            }
        }

        return new IndicatorResult(startIndex, length);
    }

    private void processChartBar(LayerData layer, IBar bar) {
        long barTime = bar.getTime();
        long interval = getPeriodInterval(layer.periodIndex);
        long periodStart = getChartPeriodStart(barTime, interval);

        if (!layer.currentCandleActive || periodStart != layer.currentPeriodStart) {
            if (layer.currentCandleActive) {
                CandleData completedCandle = new CandleData(layer.currentOpen, layer.currentHigh, layer.currentLow,
                        layer.currentClose, layer.currentPeriodStart, true);
                if (layer.historicalCandles.isEmpty() || layer.historicalCandles.get(layer.historicalCandles.size()-1).openTime != layer.currentPeriodStart) {
                    layer.historicalCandles.add(completedCandle);
                }
                if (layer.historicalCandles.size() > layer.candlesToShow) layer.historicalCandles.remove(0);
                if (layer.historicalCandles.size() >= 2) {
                    detectLiquiditySweep(layer);
                }
                // writeSmtCandle REMOVED
            }
            layer.currentPeriodStart = periodStart;
            layer.currentOpen = bar.getOpen();
            layer.currentHigh = bar.getHigh();
            layer.currentLow = bar.getLow();
            layer.currentClose = bar.getClose();
            layer.currentCandleActive = true;
        } else {
            if (bar.getHigh() > layer.currentHigh) layer.currentHigh = bar.getHigh();
            if (bar.getLow() < layer.currentLow) layer.currentLow = bar.getLow();
            layer.currentClose = bar.getClose();
        }
    }

    private void detectLiquiditySweep(LayerData layer) {
        if (closureShadeMode != 1 || layer.historicalCandles.size() < 2) return;
        List<CandleData> candles = layer.historicalCandles;
        CandleData c1 = candles.get(candles.size() - 2);
        CandleData c2 = candles.get(candles.size() - 1);
        long periodMs = getPeriodInterval(layer.periodIndex);
        if (c2.low < c1.low && c2.close > c1.close) {
            layer.lsActive = true;
            layer.lsBullish = true;
            layer.lsPrice = c1.low;
            layer.lsStartTime = c1.openTime;
            layer.lsEndTime = c2.openTime + periodMs;
        } else if (c2.high > c1.high && c2.close < c1.close) {
            layer.lsActive = true;
            layer.lsBullish = false;
            layer.lsPrice = c1.high;
            layer.lsStartTime = c1.openTime;
            layer.lsEndTime = c2.openTime + periodMs;
        } else {
            layer.lsActive = false;
        }
    }

    private long getChartPeriodStart(long timeMillis, long intervalMs) {
        // Daily/weekly stay on Midnight New York; intraday follows the selected
        // TradingView display zone and its instrument-specific 4H anchor.
        Calendar cal = (intervalMs >= 24 * 60 * 60 * 1000L) ? newYorkCalendar(timeMillis) : Calendar.getInstance(getTimezone());
        if (intervalMs < 24 * 60 * 60 * 1000L) cal.setTimeInMillis(timeMillis);
        cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        if (intervalMs == 24 * 60 * 60 * 1000L) {
            cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0);
            return cal.getTimeInMillis();
        }
        if (intervalMs == 7 * 24 * 60 * 60 * 1000L) {
            cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0);
            int offset = (cal.get(Calendar.DAY_OF_WEEK) - Calendar.MONDAY + 7) % 7;
            cal.add(Calendar.DAY_OF_MONTH, -offset);
            return cal.getTimeInMillis();
        }
        cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0);
        long dayStart = cal.getTimeInMillis();
        long anchor = intervalMs == 4 * 60 * 60 * 1000L ? get4HAnchorHour() * 60 * 60 * 1000L : 0;
        long elapsed = timeMillis - dayStart - anchor;
        if (elapsed < 0) elapsed += 24 * 60 * 60 * 1000L;
        long start = dayStart + anchor + (elapsed / intervalMs) * intervalMs;
        if (start > timeMillis) start -= intervalMs;
        return start;
    }

    private long getChartPeriodEnd(long startMillis, long intervalMs) {
        if (intervalMs < 24 * 60 * 60 * 1000L) return startMillis + intervalMs;
        Calendar cal = newYorkCalendar(startMillis);
        cal.add(Calendar.DAY_OF_MONTH, intervalMs == 24 * 60 * 60 * 1000L ? 1 : 7);
        return cal.getTimeInMillis();
    }


    /**
     * Weighted scoring for CISD signal eligibility.
     * Standard (grade=0): all active filters must pass (AND)
     * Premium (grade=1):  >= 60% of active filters must pass
     * Ultimate (grade=2): >= 75% of active filters must pass
     */
    private boolean isSignalEligible(boolean trendPass, boolean fibPass, boolean msPass, 
            boolean htfPass, boolean momVolPass, boolean trendActive, boolean fibActive, 
            boolean msActive, boolean htfActive, boolean momVolActive) {
        if (cisdGrade == 0) {
            // Standard: keep original AND logic
            return trendPass && momVolPass && htfPass && fibPass && msPass;
        }
        
        int total = 0, passed = 0;
        if (trendActive) { total++; if (trendPass) passed++; }
        if (fibActive)   { total++; if (fibPass)   passed++; }
        if (msActive)    { total++; if (msPass)    passed++; }
        if (htfActive)   { total++; if (htfPass)   passed++; }
        if (momVolActive){ total++; if (momVolPass) passed++; }
        
        if (total == 0) return true; // no active filters = allow
        
        double ratio = (double) passed / total;
        if (cisdGrade == 1) return ratio >= 0.6;  // Premium: 60%
        if (cisdGrade == 2) return ratio >= 0.75; // Ultimate: 75%
        return ratio >= 0.6; // fallback
    }

    private double getEMA(IBar[] bars, int endIndex, int period) {
        if (endIndex < period - 1 || period <= 0) return bars[endIndex].getClose();
        double multiplier = 2.0 / (period + 1);
        double ema = bars[endIndex - period + 1].getClose();
        for (int i = endIndex - period + 2; i <= endIndex; i++) {
            ema = (bars[i].getClose() - ema) * multiplier + ema;
        }
        return ema;
    }

    private boolean passTrendFilter(IBar[] bars, int index, boolean bullish) {
        if (trendFilter == 0) return true;
        int period = (trendFilter == 1) ? 50 : 200;
        if (index < period - 1) return true;
        double ema = getEMA(bars, index, period);
        double close = bars[index].getClose();
        return bullish ? close > ema : close < ema;
    }

    private boolean passMomentumAndVolumeFilters(IBar[] bars, int index, boolean bullish) {
        if (momentumFilter == 0 && !volumeFilterEnabled) return true;
        IBar breakoutBar = bars[index];
        double range = breakoutBar.getHigh() - breakoutBar.getLow();
        double closeLocation = range > 0 ? (breakoutBar.getClose() - breakoutBar.getLow()) / range : 0.5;
        if (momentumFilter > 0) {
            if (momentumFilter >= 1) {
                if (bullish && closeLocation < 0.5) return false;
                if (!bullish && closeLocation > 0.5) return false;
            }
            if (momentumFilter >= 2) {
                double avgRange = 0;
                int count = 0;
                for (int i = Math.max(0, index - 5); i < index; i++) {
                    avgRange += bars[i].getHigh() - bars[i].getLow();
                    count++;
                }
                avgRange /= (count > 0 ? count : 1);
                if (range < avgRange * 1.2) return false;
            }
        }
        if (volumeFilterEnabled) {
            double vol = breakoutBar.getVolume();
            double avgVol = 0;
            int count = Math.min(20, index);
            for (int i = index - count; i < index; i++) avgVol += bars[i].getVolume();
            avgVol /= (count > 0 ? count : 1);
            if (vol < avgVol * minVolumeRatio) return false;
        }
        return true;
    }

    private boolean isVolumeProfileConfirmed(IBar[] bars, int index, double entryPrice) {
        int lookback = Math.min(100, index + 1);
        int start = index - lookback + 1;
        if (start < 0) start = 0;
        double high = Double.MIN_VALUE, low = Double.MAX_VALUE;
        for (int i = start; i <= index; i++) {
            if (bars[i].getHigh() > high) high = bars[i].getHigh();
            if (bars[i].getLow() < low) low = bars[i].getLow();
        }
        if (high == low) return false;
        int rows = 30;
        double step = (high - low) / rows;
        double[] volumes = new double[rows];
        for (int i = start; i <= index; i++) {
            double barHigh = bars[i].getHigh(), barLow = bars[i].getLow();
            int rowFrom = (int) Math.min(Math.floor((high - barHigh) / step), rows - 1);
            int rowTo = (int) Math.min(Math.floor((high - barLow) / step), rows - 1);
            for (int r = rowFrom; r <= rowTo; r++) {
                if (barHigh == barLow) volumes[r] += bars[i].getVolume();
                else {
                    double maxPrice = Math.min(high - r * step, barHigh);
                    double minPrice = Math.max(high - (r + 1) * step, barLow);
                    volumes[r] += bars[i].getVolume() * (maxPrice - minPrice) / (barHigh - barLow);
                }
            }
        }
        double maxVol = 0;
        for (double v : volumes) if (v > maxVol) maxVol = v;
        if (maxVol == 0) return false;
        int entryRow = (int) Math.min(Math.floor((high - entryPrice) / step), rows - 1);
        if (entryRow < 0) entryRow = 0;
        return (volumes[entryRow] / maxVol) >= 0.50;
    }

    private void detectCISDFinal(IBar[] bars, int detectionIndex) {
        if (!showCISD || bars.length < 2 || detectionIndex < 0 || detectionIndex >= bars.length) return;
        IBar currentBar = bars[detectionIndex];
        int minRequired = cisdSensitivity == 0 ? 3 : (cisdSensitivity == 1 ? 2 : 1);
        int maxLookback = 200;

        boolean trendActive = trendFilter > 0;
        boolean fibActive = minRetracement > 0;
        boolean msActive = marketStructureFilter > 0;
        boolean htfActive = higherTFConfirmation > 0;
        boolean momVolActive = momentumFilter > 0 || volumeFilterEnabled;
        double fibThreshold = FIB_RATIOS[minRetracement];

        int[] wave = findWave(bars, detectionIndex-1, maxLookback, true);
        if (wave[0] != -1 && (wave[1] - wave[0] + 1) >= minRequired) {
            double firstOpen = bars[wave[0]].getOpen();
            double lowest = Double.MAX_VALUE;
            for (int k = wave[0]; k <= wave[1]; k++) lowest = Math.min(lowest, bars[k].getLow());
            if (!isDuplicateSignal(bars[wave[0]].getTime(), firstOpen)) {
                if (!pendingBullish.active || bars[wave[0]].getTime() > pendingBullish.waveStartTime ||
                    (bars[wave[0]].getTime() == pendingBullish.waveStartTime && lowest < pendingBullish.stopLevel)) {
                    pendingBullish.active = true;
                    pendingBullish.triggerOpen = firstOpen;
                    pendingBullish.stopLevel = lowest;
                    pendingBullish.waveStartTime = bars[wave[0]].getTime();
                    pendingBullish.waveStartIdx = wave[0];
                }
            }
        }

        wave = findWave(bars, detectionIndex-1, maxLookback, false);
        if (wave[0] != -1 && (wave[1] - wave[0] + 1) >= minRequired) {
            double firstOpen = bars[wave[0]].getOpen();
            double highest = -Double.MAX_VALUE;
            for (int k = wave[0]; k <= wave[1]; k++) highest = Math.max(highest, bars[k].getHigh());
            if (!isDuplicateSignal(bars[wave[0]].getTime(), firstOpen)) {
                if (!pendingBearish.active || bars[wave[0]].getTime() > pendingBearish.waveStartTime ||
                    (bars[wave[0]].getTime() == pendingBearish.waveStartTime && highest > pendingBearish.stopLevel)) {
                    pendingBearish.active = true;
                    pendingBearish.triggerOpen = firstOpen;
                    pendingBearish.stopLevel = highest;
                    pendingBearish.waveStartTime = bars[wave[0]].getTime();
                    pendingBearish.waveStartIdx = wave[0];
                }
            }
        }

        double close = currentBar.getClose();
        if (pendingBullish.active && close > pendingBullish.triggerOpen) {
            boolean trendPass = !trendActive || passTrendFilter(bars, detectionIndex, true);
            boolean momVolPass = !momVolActive || passMomentumAndVolumeFilters(bars, detectionIndex, true);
            boolean htfPass = !htfActive || checkHigherTFAlignment(true);

            boolean fibPass = !fibActive;
            String fibLabel = "";
            if (fibActive) {
                double[] fibResult = computeFibRetracement(bars, pendingBullish.waveStartIdx, detectionIndex-1, true);
                if (fibResult[0] >= 0 && fibResult[0] >= fibThreshold) {
                    fibPass = true;
                    fibLabel = String.format("Fib %.0f%%", fibResult[0]*100);
                }
            }

            boolean msPass = !msActive || checkMarketStructure(bars, true);

            if (isSignalEligible(trendPass, fibPass, msPass, htfPass, momVolPass, trendActive, fibActive, msActive, htfActive, momVolActive)) {
                double entry = pendingBullish.triggerOpen, stop = pendingBullish.stopLevel;
                if (isSessionAllowed(pendingBullish.waveStartTime) && isRRValid(entry, stop)) {
                    String confirmingLabel = null;
                    if (htfPass && higherTFConfirmation > 0) {
                        int layerIdx = higherTFConfirmation - 1;
                        confirmingLabel = SHORT_LABELS[layers[layerIdx].periodIndex];
                    }
                    boolean confirmed = isVolumeProfileConfirmed(bars, detectionIndex, entry);

                    storeCisdSignal(pendingBullish.waveStartTime, currentBar.getTime(), entry, stop, true,
                            currentBar.getTime(), confirmed, htfPass, confirmingLabel,
                            fibPass, fibLabel, trendPass, momVolPass, msPass,
                            trendActive, fibActive, msActive, htfActive, momVolActive);
                }
            }
            pendingBullish.active = false;
        }

        if (pendingBearish.active && close < pendingBearish.triggerOpen) {
            boolean trendPass = !trendActive || passTrendFilter(bars, detectionIndex, false);
            boolean momVolPass = !momVolActive || passMomentumAndVolumeFilters(bars, detectionIndex, false);
            boolean htfPass = !htfActive || checkHigherTFAlignment(false);

            boolean fibPass = !fibActive;
            String fibLabel = "";
            if (fibActive) {
                double[] fibResult = computeFibRetracement(bars, pendingBearish.waveStartIdx, detectionIndex-1, false);
                if (fibResult[0] >= 0 && fibResult[0] >= fibThreshold) {
                    fibPass = true;
                    fibLabel = String.format("Fib %.0f%%", fibResult[0]*100);
                }
            }

            boolean msPass = !msActive || checkMarketStructure(bars, false);

            if (isSignalEligible(trendPass, fibPass, msPass, htfPass, momVolPass, trendActive, fibActive, msActive, htfActive, momVolActive)) {
                double entry = pendingBearish.triggerOpen, stop = pendingBearish.stopLevel;
                if (isSessionAllowed(pendingBearish.waveStartTime) && isRRValid(entry, stop)) {
                    String confirmingLabel = null;
                    if (htfPass && higherTFConfirmation > 0) {
                        int layerIdx = higherTFConfirmation - 1;
                        confirmingLabel = SHORT_LABELS[layers[layerIdx].periodIndex];
                    }
                    boolean confirmed = isVolumeProfileConfirmed(bars, detectionIndex, entry);

                    storeCisdSignal(pendingBearish.waveStartTime, currentBar.getTime(), entry, stop, false,
                            currentBar.getTime(), confirmed, htfPass, confirmingLabel,
                            fibPass, fibLabel, trendPass, momVolPass, msPass,
                            trendActive, fibActive, msActive, htfActive, momVolActive);
                }
            }
            pendingBearish.active = false;
        }
    }

    private void storeCisdSignal(long startTime, long endTime, double entry, double stop, boolean bullish,
                                 long breakoutTime, boolean confirmed, boolean higherTFAligned, String confirmingLabel,
                                 boolean fibPassed, String fibLabel, boolean trendPassed, boolean momentumPassed,
                                 boolean marketStructurePassed,
                                 boolean trendActive, boolean fibActive, boolean msActive,
                                 boolean htfActive, boolean momVolActive) {
        if (isDuplicateSignal(startTime, entry)) return;
        if (cisdStoredCount < MAX_CISD_STORED) cisdStoredCount++;
        else {
            for (int i = 0; i < MAX_CISD_STORED - 1; i++) {
                cisdStoredStartTimes[i] = cisdStoredStartTimes[i + 1];
                cisdStoredEndTimes[i] = cisdStoredEndTimes[i + 1];
                cisdStoredLevels[i] = cisdStoredLevels[i + 1];
                cisdStoredBullish[i] = cisdStoredBullish[i + 1];
                cisdStoredStopLevels[i] = cisdStoredStopLevels[i + 1];
                cisdStoredActivationTime[i] = cisdStoredActivationTime[i + 1];
                cisdStoredDeactivationTime[i] = cisdStoredDeactivationTime[i + 1];
                cisdStoredBreakoutTime[i] = cisdStoredBreakoutTime[i + 1];
                cisdStoredLogged[i] = cisdStoredLogged[i + 1];
                cisdStoredRetestPlayed[i] = cisdStoredRetestPlayed[i + 1];
                cisdStoredConfirmed[i] = cisdStoredConfirmed[i + 1];
                cisdStoredHigherTFAligned[i] = cisdStoredHigherTFAligned[i + 1];
                cisdStoredConfirmingTFLabel[i] = cisdStoredConfirmingTFLabel[i + 1];
                cisdStoredFibPassed[i] = cisdStoredFibPassed[i + 1];
                cisdStoredFibLabel[i] = cisdStoredFibLabel[i + 1];
                cisdStoredTrendPassed[i] = cisdStoredTrendPassed[i + 1];
                cisdStoredMomentumPassed[i] = cisdStoredMomentumPassed[i + 1];
                cisdStoredVolumePassed[i] = cisdStoredVolumePassed[i + 1];
                cisdStoredMarketStructurePassed[i] = cisdStoredMarketStructurePassed[i + 1];
                cisdStoredFilterSymbols[i] = cisdStoredFilterSymbols[i + 1];
                cisdStoredTrendActive[i] = cisdStoredTrendActive[i + 1];
                cisdStoredFibActive[i] = cisdStoredFibActive[i + 1];
                cisdStoredMSActive[i] = cisdStoredMSActive[i + 1];
                cisdStoredHTFActive[i] = cisdStoredHTFActive[i + 1];
                cisdStoredMomVolActive[i] = cisdStoredMomVolActive[i + 1];
            }
        }
        int idx = cisdStoredCount - 1;
        cisdStoredStartTimes[idx] = startTime;
        cisdStoredEndTimes[idx] = endTime;
        cisdStoredLevels[idx] = entry;
        cisdStoredBullish[idx] = bullish;
        cisdStoredStopLevels[idx] = stop;
        cisdStoredActivationTime[idx] = 0;
        cisdStoredDeactivationTime[idx] = Long.MAX_VALUE;
        cisdStoredBreakoutTime[idx] = breakoutTime;
        cisdStoredLogged[idx] = false;
        cisdStoredRetestPlayed[idx] = false;
        cisdStoredConfirmed[idx] = confirmed;
        cisdStoredHigherTFAligned[idx] = higherTFAligned;
        cisdStoredConfirmingTFLabel[idx] = confirmingLabel;
        cisdStoredFibPassed[idx] = fibPassed;
        cisdStoredFibLabel[idx] = fibLabel;
        cisdStoredTrendPassed[idx] = trendPassed;
        cisdStoredMomentumPassed[idx] = momentumPassed;
        cisdStoredVolumePassed[idx] = volumeFilterEnabled;
        cisdStoredMarketStructurePassed[idx] = marketStructurePassed;
        cisdStoredTrendActive[idx] = trendActive;
        cisdStoredFibActive[idx] = fibActive;
        cisdStoredMSActive[idx] = msActive;
        cisdStoredHTFActive[idx] = htfActive;
        cisdStoredMomVolActive[idx] = momVolActive;

        cisdStorage.put(lastChartPeriodMs, new ArrayList<CisdEntry>() {{
            for (int i = 0; i < cisdStoredCount; i++)
                add(new CisdEntry(cisdStoredStartTimes[i], cisdStoredEndTimes[i], cisdStoredLevels[i],
                        cisdStoredStopLevels[i], cisdStoredBullish[i], cisdStoredActivationTime[i],
                        cisdStoredDeactivationTime[i], cisdStoredBreakoutTime[i], cisdStoredLogged[i],
                        cisdStoredRetestPlayed[i], cisdStoredConfirmed[i],
                        cisdStoredHigherTFAligned[i], cisdStoredConfirmingTFLabel[i],
                        cisdStoredFibPassed[i], cisdStoredFibLabel[i],
                        cisdStoredTrendPassed[i], cisdStoredMomentumPassed[i], cisdStoredVolumePassed[i],
                        cisdStoredMarketStructurePassed[i], cisdStoredFilterSymbols[i],
                        cisdStoredTrendActive[i], cisdStoredFibActive[i], cisdStoredMSActive[i],
                        cisdStoredHTFActive[i], cisdStoredMomVolActive[i]));
        }});
        trimCisdStorageIfNeeded();
        if (!cisdAlertSound.equals("None")) playSound(cisdAlertSound);
        lastAlertStartTime = startTime;
        lastAlertLevel = entry;

        writeSharedCISDLine(bullish, entry, breakoutTime, confirmed);
        writeCisdSignalToCsv(idx);
        if (saveLoadCISD) saveCisdToFile();
    }

    private void checkRetestFrequent(IBar currentBar) {
        if (cisdStoredCount == 0 || currentBar == null || cisdRetestSound.equals("None")) return;
        long currentBarTime = currentBar.getTime();

        for (int i = 0; i < cisdStoredCount; i++) {
            if (cisdStoredRetestPlayed[i]) continue;
            if (currentBarTime <= cisdStoredBreakoutTime[i]) continue;
            if (cisdStoredActivationTime[i] != 0) {
                playSound(cisdRetestSound);
                cisdStoredRetestPlayed[i] = true;
                updateSharedRetestLine(i);
                continue;
            }
            boolean touched = false;
            if (cisdStoredBullish[i]) {
                if (currentBar.getLow() <= cisdStoredLevels[i]) touched = true;
            } else {
                if (currentBar.getHigh() >= cisdStoredLevels[i]) touched = true;
            }
            if (touched) {
                cisdStoredActivationTime[i] = currentBarTime;
                playSound(cisdRetestSound);
                cisdStoredRetestPlayed[i] = true;
                updateSharedRetestLine(i);
                sharedFileLastModified = 0;
            }
        }
    }

    private void updateSharedRetestLine(int index) {
        if (!sharedCISDAlerts) return;
        synchronized (sharedFileLock) {
            List<String[]> lines = readSharedCISDLinesInternal();
            boolean changed = false;
            for (String[] parts : lines) {
                if (parts.length < 5) continue;
                long btTime;
                try { btTime = Long.parseLong(parts[5]); } catch (NumberFormatException e) { continue; }
                if (btTime == cisdStoredBreakoutTime[index] && !"true".equals(parts[4])) {
                    parts[4] = "true";
                    changed = true;
                    break;
                }
            }
            if (changed) {
                try (PrintWriter pw = new PrintWriter(new FileWriter(getSharedCISDPath()))) {
                    for (String[] l : lines) {
                        pw.println(l[0] + "," + l[1] + "," + l[2] + "," + l[3] + "," + l[4] + "," + l[5] + "," + (l.length > 6 ? l[6] : "false"));
                    }
                } catch (IOException e) { }
            }
        }
    }

    // MODIFIED: showRiskReward guard removed - always tracks trade outcomes (needed for stats panel)
    private void updateCisdStates(long currentEndTime) {
        if (cisdStoredCount == 0) return;
        for (int i = 0; i < cisdStoredCount; i++) {
            // Track retest activation (used for retest sound)
            if (cisdStoredActivationTime[i] == 0) {
                for (int j = 0; j < inputs[0].length; j++) {
                    IBar bar = inputs[0][j];
                    if (bar.getTime() <= cisdStoredBreakoutTime[i]) continue;
                    boolean touchedEntry = false;
                    if (cisdStoredBullish[i]) { if (bar.getLow() <= cisdStoredLevels[i]) touchedEntry = true; }
                    else { if (bar.getHigh() >= cisdStoredLevels[i]) touchedEntry = true; }
                    if (touchedEntry) { cisdStoredActivationTime[i] = bar.getTime(); break; }
                }
            }
        }
    }


    private String getSession(long timeMillis) {
        Calendar cal = Calendar.getInstance(nyTimeZone);
        cal.setTimeInMillis(timeMillis);
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        if (hour >= 18 || hour < 1) return "Asia";
        if (hour >= 1 && hour < 8) return "London";
        if (hour >= 8 && hour < 17) return "NY";
        return "Closed";
    }

    private void playSound(String filename) {
        if (filename.equals("None")) return;
        try {
            String userDir = System.getProperty("user.dir");
            File soundFile = new File(userDir, filename);
            if (!soundFile.exists()) return;
            AudioInputStream audioIn = AudioSystem.getAudioInputStream(soundFile);
            Clip clip = AudioSystem.getClip();
            clip.open(audioIn);
            clip.start();
        } catch (Exception e) { }
    }

    private long getCurrentChartPeriodMs() { return context.getFeedDescriptor().getPeriod().getInterval(); }
    /**
     * Write CISD signal to CSV immediately when it appears (no TP/SL tracking).
     * Format: Instrument, Time (NY), Date, Day, Session, TF, Direction, Entry, SL,
     *         Grade, Score, Trend, Fib, MS, HTF, Mom/Vol, Confirmed
     */
    private void writeCisdSignalToCsv(int index) {
        String path = context.getFilesDir() + File.separator + "HigherTF_Signals.csv";
        boolean fileExists = new File(path).exists();

        String instrument = context.getFeedDescriptor().getInstrument().toString();
        String chartTf = getCurrentTFShortName();
        String direction = cisdStoredBullish[index] ? "+Cisd" : "-Cisd";
        String directionId = cisdStoredBullish[index] ? "BUY" : "SELL";

        // Keep wave start separately. The valid signal time is the close of the confirmation bar.
        long waveStartMillis = cisdStoredStartTimes[index];
        long confirmationBarOpenMillis = cisdStoredEndTimes[index];
        long signalMillis = confirmationBarOpenMillis + getCurrentChartPeriodMs();

        String waveStartTime = nyTimeFormat.format(new Date(waveStartMillis));
        String signalTime = nyTimeFormat.format(new Date(signalMillis));
        String day = dayFormat.format(new Date(signalMillis));
        String session = getSession(signalMillis);

        String cleanInstrument = instrument.replace("/", "_").replace(".", "_");
        String signalId = cleanInstrument + "_" + chartTf + "_" + directionId
                + "_" + confirmationBarOpenMillis;

        String grade = cisdGrade == 0 ? "Standard"
                : (cisdGrade == 1 ? "Premium" : "Ultimate");

        // Score includes only filters that were active at the time of the signal.
        int total = 0;
        int passed = 0;
        if (cisdStoredTrendActive[index]) { total++; if (cisdStoredTrendPassed[index]) passed++; }
        if (cisdStoredFibActive[index]) { total++; if (cisdStoredFibPassed[index]) passed++; }
        if (cisdStoredMSActive[index]) { total++; if (cisdStoredMarketStructurePassed[index]) passed++; }
        if (cisdStoredHTFActive[index]) { total++; if (cisdStoredHigherTFAligned[index]) passed++; }
        if (cisdStoredMomVolActive[index]) {
            total++;
            if (cisdStoredMomentumPassed[index] || cisdStoredVolumePassed[index]) passed++;
        }
        String score = total > 0 ? passed + "/" + total : "-";

        try (PrintWriter pw = new PrintWriter(new FileWriter(path, true))) {
            if (!fileExists) {
                pw.println("SignalID,SignalTimeNY,WaveStartTimeNY,Date,Day,"
                        + "Session,Instrument,TF,Direction,Grade,Score,"
                        + "Trend,Fib,MS,HTF,MomVol,Confirmed");
            }

            pw.printf(Locale.US,
                    "%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s%n",
                    signalId,
                    signalTime,
                    waveStartTime,
                    signalTime.substring(0, 10),
                    day,
                    session,
                    instrument,
                    chartTf,
                    direction,
                    grade,
                    score,
                    cisdStoredTrendActive[index] ? (cisdStoredTrendPassed[index] ? "1" : "0") : "-",
                    cisdStoredFibActive[index] ? (cisdStoredFibPassed[index] ? "1" : "0") : "-",
                    cisdStoredMSActive[index] ? (cisdStoredMarketStructurePassed[index] ? "1" : "0") : "-",
                    cisdStoredHTFActive[index] ? (cisdStoredHigherTFAligned[index] ? "1" : "0") : "-",
                    cisdStoredMomVolActive[index]
                            ? ((cisdStoredMomentumPassed[index] || cisdStoredVolumePassed[index]) ? "1" : "0")
                            : "-",
                    cisdStoredConfirmed[index] ? "1" : "0");
        } catch (IOException e) {
            context.getConsole().getErr().println("CISD Signal CSV error: " + e.getMessage());
        }
    }

    private String getCurrentTFShortName() {
        long currentInterval = getCurrentChartPeriodMs();
        for (int i = 0; i < PERIOD_COUNT; i++)
            if (PERIOD_INTERVALS[i] == currentInterval) return SHORT_LABELS[i];
        long hours = currentInterval / 3600000L; long minutes = (currentInterval % 3600000L) / 60000L;
        return (hours > 0) ? hours + "h" : minutes + "m";
    }

    private String getCisdFilePath() {
        String instrument = context.getFeedDescriptor().getInstrument().toString().replace("/", "_");
        String tf = getCurrentTFShortName();
        return context.getFilesDir() + File.separator + "HigherTFCandles_cisd_" + instrument + "_" + tf + ".properties";
    }

    private void saveCisdToFile() {
        Properties p = new Properties();
        int count = 0;
        for (int i = 0; i < cisdStoredCount; i++) {
            if (cisdStoredActivationTime[i] == 0) {
                p.setProperty("cisd." + count + ".startTime", String.valueOf(cisdStoredStartTimes[i]));
                p.setProperty("cisd." + count + ".endTime", String.valueOf(cisdStoredEndTimes[i]));
                p.setProperty("cisd." + count + ".entry", String.valueOf(cisdStoredLevels[i]));
                p.setProperty("cisd." + count + ".stop", String.valueOf(cisdStoredStopLevels[i]));
                p.setProperty("cisd." + count + ".bullish", String.valueOf(cisdStoredBullish[i]));
                p.setProperty("cisd." + count + ".breakoutTime", String.valueOf(cisdStoredBreakoutTime[i]));
                p.setProperty("cisd." + count + ".confirmed", String.valueOf(cisdStoredConfirmed[i]));
                p.setProperty("cisd." + count + ".higherTFAligned", String.valueOf(cisdStoredHigherTFAligned[i]));
                p.setProperty("cisd." + count + ".confirmingTFLabel", cisdStoredConfirmingTFLabel[i] != null ? cisdStoredConfirmingTFLabel[i] : "");
                p.setProperty("cisd." + count + ".fibPassed", String.valueOf(cisdStoredFibPassed[i]));
                p.setProperty("cisd." + count + ".fibLabel", cisdStoredFibLabel[i] != null ? cisdStoredFibLabel[i] : "");
                p.setProperty("cisd." + count + ".trendPassed", String.valueOf(cisdStoredTrendPassed[i]));
                p.setProperty("cisd." + count + ".momentumPassed", String.valueOf(cisdStoredMomentumPassed[i]));
                p.setProperty("cisd." + count + ".volumePassed", String.valueOf(cisdStoredVolumePassed[i]));
                p.setProperty("cisd." + count + ".marketStructurePassed", String.valueOf(cisdStoredMarketStructurePassed[i]));
                p.setProperty("cisd." + count + ".filterSymbols", cisdStoredFilterSymbols[i] != null ? cisdStoredFilterSymbols[i] : "");
                p.setProperty("cisd." + count + ".trendActive", String.valueOf(cisdStoredTrendActive[i]));
                p.setProperty("cisd." + count + ".fibActive", String.valueOf(cisdStoredFibActive[i]));
                p.setProperty("cisd." + count + ".msActive", String.valueOf(cisdStoredMSActive[i]));
                p.setProperty("cisd." + count + ".htfActive", String.valueOf(cisdStoredHTFActive[i]));
                p.setProperty("cisd." + count + ".momVolActive", String.valueOf(cisdStoredMomVolActive[i]));
                count++;
            }
        }
        p.setProperty("cisd.count", String.valueOf(count));
        try (FileOutputStream fos = new FileOutputStream(getCisdFilePath())) {
            p.store(fos, "HigherTFCandles CISD");
        } catch (IOException e) { }
    }

    private void loadCisdFromFile() {
        File f = new File(getCisdFilePath());
        if (!f.exists()) return;
        Properties p = new Properties();
        try (FileInputStream fis = new FileInputStream(f)) {
            p.load(fis);
            int count = Integer.parseInt(p.getProperty("cisd.count", "0"));
            for (int i = 0; i < count && cisdStoredCount < MAX_CISD_STORED; i++) {
                String pre = "cisd." + i + ".";
                long startTime = Long.parseLong(p.getProperty(pre + "startTime", "0"));
                long endTime = Long.parseLong(p.getProperty(pre + "endTime", "0"));
                double entry = Double.parseDouble(p.getProperty(pre + "entry", "0"));
                double stop = Double.parseDouble(p.getProperty(pre + "stop", "0"));
                boolean bullish = Boolean.parseBoolean(p.getProperty(pre + "bullish", "false"));
                long breakoutTime = Long.parseLong(p.getProperty(pre + "breakoutTime", "0"));
                boolean confirmed = Boolean.parseBoolean(p.getProperty(pre + "confirmed", "false"));
                boolean higherTFAligned = Boolean.parseBoolean(p.getProperty(pre + "higherTFAligned", "false"));
                String confirmingLabel = p.getProperty(pre + "confirmingTFLabel", null);
                boolean fibPassed = Boolean.parseBoolean(p.getProperty(pre + "fibPassed", "false"));
                String fibLabel = p.getProperty(pre + "fibLabel", null);
                boolean trendPassed = Boolean.parseBoolean(p.getProperty(pre + "trendPassed", "false"));
                boolean momentumPassed = Boolean.parseBoolean(p.getProperty(pre + "momentumPassed", "false"));
                boolean volumePassed = Boolean.parseBoolean(p.getProperty(pre + "volumePassed", "false"));
                boolean marketStructurePassed = Boolean.parseBoolean(p.getProperty(pre + "marketStructurePassed", "false"));
                String filterSymbols = p.getProperty(pre + "filterSymbols", null);
                boolean trendActive = Boolean.parseBoolean(p.getProperty(pre + "trendActive", "false"));
                boolean fibActive = Boolean.parseBoolean(p.getProperty(pre + "fibActive", "false"));
                boolean msActive = Boolean.parseBoolean(p.getProperty(pre + "msActive", "false"));
                boolean htfActive = Boolean.parseBoolean(p.getProperty(pre + "htfActive", "false"));
                boolean momVolActive = Boolean.parseBoolean(p.getProperty(pre + "momVolActive", "false"));

                int idx2 = cisdStoredCount;
                cisdStoredStartTimes[idx2] = startTime;
                cisdStoredEndTimes[idx2] = endTime;
                cisdStoredLevels[idx2] = entry;
                cisdStoredBullish[idx2] = bullish;
                cisdStoredStopLevels[idx2] = stop;
                cisdStoredActivationTime[idx2] = 0;
                cisdStoredDeactivationTime[idx2] = Long.MAX_VALUE;
                cisdStoredBreakoutTime[idx2] = breakoutTime;
                cisdStoredLogged[idx2] = false;
                cisdStoredRetestPlayed[idx2] = false;
                cisdStoredConfirmed[idx2] = confirmed;
                cisdStoredHigherTFAligned[idx2] = higherTFAligned;
                cisdStoredConfirmingTFLabel[idx2] = confirmingLabel;
                cisdStoredFibPassed[idx2] = fibPassed;
                cisdStoredFibLabel[idx2] = fibLabel;
                cisdStoredTrendPassed[idx2] = trendPassed;
                cisdStoredMomentumPassed[idx2] = momentumPassed;
                cisdStoredVolumePassed[idx2] = volumePassed;
                cisdStoredMarketStructurePassed[idx2] = marketStructurePassed;
                cisdStoredFilterSymbols[idx2] = filterSymbols;
                cisdStoredTrendActive[idx2] = trendActive;
                cisdStoredFibActive[idx2] = fibActive;
                cisdStoredMSActive[idx2] = msActive;
                cisdStoredHTFActive[idx2] = htfActive;
                cisdStoredMomVolActive[idx2] = momVolActive;
                cisdStoredCount++;
            }
            if (cisdStoredCount > 0) {
                List<CisdEntry> list = new ArrayList<>();
                for (int i = 0; i < cisdStoredCount; i++) {
                    list.add(new CisdEntry(cisdStoredStartTimes[i], cisdStoredEndTimes[i], cisdStoredLevels[i],
                            cisdStoredStopLevels[i], cisdStoredBullish[i], cisdStoredActivationTime[i],
                            cisdStoredDeactivationTime[i], cisdStoredBreakoutTime[i], cisdStoredLogged[i],
                            cisdStoredRetestPlayed[i], cisdStoredConfirmed[i],
                            cisdStoredHigherTFAligned[i], cisdStoredConfirmingTFLabel[i],
                            cisdStoredFibPassed[i], cisdStoredFibLabel[i],
                            cisdStoredTrendPassed[i], cisdStoredMomentumPassed[i], cisdStoredVolumePassed[i],
                            cisdStoredMarketStructurePassed[i], cisdStoredFilterSymbols[i],
                            cisdStoredTrendActive[i], cisdStoredFibActive[i], cisdStoredMSActive[i],
                            cisdStoredHTFActive[i], cisdStoredMomVolActive[i]));
                }
                cisdStorage.put(getCurrentChartPeriodMs(), list);
                trimCisdStorageIfNeeded();
            }
        } catch (IOException e) { }
    }

    private String getJournalDecisionsPath() {
        return context.getFilesDir() + File.separator + "CISD_Journal_Decisions.csv";
    }

    private void updateJournalDecisionsFromFile() {
        File file = new File(getJournalDecisionsPath());
        long modified = file.exists() ? file.lastModified() : 0;
        if (modified == journalDecisionsLastModified) return;
        journalDecisionsLastModified = modified;
        journalDecisions.clear();
        if (!file.exists()) return;
        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line; boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) { header = false; continue; }
                String[] parts = line.replace("\"", "").split(",", 4);
                if (parts.length >= 2 && parts[0].trim().length() > 0) {
                    journalDecisions.put(parts[0].trim(), parts[1].trim().toUpperCase());
                }
            }
        } catch (IOException ignored) { }
    }

    private String getSignalId(int index) {
        String instrument = context.getFeedDescriptor().getInstrument().toString().replace("/", "_").replace(".", "_");
        String direction = cisdStoredBullish[index] ? "BUY" : "SELL";
        return instrument + "_" + getCurrentTFShortName() + "_" + direction + "_" + cisdStoredEndTimes[index];
    }

    private String findJournalDecision(int index) {
        String exact = journalDecisions.get(getSignalId(index));
        if (exact != null) return exact;
        // A trader may switch chart timeframe after the signal. The decision
        // still belongs to the same instrument, direction and confirmation bar,
        // so fall back to those stable parts of SignalID.
        String instrument = context.getFeedDescriptor().getInstrument().toString().replace("/", "_").replace(".", "_");
        String direction = cisdStoredBullish[index] ? "BUY" : "SELL";
        String suffix = "_" + direction + "_" + cisdStoredEndTimes[index];
        for (Map.Entry<String, String> entry : journalDecisions.entrySet()) {
            if (entry.getKey().startsWith(instrument + "_") && entry.getKey().endsWith(suffix)) return entry.getValue();
        }
        return null;
    }

    private void drawJournalDecision(Graphics2D g2, String decision, int x, int y, boolean bullish, Font oldFont) {
        if (decision == null || decision.length() == 0) return;
        Color color = "ENTERED".equals(decision) ? new Color(0, 170, 80) :
                "SKIPPED".equals(decision) ? new Color(220, 75, 75) :
                "IGNORED".equals(decision) ? new Color(130, 130, 130) : new Color(220, 165, 0);
        String label = "ENTERED".equals(decision) ? "✓ ENTERED" :
                "SKIPPED".equals(decision) ? "× SKIPPED" :
                "IGNORED".equals(decision) ? "— IGNORED" : "⌛ REVIEW";
        g2.setFont(oldFont.deriveFont(Font.BOLD, 9f));
        g2.setColor(color);
        g2.drawString(label, x, bullish ? y + 16 : y - 16);
    }

    private String getSharedCISDPath() {
        return context.getFilesDir() + File.separator + "SharedCISD.csv";
    }

    private List<String[]> readSharedCISDLinesInternal() {
        List<String[]> lines = new ArrayList<>();
        File f = new File(getSharedCISDPath());
        if (!f.exists()) return lines;
        try (BufferedReader br = new BufferedReader(new FileReader(f))) {
            String line;
            while ((line = br.readLine()) != null) {
                String[] parts = line.split(",");
                if (parts.length >= 7) {
                    lines.add(new String[]{parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]});
                } else if (parts.length == 6) {
                    lines.add(new String[]{parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], "false"});
                } else if (parts.length == 5) {
                    lines.add(new String[]{parts[0], parts[1], parts[2], parts[3], parts[4], "0", "false"});
                } else if (parts.length == 4) {
                    lines.add(new String[]{parts[0], parts[1], parts[2], parts[3], "false", "0", "false"});
                }
            }
        } catch (IOException e) { }
        return lines;
    }

    private void writeSharedCISDLine(boolean bullish, double entry, long breakoutTime, boolean confirmed) {
        synchronized (sharedFileLock) {
            try {
                String instrument = context.getFeedDescriptor().getInstrument().toString();
                String tf = getCurrentTFShortName();
                List<String[]> lines = readSharedCISDLinesInternal();
                lines.add(0, new String[]{instrument, tf, (bullish ? "+Cisd" : "-Cisd"), String.valueOf(entry), "false", String.valueOf(breakoutTime), String.valueOf(confirmed)});
                while (lines.size() > maxSharedLines) lines.remove(lines.size() - 1);
                try (PrintWriter pw = new PrintWriter(new FileWriter(getSharedCISDPath()))) {
                    for (String[] l : lines) {
                        pw.println(l[0] + "," + l[1] + "," + l[2] + "," + l[3] + "," + l[4] + "," + l[5] + "," + l[6]);
                    }
                }
            } catch (Exception e) { }
        }
    }

    private void updateSharedAlertsFromFile() {
        if (!sharedCISDAlerts) return;
        File sf = new File(getSharedCISDPath());
        long mod = sf.lastModified();
        if (mod != sharedFileLastModified) {
            sharedFileLastModified = mod;
            synchronized (sharedFileLock) {
                List<String[]> lines = readSharedCISDLinesInternal();
                sharedAlertLines.clear();
                for (int i = 0; i < Math.min(maxSharedLines, lines.size()); i++) {
                    sharedAlertLines.add(lines.get(i));
                }
            }
        }
    }

    // MODIFIED: removed showRiskReward from loadSettings
    private void loadSettings() {
        File f = new File(getSettingsFilePath());
        if (!f.exists()) return;
        try (FileInputStream fis = new FileInputStream(f)) {
            Properties p = new Properties(); p.load(fis);
            for (int i = 0; i < MAX_LAYERS; i++) {
                String pre = "layer" + i + ".";
                layers[i].enabled = getBool(p, pre + "enabled", layers[i].enabled);
                layers[i].periodIndex = getInt(p, pre + "periodIndex", layers[i].periodIndex);
                layers[i].candlesToShow = getInt(p, pre + "candlesToShow", layers[i].candlesToShow);
                layers[i].positionOption = getInt(p, pre + "positionOption", layers[i].positionOption);
                layers[i].candleOffset = getInt(p, pre + "candleOffset", layers[i].candleOffset);
                // layers[i].smtDetecting REMOVED
            }
            showTimer = getBool(p, "showTimer", showTimer);
            candleBodyScale = getInt(p, "candleBodyScale", candleBodyScale);
            candleColorScheme = getInt(p, "candleColorScheme", candleColorScheme);
            showClosure = getBool(p, "showClosure", showClosure);
            closureColorIndex = getInt(p, "closureColorIndex", closureColorIndex);
            closureStyleIndex = getInt(p, "closureStyleIndex", closureStyleIndex);
            closureWidth = getInt(p, "closureWidth", closureWidth);
            closureShadeMode = getInt(p, "closureShadeMode", 1);
            maxHistoryShades = getInt(p, "maxHistoryShades", 3);
            // showRiskReward line REMOVED
            showCISD = getBool(p, "showCISD", showCISD);
            cisdAlertSound = p.getProperty("cisdAlertSound", "alert.wav");
            cisdRetestSound = p.getProperty("cisdRetestSound", "retest.wav");
            cisdSensitivity = getInt(p, "cisdSensitivity", cisdSensitivity);
            ignoreInsideBars = getBool(p, "ignoreInsideBars", ignoreInsideBars);
            momentumFilter = getInt(p, "momentumFilter", 0);
            volumeFilterEnabled = getBool(p, "volumeFilterEnabled", false);
            trendFilter = getInt(p, "trendFilter", 0);
            higherTFConfirmation = getInt(p, "higherTFConfirmation", 0);
            horizontalLevelsMode = getInt(p, "horizontalLevelsMode", 0);
            showStatsPanel = getBool(p, "showStatsPanel", true);
            smtEnabled = getBool(p, "smtEnabled", false);
            cisdGrade = getInt(p, "cisdGrade", 0);
            minRetracement = getInt(p, "minRetracement", 0);
            marketStructureFilter = getInt(p, "marketStructureFilter", 0);
            eqLineLayer = getInt(p, "eqLineLayer", 0);
            saveLoadCISD = getBool(p, "saveLoadCISD", saveLoadCISD);
            sharedCISDAlerts = getBool(p, "sharedCISDAlerts", sharedCISDAlerts);
            maxSharedLines = getInt(p, "maxSharedLines", 5);
            showEntryPrice = getBool(p, "showEntryPrice", showEntryPrice);
            chartTimezone = getInt(p, "chartTimezone", chartTimezone);
            layerSpacing = getInt(p, "layerSpacing", layerSpacing);
            // chartSpacing line REMOVED
            enableLog = getBool(p, "enableLog", enableLog);
            activeSessions = getInt(p, "activeSessions", activeSessions);
            // minRRFilter line REMOVED
            chartCalendar = Calendar.getInstance(getTimezone());
        } catch (IOException e) { }
    }
    // MODIFIED: removed showRiskReward from saveSettings
    private void saveSettings() {
        Properties p = new Properties();
        for (int i = 0; i < MAX_LAYERS; i++) {
            String pre = "layer" + i + ".";
            p.setProperty(pre + "enabled", String.valueOf(layers[i].enabled));
            p.setProperty(pre + "periodIndex", String.valueOf(layers[i].periodIndex));
            p.setProperty(pre + "candlesToShow", String.valueOf(layers[i].candlesToShow));
            p.setProperty(pre + "positionOption", String.valueOf(layers[i].positionOption));
            p.setProperty(pre + "candleOffset", String.valueOf(layers[i].candleOffset));
            // p.setProperty(pre + "smtDetecting") REMOVED
        }
        p.setProperty("showTimer", String.valueOf(showTimer));
        p.setProperty("candleBodyScale", String.valueOf(candleBodyScale));
        p.setProperty("candleColorScheme", String.valueOf(candleColorScheme));
        p.setProperty("showClosure", String.valueOf(showClosure));
        p.setProperty("closureColorIndex", String.valueOf(closureColorIndex));
        p.setProperty("closureStyleIndex", String.valueOf(closureStyleIndex));
        p.setProperty("closureWidth", String.valueOf(closureWidth));
        p.setProperty("closureShadeMode", String.valueOf(closureShadeMode));
        p.setProperty("maxHistoryShades", String.valueOf(maxHistoryShades));
        // showRiskReward line REMOVED
        p.setProperty("showCISD", String.valueOf(showCISD));
        p.setProperty("cisdAlertSound", cisdAlertSound);
        p.setProperty("cisdRetestSound", cisdRetestSound);
        p.setProperty("cisdSensitivity", String.valueOf(cisdSensitivity));
        p.setProperty("ignoreInsideBars", String.valueOf(ignoreInsideBars));
        p.setProperty("momentumFilter", String.valueOf(momentumFilter));
        p.setProperty("volumeFilterEnabled", String.valueOf(volumeFilterEnabled));
        p.setProperty("trendFilter", String.valueOf(trendFilter));
        p.setProperty("higherTFConfirmation", String.valueOf(higherTFConfirmation));
        p.setProperty("horizontalLevelsMode", String.valueOf(horizontalLevelsMode));
        p.setProperty("showStatsPanel", String.valueOf(showStatsPanel));
        p.setProperty("smtEnabled", String.valueOf(smtEnabled));
        p.setProperty("cisdGrade", String.valueOf(cisdGrade));
        p.setProperty("minRetracement", String.valueOf(minRetracement));
        p.setProperty("marketStructureFilter", String.valueOf(marketStructureFilter));
        p.setProperty("eqLineLayer", String.valueOf(eqLineLayer));
        p.setProperty("saveLoadCISD", String.valueOf(saveLoadCISD));
        p.setProperty("sharedCISDAlerts", String.valueOf(sharedCISDAlerts));
        p.setProperty("maxSharedLines", String.valueOf(maxSharedLines));
        p.setProperty("showEntryPrice", String.valueOf(showEntryPrice));
        p.setProperty("chartTimezone", String.valueOf(chartTimezone));
        p.setProperty("layerSpacing", String.valueOf(layerSpacing));
        // chartSpacing line REMOVED
        p.setProperty("enableLog", String.valueOf(enableLog));
        p.setProperty("activeSessions", String.valueOf(activeSessions));
        // minRRFilter line REMOVED
    }

    private boolean getBool(Properties p, String key, boolean def) {
        String v = p.getProperty(key);
        return v == null ? def : "true".equals(v);
    }
    private int getInt(Properties p, String key, int def) {
        try { return Integer.parseInt(p.getProperty(key)); } catch (Exception e) { return def; }
    }

    private String getSettingsFilePath() { return context.getFilesDir() + File.separator + "HigherTFCandles.properties"; }

    // ========== Drawing ==========
    @Override
    public Point drawOutput(Graphics g, int outputIdx, Object values, Color color,
                            Stroke stroke, IIndicatorDrawingSupport support,
                            List<Shape> shapes, Map<Color, List<Point>> handles) {
        if (outputIdx % 4 != 0) return null;
        int candleIdx = outputIdx / 4;
        if (candleIdx >= MAX_CANDLES) return null;

        Graphics2D g2 = (Graphics2D) g;
        Stroke oldStroke = g2.getStroke();
        Font oldFont = g2.getFont();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        if (outputIdx == 0) {
            if (inputs[0] != null && inputs[0].length > 0) {
                IBar lastBar = inputs[0][inputs[0].length - 1];
                checkRetestFrequent(lastBar);
            }
            updateSharedAlertsFromFile();
            // smtSignals = detectSmtDivergence(inputs[0]);  // SMT disabled for now
        }

        int numCandles = support.getNumberOfCandlesOnScreen();
        if (numCandles <= 0) return null;
        int first = support.getIndexOfFirstCandleOnScreen();
        int last = first + numCandles - 1;
        float cW = support.getCandleWidthInPixels(0);
        float sW = support.getSpaceBetweenCandlesInPixels(0);
        float slot = cW + sW;
        if (slot <= 0) return null;

        long chartInterval = getCurrentChartPeriodMs();
        int adjustedLayerSpacing = Math.round(layerSpacing * (candleBodyScale / 100.0f));

        int[] layerBaseSlots = new int[MAX_LAYERS];
        int rightCumulative = 0;
        for (int i = 0; i < MAX_LAYERS; i++) {
            LayerData l = layers[i];
            if (!l.enabled) continue;
            if (getPeriodInterval(l.periodIndex) <= chartInterval) continue;
            if (l.positionOption == 2) {
                int start = Math.max(rightCumulative, l.candleOffset);
                layerBaseSlots[i] = start;
                rightCumulative = start + l.candlesToShow + adjustedLayerSpacing;
            }
        }
        int leftCumulative = 0;
        for (int i = 0; i < MAX_LAYERS; i++) {
            LayerData l = layers[i];
            if (!l.enabled) continue;
            if (getPeriodInterval(l.periodIndex) <= chartInterval) continue;
            if (l.positionOption == 0) {
                int distance = Math.max(leftCumulative, l.candleOffset);
                layerBaseSlots[i] = - (distance + l.candlesToShow - 1);
                leftCumulative = distance + l.candlesToShow + adjustedLayerSpacing;
            }
        }
        int overlapCumulative = 0;
        for (int i = 0; i < MAX_LAYERS; i++) {
            LayerData l = layers[i];
            if (!l.enabled) continue;
            if (getPeriodInterval(l.periodIndex) <= chartInterval) continue;
            if (l.positionOption == 1) {
                layerBaseSlots[i] = - (overlapCumulative + l.candlesToShow - 1);
                overlapCumulative += l.candlesToShow + adjustedLayerSpacing;
            }
        }

        LayerData firstLayer = null;
        int firstLayerIndex = -1;
        for (int i = 0; i < MAX_LAYERS; i++) {
            if (layers[i].enabled && getPeriodInterval(layers[i].periodIndex) > chartInterval) {
                firstLayer = layers[i];
                firstLayerIndex = i;
                break;
            }
        }

        for (int i = 0; i < MAX_LAYERS; i++) {
            LayerData layer = layers[i];
            if (!layer.enabled) continue;
            if (getPeriodInterval(layer.periodIndex) <= chartInterval) continue;

            List<CandleData> displayList = new ArrayList<>(layer.historicalCandles);
            if (layer.currentCandleActive) {
                displayList.add(new CandleData(layer.currentOpen, layer.currentHigh,
                        layer.currentLow, layer.currentClose, layer.currentPeriodStart, false));
            }
            while (displayList.size() > layer.candlesToShow) displayList.remove(0);

            if (candleIdx >= displayList.size()) continue;
            CandleData cd = displayList.get(candleIdx);
            if (cd == null || !isValidOHLC(cd)) continue;

            int baseOffset = layerBaseSlots[i];
            int xCenter;
            if (layer.positionOption == 0) {
                xCenter = (int) (support.getMiddleOfCandle(first) + slot * (baseOffset + candleIdx));
            } else if (layer.positionOption == 1) {
                xCenter = (int) (support.getMiddleOfCandle(last) + slot * (baseOffset + candleIdx));
            } else {
                xCenter = (int) (support.getMiddleOfCandle(last) + slot * (baseOffset + candleIdx));
            }

            float maxWidth = Math.max(1, slot - 2);
            int bodyWidth = Math.max(1, (int) Math.min(cW * (candleBodyScale / 100.0f), maxWidth));
            int halfBody = Math.max(1, bodyWidth / 2);

            int yOpen  = (int) support.getYForValue(cd.open);
            int yHigh  = (int) support.getYForValue(cd.high);
            int yLow   = (int) support.getYForValue(cd.low);
            int yClose = (int) support.getYForValue(cd.close);
            if (yOpen < 0 && yHigh < 0 && yLow < 0 && yClose < 0) continue;
            int top = Math.min(yOpen, yClose);
            int bot = Math.max(yOpen, yClose);
            int bodyH = Math.max(1, bot - top);
            boolean bullish = cd.close >= cd.open;

            g2.setColor(WICK_COLOR);
            g2.setStroke(new BasicStroke(1f));
            g2.drawLine(xCenter, yHigh, xCenter, top);
            g2.drawLine(xCenter, bot, xCenter, yLow);

            g2.setColor(bullish ? BULLISH_BODY_COLOR : BEARISH_BODY_COLOR);
            g2.fillRect(xCenter - halfBody, top, bodyWidth, bodyH);
            g2.setColor(BORDER_COLOR);
            g2.setStroke(new BasicStroke(0.8f));
            g2.drawRect(xCenter - halfBody, top, bodyWidth, bodyH);

            if (eqLineLayer > 0 && (i == eqLineLayer - 1)) {
                long periodMs = getPeriodInterval(layer.periodIndex);
                float[] eqDashPattern = (closureStyleIndex == 0) ? null : (closureStyleIndex == 1) ? new float[]{6f, 4f} : new float[]{1f, 3f};
                Stroke eqStroke = new BasicStroke(closureWidth, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, eqDashPattern, 0f);

                CandleData completedCandle = null;
                for (int idx = displayList.size() - 1; idx >= 0; idx--) {
                    CandleData c = displayList.get(idx);
                    if (c != null && c.completed) {
                        completedCandle = c;
                        break;
                    }
                }
                if (completedCandle != null) {
                    double eqPrice = (completedCandle.high + completedCandle.low) / 2.0;
                    int yEQ = (int) support.getYForValue(eqPrice);
                    int xEQStart = support.getXForTime(completedCandle.openTime, false);
                    long lineEndTime;
                    if (layer.currentCandleActive && layer.currentPeriodStart > completedCandle.openTime) {
                        lineEndTime = layer.currentPeriodStart + periodMs;
                    } else {
                        lineEndTime = completedCandle.openTime + periodMs;
                    }
                    int xEQEnd = support.getXForTime(lineEndTime, false);
                    if (xEQStart >= 0 && xEQEnd >= 0 && yEQ >= 0 && yEQ < support.getChartHeight()) {
                        g2.setColor(CLOSURE_COLORS[closureColorIndex]);
                        g2.setStroke(eqStroke);
                        g2.drawLine(xEQStart, yEQ, xEQEnd, yEQ);
                    }
                }
            }

            if (candleIdx == 0) {
                double highestHigh = -Double.MAX_VALUE;
                int highestIdx = 0;
                for (int idx2 = 0; idx2 < displayList.size(); idx2++) {
                    CandleData c = displayList.get(idx2);
                    if (c != null && !Double.isNaN(c.high) && c.high > highestHigh) {
                        highestHigh = c.high;
                        highestIdx = idx2;
                    }
                }
                if (highestHigh != -Double.MAX_VALUE) {
                    CandleData highestCandle = displayList.get(highestIdx);
                    int labelXCenter;
                    if (layer.positionOption == 0) {
                        labelXCenter = (int) (support.getMiddleOfCandle(first) + slot * (baseOffset + highestIdx));
                    } else if (layer.positionOption == 1) {
                        labelXCenter = (int) (support.getMiddleOfCandle(last) + slot * (baseOffset + highestIdx));
                    } else {
                        labelXCenter = (int) (support.getMiddleOfCandle(last) + slot * (baseOffset + highestIdx));
                    }
                    int labelY = (int) support.getYForValue(highestCandle.high) - 4;
                    String label = SHORT_LABELS[layer.periodIndex];

                    g2.setFont(oldFont.deriveFont(Font.BOLD, 9f));
                    g2.setColor(new Color(100, 100, 100));
                    int textWidth = g2.getFontMetrics().stringWidth(label);
                    g2.drawString(label, labelXCenter - textWidth / 2, labelY);

                    if (showTimer) {
                        long now = System.currentTimeMillis();
                        long periodEnd = layer.currentPeriodStart + getPeriodInterval(layer.periodIndex);
                        long remaining = periodEnd - now;
                        if (remaining > 0) {
                            String timerText = String.format("%02d:%02d:%02d", remaining / 3600000, (remaining % 3600000) / 60000, (remaining % 60000) / 1000);
                            Font timerFont = oldFont.deriveFont(Font.BOLD, 10f);
                            g2.setFont(timerFont);
                            FontMetrics fm = g2.getFontMetrics();
                            int timerWidth = fm.stringWidth(timerText);
                            int timerHeight = fm.getAscent();
                            int timerX = labelXCenter - timerWidth / 2;
                            int timerY = labelY - timerHeight - 5;
                            Color timerBg = bullish ? new Color(0, 200, 0, 100) : new Color(200, 0, 0, 100);
                            g2.setColor(timerBg);
                            g2.fillRect(timerX - 3, timerY - timerHeight, timerWidth + 6, timerHeight + 4);
                            g2.setColor(Color.WHITE);
                            g2.drawString(timerText, timerX, timerY);
                        }
                    }
                }
            }

            if (i == 0 && layer.lsActive && !Double.isNaN(layer.lsPrice)) {
                int xStart = support.getXForTime(layer.lsStartTime, false);
                int xEnd = support.getXForTime(layer.lsEndTime, false);
                if (xStart >= 0 && xEnd >= 0 && xEnd > xStart) {
                    int yLevel = (int) support.getYForValue(layer.lsPrice);
                    Color lsColor = layer.lsBullish ? new Color(0, 150, 255) : new Color(255, 80, 80);
                    g2.setColor(lsColor);
                    g2.setStroke(new BasicStroke(1.0f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, new float[]{4f, 3f}, 0f));
                    g2.drawLine(xStart, yLevel, xEnd, yLevel);
                    String lsLabel = "L.S-" + SHORT_LABELS[layer.periodIndex];
                    g2.setFont(oldFont.deriveFont(Font.BOLD, 9f));
                    FontMetrics fm = g2.getFontMetrics();
                    int textWidth = fm.stringWidth(lsLabel);
                    int textX = (xStart + xEnd) / 2 - textWidth / 2;
                    int textY = yLevel - 4;
                    g2.setColor(new Color(255, 255, 200, 180));
                    g2.fillRect(textX - 2, textY - fm.getAscent(), textWidth + 4, fm.getHeight());
                    g2.setColor(lsColor);
                    g2.drawString(lsLabel, textX, textY);
                }
            }

            if (showClosure && i == 0) {
                int chartHeight = support.getChartHeight();
                long periodMsClosure = getPeriodInterval(layer.periodIndex);
                float[] dashPattern = (closureStyleIndex == 0) ? null : (closureStyleIndex == 1) ? new float[]{6f, 4f} : new float[]{1f, 3f};
                Stroke closureStroke = new BasicStroke(closureWidth, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, dashPattern, 0f);
                
                int xOpenTime = support.getXForTime(cd.openTime, false);
                if (xOpenTime >= 0) {
                    g2.setColor(CLOSURE_COLORS[closureColorIndex]);
                    g2.setStroke(closureStroke);
                    g2.drawLine(xOpenTime, 0, xOpenTime, chartHeight - 1);
                    
                    SimpleDateFormat labelFormat = new SimpleDateFormat("HH:mm");
                    labelFormat.setTimeZone(getTimezone());
                    long startTime = cd.openTime;
                    long endTime = getChartPeriodEnd(startTime, periodMsClosure);
                    String startStr = labelFormat.format(new Date(startTime));
                    String endStr = labelFormat.format(new Date(endTime));
                    String closureLabel = "C" + (candleIdx + 1) + " (" + startStr + "-" + endStr + ")";
                    g2.setFont(oldFont.deriveFont(Font.BOLD, 9f));
                    int closureTextWidth = g2.getFontMetrics().stringWidth(closureLabel);
                    int closureTextX = xOpenTime + 4;
                    if (closureTextX + closureTextWidth > support.getChartWidth()) {
                        closureTextX = xOpenTime - closureTextWidth - 3;
                    }
                    int closureTextY = 12;
                    g2.drawString(closureLabel, closureTextX, closureTextY);
                }
                
                if (cd.completed) {
                    long closeTime = getChartPeriodEnd(cd.openTime, periodMsClosure);
                    int xCloseTime = support.getXForTime(closeTime, false);
                    if (xCloseTime >= 0) {
                        g2.setColor(CLOSURE_COLORS[closureColorIndex]);
                        g2.setStroke(closureStroke);
                        g2.drawLine(xCloseTime, 0, xCloseTime, chartHeight - 1);
                    }
                } else {
                    long futureCloseTime = getChartPeriodEnd(cd.openTime, periodMsClosure);
                    int xFutureClose = support.getXForTime(futureCloseTime, false);
                    if (xFutureClose >= 0) {
                        g2.setColor(CLOSURE_COLORS[closureColorIndex]);
                        g2.setStroke(new BasicStroke(closureWidth, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, 
                            dashPattern, 0f));
                        g2.drawLine(xFutureClose, 0, xFutureClose, chartHeight - 1);
                        SimpleDateFormat labelFormat = new SimpleDateFormat("HH:mm");
                        labelFormat.setTimeZone(getTimezone());
                        String futureLabel = labelFormat.format(new Date(futureCloseTime));
                        g2.setFont(oldFont.deriveFont(Font.BOLD, 9f));
                        int fw = g2.getFontMetrics().stringWidth(futureLabel);
                        int fx = xFutureClose + 4;
                        if (fx + fw > support.getChartWidth()) fx = xFutureClose - fw - 3;
                        g2.drawString(futureLabel, fx, 12);
                    }
                }
            }

            if ((closureShadeMode == 1 || closureShadeMode == 2) && i == firstLayerIndex) {
                long periodMs = getPeriodInterval(layer.periodIndex);
                int totalShades = Math.min(maxHistoryShades, displayList.size() - 1);
                
                for (int idx = displayList.size() - 1; idx >= 1 && (displayList.size() - 1 - idx) < totalShades; idx--) {
                    CandleData currentCandle = displayList.get(idx);
                    if (currentCandle == null || !currentCandle.completed) continue;
                    CandleData prevCandle = displayList.get(idx - 1);
                    if (prevCandle == null || !prevCandle.completed) continue;

                    int xStart = support.getXForTime(currentCandle.openTime, false);
                    int xEnd = support.getXForTime(currentCandle.openTime + periodMs, false);
                    if (xStart < 0 || xEnd < 0) continue;

                    double prevMid = (prevCandle.high + prevCandle.low) / 2.0;
                    int yMid = (int) support.getYForValue(prevMid);

                    if (closureShadeMode == 1) {
                        double halfRange = (prevCandle.high - prevCandle.low) / 2.0;
                        double extreme = (prevCandle.close >= prevCandle.open) ? prevMid - halfRange : prevMid + halfRange;
                        double highPrice = Math.max(prevMid, extreme);
                        double lowPrice = Math.min(prevMid, extreme);
                        int yTop = (int) support.getYForValue(highPrice);
                        int yBottom = (int) support.getYForValue(lowPrice);
                        int rectHeight = yBottom - yTop;
                        if (rectHeight > 0) {
                            Color shadeColor = (prevCandle.close >= prevCandle.open) ? EQ_SHADE_BULLISH : EQ_SHADE_BEARISH;
                            g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.3f));
                            g2.setColor(shadeColor);
                            g2.fillRect(xStart, yTop, xEnd - xStart, rectHeight);
                            g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 1.0f));
                        }
                    } else if (closureShadeMode == 2) {
                        int yCurrentOpen = (int) support.getYForValue(currentCandle.open);
                        int yTop = Math.min(yMid, yCurrentOpen);
                        int yBottom = Math.max(yMid, yCurrentOpen);
                        int rectHeight = yBottom - yTop;
                        if (rectHeight > 0) {
                            boolean isAbove = currentCandle.open > prevMid;
                            Color shadeColor = isAbove ? REBOUND_BULLISH_COLOR : REBOUND_BEARISH_COLOR;
                            g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.3f));
                            g2.setColor(shadeColor);
                            g2.fillRect(xStart, yTop, xEnd - xStart, rectHeight);
                            g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 1.0f));
                        }
                    }
                }
                
                if (layer.currentCandleActive && displayList.size() >= 2) {
                    CandleData currentIncomplete = displayList.get(displayList.size() - 1);
                    CandleData prevCandle = displayList.get(displayList.size() - 2);
                    if (prevCandle != null && prevCandle.completed && !currentIncomplete.completed) {
                        double prevMid = (prevCandle.high + prevCandle.low) / 2.0;
                        int yMid = (int) support.getYForValue(prevMid);
                        long shadeStart = currentIncomplete.openTime;
                        long shadeEnd = currentIncomplete.openTime + periodMs;
                        int x1 = support.getXForTime(shadeStart, false);
                        int x2 = support.getXForTime(shadeEnd, true);
                        if (x1 >= 0 && x2 >= 0 && x2 > x1) {
                            if (closureShadeMode == 1) {
                                double halfRange = (prevCandle.high - prevCandle.low) / 2.0;
                                double extreme = (prevCandle.close >= prevCandle.open) ? prevMid - halfRange : prevMid + halfRange;
                                double highPrice = Math.max(prevMid, extreme);
                                double lowPrice = Math.min(prevMid, extreme);
                                int yTop = (int) support.getYForValue(highPrice);
                                int yBottom = (int) support.getYForValue(lowPrice);
                                int rectHeight = yBottom - yTop;
                                if (rectHeight > 0) {
                                    Color shadeColor = (prevCandle.close >= prevCandle.open) ? EQ_SHADE_BULLISH : EQ_SHADE_BEARISH;
                                    g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.3f));
                                    g2.setColor(shadeColor);
                                    g2.fillRect(x1, yTop, x2 - x1, rectHeight);
                                    g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 1.0f));
                                }
                            } else if (closureShadeMode == 2) {
                                int yCurrentOpen = (int) support.getYForValue(currentIncomplete.open);
                                int yTop = Math.min(yMid, yCurrentOpen);
                                int yBottom = Math.max(yMid, yCurrentOpen);
                                int rectHeight = yBottom - yTop;
                                if (rectHeight > 0) {
                                    boolean isAbove = currentIncomplete.open > prevMid;
                                    Color shadeColor = isAbove ? REBOUND_BULLISH_COLOR : REBOUND_BEARISH_COLOR;
                                    g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.3f));
                                    g2.setColor(shadeColor);
                                    g2.fillRect(x1, yTop, x2 - x1, rectHeight);
                                    g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 1.0f));
                                }
                            }
                        }
                    }
                }
            }
        }

        if (outputIdx == 0) {
            if (horizontalLevelsMode != -1) {
                drawHorizontalLevels(g2, support, oldFont);
            }
            drawCISDLines(g2, support, slot, oldFont);
            // drawRiskRewardLines call REMOVED
            drawSharedAlertsPanel(g2, support, oldFont);
            if (showStatsPanel) {
                drawStatsPanel(g2, support, oldFont);
            }
            // drawSmtDivergence(g2, support, oldFont, smtSignals);  // SMT disabled for now
        }

        g2.setStroke(oldStroke);
        g2.setFont(oldFont);
        return null;
    }

    private void drawHorizontalLevels(Graphics2D g2, IIndicatorDrawingSupport support, Font oldFont) {
        int chartWidth = support.getChartWidth();
        int chartHeight = support.getChartHeight();

        LayerData dailyLayer = null;
        for (LayerData l : layers) {
            if (l.enabled && l.periodIndex == 4) {
                dailyLayer = l;
                break;
            }
        }

        if (horizontalLevelsMode == 0 || horizontalLevelsMode == 2) {
            if (dailyLayer != null && !dailyLayer.historicalCandles.isEmpty()) {
                CandleData lastDaily = dailyLayer.historicalCandles.get(dailyLayer.historicalCandles.size() - 1);
                if (lastDaily != null && lastDaily.completed) {
                    double pdh = lastDaily.high;
                    double pdl = lastDaily.low;
                    Stroke levelStroke = new BasicStroke(1f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, new float[]{4f, 3f}, 0f);
                    
                    int yH = (int) support.getYForValue(pdh);
                    if (yH >= 0 && yH < chartHeight) {
                        g2.setColor(PDH_COLOR);
                        g2.setStroke(levelStroke);
                        g2.drawLine(0, yH, chartWidth, yH);
                        g2.setFont(oldFont.deriveFont(Font.PLAIN, 9f));
                        g2.drawString("PDH", chartWidth - 35, yH - 2);
                    }
                    int yL = (int) support.getYForValue(pdl);
                    if (yL >= 0 && yL < chartHeight) {
                        g2.setColor(PDL_COLOR);
                        g2.setStroke(levelStroke);
                        g2.drawLine(0, yL, chartWidth, yL);
                        g2.setFont(oldFont.deriveFont(Font.PLAIN, 9f));
                        g2.drawString("PDL", chartWidth - 35, yL - 2);
                    }
                }
            }
        }

        if (horizontalLevelsMode == 1 || horizontalLevelsMode == 2) {
            LayerData htfLayer = layers[0];
            if (htfLayer.enabled && !htfLayer.historicalCandles.isEmpty()) {
                int lookback = Math.min(5, htfLayer.historicalCandles.size());
                double swingHigh = Double.MIN_VALUE;
                double swingLow = Double.MAX_VALUE;
                for (int i = htfLayer.historicalCandles.size() - lookback; i < htfLayer.historicalCandles.size(); i++) {
                    CandleData c = htfLayer.historicalCandles.get(i);
                    if (c != null) {
                        if (c.high > swingHigh) swingHigh = c.high;
                        if (c.low < swingLow) swingLow = c.low;
                    }
                }
                Stroke levelStroke = new BasicStroke(1f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, new float[]{4f, 3f}, 0f);
                
                int yH = (int) support.getYForValue(swingHigh);
                if (yH >= 0 && yH < chartHeight) {
                    g2.setColor(SWING_H_COLOR);
                    g2.setStroke(levelStroke);
                    g2.drawLine(0, yH, chartWidth, yH);
                    g2.setFont(oldFont.deriveFont(Font.PLAIN, 9f));
                    g2.drawString("HTF Swing H", chartWidth - 75, yH - 2);
                }
                int yL = (int) support.getYForValue(swingLow);
                if (yL >= 0 && yL < chartHeight) {
                    g2.setColor(SWING_L_COLOR);
                    g2.setStroke(levelStroke);
                    g2.drawLine(0, yL, chartWidth, yL);
                    g2.setFont(oldFont.deriveFont(Font.PLAIN, 9f));
                    g2.drawString("HTF Swing L", chartWidth - 75, yL - 2);
                }
            }
        }
    }

    private void drawCISDLines(Graphics2D g2, IIndicatorDrawingSupport support, float slot, Font oldFont) {
        if (!showCISD || cisdStoredCount == 0) return;
        String tfShort = getCurrentTFShortName();
        updateJournalDecisionsFromFile();
        for (int i = 0; i < cisdStoredCount; i++) {
            long sigStart = cisdStoredStartTimes[i];
            long sigEnd = cisdStoredEndTimes[i];
            double sigLevel = cisdStoredLevels[i];
            boolean sigBullish = cisdStoredBullish[i];

            int xStart = support.getXForTime(sigStart, false);
            int xBreakout = support.getXForTime(sigEnd, false);
            if (xStart >= 0 && xBreakout >= 0) {
                int yLevel = (int) support.getYForValue(sigLevel);
                if (yLevel >= 0 && yLevel < support.getChartHeight()) {
                    int xEnd = xBreakout + (int)(3 * slot);
                    if (xEnd > support.getChartWidth()) xEnd = support.getChartWidth();

                    Color lineColor = sigBullish ? CISD_BULLISH_COLOR : CISD_BEARISH_COLOR;
                    float lineThickness = 2.0f;

                    g2.setColor(lineColor);
                    g2.setStroke(new BasicStroke(lineThickness, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER));
                    g2.drawLine(xStart, yLevel, xEnd, yLevel);

                    String mainLabel = (sigBullish ? "+Cisd" : "-Cisd") + " (" + tfShort + ")";
                    g2.setFont(oldFont.deriveFont(Font.BOLD, 10f));
                    FontMetrics fmMain = g2.getFontMetrics();
                    int cisTextX = xEnd + 4;
                    int cisTextY = yLevel - 4;
                    if (cisTextX + fmMain.stringWidth(mainLabel) > support.getChartWidth())
                        cisTextX = support.getChartWidth() - fmMain.stringWidth(mainLabel) - 10;
                    g2.setColor(lineColor);
                    g2.drawString(mainLabel, cisTextX, cisTextY);
                    drawJournalDecision(g2, findJournalDecision(i), cisTextX, cisTextY, sigBullish, oldFont);
                    int curX = cisTextX + fmMain.stringWidth(mainLabel) + 4;

                    if (cisdStoredRetestPlayed[i]) {
                        Font retestFont = oldFont.deriveFont(Font.ITALIC, 8f);
                        g2.setFont(retestFont);
                        FontMetrics fmRetest = g2.getFontMetrics();
                        String retestStr = "retest";
                        int retestWidth = fmRetest.stringWidth(retestStr);
                        Color retestColor = sigBullish ? new Color(100, 180, 255) : new Color(255, 120, 120);
                        g2.setColor(retestColor);
                        g2.drawString(retestStr, curX, cisTextY);
                        curX += retestWidth + 6;
                    }

                    g2.setFont(oldFont.deriveFont(Font.PLAIN, 7f));
                    FontMetrics fmBadge = g2.getFontMetrics();
                    int badgePadding = 2;
                    int badgeArc = 4;

                    if (cisdStoredFibActive[i] && cisdStoredFibPassed[i]) {
                        drawBadge(g2, "FIB", curX, cisTextY, fmBadge, badgePadding, badgeArc,
                                new Color(0, 180, 0, 150), Color.WHITE);
                        curX += fmBadge.stringWidth("FIB") + badgePadding * 2 + 3;
                    }
                    if (cisdStoredMSActive[i] && cisdStoredMarketStructurePassed[i]) {
                        drawBadge(g2, "STR", curX, cisTextY, fmBadge, badgePadding, badgeArc,
                                new Color(128, 0, 128, 150), Color.WHITE);
                        curX += fmBadge.stringWidth("STR") + badgePadding * 2 + 3;
                    }
                    if (cisdStoredTrendActive[i] && cisdStoredTrendPassed[i]) {
                        drawBadge(g2, "TREND", curX, cisTextY, fmBadge, badgePadding, badgeArc,
                                new Color(0, 100, 200, 150), Color.WHITE);
                        curX += fmBadge.stringWidth("TREND") + badgePadding * 2 + 3;
                    }
                    if (cisdStoredHTFActive[i] && cisdStoredHigherTFAligned[i]) {
                        drawBadge(g2, "HTF", curX, cisTextY, fmBadge, badgePadding, badgeArc,
                                new Color(218, 165, 32, 150), Color.WHITE);
                        curX += fmBadge.stringWidth("HTF") + badgePadding * 2 + 3;
                    }
                    if (cisdStoredMomVolActive[i] && (cisdStoredMomentumPassed[i] || cisdStoredVolumePassed[i])) {
                        drawBadge(g2, "MOM", curX, cisTextY, fmBadge, badgePadding, badgeArc,
                                new Color(255, 140, 0, 150), Color.WHITE);
                        curX += fmBadge.stringWidth("MOM") + badgePadding * 2 + 3;
                    }
                    if (cisdStoredConfirmed[i]) {
                        drawBadge(g2, "CONF", curX, cisTextY, fmBadge, badgePadding, badgeArc,
                                new Color(255, 215, 0, 150), Color.BLACK);
                    }
                }
            }
        }
    }

    private void drawBadge(Graphics2D g2, String text, int x, int y, FontMetrics fm, int pad, int arc,
                           Color bgColor, Color textColor) {
        int textWidth = fm.stringWidth(text);
        int textHeight = fm.getAscent();
        int badgeWidth = textWidth + pad * 2;
        int badgeHeight = textHeight + pad * 2;
        int badgeX = x;
        int badgeY = y - textHeight;
        g2.setColor(bgColor);
        g2.fillRoundRect(badgeX, badgeY, badgeWidth, badgeHeight, arc, arc);
        g2.setColor(textColor);
        g2.drawString(text, badgeX + pad, y);
    }

    // drawRiskRewardLines method REMOVED
    // isSignalActive method REMOVED

    private void drawSharedAlertsPanel(Graphics2D g2, IIndicatorDrawingSupport support, Font oldFont) {
        if (!sharedCISDAlerts || sharedAlertLines.isEmpty()) return;

        Font cardFont = oldFont.deriveFont(Font.BOLD, 8f);
        g2.setFont(cardFont);
        FontMetrics fm = g2.getFontMetrics();
        int cardHeight = fm.getHeight() + 4;
        int cardPaddingX = 4;
        int cardArc = 6;

        int panelX = 10;
        int panelY = 20;

        for (int i = 0; i < sharedAlertLines.size(); i++) {
            String[] parts = sharedAlertLines.get(i);
            if (parts.length < 5) continue;
            String sym = parts[0];
            String tf = parts[1];
            String type = parts[2];
            boolean isBull = type.startsWith("+");
            boolean retest = "true".equals(parts[4]);
            boolean star = parts.length > 6 && "true".equals(parts[6]);

            Color cardBg;
            if (retest) {
                cardBg = new Color(100, 150, 255, 160);
            } else {
                cardBg = isBull ? new Color(0, 180, 0, 160) : new Color(255, 60, 60, 160);
            }

            String arrow = isBull ? "\u25B2" : "\u25BC";
            String displayText = arrow + " " + sym + "  [" + tf + "]";
            if (retest) displayText += " (R)";
            if (showEntryPrice) {
                String entry = parts[3];
                try {
                    double ep = Double.parseDouble(entry);
                    displayText += " @ " + String.format("%.5f", ep);
                } catch (NumberFormatException ignored) {
                    displayText += " @ " + entry;
                }
            }

            int textWidth = fm.stringWidth(displayText);
            int cardWidth = textWidth + cardPaddingX * 2;
            int cardX = panelX;
            int cardY = panelY + i * (cardHeight + 2);

            g2.setColor(cardBg);
            g2.fillRoundRect(cardX, cardY - fm.getAscent() - 1, cardWidth, cardHeight, cardArc, cardArc);

            g2.setColor(new Color(255, 255, 255, 40));
            g2.setStroke(new BasicStroke(0.7f));
            g2.drawRoundRect(cardX, cardY - fm.getAscent() - 1, cardWidth, cardHeight, cardArc, cardArc);
            g2.setColor(new Color(30, 30, 30));
            g2.drawString(displayText, cardX + cardPaddingX, cardY);
        }
    }
    private void drawStatsPanel(Graphics2D g2, IIndicatorDrawingSupport support, Font oldFont) {
        if (cisdStoredCount == 0) return;

        int lastIdx = cisdStoredCount - 1;
        boolean bullish = cisdStoredBullish[lastIdx];
        String dir = bullish ? "+Cisd" : "-Cisd";
        String tf = getCurrentTFShortName();
        String grade = cisdGrade == 0 ? "" : (cisdGrade == 1 ? " [Premium]" : " [Ultimate]");

        StringBuilder filters = new StringBuilder();
        if (cisdStoredTrendActive[lastIdx] && cisdStoredTrendPassed[lastIdx]) filters.append(" TREND");
        if (cisdStoredFibActive[lastIdx] && cisdStoredFibPassed[lastIdx]) filters.append(" FIB");
        if (cisdStoredMSActive[lastIdx] && cisdStoredMarketStructurePassed[lastIdx]) filters.append(" MS");
        if (cisdStoredHTFActive[lastIdx] && cisdStoredHigherTFAligned[lastIdx]) filters.append(" HTF");
        if (cisdStoredMomVolActive[lastIdx] && (cisdStoredMomentumPassed[lastIdx] || cisdStoredVolumePassed[lastIdx])) filters.append(" MOM");

        String[] lines;
        if (cisdStoredRetestPlayed[lastIdx]) {
            lines = new String[]{
                "Signals: " + cisdStoredCount,
                "Last: " + dir + " (" + tf + ")" + grade,
                filters.length() > 0 ? "Filters:" + filters.toString() : "",
                "Retest OK"
            };
        } else {
            lines = new String[]{
                "Signals: " + cisdStoredCount,
                "Last: " + dir + " (" + tf + ")" + grade,
                filters.length() > 0 ? "Filters:" + filters.toString() : ""
            };
        }

        int panelX = 10;
        int panelY = support.getChartHeight() - 80;
        Font font = oldFont.deriveFont(Font.BOLD, 11f);
        g2.setFont(font);
        FontMetrics fm = g2.getFontMetrics();
        int lineHeight = fm.getHeight() + 2;

        int bgWidth = 0;
        for (String line : lines) {
            if (line.isEmpty()) continue;
            int w = fm.stringWidth(line);
            if (w > bgWidth) bgWidth = w;
        }
        bgWidth += 16;
        int bgHeight = lineHeight * lines.length + 10;
        g2.setColor(new Color(20, 20, 30, 220));
        g2.fillRect(panelX - 5, panelY - fm.getAscent() - 5, bgWidth, bgHeight);

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            if (line.isEmpty()) continue;
            Color c = Color.WHITE;
            if (line.startsWith("Last:")) {
                c = line.contains("+Cisd") ? new Color(100, 200, 255) : new Color(255, 100, 100);
            } else if (line.contains("Retest")) {
                c = new Color(100, 200, 100);
            }
            g2.setColor(c);
            g2.drawString(line, panelX, panelY + i * lineHeight);
        }
    }


    private boolean isValidOHLC(CandleData cd) {
        double o = cd.open, h = cd.high, l = cd.low, c = cd.close;
        return !Double.isNaN(o) && !Double.isNaN(h) && !Double.isNaN(l) && !Double.isNaN(c)
            && h >= Math.max(o, c) - 1e-8 && l <= Math.min(o, c) + 1e-8;
    }

    @Override
    public IndicatorInfo getIndicatorInfo() { return indicatorInfo; }
    @Override
    public InputParameterInfo getInputParameterInfo(int i) { return inputParameterInfos[i]; }
    @Override
    public OptInputParameterInfo getOptInputParameterInfo(int i) { return i < optInputParameterInfos.length ? optInputParameterInfos[i] : null; }
    @Override
    public OutputParameterInfo getOutputParameterInfo(int i) { return outputParameterInfos[i]; }
    @Override
    public void setInputParameter(int i, Object o) { inputs[i] = (IBar[]) o; }
    @Override
    public void setOutputParameter(int i, Object o) { outputs[i] = o; }
    @Override
    public int getLookback() { return 0; }
    @Override
    public int getLookforward() { return 0; }

    private static class CandleData {
        long time, openTime;
        boolean completed;
        double open, high, low, close;
        CandleData(IBar bar) {
            time = bar.getTime();
            openTime = bar.getTime();
            completed = true;
            open = bar.getOpen();
            high = bar.getHigh();
            low = bar.getLow();
            close = bar.getClose();
        }
        CandleData(double o, double h, double l, double c, long openTime, boolean completed) {
            this.open = o; this.high = h; this.low = l; this.close = c;
            this.openTime = openTime; this.completed = completed; this.time = openTime;
        }
    }
}
