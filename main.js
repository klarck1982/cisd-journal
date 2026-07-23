const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const fs=require('fs'),path=require('path');
let win, watcher, config={};
const cfg=()=>path.join(app.getPath('userData'),'settings.json');
function load(){try{config=JSON.parse(fs.readFileSync(cfg(),'utf8'))}catch{config={}}}
function save(){fs.writeFileSync(cfg(),JSON.stringify(config,null,2))}
function parseCSV(file){
 const raw=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').trim(); if(!raw)return[];
 const lines=raw.split(/\r?\n/), h=lines.shift().split(',');
 return lines.map(x=>{let a=x.split(','),o={};h.forEach((k,i)=>o[k]=a[i]||'');return o}).filter(x=>x.SignalID);
}
function sendSignals(){try{if(config.csvPath&&fs.existsSync(config.csvPath))win.webContents.send('signals',parseCSV(config.csvPath));}catch(e){win.webContents.send('source-error',e.message)}}
function watch(){if(watcher)fs.unwatchFile(watcher);watcher=config.csvPath;if(watcher)fs.watchFile(watcher,{interval:2000},sendSignals);sendSignals()}
function create(){win=new BrowserWindow({width:1450,height:900,minWidth:1120,minHeight:720,backgroundColor:'#090f19',title:'CISD Journal',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});win.loadFile('renderer/index.html')}
app.whenReady().then(()=>{load();create();ipcMain.handle('get-settings',()=>config);ipcMain.handle('select-csv',async()=>{let r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'CISD Signals CSV',extensions:['csv']}]});if(!r.canceled){config.csvPath=r.filePaths[0];save();watch()}return config.csvPath});ipcMain.handle('select-terminal',async(_,key)=>{let r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'MT5 terminal or shortcut',extensions:['exe','lnk']}]});if(!r.canceled){config[key]=r.filePaths[0];save()}return config[key]||''});ipcMain.handle('launch-terminal',async(_,key)=>{let p=config[key];if(!p)return{ok:false,reason:'not-configured'};let result=await shell.openPath(p);return result?{ok:false,reason:result}:{ok:true}});ipcMain.handle('reload-signals',()=>{sendSignals();return true});watch();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
