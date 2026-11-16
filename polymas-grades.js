// 只顺序调用已确认的学生只读接口；不创建播放器，不刷新/计算/修改网站成绩。
(() => {
 const CACHE='pmGradeCache',ACCOUNT='pmGradeAccount',JOB='pmGradeJob',ALARM='pm-grade-resume',KEEP=30*86400000;
 const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x),hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),cycle=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}:[A-Za-z0-9_-]{1,100}:\d{1,10}$/.test(x);
 const error=(code,message)=>PolymasAPI.error(code,message),state=async()=> (await chrome.storage.session.get(JOB))[JOB],save=j=>chrome.storage.session.set({[JOB]:j});
 const code=e=>['LOGIN_REQUIRED','ACCOUNT_CHANGED','PERMISSION','PAGE_TIMEOUT','NETWORK','READ_FAILED','SCORE_VISIBILITY_UNKNOWN'].includes(e?.code)?e.code:e?.code==='CANCELLED'?'ACCOUNT_CHANGED':'READ_FAILED';
 let queue=Promise.resolve(),active=null;
 const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
 async function cache(){const d=(await chrome.storage.local.get(CACHE))[CACHE]||{version:1,accounts:{}};if(d.version!==1||!d.accounts||typeof d.accounts!=='object')return {version:1,accounts:{}};for(const [a,b]of Object.entries(d.accounts)){if(!hash(a)||!b?.courses){delete d.accounts[a];continue;}for(const [k,c]of Object.entries(b.courses))if(!cycle(k)||!Number.isFinite(c.seenAt)||c.seenAt<Date.now()-KEEP)delete b.courses[k];else if(c.snapshot?.updatedAt<Date.now()-KEEP)c.snapshot=null;if(!Object.keys(b.courses).length)delete d.accounts[a];}return d;}
 async function account(){const a=(await chrome.storage.session.get(ACCOUNT))[ACCOUNT];if(!hash(a?.hash))return null;try{if(a.stamp===await PolymasAPI.stamp())return a;}catch{}await chrome.storage.session.remove(ACCOUNT);return null;}
 async function view(){const [j,d,a]=await Promise.all([state(),cache(),account()]);return {verified:!!a,courses:a?Object.values(d.accounts[a.hash]?.courses||{}):[],job:j?{status:j.status,phase:j.phase,found:j.found||0,total:j.total??j.targets?.length??0,done:j.index||0,failed:j.failed||0,currentCourse:j.status==='running'&&j.phase==='score'?{name:j.targets[j.index]?.name||''}:null,errorCode:j.error||null,error:j.error||null}:null};}
 const scalar=n=>n===null||n===undefined?{state:'unread',value:null}:Number.isFinite(n)&&Math.abs(n)<=1000000?{state:'value',value:n}:null;
 function snapshot(setting,d,target){
  const empty={state:'unpublished',value:null},unknown={state:'unread',value:null},base={currentLabel:'当前总分',current:empty,final:empty,progress:{value:null,source:'成绩接口未提供学习资源完成度'},rows:[],updatedAt:Date.now()};
  if(setting?.courseId!==target.courseId||setting?.classId!==target.classId||typeof setting.isViewScore!=='boolean'||typeof setting.isArchive!=='boolean')throw error('SCORE_VISIBILITY_UNKNOWN','无法确认网站成绩公布状态');
  if(!setting.isViewScore)return {...base,state:'unpublished'};
  if(d?.courseId!==target.courseId||d?.classId!==target.classId)throw error('READ_FAILED','网站成绩与当前课程不一致');
  const current=scalar(d.totalScore),adjusted=scalar(d.finalScore);if(!current||!adjusted)throw error('READ_FAILED','网站成绩格式异常');
  const rows=[];for(const [label,field]of [['考勤','attendance'],['平时','usual'],['作业','homework'],['考试','exam']]){const weighted=scalar(d[field+'Score']),weight=scalar(d[field]);if(!weighted||!weight)throw error('READ_FAILED','网站分项成绩格式异常');rows.push({label,weight,total:unknown,finished:unknown,average:unknown,progress:unknown,weighted});}
  if(d.assessmentScoreStudentList!==null&&d.assessmentScoreStudentList!==undefined){if(!Array.isArray(d.assessmentScoreStudentList)||d.assessmentScoreStudentList.length>100)throw error('READ_FAILED','网站分项格式异常');for(const [i,r]of d.assessmentScoreStudentList.entries()){const weighted=scalar(r.score);if(!weighted)throw error('READ_FAILED','网站分项分数异常');rows.push({label:typeof r.assessmentName==='string'?r.assessmentName.slice(0,100):'其他考核项 '+(i+1),weight:unknown,total:unknown,finished:unknown,average:unknown,progress:unknown,weighted});}}
  if(adjusted.state==='value')rows.push({label:'教师调整后得分',weight:unknown,total:unknown,finished:unknown,average:unknown,progress:unknown,weighted:adjusted});
  return {...base,state:'read',current,final:setting.isArchive?(adjusted.state==='value'?adjusted:current):empty,rows};
 }
 async function finish(j,status,errorCode=null){j.total=j.targets?.length||0;j.status=status;j.error=errorCode;j.results={};j.courses=[];j.targets=[];j.allTargets=[];j.terms=[];j.expected=null;j.retryIds=null;j.account=null;j.stamp=null;j.schoolNid=null;await save(j);await chrome.alarms.clear(ALARM);}
 async function step(j,signal){
  if(j.phase==='account')return PolymasAPI.profile(signal);
  if(j.phase==='list')return PolymasAPI.request('/student-course/student/index/queryStudentCourse',{keyword:'',term:'',schoolId:j.schoolNid,status:2,page:j.page,size:16},signal);
  if(j.phase==='terms')return PolymasAPI.request('/student-course/student/term/list',{courseId:j.courses[j.discovery].courseId},signal);
  if(j.phase==='classes')return PolymasAPI.request('/student-course/student/classList',{courseId:j.courses[j.discovery].courseId,term:j.terms[j.termIndex].term,boolQueryGroup:false},signal);
  if(j.phase==='verify')return PolymasAPI.profile(signal);
  const c=j.targets[j.index],params={courseId:c.courseId,classId:c.classId,term:c.termId};
  const setting=await PolymasAPI.request('/score-manage/api/totalScore/getCourseSetting',params,signal);
  if(setting?.isViewScore===false)return snapshot(setting,null,c);
  if(setting?.isViewScore!==true)throw error('SCORE_VISIBILITY_UNKNOWN','无法确认成绩公布状态');
  return snapshot(setting,await PolymasAPI.request('/score-manage/api/totalScore/getCourseScore',params,signal),c);
 }
 async function apply(j,data){
  if(j.phase==='account'){if(j.expected&&j.expected!==data.account)throw error('ACCOUNT_CHANGED','账号已切换');if(!id(data.schoolNid))throw error('READ_FAILED','网站未提供学校标识');j.account=data.account;j.stamp=data.stamp;j.schoolNid=data.schoolNid;j.phase='list';j.page=1;}
  else if(j.phase==='list'){
   if(!data||!Array.isArray(data.list)||!Number.isSafeInteger(data.total)||data.total<0||data.total>2000||data.list.length>16||j.page>125)throw error('READ_FAILED','课程列表格式异常');
   for(const c of data.list){if(c.courseType!=='agent')continue;if(!id(c.courseId)||typeof c.courseName!=='string'||!c.courseName.trim())throw error('READ_FAILED','智能体课程标识异常');if(!j.courses.some(x=>x.courseId===c.courseId))j.courses.push({courseId:c.courseId,name:c.courseName.slice(0,160)});}
   j.found=j.courses.length;if(j.page*16<data.total){if(!data.list.length)throw error('READ_FAILED','课程分页未返回完整数据');j.page++;}else{j.phase=j.courses.length?'terms':'verify';j.discovery=0;}
  }else if(j.phase==='terms'){
   if(!Array.isArray(data)||data.length>50||data.some(t=>!Number.isSafeInteger(t.term)||t.term<1||t.term>9999999999||typeof t.termName!=='string'))throw error('READ_FAILED','课程学期格式异常');
   j.terms=data.map(t=>({term:t.term,name:t.termName.slice(0,80)}));j.termIndex=0;if(j.terms.length)j.phase='classes';else await nextDiscovery(j);
  }else if(j.phase==='classes'){
   if(!Array.isArray(data)||data.length>100||data.some(c=>!id(c.classId)))throw error('READ_FAILED','学生班级格式异常');const course=j.courses[j.discovery],term=j.terms[j.termIndex];
   for(const c of data){const key=course.courseId+':'+c.classId+':'+term.term;if(!j.targets.some(x=>x.cycleId===key))j.targets.push({...course,classId:c.classId,className:typeof c.className==='string'?c.className.slice(0,100):'',termId:term.term,term:term.name,cycleId:key,status:'learn',platform:'polymas',order:j.targets.length});}if(j.targets.length>1000)throw error('READ_FAILED','课程批次数量超出限制');
   j.termIndex++;if(j.termIndex>=j.terms.length)await nextDiscovery(j);
  }else if(j.phase==='score'){j.results[j.targets[j.index].cycleId]={snapshot:data,at:Date.now()};j.index++;if(j.index>=j.targets.length)j.phase='verify';}
  else if(j.phase==='verify'){
   if(data.account!==j.account||data.stamp!==j.stamp)throw error('ACCOUNT_CHANGED','账号已切换');const d=await cache(),bucket=d.accounts[j.account]||={courses:{}},retained={};
   for(const c of j.allTargets||j.targets){const prior=bucket.courses[c.cycleId],r=j.results[c.cycleId];retained[c.cycleId]={...c,seenAt:Date.now(),snapshot:r?.snapshot||prior?.snapshot||null,lastError:r?r.error||null:prior?.lastError||null,lastAttempt:r?.at||prior?.lastAttempt||null};}
   bucket.courses=retained;await chrome.storage.local.set({[CACHE]:d});await chrome.storage.session.set({[ACCOUNT]:{hash:j.account,stamp:j.stamp,checkedAt:Date.now()}});await finish(j,'done');return;
  }
  await save(j);
 }
 async function nextDiscovery(j){j.discovery++;if(j.discovery<j.courses.length){j.phase='terms';return;}j.allTargets=j.targets;j.targets=j.targets.filter(c=>(!j.one||c.cycleId===j.one)&&(!j.retryIds||j.retryIds.includes(c.cycleId)));if(j.one&&!j.targets.length)throw error('READ_FAILED','当前学生账号未找到该课程批次');j.phase=j.targets.length?'score':'verify';}
 async function pump(jobId){if(active)return;const controller=new AbortController();active={jobId,controller};try{
  while(true){const j=await state();if(j?.id!==jobId||j.status!=='running')break;await chrome.alarms.create(ALARM,{when:Date.now()+30000});let data,failure;try{data=await step(j,controller.signal);}catch(e){failure=e;}
   const proceed=await serial(async()=>{const current=await state();if(current?.id!==jobId||current.status!=='running')return false;
    try{if(failure){const c=code(failure);if(j.phase==='score'&&!['LOGIN_REQUIRED','ACCOUNT_CHANGED','PERMISSION'].includes(c)){j.results[j.targets[j.index].cycleId]={error:c,at:Date.now()};j.failed++;j.index++;if(j.index>=j.targets.length)j.phase='verify';await save(j);}else throw failure;}else await apply(j,data);}
    catch(e){await chrome.storage.session.remove(ACCOUNT);await finish(j,'failed',code(e));return false;}return j.status==='running';});if(!proceed)break;
  }
 }finally{active=null;}}
 async function start(m){const j=await state();if(j?.status==='running')throw error('BUSY','AI教学中心成绩正在刷新');if(m.cycleId!==undefined&&!cycle(m.cycleId)||m.retryFailed!==undefined&&typeof m.retryFailed!=='boolean'||m.retryFailed&&m.cycleId)throw Error('课程刷新参数无效');if(!await PolymasAPI.granted())throw error('PERMISSION','请先授权 AI教学中心的账号与成绩读取');let retryIds=null,expected=null;
  if(m.cycleId||m.retryFailed){const a=await account();if(!a)throw error('LOGIN_REQUIRED','请先刷新课程确认账号');expected=a.hash;const d=await cache();if(m.cycleId&&!d.accounts[a.hash]?.courses?.[m.cycleId])throw Error('当前账号没有该课程');if(m.retryFailed){retryIds=Object.values(d.accounts[a.hash]?.courses||{}).filter(c=>c.lastError).map(c=>c.cycleId);if(!retryIds.length)return {started:false,code:'NO_FAILED_COURSES'};}}
  await chrome.storage.session.remove(ACCOUNT);const job={id:crypto.randomUUID(),status:'running',phase:'account',index:0,failed:0,found:0,courses:[],targets:[],results:{},one:m.cycleId||null,retryIds,expected};await save(job);await chrome.alarms.create(ALARM,{when:Date.now()+1000});return view();
 }
 const types=new Set(['pmGradesGet','pmGradesStart','pmGradesCancel','pmGradesClear','pmGradeSummary']);
 globalThis.PolymasGrades={types,snapshot,restore:async()=>{await chrome.storage.local.set({[CACHE]:await cache()});const j=await state();if(j?.status==='running')void pump(j.id).catch(()=>{});},handle:(m,s,role)=>serial(async()=>{
  if(m.type==='pmGradeSummary'){if(role!=='course'||UoocPlatforms.platform(s.url)!=='polymas')throw Error('未授权摘要读取');const v=await view(),courseId=UoocPlatforms.identity(s.url).slice('polymas:'.length);const matches=v.courses.filter(c=>c.courseId===courseId);return {verified:v.verified,course:matches.length===1?matches[0]:null,ambiguous:matches.length>1};}
  if(!['grades','options','popup'].includes(role))throw Error('成绩管理仅供扩展页面使用');if(m.type==='pmGradesGet')return view();if(m.type==='pmGradesStart')return start(m);
  if(m.type==='pmGradesCancel'){active?.controller.abort();const j=await state();if(j?.status==='running')await finish(j,'cancelled','CANCELLED');return {};}
  if(m.type==='pmGradesClear'){if((await state())?.status==='running')throw Error('请先取消刷新');const a=await account(),d=await cache();if(a)delete d.accounts[a.hash];await chrome.storage.local.set({[CACHE]:d});return {};}
 })};
 chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)state().then(j=>{if(j?.status==='running')return pump(j.id);}).catch(()=>{});});
})();
