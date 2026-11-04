const fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
function environment(localInitial={},sessionInitial={}){
 const local=structuredClone(localInitial),session=structuredClone(sessionInitial),tabs=new Map(),closed=[],sent=[],alarms=new Map(),events={alarm:[],removed:[],updated:[]};let clock=Date.now(),nextTab=40,doc=0;
 const bucket=data=>({get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:typeof keys==='string'?[keys]:Object.keys(data)).filter(k=>k in data).map(k=>[k,structuredClone(data[k])])),set:async value=>Object.assign(data,structuredClone(value)),remove:async keys=>(Array.isArray(keys)?keys:[keys]).forEach(k=>delete data[k])});
 const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p},storage:{local:bucket(local),session:bucket(session)},alarms:{create:async(name,entry)=>alarms.set(name,entry),clear:async name=>alarms.delete(name),onAlarm:{addListener:fn=>events.alarm.push(fn)}},tabs:{create:async options=>{const tab={id:nextTab++,...options,documentId:'doc-'+(++doc)};tabs.set(tab.id,tab);return tab;},update:async(id,options)=>{if(!tabs.has(id))throw Error('closed');Object.assign(tabs.get(id),options,{documentId:'doc-'+(++doc)});return tabs.get(id);},reload:async id=>{if(!tabs.has(id))throw Error('closed');tabs.get(id).documentId='doc-'+(++doc);},get:async id=>{if(!tabs.has(id))throw Error('closed');return tabs.get(id);},remove:async id=>{closed.push(id);tabs.delete(id);},sendMessage:async(id,message,options)=>sent.push({id,message,options}),onRemoved:{addListener:fn=>events.removed.push(fn)},onUpdated:{addListener:fn=>events.updated.push(fn)}}};
 const context=vm.createContext({chrome,crypto:webcrypto,URL,Date:class extends Date{static now(){return clock;}},console});
 vm.runInContext(fs.readFileSync('grades-worker.js','utf8'),context);const api=context.UoocGrades;
 const gradeSender={id:'test',url:'chrome-extension://test/grades.html'};
 const send=(type,data={},role='grades',sender=gradeSender)=>api.handle({type,...data},sender,role);
 async function reply(data,error){const job=session.gradeJob,tab=tabs.get(job.tabId),sender={id:'test',url:job.pending.url,tab:{id:job.tabId},documentId:tab.documentId,frameId:0};const hello=await send('gradeHello',{},'course',sender);if(!hello.task)throw Error('no task');return send('gradeResult',{jobId:job.id,token:hello.task.token,data,error},'course',sender);}
 return {local,session,tabs,closed,sent,alarms,events,api,send,reply,context,now:()=>clock,advance:ms=>clock+=ms};
}
const A='a'.repeat(64),B='b'.repeat(64);const scalar=value=>({value,state:'value'}),unavailable={value:null,state:'unavailable'};
const score=(current=10)=>({state:'read',current:scalar(current),final:unavailable,progress:{value:29,source:'website'},rows:[{label:'视频',weight:scalar(25),total:scalar(38),finished:scalar(11),average:unavailable,progress:scalar(29),weighted:scalar(7.24)}]});
const course=(cycleId='301',status='learn')=>({cycleId,name:'演示课程'+cycleId,term:'2026秋季',status});
async function list(env,courses=[course()],account=A){await env.reply({account,courses,next:false,pageKey:'learn|1'});await env.reply({account,courses:[],next:false,pageKey:'nostart|empty'});await env.reply({account,courses:[],next:false,pageKey:'finish|empty'});}
module.exports={environment,A,B,scalar,score,course,list};
