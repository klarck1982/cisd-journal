/** Timeframe board: recent signals remain visible without a 170-row list. */
function signalTimeframeBucket(signal) {
  const tf = String(signal.TF || '').toLowerCase();
  const minutes = Number((tf.match(/\d+/) || [0])[0]);
  if (!minutes || minutes < 15) return '< 15min';
  if (minutes === 15) return '15min';
  if (minutes === 30) return '30min';
  if (minutes === 60 || tf.includes('1h')) return '1H';
  return '4H';
}
function renderSignalBoard(signals) {
  $('#signalsLatestList').innerHTML = renderListRows(signals.slice(0, 5), renderSignalCard, { key: 'signals', action: 'chooseCsv' });
  const buckets = ['< 15min', '15min', '30min', '1H', '4H'];
  $('#signalTimeframeBoard').innerHTML = buckets.map((bucket) => {
    const rows = signals.filter((signal) => signalTimeframeBucket(signal) === bucket).slice(0, 5);
    return `<section class="signal-tf-column"><h4>${escapeHtml(bucket)}</h4><div class="signal-list">${renderListRows(rows, renderSignalCard, 'signals')}</div>${signals.filter((signal) => signalTimeframeBucket(signal) === bucket).length > 5 ? '<span class="panel-hint">+ more</span>' : ''}</section>`;
  }).join('');
}
