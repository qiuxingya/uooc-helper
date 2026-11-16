const vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
function environment(){
 const local={},session={},jar=[],writes=[],calls=[],events={cookie:[],alarm:[]},alarms=new Map();
 const bucket=data=>({get:async()=>structuredClone(data),set:async d=>Object.assign(data,structuredClone(d)),remove:async keys=>(Array.isArray(keys)?keys:[keys]).forEach(k=>delete data[k])});
 const cookie=()=>({name:'ai-poly',value:'fixture-private-session',domain:'.polymas.com',path:'/',secure:true,httpOnly:true,hostOnly:false,sameSite:'strict',storeId:'0',session:true});
 const key=c=>[c.name,c.domain,c.path,c.storeId].join('|');
 const emit=change=>events.cookie.forEach(fn=>fn(change));
 const context=vm.createContext({URL,TextEncoder,crypto:webcrypto,Date,AbortController,setTimeout,clearTimeout,console,
  chrome:{permissions:{contains:async()=>context.allowed},runtime:{},storage:{local:bucket(local),session:bucket(session)},cookies:{getAll:async()=>structuredClone(jar),get:async q=>structuredClone(jar.find(c=>c.name===q.name&&c.storeId===q.storeId&&c.path===new URL(q.url).pathname)),set:async d=>{writes.push(structuredClone(d));const c={...d,domain:d.domain||new URL(d.url).hostname,hostOnly:!d.domain,session:d.expirationDate===undefined};delete c.url;const i=jar.findIndex(x=>key(x)===key(c));if(i>=0)jar.splice(i,1);jar.push(c);emit({cookie:c,removed:false,cause:'explicit'});if(context.logoutDuringWrite){jar.splice(0);emit({cookie:c,removed:true,cause:'explicit'});}return structuredClone(c);},remove:async q=>{const i=jar.findIndex(c=>c.name===q.name);if(i>=0)jar.splice(i,1);},onChanged:{addListener:f=>events.cookie.push(f)}},alarms:{create:async(n,v)=>alarms.set(n,v),clear:async n=>alarms.delete(n),onAlarm:{addListener:f=>events.alarm.push(f)}},tabs:{query:async()=>[]}},
  fetch:async(url,options)=>{calls.push({url,options});if(context.responder)return context.responder(url,options);if(context.network)throw Error('private-error-detail');return {ok:context.httpStatus===200,status:context.httpStatus,json:async()=>({code:context.code,data:{userNid:'fixture-student',authType:0,schoolInfo:{nid:'fixture-school'}}})};}
 });
 context.allowed=true;context.code=200;context.httpStatus=200;
 for(const file of ['polymas-api.js','polymas-login.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 const call=(type,data={},role='options')=>context.PolymasLogin.handle({type,...data},{},role);
 return {context,local,session,jar,writes,calls,events,alarms,cookie,emit,call,api:context.PolymasAPI};
}
module.exports={environment};
