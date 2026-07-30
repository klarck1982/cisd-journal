package com.dukascopy.indicators;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

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
