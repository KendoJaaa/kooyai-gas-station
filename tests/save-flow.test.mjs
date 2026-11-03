import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EventEmitter} from 'node:events'
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {build} from 'esbuild'

const require=createRequire(import.meta.url)
const ports={
  './mongo':['pullRemoteStore','pushRemoteStore'],
  './companyDb':['companyDatabaseUri'],
  './syncSettings':['loadSyncSettings','saveSyncSettings'],
  './sentry':['reportSyncFailure','reportSyncSkipped'],
  './updates':['checkForUpdate','downloadAvailableUpdate','getUpdateStatus','installUpdateHooks']
}
const mainBundle=await build({
  entryPoints:['src/main/index.ts'],bundle:true,platform:'node',format:'cjs',write:false,
  external:['electron','@electron-toolkit/utils'],
  plugins:[{name:'isolated-store-ports',setup(builder){
    builder.onResolve({filter:/^\.\//},args=>{
      if(args.importer.replaceAll('\\','/').endsWith('/src/main/index.ts')&&ports[args.path])return {path:args.path,namespace:'ports'}
    })
    builder.onLoad({filter:/.*/,namespace:'ports'},args=>({
      contents:ports[args.path].map(name=>`export const ${name}=(...args)=>__ports.${name}(...args)`).join('\n')
    }))
    builder.onLoad({filter:/[/\\]src[/\\]main[/\\]index\.ts$/},async args=>({
      contents:(await readFile(args.path,'utf8'))+'\nexport {saveStore,exportPdf,printSnapshots};',loader:'ts'
    }))
  }}]
})
const sharedBundle=await build({
  stdin:{contents:"export * from './src/shared/reports'; export {DEFAULT_IDENTITY} from './src/shared/station'",resolveDir:process.cwd()},
  bundle:true,platform:'node',format:'esm',write:false
})
const {emptyDay,emptyDelivery,korSheets,khorSheets,DEFAULT_IDENTITY}=await import(`data:text/javascript;base64,${Buffer.from(sharedBundle.outputFiles[0].text).toString('base64')}`)

function stores(){
  const config={layoutId:'custom',fuelTypes:[{id:'fuel',code:'TEST',nameTh:'ทดสอบ',pricePerLiter:35,sortOrder:1}],
    tanks:[{id:'tank',fuelTypeId:'fuel',tankNo:1,openingStock:1000,openingVariance:0}],
    machines:[{id:'nozzle',fuelTypeId:'fuel',tankId:'tank',nozzleNo:1,row:1,openingMeter:0}]}
  const baseline={...emptyDay(),meters:{nozzle:0},tankSticks:{tank:1000}}
  const current={...emptyDay(),meters:{nozzle:200},prices:{fuel:35},tankSticks:{tank:815},savedAt:'2026-11-03T00:00:00.000Z'}
  const earlier={...emptyDay(),meters:{nozzle:100},prices:{fuel:35},tankSticks:{tank:960},savedAt:'2026-11-02T00:00:00.000Z',
    deliveries:[{...emptyDelivery(1,'2026-11-01'),litersByTank:{tank:50}}]}
  const local={config,identity:DEFAULT_IDENTITY,setupCompleted:true,activeDate:'2026-11-02',updatedAt:'2026-11-03T00:00:00.000Z',
    days:{'2026-10-31':baseline,'2026-11-02':current}}
  return {local,remote:{...local,days:{'2026-10-31':baseline,'2026-11-01':earlier}}}
}

async function fixture(t,{remote=null,noUri=false,syncError=false,settingsError=false}={}){
  const root=await mkdtemp(join(tmpdir(),'Pum save regression '))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const ipcMain=new EventEmitter()
  let api
  let settingsWrites=0
  let uploaded
  class PrintWindow{
    constructor(){
      this.webContents={id:42,printToPDF:async()=>Buffer.from(JSON.stringify(api.printSnapshots.get(42)))}
    }
    async loadFile(){ipcMain.emit('print:ready',{sender:this.webContents})}
    isDestroyed(){return false}
    close(){}
  }
  const module={exports:{}}
  class FixedDate extends Date{
    constructor(...args){super(...(args.length?args:['2026-11-03T12:00:00.000Z']))}
    static now(){return Date.parse('2026-11-03T12:00:00.000Z')}
  }
  runInNewContext(mainBundle.outputFiles[0].text,{
    module,exports:module.exports,__dirname:root,Date:FixedDate,Buffer,URLSearchParams,console,setTimeout,clearTimeout,
    process:{platform:'win32',env:{}},
    __ports:{
      companyDatabaseUri:async()=>noUri?'':'synthetic-test-uri',
      pullRemoteStore:async()=>{if(syncError)throw new Error('Synthetic connection failure');return structuredClone(remote)},
      pushRemoteStore:async(_uri,store)=>{uploaded=structuredClone(store)},
      loadSyncSettings:async()=>({}),
      saveSyncSettings:async()=>{if(settingsError&&settingsWrites++===0)throw new Error('Synthetic settings failure')},
      reportSyncFailure(){},reportSyncSkipped(){},installUpdateHooks(){},
      checkForUpdate(){},downloadAvailableUpdate(){},getUpdateStatus(){}
    },
    require(name){
      if(name==='electron')return {
        app:{getPath:()=>root,whenReady:()=>new Promise(()=>{}),on(){}},
        BrowserWindow:PrintWindow,ipcMain,dialog:{showSaveDialog:async()=>({filePath:join(root,'report.pdf'),canceled:false})}
      }
      if(name==='@electron-toolkit/utils')return {is:{dev:false}}
      return require(name)
    }
  })
  api=module.exports
  return {api,root,disk:async()=>JSON.parse(await readFile(join(root,'station.json'),'utf8')),uploaded:()=>uploaded}
}

