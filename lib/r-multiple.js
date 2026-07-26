/**
 * R-multiple calculation.
 *
 * R is the single most important unit in a trading journal: it expresses every result
 * as a multiple of the risk originally taken, which makes trades of different sizes and
 * instruments directly comparable.
 *
 * Until now the trader had to type R by hand, which meant every edge metric depended on
 * human data entry. Entry, stop-loss and close price are already stored on imported
 * trades, so R can be derived exactly:
 *
 *     risk    = |entry - stopLoss|
 *     reward  = close - entry      (inverted for sell trades)
 *     R       = reward / risk
 */

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isSell(side) {
  return /^(sell|short)$/i.test(String(side || '').trim());
}

/**
 * Derives the R-multiple for a closed trade.
 * Returns null when the inputs cannot produce a trustworthy value — the caller must
 * never fabricate an R, because a wrong R silently corrupts every downstream metric.
 */
function calculateRMultiple(trade = {}) {
  const entry = toNumber(trade.entry);
  const stop = toNumber(trade.sl);
  const close = toNumber(trade.close);

  if (entry === null || stop === null || close === null) return null;
  if (entry === 0 || stop === 0) return null;

  const risk = Math.abs(entry - stop);
  if (risk === 0) return null;

  const rawReward = close - entry;
  const reward = isSell(trade.side) ? -rawReward : rawReward;

  const r = reward / risk;
  if (!Number.isFinite(r)) return null;

  // Guard against corrupt data producing absurd values (e.g. a stop set 1 tick away).
  if (Math.abs(r) > 100) return null;

  return Math.round(r * 100) / 100;
}

/**
 * Fills in `resultR` when it is missing but can be derived.
 * A value the trader entered manually always wins — the journal must never overwrite
 * a human judgement with a computed guess.
 */
function withDerivedR(trade = {}) {
  const hasManualR = trade.resultR !== null && trade.resultR !== undefined && trade.resultR !== '';
  if (hasManualR) return trade;

  const derived = calculateRMultiple(trade);
  if (derived === null) return trade;

  return { ...trade, resultR: derived, resultRSource: 'derived' };
}

module.exports = {
  calculateRMultiple,
  withDerivedR,
};
