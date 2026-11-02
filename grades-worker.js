(() => {
 const CENTER='https://www.uooc.net.cn/home#/center/course/',ALARM='uooc-grade-deadline',KEEP=30*86400000;
 let queue=Promise.resolve();const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
 const categories=['learn','nostart','finish'],hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),id=v=>typeof v==='string'&&/^\d{1,20}$/.test(v);
 const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
 const scoreUrl=cycle=>'https://www.uooc.net.cn/home/course/'+cycle+'#/result';
 const clip=(v,n)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').slice(0,n):'';
 const errors={LOGIN_REQUIRED:'请先登录优课后重试',ACCOUNT_CHANGED:'账号已切换，请重新刷新',PAGE_TIMEOUT:'页面读取超时',UNSUPPORTED_TABLE:'成绩表结构暂不支持',AMBIGUOUS_PAGER:'分页入口不唯一',PAGER_CHANGED:'分页内容未更新',UNSUPPORTED_COURSE_CARD:'课程卡片暂不支持',READ_FAILED:'页面读取失败',TAB_CLOSED:'刷新页面已关闭',NAVIGATION_CHANGED:'刷新页面发生意外跳转',NOT_ENROLLED:'当前账号的已选课程中未找到这门课',CANCELLED:'刷新已取消',INTERRUPTED:'刷新任务已中断'};
 async function state(){return (await chrome.storage.session.get(['gradeJob','gradeAccount']));}
 async function save(job){await chrome.storage.session.set({gradeJob:job});}
 function prune(cache){cache=cache?.version===1?cache:{version:1,accounts:{}};for(const [account,bucket] of Object.entries(cache.accounts)){
  if(!hash(account)){delete cache.accounts[account];continue;}for(const [cycle,row] of Object.entries(bucket.courses||{})){if(!id(cycle)||row.seenAt<Date.now()-KEEP)delete bucket.courses[cycle];else if(row.snapshot?.updatedAt<Date.now()-KEEP)row.snapshot=null;}
  if(!Object.keys(bucket.courses||{}).length)delete cache.accounts[account];
 }return cache;}
 async function cache(){const data=prune((await chrome.storage.local.get('gradeCache')).gradeCache);return data;}
 async function note(event,code,count=0){const {gradeAudit=[]}=await chrome.storage.local.get('gradeAudit');gradeAudit.push({time:Date.now(),version:'1.1.0',event,code,count});await chrome.storage.local.set({gradeAudit:gradeAudit.filter(x=>x.time>Date.now()-KEEP).slice(-200)});}
 async function close(job){await chrome.alarms.clear(ALARM);if(Number.isInteger(job?.tabId)){try{await chrome.tabs.sendMessage(job.tabId,{type:'gradeAbort'});}catch{}try{await chrome.tabs.remove(job.tabId);}catch{}}}
 async function finish(job,status,error=null){job.status=status;job.error=error;job.pending=null;job.finishedAt=Date.now();job.found=job.courses?.length||0;job.failed=Object.values(job.results||{}).filter(r=>r.error).length;job.results={};job.courses=[];job.account=null;await save(job);await close(job);await note('refresh',error||status,job.done||0);}
 async function invalidateAccount(){await chrome.storage.session.remove('gradeAccount');}
 function matchUrl(actual,expected){try{const a=new URL(actual),e=new URL(expected);return a.protocol===e.protocol&&a.hostname===e.hostname&&a.pathname===e.pathname&&a.hash===e.hash&&!a.username&&!a.password&&!a.port;}catch{return false;}}
 function task(job){const p=job.pending;return {jobId:job.id,token:p.token,kind:p.kind,category:p.category,action:p.action,beforePageKey:p.beforePageKey};}
 async function schedule(job,kind,url,options={}){
  const previous=job.pending;job.phase=kind;job.pending={previousDocumentId:options.action==='next'?null:previous?.documentId||null,token:token(),kind,url,deadline:Date.now()+20000,documentId:options.documentId||null,category:options.category||null,action:options.action||'read',beforePageKey:options.beforePageKey||null};await save(job);await chrome.alarms.create(ALARM,{when:job.pending.deadline});
  if(options.action==='next'){try{await chrome.tabs.sendMessage(job.tabId,{type:'gradeTask'},options.documentId?{documentId:options.documentId}:{frameId:0});}catch{}}
  else try{const navigation=new URL(url);navigation.searchParams.set('uooc_helper_read',token());await chrome.tabs.update(job.tabId,{url:navigation.href,active:false});}catch{await finish(job,'failed','TAB_CLOSED');}
 }
 function courseRecord(data,status){if(!data||!id(data.cycleId)||!categories.includes(status)||typeof data.name!=='string'||!data.name.trim())throw Error('UNSUPPORTED_COURSE_CARD');return {cycleId:data.cycleId,name:clip(data.name,200),term:clip(data.term,120),status};}
 function scalar(data){if(!data||!['value','unpublished','unavailable'].includes(data.state))throw Error('READ_FAILED');if(data.state==='value'&&(!Number.isFinite(data.value)||Math.abs(data.value)>1e9))throw Error('READ_FAILED');return {value:data.state==='value'?data.value:null,state:data.state};}
 function snapshot(data){
  if(!data||!['read','unpublished'].includes(data.state)||!Array.isArray(data.rows)||data.rows.length>50)throw Error('READ_FAILED');
  const fields=['weight','total','finished','average','progress','weighted'];const rows=data.rows.map(row=>{if(typeof row.label!=='string'||!row.label.trim())throw Error('READ_FAILED');return Object.fromEntries([['label',clip(row.label,64)],...fields.map(k=>[k,scalar(row[k])])]);});
  const progress=data.progress;if(!progress||!['website','tasks','none'].includes(progress.source)||(progress.value!==null&&(!Number.isFinite(progress.value)||progress.value<0||progress.value>100)))throw Error('READ_FAILED');
  return {updatedAt:Date.now(),state:data.state,current:scalar(data.current),final:scalar(data.final),progress:{value:progress.value,source:progress.source},rows};
 }
 async function nextScore(job){
  if(job.index>=job.targets.length){await schedule(job,'account',CENTER+'learn');return;}
  await schedule(job,'score',scoreUrl(job.targets[job.index]));
 }
 async function complete(job){
  const data=await cache(),old=data.accounts[job.account]?.courses||{},courses={};
  for(const course of job.courses){const previous=old[course.cycleId];courses[course.cycleId]={...course,seenAt:Date.now(),snapshot:previous?.snapshot||null,lastError:previous?.lastError||null,lastAttempt:previous?.lastAttempt||null};const staged=job.results[course.cycleId];if(staged){courses[course.cycleId].lastAttempt=staged.at;courses[course.cycleId].lastError=staged.error||null;if(staged.snapshot)courses[course.cycleId].snapshot=staged.snapshot;}}
  data.accounts[job.account]={courses};await chrome.storage.local.set({gradeCache:prune(data)});await chrome.storage.session.set({gradeAccount:{hash:job.account,verifiedAt:Date.now()}});await finish(job,'done');
 }
 async function process(job,data,sender){
  const pending=job.pending;
  if(pending.kind==='list'){
   if(!hash(data?.account)||!Array.isArray(data.courses)||data.courses.length>1000||typeof data.pageKey!=='string'||data.pageKey.length>24000||typeof data.next!=='boolean')throw Error('READ_FAILED');
   if(job.account&&job.account!==data.account)throw Error('ACCOUNT_CHANGED');
   job.account=data.account;await chrome.storage.session.set({gradeAccount:{hash:job.account,verifiedAt:Date.now()}});
   if(job.pages.includes(data.pageKey))throw Error('PAGER_CHANGED');job.pages.push(data.pageKey);if(job.pages.length>200)throw Error('PAGER_CHANGED');
   for(const item of data.courses){const course=courseRecord(item,pending.category);if(!job.courses.some(c=>c.cycleId===course.cycleId))job.courses.push(course);}
   if(data.next){await schedule(job,'list',pending.url,{category:pending.category,action:'next',beforePageKey:data.pageKey,documentId:sender.documentId});return;}
   job.categoryIndex++;
   if(job.categoryIndex<categories.length){await schedule(job,'list',CENTER+categories[job.categoryIndex],{category:categories[job.categoryIndex]});return;}
   if(job.only&&!job.courses.some(c=>c.cycleId===job.only))throw Error('NOT_ENROLLED');
   job.targets=job.only?[job.only]:job.courses.map(c=>c.cycleId);job.index=0;job.done=0;await nextScore(job);return;
  }
  if(pending.kind==='score'){
   const result=snapshot(data);job.results[job.targets[job.index]]={snapshot:result,at:Date.now()};job.index++;job.done++;await nextScore(job);return;
  }
  if(!hash(data?.account)||data.account!==job.account)throw Error('ACCOUNT_CHANGED');await complete(job);
 }
 async function pageFailure(job,code){
  code=Object.hasOwn(errors,code)?code:'READ_FAILED';
  if(job.pending?.kind==='score'&&!['LOGIN_REQUIRED','ACCOUNT_CHANGED','TAB_CLOSED','NAVIGATION_CHANGED'].includes(code)){
   job.results[job.targets[job.index]]={error:code,at:Date.now()};job.index++;job.done++;await nextScore(job);
  }else{if(['LOGIN_REQUIRED','ACCOUNT_CHANGED'].includes(code))await invalidateAccount();await finish(job,'failed',code);}
 }
 async function hello(sender){
  const {gradeJob:job}=await state();
  if(!job||job.status!=='running'||job.tabId!==sender.tab.id||!job.pending||!sender.documentId||!matchUrl(sender.url,job.pending.url))return {scan:job?.status==='running'&&job.tabId===sender.tab.id};
  if(job.pending.previousDocumentId===sender.documentId||job.pending.documentId&&job.pending.documentId!==sender.documentId)return {scan:true};
  job.pending.documentId=sender.documentId;await save(job);return {scan:true,task:task(job)};
 }
 async function result(message,sender){
  const {gradeJob:job}=await state();const p=job?.pending;
  if(job?.status!=='running'||job.tabId!==sender.tab.id||job.id!==message.jobId||p?.token!==message.token||!p.documentId||p.documentId!==sender.documentId||!matchUrl(sender.url,p.url))throw Error('READ_FAILED');
  if(Date.now()>p.deadline){await pageFailure(job,'PAGE_TIMEOUT');return {};}
  try{if(message.error)await pageFailure(job,message.error);else await process(job,message.data,sender);}catch(e){await pageFailure(job,Object.hasOwn(errors,e.message)?e.message:'READ_FAILED');}return {};
 }
 async function start(only){
  if(only!==undefined&&!id(only))throw Error('课程标识无效');
  const {gradeJob:previous}=await state();if(previous?.status==='running')throw Error('已有刷新任务，请等待或取消');
  await invalidateAccount();const tab=await chrome.tabs.create({url:'about:blank',active:false});
  const job={id:token(),tabId:tab.id,status:'running',phase:'list',categoryIndex:0,courses:[],pages:[],targets:[],results:{},index:0,done:0,only:only||null,startedAt:Date.now(),account:null};
  await schedule(job,'list',CENTER+'learn',{category:'learn'});await note('refresh','START');return {id:job.id};
 }
 async function get(){
  const {gradeJob:job,gradeAccount:account}=await state();const data=await cache();
  const courses=hash(account?.hash)?Object.values(data.accounts[account.hash]?.courses||{}):[];
  return {verified:hash(account?.hash),courses,job:job?{id:job.id,status:job.status,phase:job.phase,done:job.done||0,total:job.targets?.length||0,found:job.courses?.length||job.found||0,failed:job.failed||0,error:job.error?errors[job.error]||errors.READ_FAILED:null}:null};
 }
 async function observeAccount(message,sender){
  if(message.account!=='logout'&&!/^https:\/\/www\.uooc\.net\.cn\/home#\/center\/course\/(learn|nostart|finish|follow)$/.test(sender.url))return {};
  if(message.account!=='logout'&&!hash(message.account))return {};
  const {gradeJob:job}=await state();
  if(message.account==='logout'){await invalidateAccount();if(job?.status==='running')await finish(job,'failed','LOGIN_REQUIRED');}
  else{if(job?.status==='running'&&job.account&&job.account!==message.account)await finish(job,'failed','ACCOUNT_CHANGED');await chrome.storage.session.set({gradeAccount:{hash:message.account,verifiedAt:Date.now()}});}
  return {};
 }
 async function restore(){
  await serial(async()=>{
   const data=await cache();await chrome.storage.local.set({gradeCache:data});const {gradeJob:job}=await state();
   if(job?.status!=='running'||!job.pending)return;
   try{await chrome.tabs.get(job.tabId);}catch{await finish(job,'failed','TAB_CLOSED');return;}
   if(job.pending.deadline<=Date.now()){await pageFailure(job,'PAGE_TIMEOUT');return;}
   await chrome.alarms.create(ALARM,{when:job.pending.deadline});try{await chrome.tabs.sendMessage(job.tabId,{type:'gradeTask'},job.pending.documentId?{documentId:job.pending.documentId}:{frameId:0});}catch{}
  });
 }
 chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)serial(async()=>{const {gradeJob:job}=await state();if(job?.status==='running'&&job.pending?.deadline<=Date.now())await pageFailure(job,'PAGE_TIMEOUT');}).catch(()=>{});});
 chrome.tabs.onRemoved.addListener(tabId=>serial(async()=>{const {gradeJob:job}=await state();if(job?.status==='running'&&job.tabId===tabId)await finish(job,'failed','TAB_CLOSED');}).catch(()=>{}));
 chrome.tabs.onUpdated.addListener((tabId,change)=>{if(!change.url||change.url==='about:blank')return;serial(async()=>{
  const {gradeJob:job}=await state();if(job?.status!=='running'||job.tabId!==tabId||!job.pending)return;
  if(matchUrl(change.url,job.pending.url)){try{await chrome.tabs.sendMessage(tabId,{type:'gradeTask'});}catch{}return;}
  try{const actual=new URL(change.url),expected=new URL(job.pending.url);if(actual.origin===expected.origin&&actual.pathname===expected.pathname&&!actual.hash)return;}catch{}
  await invalidateAccount();await finish(job,'failed',/\/user\/login|\/league\//.test(change.url)?'LOGIN_REQUIRED':'NAVIGATION_CHANGED');
 }).catch(()=>{});});
 globalThis.UoocGrades={restore,scoreUrl,prune,snapshot,types:new Set(['gradeHello','gradeResult','gradeAccount','gradesStart','gradesCancel','gradesGet','gradesClear','gradesOpen','gradeSummary']),
  async isScanTab(tabId){const {gradeJob}=await state();return gradeJob?.status==='running'&&gradeJob.tabId===tabId;},
  handle(message,sender,role){return serial(async()=>{
   const course=['gradeHello','gradeResult','gradeAccount','gradeSummary'].includes(message.type);
   if(course&&role!=='course')throw Error('此操作仅供课程页使用');
   if(message.type==='gradeHello')return hello(sender);
   if(message.type==='gradeResult')return result(message,sender);
   if(message.type==='gradeAccount')return observeAccount(message,sender);
   if(message.type==='gradesOpen'){if(!['course','popup','options','grades'].includes(role))throw Error('未授权操作');await chrome.tabs.create({url:chrome.runtime.getURL('grades.html'),active:true});return {};}
   if(message.type==='gradeSummary'){
    const cycle=new URL(sender.url).pathname.match(/^\/home\/course\/(\d+)/)?.[1]||new URL(sender.url).pathname.match(/^\/home\/learn\/new\/(\d+)/)?.[1]||new URL(sender.url).hash.match(/^#\/(\d+)\//)?.[1];const info=await get();return {course:info.verified&&id(cycle)?info.courses.find(c=>c.cycleId===cycle)||null:null,verified:info.verified};
   }
   if(role!=='grades')throw Error('此操作仅供课程总览页使用');
   if(message.type==='gradesStart')return start(message.cycleId);
   if(message.type==='gradesCancel'){const {gradeJob:job}=await state();if(job?.status==='running')await finish(job,'cancelled','CANCELLED');return {};}
   if(message.type==='gradesGet')return get();
   if(message.type==='gradesClear'){const {gradeJob:job,gradeAccount:account}=await state();if(job?.status==='running')throw Error('请先取消刷新，再清空快照');if(hash(account?.hash)){const data=await cache();delete data.accounts[account.hash];await chrome.storage.local.set({gradeCache:data});}return {};}
   throw Error('未知操作');
  });}
 };
})();
