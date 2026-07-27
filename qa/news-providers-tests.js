const assert=require('assert');
const {fetchCalendar}=require('../lib/news-providers');
const realFetch=global.fetch;
async function run(){
  const future=new Date(Date.now()+3600000).toISOString();
  global.fetch=async url=>({
    ok:true,
    json:async()=>{
      if(url.includes('financialmodelingprep')) return [{date:future,country:'United States',event:'CPI',actual:'',previous:'3.0%',estimate:'3.1%',impact:'High'}];
      if(url.includes('faireconomy')) return [{date:future.split('T')[0], time:'11:59pm', country:'USD', title:'CPI', impact:'High', actual:'', previous:'3.0%', forecast:'3.1%'}];
      return [{Date:future,Country:'United States',Event:'NFP',Actual:'',Previous:'150K',Forecast:'180K',Importance:3}];
    },
    text:async()=>JSON.stringify([{date:future}])
  });
  let fmp=await fetchCalendar('FMP','key');assert.equal(fmp.length,1);assert.equal(fmp[0].Importance,3);assert.equal(fmp[0].Event,'CPI');
  let te=await fetchCalendar('TE','key');assert.equal(te.length,1);assert.equal(te[0].Event,'NFP');
  let free=await fetchCalendar('FREE','');assert.equal(free.length,1);assert.equal(free[0].Importance,3);assert.equal(free[0].Event,'CPI');
  global.fetch=realFetch;
  console.log('News Provider QA: PASS (FMP mapping, Trading Economics mapping, FREE provider, high-impact filter)');
}
run().catch(e=>{global.fetch=realFetch;throw e});
