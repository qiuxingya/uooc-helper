(() => {
 const KEY='cxGradeJob',ACCOUNT='cxGradeAccount',CACHE='cxGradeCache',ALARM='cx-grade-deadline',KEEP=30*86400000,CENTER='https://i.chaoxing.com/base';
 const id=x=>typeof x==='string'&&/^\d{1,20}$/.test(x),hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),key=x=>typeof x==='string'&&/^\d{1,20}:\d{1,20}$/.test(x);
 const nonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 let queue=Promise.resolve();const serial=f=>{const p=queue.then(f);queue=p.catch(()=>{});return p;};
 const state=async()=> (await chrome.storage.session.get(KEY))[KEY];
 const save=job=>chrome.storage.session.set({[KEY]:job});
 function safe(raw,kind){let u;try{u=new URL(raw);}catch{return false;}if(u.protocol!=='https:'||u.port||u.username||u.password)return false;return kind==='center'?u.origin==='https://i.chaoxing.com'&&u.pathname==='/base':kind==='list'?u.origin==='https://fycourse.fanya.chaoxing.com'&&u.pathname==='/fyportal/courselist/course':kind==='progress'?u.origin==='https://stat2-ans.chaoxing.com'&&u.pathname==='/study-data/index':kind==='score'?u.origin==='https://stat2-ans.chaoxing.com'&&u.pathname==='/stat2/overall-score/stu-score':false;}
 function matchesPage(p,raw){
  if(!p||typeof raw!=='string')return false;if(raw===p.url)return true;
  // The real course center redirects /base to /base?t=<timestamp>.
  // Other scan pages still require the exact URL; document/token binding is unchanged.
  if(!['center','verify'].includes(p.kind)||!safe(p.url,'center')||!safe(raw,'center'))return false;
  const u=new URL(raw);return !u.hash&&u.searchParams.size===1&&/^\d{1,20}$/.test(u.searchParams.get('t')||'');
 }
 function url(course,kind){const u=new URL(kind==='score'?'https://stat2-ans.chaoxing.com/stat2/overall-score/stu-score':'https://stat2-ans.chaoxing.com/study-data/index');u.search=new URLSearchParams({courseid:course.courseId,clazzid:course.classId,cpi:course.accountId,ut:'s'});return u.href;}
 async function cache(){const data=(await chrome.storage.local.get(CACHE))[CACHE]||{version:1,accounts:{}};if(data.version!==1)return {version:1,accounts:{}};for(const [a,b]of Object.entries(data.accounts)){if(!hash(a)){delete data.accounts[a];continue;}for(const [k,c]of Object.entries(b.courses||{})){if(!key(k)||!Number.isFinite(c.seenAt)||c.seenAt<Date.now()-KEEP)delete b.courses[k];else{if(c.snapshot?.updatedAt<Date.now()-KEEP)c.snapshot=null;if(c.progressSnapshot?.updatedAt<Date.now()-KEEP)delete c.progressSnapshot;}}if(!Object.keys(b.courses||{}).length)delete data.accounts[a];}return data;}
 function presentCourse(course){
  if(!course.progressSnapshot)return course;
  const unread={state:'unread',value:null};
  const score=course.snapshot||{current:unread,final:unread,rows:[],updatedAt:null};
  return {...course,snapshot:{...score,progress:course.progressSnapshot},progressOnly:true};
 }
 async function view(){const [job,data,account]=await Promise.all([state(),cache(),chrome.storage.session.get(ACCOUNT)]),a=account[ACCOUNT],verified=!!a&&hash(a.hash);return {verified,courses:verified?Object.values(data.accounts[a.hash]?.courses||{}).map(presentCourse):[],job:job?{status:job.status,phase:job.phase,found:job.courses.length,total:job.targets.length,done:job.index,failed:job.failed,error:job.error||null}:null};}
 async function finish(job,status,error=null){job.status=status;job.error=error;const tabId=job.tabId;job.tabId=null;job.pending=null;job.courses=job.courses.map(c=>({cycleId:c.cycleId}));job.results={};job.account=null;await save(job);await chrome.alarms.clear(ALARM);if(Number.isInteger(tabId))try{await chrome.tabs.remove(tabId);}catch{}}
 async function navigate(job,kind,address){job.phase=kind;job.pending={token:nonce(),url:address,kind,documentId:null,deadline:Date.now()+20000};await save(job);await chrome.alarms.create(ALARM,{when:job.pending.deadline});await chrome.tabs.update(job.tabId,{url:address});}
 async function next(job){if(job.index>=job.targets.length){await navigate(job,'verify',CENTER);return;}const course=job.courses.find(c=>c.cycleId===job.targets[job.index]);await navigate(job,'progress',url(course,'progress'));}
 async function pageFailure(job,code){if(['progress','score'].includes(job.phase)&&!['LOGIN_REQUIRED','ACCOUNT_CHANGED'].includes(code)){const partial=job.phase==='score'?job.progress?.progress:null;job.results[job.targets[job.index]]={error:code,at:Date.now(),progressSnapshot:partial};delete job.progress;job.failed++;job.index++;await next(job);}else{if(['LOGIN_REQUIRED','ACCOUNT_CHANGED'].includes(code))await chrome.storage.session.remove(ACCOUNT);await finish(job,'failed',code);}}
 async function start(cycleId){const prior=await state();if(prior?.status==='running')throw Error('学习通成绩正在刷新');if(cycleId!==undefined&&!key(cycleId))throw Error('课程标识无效');await chrome.storage.session.remove(ACCOUNT);const tab=await chrome.tabs.create({url:'about:blank',active:false}),job={id:nonce(),status:'running',phase:'center',tabId:tab.id,courses:[],targets:[],index:0,failed:0,results:{},account:null,one:cycleId||null};await navigate(job,'center',CENTER);return view();}
 async function hello(sender){const job=await state();if(!job||job.status!=='running'||job.tabId!==sender.tab.id)return {scan:false};if(!sender.frameId&&/^https:\/\/(?:passport2|passport2-api|v8)\.chaoxing\.com\//.test(sender.url||'')){await chrome.storage.session.remove(ACCOUNT);await finish(job,'failed','LOGIN_REQUIRED');return {scan:true};}if(sender.frameId||!sender.documentId||!matchesPage(job.pending,sender.url))return {scan:true};job.pending.documentId=sender.documentId;await save(job);return {scan:true,task:{jobId:job.id,token:job.pending.token,kind:job.pending.kind==='verify'?'center':job.pending.kind}};}
 function validateCourses(data){if(!hash(data.account)||!Array.isArray(data.courses)||data.courses.length>500)throw Error('READ_FAILED');const found=new Map();for(const c of data.courses){if(!id(c.courseId)||!id(c.classId)||!id(c.accountId)||c.cycleId!==c.courseId+':'+c.classId||typeof c.name!=='string'||!c.name.trim())throw Error('READ_FAILED');found.set(c.cycleId,{cycleId:c.cycleId,courseId:c.courseId,classId:c.classId,accountId:c.accountId,name:c.name.slice(0,160),term:typeof c.term==='string'?c.term.slice(0,80):'',status:c.status==='ended'?'finish':'learn'});}return [...found.values()];}
 function validScore(d){return d&&d.platform==='chaoxing'&&d.current&&['value','unpublished','unread'].includes(d.current.state)&&(d.current.state!=='value'||Number.isFinite(d.current.value)&&Math.abs(d.current.value)<=1000000)&&Array.isArray(d.components)&&d.components.length<=100;}
 async function result(message,sender){
  const job=await state(),p=job?.pending;if(!job||job.status!=='running'||sender.tab.id!==job.tabId||sender.frameId||p?.documentId!==sender.documentId||!sender.documentId||message.jobId!==job.id||message.token!==p.token||!matchesPage(p,sender.url))throw Error('未授权的成绩结果');
  if(Date.now()>p.deadline){await pageFailure(job,'PAGE_TIMEOUT');return {};}
  if(message.error){await pageFailure(job,['LOGIN_REQUIRED','PAGE_TIMEOUT','SCORE_TABLE_CONFLICT','ACCOUNT_CHANGED'].includes(message.error)?message.error:'READ_FAILED');return {};}
  const d=message.data;
  try{
   if(job.phase==='center'||job.phase==='verify'){if(!d||!safe(d.listUrl,'list'))throw Error('READ_FAILED');const verifying=job.phase==='verify';await navigate(job,verifying?'verifyList':'list',d.listUrl);}
   else if(job.phase==='list'||job.phase==='verifyList'){
    const courses=validateCourses(d);if(job.phase==='verifyList'){
     if(d.account!==job.account)throw Error('ACCOUNT_CHANGED');const data=await cache(),bucket=data.accounts[job.account]||={courses:{}};
     for(const c of job.courses){const prior=bucket.courses[c.cycleId],r=job.results[c.cycleId],clean={cycleId:c.cycleId,name:c.name,term:c.term,status:c.status,platform:'chaoxing',scoreUrl:url(c,'score'),seenAt:Date.now()};if(r?.snapshot)bucket.courses[c.cycleId]={...clean,snapshot:r.snapshot,lastAttempt:r.at,lastError:null};else bucket.courses[c.cycleId]={...clean,snapshot:prior?.snapshot||null,progressSnapshot:r?.progressSnapshot||prior?.progressSnapshot||null,lastAttempt:r?.at||prior?.lastAttempt||null,lastError:r?.error||prior?.lastError||null};}
     await chrome.storage.local.set({[CACHE]:data});await chrome.storage.session.set({[ACCOUNT]:{hash:job.account,checkedAt:Date.now()}});await finish(job,'done');
    }else{job.account=d.account;job.courses=courses;job.targets=courses.filter(c=>!job.one||c.cycleId===job.one).map(c=>c.cycleId);if(job.one&&!job.targets.length)throw Error('NOT_ENROLLED');await next(job);}
   }else if(job.phase==='progress'){
    if(!d||!d.progress||!(d.progress.value===null||Number.isFinite(d.progress.value)&&d.progress.value>=0&&d.progress.value<=100))throw Error('READ_FAILED');const counts=value=>value&&Number.isSafeInteger(value.done)&&Number.isSafeInteger(value.total)&&value.done>=0&&value.done<=value.total?{done:value.done,total:value.total}:null;
    const tasks=counts(d.tasks)||counts(d.progress),quiz=counts(d.quiz);
    const progress={value:tasks?(tasks.total>0?Math.round(tasks.done/tasks.total*10000)/100:null):d.progress.value,source:'网站章节任务点（可能包含视频、音频和测验等）',...(tasks||{}),updatedAt:Date.now()};
    job.progress={tasks,quiz,progress};const c=job.courses.find(c=>c.cycleId===job.targets[job.index]);await navigate(job,'score',url(c,'score'));
   }else if(job.phase==='score'){
    if(!validScore(d))throw Error('READ_FAILED');const scalar=n=>n===null||n===undefined?{state:'unread',value:null}:{state:'value',value:n},rows=d.components.map(c=>{const counts=/^章节任务点$/.test(c.name)?job.progress.tasks:/^章节测验$/.test(c.name)?job.progress.quiz:null;return {label:String(c.name||'未知项目').slice(0,100),weight:scalar(c.weight),total:scalar(counts?.total),finished:scalar(counts?.done),average:{state:'unread',value:null},progress:scalar(counts?.total?Math.round(counts.done/counts.total*10000)/100:null),weighted:c.weighted,classAverage:c.classAverage};});
    job.results[job.targets[job.index]]={at:Date.now(),snapshot:{current:d.current,currentLabel:'综合成绩',final:{state:'unpublished',value:null},progress:job.progress.progress,rows,updatedAt:Date.now()}};delete job.progress;job.index++;await next(job);
   }
  }catch(e){await pageFailure(job,['ACCOUNT_CHANGED','NOT_ENROLLED'].includes(e.message)?e.message:'READ_FAILED');}return {};
 }
 async function restore(){await chrome.storage.local.set({[CACHE]:await cache()});const job=await state();if(job?.status==='running'){if(!job.pending||job.pending.deadline<=Date.now())await pageFailure(job,'PAGE_TIMEOUT');else{try{await chrome.tabs.get(job.tabId);await chrome.alarms.create(ALARM,{when:job.pending.deadline});}catch{await finish(job,'failed','TAB_CLOSED');}}}}
 const types=new Set(['cxGradeHello','cxGradeResult','cxGradesGet','cxGradesStart','cxGradesCancel','cxGradesClear','cxGradeSummary','cxAccountHint']);
 globalThis.ChaoxingGrades={types,safe,url,restore:()=>serial(restore),isScanTab:async tabId=>{const job=await state();return job?.status==='running'&&job.tabId===tabId;},handle:(m,s,role)=>serial(async()=>{
  if(['cxGradeHello','cxGradeResult'].includes(m.type)){if(!['course','cxpage'].includes(role)||!s.tab)throw Error('未授权课程页面');return m.type==='cxGradeHello'?hello(s):result(m,s);}
  if(m.type==='cxAccountHint'){
   if(role!=='cxaccount'||!s.tab||m.logout!==true&&!hash(m.account))throw Error('未授权账号提示');const job=await state();if(job?.status==='running'&&job.tabId===s.tab.id)return {};
   const a=(await chrome.storage.session.get(ACCOUNT))[ACCOUNT];if(m.logout===true||a&&a.hash!==m.account){await chrome.storage.session.remove(ACCOUNT);if(job?.status==='running'&&job.account&&(m.logout===true||job.account!==m.account))await finish(job,'failed','ACCOUNT_CHANGED');}return {};
  }
  if(m.type==='cxGradeSummary'){if(role!=='course')throw Error('未授权操作');const data=await view();let cycle;try{cycle=UoocPlatforms.identity(s.url).replace('chaoxing:','');}catch{}return {verified:data.verified,course:data.courses.find(c=>c.cycleId===cycle)||null};}
  if(!['grades','options','popup'].includes(role))throw Error('此操作仅供扩展页面使用');
  if(m.type==='cxGradesGet')return view();if(m.type==='cxGradesStart')return start(m.cycleId);
  if(m.type==='cxGradesCancel'){const job=await state();if(job?.status==='running')await finish(job,'cancelled','CANCELLED');return {};}
  if(m.type==='cxGradesClear'){if((await state())?.status==='running')throw Error('请先取消刷新');const a=(await chrome.storage.session.get(ACCOUNT))[ACCOUNT],data=await cache();if(a)delete data.accounts[a.hash];await chrome.storage.local.set({[CACHE]:data});return {};}
 })};
 chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)serial(async()=>{const j=await state();if(j?.status==='running'&&j.pending?.deadline<=Date.now())await pageFailure(j,'PAGE_TIMEOUT');}).catch(()=>{});});
 chrome.tabs.onRemoved.addListener(id=>serial(async()=>{const j=await state();if(j?.status==='running'&&j.tabId===id)await finish(j,'failed','TAB_CLOSED');}).catch(()=>{}));
})();
