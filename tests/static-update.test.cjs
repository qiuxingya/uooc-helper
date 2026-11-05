const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');function setup(){const c=vm.createContext({setTimeout,clearTimeout,AbortController,URL,chrome:{storage:{local:{get:async()=>({}),set:async()=>{}}},permissions:{contains:async()=>true},runtime:{getManifest:()=>({version:'2.1.2'})},alarms:{onAlarm:{addListener:()=>{}}},tabs:{onRemoved:{addListener:()=>{}}}}});vm.runInContext(fs.readFileSync('updater.js','utf8'),c);return c.UoocUpdater;}
const good=()=>({format:'uooc-update',schemaVersion:1,version:'2.1.3',tag:'v2.1.3',downloadUrl:'https://github.com/qiuxingya/uooc-helper/releases/download/v2.1.3/uooc-helper-2.1.3.zip',size:123,sha256:'a'.repeat(64),notes:'更新说明'});
test('静态清单字段正确转换，拒绝不可信下载和无效数据',()=>{const api=setup();assert.equal(api.parseManifest(good()).version,'2.1.3');for(const patch of [{format:'other'},{schemaVersion:2},{version:'bad'},{tag:'v2.1.2'},{size:0},{size:1.1},{size:52428801},{sha256:'bad'},{downloadUrl:'https://evil.example/file.zip'}])assert.throws(()=>api.parseManifest({...good(),...patch}));});
test('插件和本机助手日常更新不使用 GitHub REST API',()=>{for(const name of ['updater.js','native-updater/UoocUpdater.cs'])assert.ok(!fs.readFileSync(name,'utf8').includes('api.github.com'));assert.match(fs.readFileSync('native-updater/UoocUpdater.cs','utf8'),/HelperVersion="1.1.0"/);});

test('手动重试检查立即恢复网络错误，成功后仍使用冷却时间',async()=>{
 let saved={source:'static-v1'},requests=0;
 const c=vm.createContext({setTimeout,clearTimeout,AbortController,URL,
  fetch:async()=>{if(++requests===1)throw Error('network');return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(good())};},
  chrome:{storage:{local:{get:async()=>({updater:saved}),set:async d=>saved=d.updater}},permissions:{contains:async()=>true},
   runtime:{getManifest:()=>({version:'2.1.2'})},alarms:{create:async()=>{},onAlarm:{addListener:()=>{}}},tabs:{onRemoved:{addListener:()=>{}}}}
 });
 vm.runInContext(fs.readFileSync('updater.js','utf8'),c);
 const check=()=>c.UoocUpdater.handle({type:'updateCheck'},{},'popup');
 await assert.rejects(check(),e=>e.code==='NETWORK');
 assert.equal((await check()).latest.version,'2.1.3');
 assert.equal((await check()).errorCode,null);
 assert.equal(requests,2);
});

test('更新检查遵循 Retry-After，冷却结束后区分损坏清单',async()=>{
 let saved={source:'static-v1'},requests=0;
 const clock={now:Date.now()};
 class TestDate extends Date{static now(){return clock.now;}}
 const c=vm.createContext({setTimeout,clearTimeout,AbortController,URL,Date:TestDate,
  fetch:async()=>++requests===1
   ?{ok:false,status:429,headers:{get:key=>key==='retry-after'?'120':null}}
   :{ok:true,status:200,headers:{get:()=>null},text:async()=>'<html>unexpected</html>'},
  chrome:{storage:{local:{get:async()=>({updater:saved}),set:async d=>saved=d.updater}},permissions:{contains:async()=>true},
   runtime:{getManifest:()=>({version:'2.1.2'})},alarms:{create:async()=>{},onAlarm:{addListener:()=>{}}},tabs:{onRemoved:{addListener:()=>{}}}}
 });
 vm.runInContext(fs.readFileSync('updater.js','utf8'),c);
 const check=()=>c.UoocUpdater.handle({type:'updateCheck'},{},'popup');
 await assert.rejects(check(),e=>e.code==='GITHUB_RATE_LIMIT');
 assert.equal(saved.retryAt,clock.now+120000);
 clock.now+=119000;
 await assert.rejects(check(),e=>e.code==='GITHUB_RATE_LIMIT');
 assert.equal(requests,1);
 clock.now+=1000;
 await assert.rejects(check(),e=>e.code==='INVALID_RELEASE');
 assert.equal(requests,2);
});

test('静态请求跟随下载重定向并清除旧 API 限流缓存，404 不误报最新',async()=>{let saved={retryAt:Date.now()+999999,error:'GITHUB_RATE_LIMIT',latest:{version:'9.9.9'}},request;const c=vm.createContext({setTimeout,clearTimeout,AbortController,URL,fetch:async(url,options)=>{request={url,options};return {ok:true,status:200,url:'https://release-assets.githubusercontent.com/file',headers:{get:()=>null},text:async()=>JSON.stringify(good())};},chrome:{storage:{local:{get:async()=>({updater:saved}),set:async d=>saved=d.updater}},permissions:{contains:async()=>true},runtime:{getManifest:()=>({version:'2.1.2'})},alarms:{create:async()=>{},onAlarm:{addListener:()=>{}}},tabs:{onRemoved:{addListener:()=>{}}}}});vm.runInContext(fs.readFileSync('updater.js','utf8'),c);const result=await c.UoocUpdater.handle({type:'updateCheck'},{},'popup');assert.equal(result.latest.version,'2.1.3');assert.match(request.url,/releases\/latest\/download\/update.json$/);assert.equal(request.options.redirect,'follow');assert.equal(saved.source,'static-v1');assert.equal(saved.retryAt,null);saved={source:'static-v1'};c.fetch=async()=>({ok:false,status:404,headers:{get:()=>null}});await assert.rejects(c.UoocUpdater.handle({type:'updateCheck'},{},'popup'),e=>e.code==='NO_RELEASE');assert.equal(saved.error,'NO_RELEASE');});

test('自动安装路径同样拦截旧助手，不调用 prepare 或 REST API',async()=>{const commands=[];let saved={source:'static-v1',autoCheck:true,autoInstall:true,attemptedAt:Date.now(),checkedAt:Date.now(),latest:{version:'2.1.3',sha256:'a'.repeat(64)}};const c=vm.createContext({setTimeout,clearTimeout,AbortController,URL,fetch:async()=>{throw Error('unexpected fetch');},chrome:{storage:{local:{get:async()=>({updater:saved}),set:async d=>saved=d.updater},session:{get:async()=>({})}},permissions:{contains:async()=>true},runtime:{id:'test',getManifest:()=>({version:'2.1.2'}),connectNative:()=>{let callback;return {onMessage:{addListener:fn=>callback=fn},onDisconnect:{addListener:()=>{}},disconnect:()=>{},postMessage:m=>{commands.push(m.command);callback({ok:true,version:'2.1.2',helperVersion:'1.0.0'});}};}},alarms:{create:async()=>{},onAlarm:{addListener:()=>{}}},tabs:{query:async()=>[],onRemoved:{addListener:()=>{}}}}});vm.runInContext(fs.readFileSync('updater.js','utf8'),c);await assert.rejects(c.UoocUpdater.handle({type:'updateInstall'},{},'popup'),e=>e.code==='HELPER_UPGRADE_REQUIRED');assert.deepEqual(commands,['status']);assert.equal(saved.error,'HELPER_UPGRADE_REQUIRED');});