test('saving returns the actual merged store used for the form and report',async t=>{
  const {local,remote}=stores()
  const f=await fixture(t,{remote})
  const result=await f.api.saveStore(local)
  assert.equal(result.ok,true)
  assert.equal(result.synced,true)
  const saved=JSON.parse(JSON.stringify(result.store))
  assert.deepEqual(saved,await f.disk())
  assert.ok(saved.days['2026-11-01'],'the renderer receives newly synced history')
  const day=saved.days[saved.activeDate]
  const tank=khorSheets(saved.config,saved.activeDate,saved.days,day)[0]
  assert.equal(tank.variance,-45)
  assert.equal(tank.varianceCarry,-35)
  assert.equal(korSheets(saved.config,saved.activeDate,saved.days,day)[0].gross.baht,3500)
  assert.ok(f.uploaded().days['2026-11-01'])
})

test('daily PDF uses the returned saved snapshot even if another operation later changes the local file',async t=>{
  const {local,remote}=stores()
  const f=await fixture(t,{remote})
  const result=await f.api.saveStore(local)
  assert.equal(result.ok,true)
  await writeFile(join(f.root,'station.json'),JSON.stringify({...local,activeDate:'2026-10-31'}))
  const pdf=await f.api.exportPdf('daily',undefined,result.store)
  assert.equal(pdf.ok,true,JSON.stringify(pdf))
  const printed=JSON.parse(await readFile(pdf.filePath,'utf8'))
  assert.deepEqual(printed,JSON.parse(JSON.stringify(result.store)))
  assert.equal(printed.activeDate,'2026-11-02')
  assert.equal(f.api.printSnapshots.size,0,'the immutable print snapshot is cleaned up')
})

for(const mode of ['noUri','syncError'])test(`${mode}: offline save returns the same store written locally`,async t=>{
  const {local}=stores()
  const f=await fixture(t,{[mode]:true})
  const result=await f.api.saveStore(local)
  assert.equal(result.ok,true)
  assert.equal(result.synced,false)
  assert.deepEqual(JSON.parse(JSON.stringify(result.store)),await f.disk())
})

test('a settings-file failure after syncing cannot replace merged records with the stale submitted store',async t=>{
  const {local,remote}=stores()
  const f=await fixture(t,{remote,settingsError:true})
  const result=await f.api.saveStore(local)
  assert.equal(result.ok,true)
  assert.ok(result.store.days['2026-11-01'])
  assert.ok((await f.disk()).days['2026-11-01'])
})

test('legacy PDF calls still work, and malformed explicit snapshots are rejected',async t=>{
  const {local}=stores()
  const f=await fixture(t,{noUri:true})
  await f.api.saveStore(local)
  const pdf=await f.api.exportPdf()
  assert.equal(pdf.ok,true,JSON.stringify(pdf))
  assert.equal(JSON.parse(await readFile(pdf.filePath,'utf8')).activeDate,local.activeDate)
  assert.equal((await f.api.exportPdf('daily',undefined,{invalid:true})).ok,false)
})

test('the preload forwards the saved store and exact PDF snapshot across the IPC boundary',async()=>{
  const preload=await build({entryPoints:['src/preload/index.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false})
  const {local}=stores()
  const calls=[]
  let bridge
  const module={exports:{}}
  runInNewContext(preload.outputFiles[0].text,{
    module,exports:module.exports,process:{versions:{electron:'22.3.27'},contextIsolated:true},
    require(name){
      if(name==='electron')return {
        contextBridge:{exposeInMainWorld(name,value){if(name==='api')bridge=value}},
        ipcRenderer:{async invoke(channel,...args){calls.push({channel,args});return channel==='store:save'?{ok:true,store:local,synced:true}:{ok:false,canceled:true}}}
      }
      if(name==='@electron-toolkit/preload')return {electronAPI:{}}
      return require(name)
    }
  })
  const saved=await bridge.saveStore(local)
  await bridge.exportPdf(saved.store)
  assert.equal(calls[0].channel,'store:save')
  assert.equal(calls[1].channel,'pdf:export')
  assert.equal(calls[1].args[0],saved.store)
})
