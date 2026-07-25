const fs = require('fs');
const path = require('path');

function createStore(app) {
  const dataFile = () => path.join(app.getPath('userData'), 'journal-data.json');
  const initial = () => ({
    version: 1,
    accounts: [
      {id:'fundingpips',firm:'FundingPips',name:'FundingPips Account',capital:0,currency:'USD',phase:'Challenge',profitTarget:0,dailyLoss:0,maxDrawdown:0,currentBalance:0},
      {id:'fundednext',firm:'FundedNext',name:'FundedNext Account',capital:0,currency:'USD',phase:'Challenge',profitTarget:0,dailyLoss:0,maxDrawdown:0,currentBalance:0}
    ],
    trades: [], openPositions: [], signals: [], importHistory: [], backtests: [], activeBacktestId: null, daily: [],
    settings: {csvPath:'',timezone:'America/New_York',newsProvider:'FMP',onboardingComplete:false}
  });
  function normalize(data) {
    const base=initial(), d={...base,...(data||{})};
    for (const key of ['accounts','trades','openPositions','signals','backtests','daily','importHistory']) d[key]=Array.isArray(data?.[key])?data[key]:base[key];
    d.settings={...base.settings,...(data?.settings||{})};
    return d;
  }
  function logError(where,error) {
    try { fs.appendFileSync(path.join(app.getPath('userData'),'cisd-journal-errors.log'), `[${new Date().toISOString()}] ${where}: ${error.message||error}\n`); } catch {}
  }
  function read() {
    try { return normalize(JSON.parse(fs.readFileSync(dataFile(),'utf8'))); }
    catch(error) {
      if (fs.existsSync(dataFile())) try { fs.copyFileSync(dataFile(), dataFile()+'.corrupt-'+Date.now()); } catch {}
      logError('read', error); return initial();
    }
  }
  function save(data) {
    const target=dataFile(), temp=target+'.tmp';
    try { fs.writeFileSync(temp, JSON.stringify(normalize(data),null,2)); fs.renameSync(temp,target); }
    catch(error) { try { if(fs.existsSync(temp)) fs.unlinkSync(temp); }catch{} logError('save',error); throw error; }
  }
  return {dataFile,initial,normalize,logError,read,save};
}
module.exports={createStore};
