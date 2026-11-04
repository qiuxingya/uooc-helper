const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');const {environment}=require('./vault-env.cjs');
const url='https://www.uooc.net.cn/home/learn/index#/101/202/303/section';
const course=(id=1,address=url)=>({id:'test',url:address,tab:{id},frameId:0,documentId:'doc-'+id});
function setup(fetch){const env=environment({}, {},fetch,{},true);let clock=Date.now();env.context.Date=class extends Date{static now(){return clock;}};return Object.assign(env,{advance:ms=>clock+=ms,now:()=>clock});}
const send=(env,type,data={},sender=course())=>env.send(type,data,sender);
test('overlapping tabs merge watch intervals and same-day completion is unique',async()=>{
 const env=setup();let now=env.now();await send(env,'activityReport',{segments:[[now-10000,now]],ended:true,resource:'#/101/202/303/section',position:{title:'课程',chapter:'第一节',seconds:120}});
 await send(env,'activityReport',{segments:[[now-5000,now]],ended:true,resource:'#/101/202/303/section'},course(2));let result=(await env.send('overview')).result;assert.equal(result.today.milliseconds,10000);assert.equal(result.today.videos,1);assert.equal(result.recent[0].seconds,120);
 env.advance(10000);now=env.now();await send(env,'activityReport',{segments:[[now-10000,now]],ended:true,resource:'#/101/202/404/section'},course(2));result=(await env.send('overview')).result;assert.equal(result.today.milliseconds,20000);assert.equal(result.today.videos,2);
});
test('cross-midnight segments split days and records expire after 30 days',async()=>{
 const env=setup();env.advance(new Date(2026,9,30,0,0,2).getTime()-env.now());const now=env.now();await send(env,'activityReport',{segments:[[now-4000,now]],ended:true,resource:'v1'});let result=(await env.send('overview')).result;assert.equal(result.today.milliseconds,2000);assert.equal(result.recent30.milliseconds,4000);env.advance(31*86400000);result=(await env.send('overview')).result;assert.equal(result.recent30.milliseconds,0);assert.equal(result.recent30.videos,0);
});
test('statistics reject invalid ranges and unknown resources do not increment persistent completion',async()=>{
 const env=setup();assert.match((await send(env,'activityReport',{segments:[[0,Date.now()]]})).error,/范围/);await send(env,'activityReport',{segments:[],ended:true,resource:null});assert.equal((await env.send('overview')).result.today.videos,0);
});
test('logs store only fixed fields and cap at 1000 entries',async()=>{
 const env=setup();await send(env,'eventLog',{event:'error',stage:'quiz',code:'MODEL',apiKey:'secret',text:'private question',answers:['private answer']});let result=(await env.send('logsExport')).result;assert.equal(result.logs[0].code,'MODEL');assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('secret'));
 env.local.activityData.logs=Array.from({length:1005},()=>({time:env.now(),version:'0.9.0',event:'pause',stage:'idle',code:'PAUSE'}));result=(await env.send('logsExport')).result;assert.equal(result.logs.length,1000);
});
test('timers are per-tab and stale stops cannot clear a new run; worker restore repairs alarms',async()=>{
 const env=setup();const response=await send(env,'timerStart',{minutes:1,run:'one'});assert.equal(response.result.deadline,env.now()+60000);await send(env,'timerStart',{minutes:15,run:'other'},course(2));
 await send(env,'timerStop',{run:'stale'});assert.ok(env.alarms.has('uooc-stop:1'));env.alarms.clear();await vm.runInContext('UoocActivity.restore()',env.context);assert.equal(env.alarms.size,2);
 env.advance(61000);await vm.runInContext("UoocActivity.expire('1')",env.context);assert.equal(env.sent[0].id,1);assert.equal(env.sent[0].message.run,'one');assert.ok(env.session.learningTimers['2']);await send(env,'timerStop',{run:'other'},course(2));assert.equal(env.alarms.has('uooc-stop:2'),false);
});
test('cancel affects only the sender tab and discarded results never escape',async()=>{
 const finish=[];const env=setup(async(url,options)=>new Promise(resolve=>finish.push(()=>resolve({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answers:[0],explanation:'ok',uncertain:false})}}]})}))));env.local.apiKey='test-only';
 const q={text:'题',type:'single',options:['甲','乙']};const a=send(env,'solve',{question:q},course(1)),b=send(env,'solve',{question:q},course(2));while(finish.length<2)await new Promise(r=>setTimeout(r,5));await send(env,'cancelRequests',{tabId:2},course(1));assert.equal(env.calls[0].signal.aborted,true);assert.equal(env.calls[1].signal.aborted,false);finish.forEach(f=>f());assert.match((await a).error,/取消/);assert.ok((await b).result);
});
test('role checks, settings whitelist, orb reset and clear history preserve API key',async()=>{
 const env=setup();env.local.apiKey='keep';assert.match((await send(env,'logsExport')).error,/扩展/);assert.match((await env.send('timerStart',{minutes:1})).error,/课程页/);
 assert.match((await env.send('settingsSave',{settings:{apiKey:'injected'}})).error,/字段/);const good={delay:4,rate:1.5,timerMinutes:30,sound:false,questionSelector:'',stemSelector:'',nextSelector:''};assert.ok(!(await env.send('settingsSave',{settings:good})).error);assert.equal(env.local.apiKey,'keep');assert.equal(env.synced.settings.rate,1.5);
 await send(env,'orbSave',{position:{x:.5,y:1}});assert.equal(env.local.orbPosition.x,.5);await env.send('resetOrb');assert.equal(env.local.orbPosition,undefined);await env.send('clearHistory');assert.equal((await env.send('overview')).result.recent.length,0);assert.equal(env.local.apiKey,'keep');
});
test('settings JSON validates versions, byte limits and forbidden fields',()=>{
 const env=setup();const parse=text=>{env.context.text=text;return vm.runInContext('UoocSettings.parse(text)',env.context);};assert.equal(parse(JSON.stringify({format:'uooc-settings',version:1,settings:{rate:1.25}})).rate,1.25);
 for(const value of [{format:'uooc-settings',version:2,settings:{}},{format:'uooc-settings',version:1,settings:{apiKey:'secret'}},{format:'uooc-settings',version:1,settings:{rate:4}},{format:'uooc-settings',version:1,settings:{sound:'yes'}}])assert.throws(()=>parse(JSON.stringify(value)));
 assert.throws(()=>parse(' '.repeat(65537)),/64 KB/);
});

