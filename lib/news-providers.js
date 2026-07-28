/**
 * Economic news source: Forex Factory's public weekly calendar feed.
 *
 * CISD Journal intentionally has one source, not a confusing provider picker.
 * It requires no user account or API key and we keep only high-impact upcoming
 * events, which are the ones relevant to a funded trader's risk decisions.
 */
async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CISD-Journal/1.0', Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeImpact(value) {
  const impact = String(value || '').toLowerCase();
  if (impact === 'high' || impact === 'red' || impact === '3') return 3;
  if (impact === 'medium' || impact === 'orange' || impact === '2') return 2;
  return 1;
}

async function fetchCalendar() {
  const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
  let response;
  try {
    response = await fetchWithTimeout(url);
  } catch (error) {
    const failure = new Error(`تعذر الاتصال بتقويم Forex Factory: ${error.message}`);
    failure.code = error.name === 'AbortError' ? 'newsNetworkTimeout' : 'newsNetworkError';
    throw failure;
  }
  if (!response.ok) {
    const failure = new Error(`Forex Factory أعاد رمز اتصال ${response.status}`);
    failure.code = 'newsApiError';
    throw failure;
  }

  let rows;
  try {
    rows = await response.json();
  } catch (error) {
    const failure = new Error('تعذر قراءة بيانات Forex Factory.');
    failure.code = 'newsParseError';
    throw failure;
  }
  if (!Array.isArray(rows)) {
    const failure = new Error('Forex Factory أعاد بيانات غير متوقعة.');
    failure.code = 'newsParseError';
    throw failure;
  }

  return rows
    .map((item) => ({
      Date: item.date || '',
      Country: item.country || '',
      Event: item.title || item.event || '',
      Actual: item.actual || '',
      Previous: item.previous || '',
      Forecast: item.forecast || '',
      Importance: normalizeImpact(item.impact),
      source: 'Forex Factory',
    }))
    .filter((item) => item.Importance >= 3 && new Date(item.Date).getTime() >= Date.now() - 3600000)
    .sort((a, b) => new Date(a.Date) - new Date(b.Date));
}

module.exports = { fetchCalendar };
