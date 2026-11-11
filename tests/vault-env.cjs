const vm=require('node:vm'),fs=require('node:fs');const {webcrypto}=require('node:crypto');const source=fs.readFileSync('background.js','utf8');
function environment(initial={},sessionInitial={},fetchImpl,deviceState={},features=false){
 const local=structuredClone(initial),session=structuredClone(sessionInitial),synced={};let listener,failRead=false;const alarms=new Map(),sent=[],listeners={};
 const bucket=(data,sessionBucket=false)=>({setAccessLevel:async()=>{},get:async keys=>{
  if(!sessionBucket&&failRead&&keys==='keyVault'){failRead=false;return {keyVault:{bad:true}};}
  return Object.fromEntries((Array.isArray(keys)?keys:typeof keys==='string'?[keys]:Object.keys(data)).filter(k=>k in data).map(k=>[k,structuredClone(data[k])]));
 },set:async values=>Object.assign(data,structuredClone(values)),remove:async keys=>(Array.isArray(keys)?keys:[keys]).forEach(k=>delete data[k])});
 let calls=[];
 const context=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,btoa,atob,Date,URL,TypeError,SyntaxError,
  fetch:async(url,options)=>{calls.push({url,...options});if(fetchImpl)return fetchImpl(url,options);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answers:[0],explanation:'ok',uncertain:false})}}]})};},
  chrome:{storage:{local:bucket(local),session:bucket(session,true),sync:{set:async data=>Object.assign(synced,structuredClone(data)),get:async()=>synced}},alarms:{create:async(name,info)=>alarms.set(name,info),clear:async name=>alarms.delete(name),get:async name=>alarms.get(name),onAlarm:{addListener:fn=>listeners.alarm=fn}},tabs:{sendMessage:async(id,message)=>sent.push({id,message}),query:async()=>[],onRemoved:{addListener:fn=>listeners.removed=fn}},runtime:{getManifest:()=>({version:'0.9.0'}),id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn}}}});
 context.__deviceState=deviceState;if(features){vm.runInContext(fs.readFileSync('platforms.js','utf8'),context);vm.runInContext(fs.readFileSync('settings.js','utf8'),context);vm.runInContext(fs.readFileSync('activity.js','utf8'),context);}vm.runInContext(source,context);
 // Unit tests substitute the IndexedDB key boundary; real extension tests exercise IndexedDB itself.
 vm.runInContext(`deviceKey=async(create=false)=>{if(!__deviceState.key){if(!create)throw Error('本机加密密钥缺失，请重新粘贴 API Key 并保存');__deviceState.key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);}return __deviceState.key;};`,context);
 const sender={id:'test',url:'chrome-extension://test/options.html'};
 return {local,session,calls,context,deviceState,synced,alarms,sent,listeners,corruptNextRead:()=>failRead=true,
  send:(type,data={},who=sender)=>new Promise(resolve=>{const handled=listener({type,...data},who,resolve);if(!handled)resolve(undefined);}),
  solve:()=>vm.runInContext(`solve({text:'题目',type:'single',options:['甲','乙']})`,context)};
}
module.exports={environment};
