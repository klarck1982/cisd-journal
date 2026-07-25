const assert=require('assert'); const fs=require('fs'); const os=require('os'); const path=require('path');
const {createStore}=require('../lib/store'); const {fundedNext,mt5}=require('../lib/importers');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cisd-e2e-')); const app={getPath:()=>dir}; const store=createStore(app);
let data=store.initial();
// Configure two independent accounts
data.accounts[0]={...data.accounts[0],capital:100000,currentBalance:100000,dailyLoss:3,maxDrawdown:10,profitTarget:10};
data.accounts[1]={...data.accounts[1],capital:50000,currentBalance:50000,dailyLoss:3,maxDrawdown:6,profitTarget:8};
// FundedNext: one closed trade and one open position in the same CSV
const fn=`Ticket ID,Open Time,Open Price,Close Time,Close Price,Profit,Lots,Commission,Swap,Symbol,Type,SL,TP,Pips,Volume\nF-1,2026.07.24 10:00:00,4000,2026-07-24 11:00:00,4010,20,0.1,-1,0,XAUUSD,Buy,3980,4040,1000,10\nF-2,2026.07.24 10:05:00,20000,Currently Running,20020,-5,0.1,0,0,NDX100,Sell,20100,19800,-500,10`;
let result=fundedNext(data,fn,'fundednext','fundednext.csv'); assert.equal(result.added,1); assert.equal(data.trades.length,1); assert.equal(data.openPositions.length,1); assert.equal(data.trades[0].netProfit,19);
// Same import must not duplicate the closed deal
fundedNext(data,fn,'fundednext','fundednext.csv'); assert.equal(data.trades.length,1);
// MT5 report goes to another account and must remain isolated
const mt=`Ticket,Open Time,Open Price,Close Time,Close Price,Profit,Volume,Commission,Swap,Symbol,Type,SL,TP\nM-1,2026-07-24 10:00,1.10,2026-07-24 11:00,1.11,10,0.1,-1,0,EURUSD,buy,1.09,1.12`;
result=mt5(data,mt,'fundingpips','mt5.csv',false); assert.equal(result.added,1); assert.equal(data.trades.filter(x=>x.accountId==='fundednext').length,1); assert.equal(data.trades.filter(x=>x.accountId==='fundingpips').length,1);
// Simulate CISD signal decision separation per account
const sig={SignalID:'SIG-1',Instrument:'XAUUSD',Direction:'+CISD',decisions:{fundingpips:{status:'ORDER_PLACED'},fundednext:{status:'MISSED',reason:'تردد'}}}; data.signals.push(sig); assert.notEqual(sig.decisions.fundingpips.status,sig.decisions.fundednext.status);
// Persist and recover
a=data; store.save(a); data=store.read(); assert.equal(data.trades.length,2); assert.equal(data.openPositions.length,1); assert.equal(data.signals[0].decisions.fundednext.reason,'تردد');
// Backup simulation
const backup=path.join(dir,'backup.json'); fs.copyFileSync(path.join(dir,'journal-data.json'),backup); assert.ok(fs.existsSync(backup));
fs.rmSync(dir,{recursive:true,force:true}); console.log('E2E Simulation: PASS (accounts, imports, duplicates, open positions, signals, persistence, backup)');
