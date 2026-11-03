(() => {
 const DAY=86400000,KEEP=30*DAY,prefix='uooc-stop:';
 let queue=Promise.resolve();
 const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
 const today=time=>{const d=new Date(time);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 const cleanText=(text,max=120)=>typeof text==='string'?text.replace(/[\u0000-\u001f]/g,' ').slice(0,max):'';
 function route(raw){
  if(globalThis.UoocPlatforms)return UoocPlatforms.route(raw);
  const u=new URL(raw);if(!/^https?:$/.test(u.protocol)||!/(^|\.)uooc\.net\.cn$/i.test(u.hostname)||u.port||u.username||u.password)throw Error('课程地址不受支持');
  const hash=/^#\/[a-zA-Z0-9/_-]*$/.test(u.hash)?u.hash:'';
  return u.origin+u.pathname+hash;
 }
 function identity(raw){if(globalThis.UoocPlatforms)return UoocPlatforms.identity(raw);const u=new URL(route(raw)),parts=u.hash.slice(2).split('/');return /^\d+$/.test(parts[0])&&/^\d+$/.test(parts[1])?u.origin+u.pathname+'#/'+parts.slice(0,2).join('/'):u.origin+u.pathname;}
 function prune(data,now){
  data.days||={};data.recent||=[];data.logs||=[];
  for(const [day,entry] of Object.entries(data.days)){
   for(const [key,item] of Object.entries(entry)){
    item.intervals=item.intervals.filter(([a,b])=>b>now-KEEP).map(([a,b])=>[Math.max(a,now-KEEP),b]);item.completed=item.completed.filter(x=>x.time>now-KEEP);
    if(!item.intervals.length&&!item.completed.length)delete entry[key];
   }
   if(!Object.keys(entry).length)delete data.days[day];
  }
  data.recent=data.recent.filter(r=>r.time>now-KEEP).slice(0,10);
  data.logs=data.logs.filter(r=>r.time>now-KEEP).slice(-1000);return data;
 }
 async function load(){const {activityData}=await chrome.storage.local.get('activityData');return prune(activityData||{days:{},recent:[],logs:[]},Date.now());}
 function merge(intervals,segment){const list=[...intervals,segment].sort((a,b)=>a[0]-b[0]),out=[];for(const [a,b] of list){const last=out.at(-1);if(last&&a<=last[1])last[1]=Math.max(b,last[1]);else out.push([a,b]);}return out;}
 const codes=new Set(['START','PAUSE','TIMER','VIDEO_END','PLAYBACK','QUESTION','SAVE','CONFIRM','VERIFY','MODEL','NETWORK','ADAPTER','MANUAL','UNKNOWN']);
 function logEntry(data,event,stage,code){data.logs.push({time:Date.now(),version:chrome.runtime.getManifest().version,event:['start','pause','error','complete','diagnostic','timer','stage'].includes(event)?event:'error',stage:['video','quiz','navigation','idle'].includes(stage)?stage:'idle',code:codes.has(code)?code:'UNKNOWN'});data.logs=data.logs.slice(-1000);}
 async function report(message,sender){
  const now=Date.now(),data=await load(),url=route(sender.url),course=identity(url);
  const segments=Array.isArray(message.segments)?message.segments:[];
  if(segments.length>20)throw Error('统计批次过大');
  for(const pair of segments){
   if(!Array.isArray(pair)||pair.length!==2||!pair.every(Number.isFinite))throw Error('统计时间格式错误');
   const [start,end]=pair;if(start<now-60000||end>now+1000||start>end||end-start>15000)throw Error('统计时间超出范围');
   let cursor=start;
   while(cursor<end){const date=new Date(cursor),midnight=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime(),until=Math.min(end,midnight),day=today(cursor);const bucket=data.days[day]||=(Object.create(null));const item=bucket[course]||={intervals:[],completed:[]};item.intervals=merge(item.intervals,[cursor,until]);cursor=until;}
  }
  const resource=typeof message.resource==='string'&&/^[a-zA-Z0-9/_#:-]{1,220}$/.test(message.resource)?message.resource:null;
  if(message.ended===true&&resource){const bucket=data.days[today(now)]||=(Object.create(null)),item=bucket[course]||={intervals:[],completed:[]};if(!item.completed.some(x=>x.id===resource))item.completed.push({id:resource,time:now});}
  if(message.position&&Number.isFinite(message.position.seconds)&&message.position.seconds>=0){
   data.recent=data.recent.filter(r=>r.course!==course);data.recent.unshift({course,url,title:cleanText(message.position.title)||'优课课程',chapter:cleanText(message.position.chapter)||'当前资源',seconds:Math.min(message.position.seconds,86400),time:now});data.recent=data.recent.slice(0,10);
  }
  if(message.ended)logEntry(data,'complete','video','VIDEO_END');
  await chrome.storage.local.set({activityData:prune(data,now)});return {ok:true};
 }
 function summarize(data){
  const result={today:{milliseconds:0,videos:0},recent30:{milliseconds:0,videos:0},recent:data.recent};
  for(const [day,courses] of Object.entries(data.days))for(const item of Object.values(courses)){const ms=item.intervals.reduce((sum,[a,b])=>sum+b-a,0),n=item.completed.length;result.recent30.milliseconds+=ms;result.recent30.videos+=n;if(day===today(Date.now())){result.today.milliseconds+=ms;result.today.videos+=n;}}
  return result;
 }
 async function timer(message,sender){
  const key=String(sender.tab.id),name=prefix+key;
  const {learningTimers={}}=await chrome.storage.session.get('learningTimers');
  if(message.type==='timerStop'){if(learningTimers[key]&&learningTimers[key].run!==message.run)return {};delete learningTimers[key];await chrome.storage.session.set({learningTimers});await chrome.alarms.clear(name);return {};}
  const minutes=message.minutes;if(!Number.isInteger(minutes)||minutes<0||minutes>240)throw Error('定时时长无效');
  const deadline=minutes?Date.now()+minutes*60000:0;
  const run=typeof message.run==='string'?message.run.slice(0,80):'';
  learningTimers[key]={deadline,run,documentId:sender.documentId||null};await chrome.storage.session.set({learningTimers});
  if(deadline)await chrome.alarms.create(name,{when:deadline});else await chrome.alarms.clear(name);
  return {deadline};
 }
 async function expire(tabId,expected){
  return serial(async()=>{
   const {learningTimers={}}=await chrome.storage.session.get('learningTimers'),entry=learningTimers[tabId];
   if(!entry||!entry.deadline||entry.deadline>Date.now()||(expected&&entry.run!==expected))return;
   delete learningTimers[tabId];await chrome.storage.session.set({learningTimers});
   globalThis.cancelTabRequests?.(Number(tabId));
   try{await chrome.tabs.sendMessage(Number(tabId),{type:'timerExpired',run:entry.run},entry.documentId?{documentId:entry.documentId}:{frameId:0});}catch{}
  });
 }
 async function restore(){
  await serial(async()=>{const data=await load();await chrome.storage.local.set({activityData:data});});
  const {learningTimers={}}=await chrome.storage.session.get('learningTimers');
  for(const [tabId,item] of Object.entries(learningTimers))if(item.deadline){if(item.deadline<=Date.now())await expire(tabId,item.run);else await chrome.alarms.create(prefix+tabId,{when:item.deadline});}
 }
 chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name.startsWith(prefix))expire(alarm.name.slice(prefix.length)).catch(()=>{});});
 chrome.tabs.onRemoved.addListener(tabId=>{globalThis.cancelTabRequests?.(tabId);serial(async()=>{const {learningTimers={}}=await chrome.storage.session.get('learningTimers');delete learningTimers[tabId];await chrome.storage.session.set({learningTimers});await chrome.alarms.clear(prefix+tabId);}).catch(()=>{});});
 globalThis.UoocActivity={route,identity,merge,prune,summarize,restore,expire,
  async handle(message,sender,role){
   const courseTypes=['activityReport','eventLog','timerStart','timerStop','cancelRequests','uiGet','orbSave','settingsPatch'];
   if(courseTypes.includes(message.type)){
    if(role!=='course')throw Error('此操作仅供课程页使用');
    if(message.type==='uiGet'){const data=await chrome.storage.local.get([...Object.keys(UoocSettings.defaults),'orbPosition']);return {settings:UoocSettings.validate(data,false),position:data.orbPosition&&[data.orbPosition.x,data.orbPosition.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)?data.orbPosition:null};}
    if(message.type==='orbSave'){const p=message.position;if(!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('悬浮球位置无效');await chrome.storage.local.set({orbPosition:{x:p.x,y:p.y}});return {};}
    if(message.type==='settingsPatch')return serial(async()=>{if(!message.patch||Object.keys(message.patch).some(k=>!['rate','timerMinutes','autoSubmit'].includes(k)))throw Error('设置字段无效');const data=await chrome.storage.local.get(Object.keys(UoocSettings.defaults));const settings=UoocSettings.validate({...data,...message.patch},false);await chrome.storage.local.set(settings);await chrome.storage.sync.set({settings});return settings;});
    if(message.type==='cancelRequests'){globalThis.cancelTabRequests?.(sender.tab.id);return {};}
    if(message.type==='timerStart'||message.type==='timerStop')return serial(()=>timer(message,sender));
    return serial(async()=>{if(message.type==='activityReport')return report(message,sender);const data=await load();logEntry(data,message.event,message.stage,message.code);await chrome.storage.local.set({activityData:data});return {};});
   }
   if(role!=='options'&&role!=='popup')throw Error('此操作仅供扩展页面使用');
   if(message.type==='overview')return serial(async()=>summarize(await load()));
   if(message.type==='settingsGet')return serial(async()=>{const data=await chrome.storage.local.get(Object.keys(UoocSettings.defaults));return UoocSettings.validate(data,false);});
   if(role!=='options')throw Error('此操作仅供设置页使用');
   if(message.type==='settingsSave')return serial(async()=>{
    const settings=UoocSettings.validate(message.settings);await chrome.storage.local.set(settings);await chrome.storage.sync.set({settings});return settings;
   });
   if(message.type==='resetOrb'){await chrome.storage.local.remove('orbPosition');const tabs=await chrome.tabs.query({});await Promise.all(tabs.map(t=>chrome.tabs.sendMessage(t.id,{type:'orbReset'}).catch(()=>{})));return {};}
   if(message.type==='logsExport')return serial(async()=>({format:'uooc-logs',version:1,logs:(await load()).logs}));
   if(message.type==='clearHistory')return serial(async()=>{await chrome.storage.local.set({activityData:{days:{},recent:[],logs:[]}});await chrome.tabs.query({}).then(tabs=>Promise.all(tabs.map(t=>chrome.tabs.sendMessage(t.id,{type:'historyCleared'}).catch(()=>{}))));return {};});
   throw Error('未知操作');
  },types:new Set(['activityReport','eventLog','timerStart','timerStop','cancelRequests','overview','settingsGet','settingsSave','resetOrb','logsExport','clearHistory','uiGet','orbSave','settingsPatch'])};
})();
