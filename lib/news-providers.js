async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFMP(key) {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
  const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${encodeURIComponent(key)}`;
  let response;
  try {
    response = await fetchWithTimeout(url);
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('FMP request timed out after 15s - check internet or firewall');
      e.code = 'newsNetworkTimeout';
      throw e;
    }
    const e = new Error(`Network error contacting FMP: ${err.message}`);
    e.code = 'newsNetworkError';
    throw e;
  }

  if (!response.ok) {
    let body = '';
    try { body = await response.text(); } catch {}
    // Common FMP errors: 401 invalid key, 402 limit, 403 forbidden
    if (response.status === 401) {
      const e = new Error(`FMP: مفتاح API غير صالح أو منتهي (401). تأكد من نسخ المفتاح كاملاً من financialmodelingprep.com. التفاصيل: ${body.slice(0,200)}`);
      e.code = 'newsKeyInvalid';
      throw e;
    }
    if (response.status === 402) {
      const e = new Error(`FMP: تم استهلاك الحد اليومي للمفتاح المجاني (402). جرب غداً أو استخدم مزود مجاني بدون مفتاح من الإعدادات. التفاصيل: ${body.slice(0,200)}`);
      e.code = 'newsKeyLimit';
      throw e;
    }
    if (response.status === 429) {
      const e = new Error(`FMP: كثرة الطلبات (429). انتظر دقيقة ثم حاول.`);
      e.code = 'newsRateLimit';
      throw e;
    }
    const e = new Error(`FMP API error: ${response.status} ${response.statusText} - ${body.slice(0,300)}`);
    e.code = response.status >= 500 ? 'newsServerError' : 'newsApiError';
    throw e;
  }

  let raw;
  try {
    raw = await response.json();
  } catch (err) {
    const e = new Error(`FMP returned invalid JSON: ${err.message}`);
    e.code = 'newsParseError';
    throw e;
  }

  if (!Array.isArray(raw)) {
    // Sometimes FMP returns { Error Message: ... } when key is wrong
    if (raw && raw['Error Message']) {
      const e = new Error(`FMP: ${raw['Error Message']}`);
      e.code = 'newsKeyInvalid';
      throw e;
    }
    const e = new Error(`FMP returned unexpected format: ${JSON.stringify(raw).slice(0,300)}`);
    e.code = 'newsParseError';
    throw e;
  }

  return raw.map(item => ({
    Date: item.date || item.datetime,
    Country: item.country || '',
    Event: item.event || item.name || '',
    Actual: item.actual || '',
    Previous: item.previous || '',
    Forecast: item.estimate || item.forecast || '',
    Importance: /high|3/i.test(String(item.impact || '')) ? 3 : /medium|2/i.test(String(item.impact || '')) ? 2 : 1
  }));
}

async function fetchTradingEconomics(key) {
  const url = `https://api.tradingeconomics.com/calendar?c=${encodeURIComponent(key)}&f=json`;
  let response;
  try {
    response = await fetchWithTimeout(url);
  } catch (err) {
    const e = new Error(`Trading Economics network error: ${err.message}`);
    e.code = 'newsNetworkError';
    throw e;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const e = new Error(`Trading Economics API error ${response.status}: ${body.slice(0,300)}`);
    e.code = 'newsApiError';
    throw e;
  }
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

// مصدر مجاني 100% بدون مفتاح - ForexFactory calendar (öffentlich)
function parseForexFactoryTimeToISO(dateStr, timeStr) {
  // dateStr: "2026-07-28", timeStr: "08:30am" أو "2:15pm" أو "All Day"
  if (!dateStr) return new Date().toISOString();
  if (!timeStr || /all day/i.test(timeStr) || timeStr.trim() === '') {
    return `${dateStr}T00:00:00.000Z`;
  }
  const m = String(timeStr).trim().match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return `${dateStr}T00:00:00.000Z`;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const ampm = (m[3] || '').toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  const hourStr = String(hour).padStart(2, '0');
  return `${dateStr}T${hourStr}:${minute}:00.000Z`;
}

async function fetchFreeForexFactory() {
  const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
  try {
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'CISD-Journal/1.0' }
    }, 12000);
    if (!response.ok) throw new Error(`Free provider HTTP ${response.status}`);
    const raw = await response.json();
    const mapped = (Array.isArray(raw) ? raw : []).map(item => {
      const impactStr = String(item.impact || '').toLowerCase();
      let importance = 1;
      if (impactStr.includes('high') || impactStr === 'red' || item.impact === 3) importance = 3;
      else if (impactStr.includes('medium') || impactStr === 'orange' || item.impact === 2) importance = 2;

      const dateStr = item.date || '';
      const timeStr = item.time || '';
      const isoDate = parseForexFactoryTimeToISO(dateStr, timeStr);

      return {
        Date: isoDate,
        Country: item.country || '',
        Event: item.title || item.event || '',
        Actual: item.actual || '',
        Previous: item.previous || '',
        Forecast: item.forecast || '',
        Importance: importance,
        _source: 'free'
      };
    });
    return mapped;
  } catch (err) {
    const e = new Error(`المزود المجاني فشل أيضاً: ${err.message}. تأكد من اتصال الإنترنت.`);
    e.code = 'newsFreeFailed';
    throw e;
  }
}

async function fetchCalendar(provider, key) {
  // المزود المجاني لا يحتاج مفتاح
  if (provider === 'FREE' || provider === 'free') {
    const data = await fetchFreeForexFactory();
    return data.filter(x => Number(x.Importance || 0) >= 3 && new Date(x.Date || x.date).getTime() >= Date.now() - 3600000)
      .sort((a, b) => new Date(a.Date || a.date) - new Date(b.Date || b.date));
  }

  if (!key) {
    const e = new Error('Enter a News API key from Settings first');
    e.code = 'newsKeyRequired';
    throw e;
  }

  const data = provider === 'FMP' ? await fetchFMP(key) : await fetchTradingEconomics(key);
  return data.filter(x => Number(x.Importance || x.importance || 0) >= 3 && new Date(x.Date || x.date).getTime() >= Date.now() - 3600000)
    .sort((a, b) => new Date(a.Date || a.date) - new Date(b.Date || b.date));
}

module.exports = { fetchCalendar };

