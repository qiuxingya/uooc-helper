const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');function setup(error=null){const c=vm.createContext({setTimeout,clearTimeout,AbortController,chrome:{storage:{local:{get:async()=>({updater:{error,source:'static-v1'}}),set:async()=>{}}},permissions:{contains:async()=>false},runtime:{id:'test',getManifest:()=>({version:'2.1.1'})},alarms:{onAlarm:{addListener:()=>{}}},tabs:{onRemoved:{addListener:()=>{}}}}});vm.runInContext(fs.readFileSync('updater.js','utf8'),c);return c.UoocUpdater;}
test('更新后台保留中文错误并提供固定错误代码',async()=>{await assert.rejects(setup().handle({type:'updateCheck'},{},'popup'),e=>e.code==='API_PERMISSION'&&e.message.includes('授权'));const view=await setup('HASH_MISMATCH').handle({type:'updateGet'},{},'popup');assert.equal(view.errorCode,'HASH_MISMATCH');assert.match(view.error,/校验失败/);});
test('课程脚本不能读取更新状态或发起安装',async()=>{await assert.rejects(setup().handle({type:'updateInstall'},{},'course'),/仅供扩展页面/);});

test('写入待安装版本失败后清理忙碌状态，未调用助手安装',async()=>{
 const saved={source:'static-v1',attemptedAt:Date.now(),latest:{version:'2.1.3',sha256:'a'.repeat(64)}};
 const commands=[];
 const c=vm.createContext({setTimeout,clearTimeout,AbortController,URL,chrome:{
  storage:{local:{get:async()=>({updater:saved}),set:async({updater})=>{if(updater.pendingVersion)throw Error('写入失败');Object.assign(saved,updater);}},session:{get:async()=>({})}},
  permissions:{contains:async()=>true},
  runtime:{id:'test',getManifest:()=>({version:'2.1.2'}),connectNative:()=>{
   let receive;
   return {onMessage:{addListener:fn=>receive=fn},onDisconnect:{addListener:()=>{}},disconnect:()=>{},postMessage:m=>{commands.push(m.command);receive({ok:true,version:'2.1.2',helperVersion:'1.1.0'});}};
  }},
  alarms:{onAlarm:{addListener:()=>{}}},tabs:{query:async()=>[],onRemoved:{addListener:()=>{}}}
 }});
 vm.runInContext(fs.readFileSync('updater.js','utf8'),c);
 await assert.rejects(c.UoocUpdater.handle({type:'updateInstall'},{},'popup'),e=>e.code==='UPDATE_FAILED');
 const state=await c.UoocUpdater.handle({type:'updateGet'},{},'popup');
 assert.equal(state.installing,false);assert.equal(state.progress,null);assert.equal(state.pendingVersion,null);
 assert.deepEqual(commands,['status']);
});