test('模型与设置使用一次本机写入，同步失败明确返回',async()=>{const env=setup();const writes=[];const original=env.context.chrome.storage.local.set;env.context.chrome.storage.local.set=async d=>{writes.push(d);return original(d);};env.context.chrome.storage.sync.set=async()=>{throw Error('模拟同步失败');};const response=await env.send('settingsSave',{settings:{...env.context.UoocSettings.defaults,rate:1.5},model:'example-model'});assert.equal(response.error,undefined);assert.equal(response.result.syncWarning,true);assert.equal(env.local.model,'example-model');assert.equal(env.local.rate,1.5);assert.equal(writes.length,1);});
test('本机设置写入失败时模型及设置均保留，旧版保存返回兼容',async()=>{const env=setup();env.local.model='old';env.context.chrome.storage.local.set=async()=>{throw Error('模拟写入失败');};const response=await env.send('settingsSave',{settings:{...env.context.UoocSettings.defaults,rate:1.5},model:'new'});assert.match(response.error,/模拟/);assert.equal(env.local.model,'old');assert.equal(env.local.rate,undefined);const old=setup();const result=await old.send('settingsSave',{settings:{...old.context.UoocSettings.defaults,rate:1.25}});assert.equal(result.result.rate,1.25);assert.equal(result.result.settings,undefined);});
