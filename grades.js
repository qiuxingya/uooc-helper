const el=id=>document.getElementById(id),statusLabels={learn:'开课中',nostart:'即将开始',finish:'已结束'};
const errorLabels={PAGE_TIMEOUT:'页面读取超时，请确认网站已登录后重试',UNSUPPORTED_TABLE:'成绩表结构暂不支持',READ_FAILED:'页面读取失败',LOGIN_REQUIRED:'需要登录，请先打开课程中心完成登录',ACCOUNT_CHANGED:'账号已切换，请重新刷新',PAGER_CHANGED:'分页内容未更新',SCORE_TABLE_CONFLICT:'网站成绩表数据尚未一致，请稍后重试',NOT_ENROLLED:'当前账号未找到该课程',TAB_CLOSED:'刷新页面已关闭，请重新开始刷新',CANCELLED:'已取消刷新'};
let platform=new URLSearchParams(location.search).get('platform')==='chaoxing'?'chaoxing':'uooc';
const cxTypes={gradesGet:'cxGradesGet',gradesStart:'cxGradesStart',gradesCancel:'cxGradesCancel',gradesClear:'cxGradesClear'};
const newView=()=>({pending:null,dirty:false,revision:0,hasData:false,readError:null,actionError:null,needsCheck:false,busy:{},note:''});
const preference=()=>({search:'',status:'all',data:'all',sort:'website',open:new Set()});
const preferences={uooc:preference(),chaoxing:preference()};
let info={verified:false,courses:[],job:null},pollTimer,view=newView();
const readStatus=document.createElement('p');
readStatus.id='readStatus';readStatus.setAttribute('role','status');readStatus.setAttribute('aria-live','polite');
el('scanStatus').after(readStatus);
const reloadGrades=document.createElement('button');
reloadGrades.id='reloadGrades';reloadGrades.textContent='重新读取';reloadGrades.hidden=true;
readStatus.after(el('error'),reloadGrades);
async function send(type,data={}){
 let timeout;
 try{
  const r=await Promise.race([
   chrome.runtime.sendMessage({type:platform==='chaoxing'?(cxTypes[type]||type):type,...data}),
   new Promise((_,reject)=>timeout=setTimeout(()=>reject(Object.assign(Error(type==='gradesGet'?'本机快照读取超时，请重新读取':'操作响应超时，需核对后台状态'),{code:'TIMEOUT'})),12000))
  ]);
  if(!r||r.error)throw Object.assign(Error(r?.error||'后台未响应，请重新加载扩展'),{code:r?.code||'BACKGROUND'});
  return r.result;
 }finally{clearTimeout(timeout);}
}
function renderControls(){
 const running=info.job?.status==='running',busy=Object.values(view.busy).some(Boolean);
 const unavailable=busy||view.needsCheck||!view.hasData||!!view.readError;
 el('platform').disabled=running||busy;
 el('refresh').disabled=running||unavailable;
 el('cancel').hidden=!running;
 el('cancel').disabled=unavailable;
 el('clear').disabled=running||unavailable||!info.verified;
 el('retryFailed').hidden=!courseList().some(course=>course.lastError);
 el('retryFailed').disabled=running||unavailable;
 document.querySelectorAll('.course-actions button').forEach(button=>button.disabled=running||unavailable);
 reloadGrades.disabled=!!view.pending;
}
function renderFeedback(){
 readStatus.textContent=view.pending?(view.hasData?'正在更新本机快照…':'正在读取本机快照…'):view.needsCheck?'请重新读取后台状态后继续。':view.note;
 readStatus.hidden=!readStatus.textContent;
 el('error').textContent=view.readError?.message||view.actionError?.message||'';
 el('error').hidden=!el('error').textContent;
 reloadGrades.hidden=!view.readError&&!view.needsCheck;
}
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function scalar(value,missing='网站未显示'){return value?.state==='value'?String(value.value):value?.state==='unpublished'?'未公布':missing;}
function time(value){return Number.isFinite(value)?new Date(value).toLocaleString():'尚未读取';}
function scoreAddress(course){
 if(platform!=='chaoxing')return 'https://www.uooc.net.cn/home/course/'+course.cycleId+'#/result';
 try{const u=new URL(course.scoreUrl),[courseId,classId]=course.cycleId.split(':');if(u.origin!=='https://stat2-ans.chaoxing.com'||u.pathname!=='/stat2/overall-score/stu-score'||u.username||u.password||u.hash||u.searchParams.size!==4)return null;for(const k of ['courseid','clazzid','cpi','ut'])if(u.searchParams.getAll(k).length!==1)return null;if(u.searchParams.get('courseid')!==courseId||u.searchParams.get('clazzid')!==classId||!/^\d{1,20}$/.test(u.searchParams.get('cpi')||'')||u.searchParams.get('ut')!=='s')return null;return u.href;}catch{return null;}
}
function failureText(job){const code=job?.errorCode||job?.error,text=errorLabels[code]||job?.error;if(!text)return '';const phase={center:'课程中心',list:'课程列表',progress:'任务进度',score:'综合成绩',verify:'账号复核',verifyList:'账号课程列表',account:'账号复核'}[job.phase];return text+(phase?'（'+phase+'）':'');}
async function action(type,data){
 const active=view,revision=active.revision;
 if(Object.values(active.busy).some(Boolean)||active.needsCheck||!active.hasData||active.readError)return;
 const running=info.job?.status==='running';
 const allowed=type==='gradesCancel'?running:!running;
 if(!allowed)return;
 active.busy[type]=true;active.actionError=null;active.note='';
 renderControls();renderFeedback();
 try{
  const result=await send(type,data);
  if(active!==view)return;
  if(revision===active.revision&&result?.code==='NO_FAILED_COURSES')active.note='没有需要重试的课程。';
  await load();
 }
 catch(error){
  if(active!==view||revision!==active.revision)return;
  active.actionError=error;
  if(error.code==='TIMEOUT'){
   active.needsCheck=true;
   await load();
  }
 }finally{
  if(active===view){active.busy[type]=false;renderControls();renderFeedback();}
 }
}
function start(cycleId){return action('gradesStart',cycleId?{cycleId}:{});}
function courseList(){
 return info.verified?info.courses.filter(course=>course&&typeof course.name==='string'&&course.name.trim()&&typeof course.cycleId==='string'
  &&(platform==='chaoxing'?/^\d{1,20}:\d{1,20}$/:/^\d{1,20}$/).test(course.cycleId)):[];
}
function progressValue(course){
 const value=course.snapshot?.progress?.value;
 return Number.isFinite(value)&&value>=0&&value<=100?value:null;
}
function rememberDetails(){
 const open=preferences[platform].open;
 for(const detail of document.querySelectorAll('.course-card details')){
  const cycle=detail.closest('.course-card').dataset.cycle;
  if(detail.open)open.add(cycle);else open.delete(cycle);
 }
}
function filterChanged(){
 Object.assign(preferences[platform],{search:el('search').value,status:el('filter').value,data:el('dataFilter').value,sort:el('sort').value});
 render();
}
function sortedCourses(courses){
 const mode=preferences[platform].sort;
 const number=course=>{
  if(mode==='website')return Number.isSafeInteger(course.order)?course.order:null;
  if(mode==='progressAsc'||mode==='progressDesc')return progressValue(course);
  if(mode==='scoreDesc')return course.snapshot?.current?.state==='value'&&Number.isFinite(course.snapshot.current.value)?course.snapshot.current.value:null;
  const times=[course.snapshot?.updatedAt,course.snapshot?.progress?.updatedAt].filter(value=>Number.isFinite(value)&&value>0&&value<=8640000000000000);
  return times.length?Math.max(...times):null;
 };
 return courses.map((course,index)=>({course,index})).sort((a,b)=>{
  const original=(Number.isSafeInteger(a.course.order)?a.course.order:a.index)-(Number.isSafeInteger(b.course.order)?b.course.order:b.index)||a.index-b.index;
  if(mode==='name')return a.course.name.localeCompare(b.course.name,'zh-CN',{numeric:true})||original;
  const left=mode==='website'?number(a.course)??a.index:number(a.course),right=mode==='website'?number(b.course)??b.index:number(b.course);
  if(left===null||right===null)return left===right?original:left===null?1:-1;
  const direction=['progressDesc','scoreDesc','updatedDesc'].includes(mode)?-1:1;
  return (left-right)*direction||original;
 }).map(item=>item.course);
}
function renderScan(){
 const job=info.job,running=job?.status==='running',bar=el('scanProgress');
 bar.hidden=!running;bar.removeAttribute('value');
 if(!running){
  el('scanStatus').textContent=job?.status==='done'?(job.failed?'刷新完成 · '+job.failed+' 门未完整刷新，可重试失败课程。':'刷新完成，已保存通过账号核对的结果。')
   :job?.status==='cancelled'?'已取消刷新，保留上次确认的快照。':failureText(job)||'请先登录'+(platform==='chaoxing'?'学习通':'优课')+'，再点击“一键刷新全部课程”。';
  return;
 }
 if(['account','verify','verifyList'].includes(job.phase)){
  el('scanStatus').textContent='正在核对账号，尚未完成刷新。';return;
 }
 if(['center','list'].includes(job.phase)){
  el('scanStatus').textContent='正在读取课程列表 · 已找到 '+(job.found||0)+' 门课程';return;
 }
 const counted=Number.isSafeInteger(job.total)&&job.total>0&&Number.isSafeInteger(job.done)&&job.done>=0&&job.done<=job.total;
 if(counted){bar.max=job.total;bar.value=job.done;}
 const course=job.currentCourse?.name?' · '+job.currentCourse.name:'';
 el('scanStatus').textContent=(job.phase==='progress'?'正在读取任务进度':'正在读取成绩')+course+(counted?' · 已处理 '+job.done+' / '+job.total:'');
}
function render(){
 rememberDetails();
 el('sort').querySelector('option[value=scoreDesc]').textContent=platform==='chaoxing'?'综合成绩降序':'当前得分降序';
 el('platform').value=platform;el('filter').querySelector('option[value=learn]').textContent=platform==='chaoxing'?'未结课':'开课中';el('filter').querySelector('option[value=nostart]').hidden=platform==='chaoxing';el('centerLink').href=platform==='chaoxing'?'https://i.chaoxing.com/base':'https://www.uooc.net.cn/home#/center/course/learn';el('centerLink').textContent=platform==='chaoxing'?'打开学习通课程中心 ↗':'打开优课课程中心 ↗';el('progressHelp').textContent=platform==='chaoxing'?'学习通进度沿用网站章节任务点口径；综合成绩可能随任务和权重变化，不等同最终总评。快照仅存本机，保留30天。':'主进度为视频＋测验。当前得分与最终总评分别显示，成绩以网站为准。快照仅存本机，保留30天。';
 const running=info.job?.status==='running';
 el('accountState').textContent=info.verified?'当前账号已确认':'等待确认账号';
 const j=info.job;
 renderScan();
 const all=courseList();
 el('totalCourses').textContent=info.verified?all.length:'—';
 el('completedCourses').textContent=info.verified?all.filter(course=>progressValue(course)===100).length:'—';
 el('attentionCourses').textContent=info.verified?all.filter(course=>course.lastError||!course.snapshot).length:'—';
 const query=el('search').value.trim().toLowerCase(),filter=el('filter').value,dataFilter=el('dataFilter').value;
 const courses=sortedCourses(all.filter(c=>c.name.toLowerCase().includes(query)&&(filter==='all'||c.status===filter)
  &&(dataFilter==='all'||dataFilter==='failed'&&c.lastError||dataFilter==='unread'&&!c.snapshot)));
 el('courseCount').textContent=courses.length+' / '+all.length+' 门课程';
 const open=preferences[platform].open;el('courses').replaceChildren();el('empty').hidden=courses.length>0;
 el('empty').textContent=!info.verified?'确认当前账号后，会在这里显示课程快照。':!info.courses.length?(j?.status==='done'&&j.found===0?'当前账号暂无已选课程。':'当前没有课程快照，请点击一键刷新。'):'没有符合筛选条件的课程。';
 for(const course of courses){
  const card=node('article',undefined,'course-card');card.dataset.cycle=course.cycleId;
  const top=node('div',undefined,'course-top'),title=node('div',undefined,'course-title'),heading=node('h2',course.name),subtitle=node('p');subtitle.append(node('span',platform==='chaoxing'&&course.status==='learn'?'未结课':statusLabels[course.status]||'课程','status'),document.createTextNode(course.term||'网站未显示学期'));title.append(heading,subtitle);
  subtitle.append(node('span',course.lastError?'读取失败':!course.snapshot?'尚未读取':course.progressOnly?'进度已更新':'已读取','read-badge'+(course.lastError?' failed':!course.snapshot?' unread':'')));
  const actions=node('div',undefined,'course-actions'),button=node('button','刷新本课'),link=node('a','打开网站成绩页 ↗');button.disabled=running;button.onclick=()=>start(course.cycleId);const address=scoreAddress(course);if(address)link.href=address;else{link.textContent='网站成绩地址不可用';link.setAttribute('aria-disabled','true');}link.target='_blank';link.rel='noopener noreferrer';actions.append(button,link);top.append(title,actions);card.append(top);
  const snapshot=course.snapshot,metrics=node('div',undefined,'metrics');
  function metric(label,value,caption){const m=node('div',undefined,'metric');m.append(node('span',label),node('strong',value,!/^[-\d.]+%?$/.test(value)?'textual':undefined));if(caption)m.append(node('small',caption));metrics.append(m);return m;}
  const progress=snapshot?.progress,value=progressValue(course);
  const source=platform==='chaoxing'?(progress?.source||'等待网站任务数据'):progress?.source==='website'?'网站“您已完成”':progress?.source==='tasks'?'按网站视频与测验任务数计算':'等待网站提供完整任务数据';
  const hasCounts=Number.isSafeInteger(progress?.done)&&Number.isSafeInteger(progress?.total)&&progress.done>=0&&progress.done<=progress.total;
  const counts=hasCounts?(progress.total>0?' · 已完成 '+progress.done+' / '+progress.total+' 项':' · 网站任务总数为 0'):'';
  const progressMetric=metric(platform==='chaoxing'?'章节任务点完成度':'视频＋测验完成度',value===null?'暂无数据':value+'%',source+counts);
  if(value!==null){const bar=node('progress');bar.max=100;bar.value=value;bar.setAttribute('aria-label',platform==='chaoxing'?'章节任务点完成度':'视频与测验完成度');progressMetric.append(bar);}
  metric(platform==='chaoxing'?'综合成绩':'当前得分',snapshot?scalar(snapshot.current):'未读取','当前累计得分，不等同最终总评');metric('总评',snapshot?scalar(snapshot.final):'未读取','仅展示网站明确公布的总评');card.append(metrics,node('p',course.progressOnly?'进度采集时间：'+time(progress?.updatedAt)+' · 成绩采集时间：'+time(snapshot?.updatedAt):'采集时间：'+time(snapshot?.updatedAt),'snapshot'));
  if(course.lastError)card.append(node('p','本次刷新失败：'+(errorLabels[course.lastError]||'暂时无法读取')+'。'+(course.progressOnly?(Number.isFinite(snapshot?.updatedAt)?'进度已更新，成绩保留上次读取结果。':'进度已更新，成绩尚未读取。'):snapshot?'上方保留旧快照。':'尚无成功读取的快照。')+' 尝试时间：'+time(course.lastAttempt),'failure'));
  const detail=node('details');detail.open=open.has(course.cycleId);detail.append(node('summary','查看分项成绩'));
  if(snapshot?.rows?.length){const wrapper=node('div',undefined,'table-wrap'),table=node('table'),head=node('thead'),headRow=node('tr');for(const label of ['考核项','权重','任务数','完成数','平均分数','完成进度','加权得分',...(platform==='chaoxing'?['班级平均（加权）']:[])])headRow.append(node('th',label));head.append(headRow);table.append(head);const body=node('tbody');for(const row of snapshot.rows){const tr=node('tr');tr.append(node('td',row.label));for(const key of ['weight','total','finished','average','progress','weighted',...(platform==='chaoxing'?['classAverage']:[])])tr.append(node('td',scalar(row[key],'—')+((key==='progress'||platform==='chaoxing'&&key==='weight')&&row[key]?.state==='value'?'%':'')));body.append(tr);}table.append(body);wrapper.append(table);detail.append(wrapper,node('p','分项与权重沿用网站；“—”表示该字段不适用或网站未显示。','table-note'));}
  else detail.append(node('p',snapshot?.state==='unpublished'?'网站尚未公布成绩。':'尚未读取到分项成绩。','table-note'));card.append(detail);el('courses').append(card);
 }
 renderControls();renderFeedback();
}
function load(){
 const active=view;
 if(active.pending){active.dirty=true;return active.pending;}
 const revision=active.revision;
 clearTimeout(pollTimer);
 active.pending=(async()=>{
  try{
   const result=await send('gradesGet');
   if(active!==view||revision!==active.revision||active.dirty)return;
   if(!result||typeof result.verified!=='boolean'||!Array.isArray(result.courses))throw Object.assign(Error('本机快照格式异常，请重新读取'),{code:'INVALID_STATE'});
   info=result;active.hasData=true;active.readError=null;
   if(active.needsCheck){active.needsCheck=false;active.actionError=null;}
   render();
  }catch(error){
   if(active===view&&revision===active.revision)active.readError=error;
  }finally{
   active.pending=null;
   if(active===view){
    renderControls();renderFeedback();
    if(active.dirty){active.dirty=false;void load();}
    else if(!active.readError&&info.job?.status==='running')pollTimer=setTimeout(load,1000);
   }
  }
 })();
 renderControls();renderFeedback();
 return active.pending;
}
el('platform').onchange=()=>{
 clearTimeout(pollTimer);
 rememberDetails();
 platform=el('platform').value;
 view=newView();info={verified:false,courses:[],job:null};
 el('courses').replaceChildren();
 const saved=preferences[platform];
 el('search').value=saved.search;el('filter').value=saved.status;el('dataFilter').value=saved.data;el('sort').value=saved.sort;
 el('error').textContent='';
 if(platform==='chaoxing'&&el('filter').value==='nostart')el('filter').value='all';
 render();return load();
};
el('refresh').onclick=()=>start();el('cancel').onclick=()=>action('gradesCancel');
el('retryFailed').title='重试当前平台、当前账号的全部失败课程，不受筛选条件影响';
el('retryFailed').onclick=()=>action('gradesStart',{retryFailed:true});
el('clear').onclick=()=>{if(confirm('清空当前账号在本机保存的课程成绩快照？'))return action('gradesClear');};
el('search').oninput=filterChanged;el('filter').onchange=filterChanged;
el('dataFilter').onchange=filterChanged;el('sort').onchange=filterChanged;
el('settings').onclick=()=>chrome.runtime.openOptionsPage();
chrome.storage.onChanged.addListener((changes,area)=>{
 const relevant=platform==='chaoxing'?['cxGradeJob','cxGradeAccount','cxGradeCache']:['gradeJob','gradeAccount','gradeCache'];
 if(area==='session'&&changes[relevant[1]]){
  const {oldValue,newValue}=changes[relevant[1]];
  if(oldValue?.hash!==newValue?.hash){view.revision++;view.hasData=false;info={...info,verified:false,courses:[]};render();}
 }
 if((area==='session'&&(changes[relevant[0]]||changes[relevant[1]]))||(area==='local'&&changes[relevant[2]]))load();
});
reloadGrades.onclick=()=>load();
el('platform').value=platform;
load();
