const assert = require('assert');
const { fetchCalendar } = require('../lib/news-providers');

const originalFetch = global.fetch;
global.fetch = async () => ({
  ok: true,
  json: async () => [
    { title: 'CPI', country: 'USD', date: '2099-01-01T12:00:00Z', impact: 'High', forecast: '2.0%', previous: '2.1%' },
    { title: 'Low item', country: 'USD', date: '2099-01-01T12:00:00Z', impact: 'Low' },
  ],
});

(async () => {
  const events = await fetchCalendar();
  assert.equal(events.length, 1, 'only high-impact Forex Factory events are surfaced');
  assert.equal(events[0].Event, 'CPI');
  assert.equal(events[0].Importance, 3);
  assert.equal(events[0].source, 'Forex Factory');
  global.fetch = originalFetch;
  console.log('News Provider QA: PASS (Forex Factory high-impact calendar)');
})().catch((error) => { global.fetch = originalFetch; throw error; });
