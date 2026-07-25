async function fetchFMP(key) {
  const from=new Date().toISOString().slice(0,10), to=new Date(Date.now()+8*86400000).toISOString().slice(0,10);
  const response=await fetch(`https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${encodeURIComponent(key)}`);
  if(!response.ok) throw new Error('FMP API error: '+response.status);
  const raw=await response.json();
  return raw.map(item=>({Date:item.date||item.datetime,Country:item.country||'',Event:item.event||item.name||'',Actual:item.actual||'',Previous:item.previous||'',Forecast:item.estimate||item.forecast||'',Importance:/high|3/i.test(String(item.impact||''))?3:/medium|2/i.test(String(item.impact||''))?2:1}));
}
async function fetchTradingEconomics(key) {
  const response=await fetch('https://api.tradingeconomics.com/calendar?c='+encodeURIComponent(key)+'&f=json');
  if(!response.ok) throw new Error('Trading Economics API error: '+response.status);
  return response.json();
}
async function fetchCalendar(provider,key) {
  if(!key) throw new Error('أدخل News API Key من الإعدادات أولاً');
  const data=provider==='FMP'?await fetchFMP(key):await fetchTradingEconomics(key);
  return data.filter(x=>Number(x.Importance||x.importance||0)>=3 && new Date(x.Date||x.date).getTime()>=Date.now()-3600000).sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
}
module.exports={fetchCalendar};
