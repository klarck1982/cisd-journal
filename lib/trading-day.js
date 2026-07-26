const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Returns the calendar day (YYYY-MM-DD) for a given instant in a given IANA timezone.
 *
 * Prop-firm daily loss limits reset on the broker/firm trading day, not on the UTC day.
 * Using `toISOString().slice(0, 10)` rolls the day over at 00:00 UTC, which is 20:00 or
 * 19:00 in New York — while the trading day is still open. That would wrongly reset the
 * daily loss budget mid-session.
 */
function tradingDayKey(value, timezone = DEFAULT_TIMEZONE) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';

  try {
    // en-CA gives an ISO-like YYYY-MM-DD format.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

module.exports = {
  DEFAULT_TIMEZONE,
  tradingDayKey,
};
