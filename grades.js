const el=id=>document.getElementById(id),statusLabels={learn:'开课中',nostart:'即将开始',finish:'已结束'};
const errorLabels={PAGE_TIMEOUT:'页面读取超时，请确认网站已登录后重试',UNSUPPORTED_TABLE:'成绩表结构暂不支持',READ_FAILED:'页面读取失败',LOGIN_REQUIRED:'需要登录，请先打开课程中心完成登录',ACCOUNT_CHANGED:'账号已切换，请重新刷新',PAGER_CHANGED:'分页内容未更新',SCORE_TABLE_CONFLICT:'网站成绩表数据尚未一致，请稍后重试',NOT_ENROLLED:'当前账号未找到该课程',TAB_CLOSED:'刷新页面已关闭，请重新开始刷新',CANCELLED:'已取消刷新'};
let platform=new URLSearchParams(location.search).get('platform')==='chaoxing'?'chaoxing':'uooc';
const cxTypes={gradesGet:'cxGradesGet',gradesStart:'cxGradesStart',gradesCancel:'cxGradesCancel',gradesClear:'cxGradesClear'};
let info={verified:false,courses:[],job:null},pollTimer,view={pending:false,dirty:false};
async function send(type,data={}){const r=await chrome.runtime.sendMessage({type:platform==='chaoxing'?(cxTypes[type]||type):type,...data});if(!r||r.error)throw Error(r?.error||'后台未响应，请重新加载扩展');return r.result;}
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function scalar(value,missing='网站未显示'){return value?.state==='value'?String(value.value):value?.state==='unpublished'?'未公布':missing;}
function time(value){return Number.isFinite(value)?new Date(value).toLocaleString():'尚未读取';}
function scoreAddress(course){
 if(platform!=='chaoxing')return 'https://www.uooc.net.cn/home/course/'+course.cycleId+'#/result';
 try{const u=new URL(course.scoreUrl),[courseId,classId]=course.cycleId.split(':');if(u.origin!=='https://stat2-ans.chaoxing.com'||u.pathname!=='/stat2/overall-score/stu-score'||u.username||u.password||u.hash||u.searchParams.size!==4)return null;for(const k of ['courseid','clazzid','cpi','ut'])if(u.searchParams.getAll(k).length!==1)return null;if(u.searchParams.get('courseid')!==courseId||u.searchParams.get('clazzid')!==classId||!/^\d{1,20}$/.test(u.searchParams.get('cpi')||'')||u.searchParams.get('ut')!=='s')return null;return u.href;}catch{return null;}
}
function failureText(job){const text=errorLabels[job?.error]||job?.error;if(!text)return '';const phase={center:'课程中心',list:'课程列表',progress:'任务进度',score:'综合成绩',verify:'账号复核',verifyList:'账号课程列表',account:'账号复核'}[job.phase];return text+(phase?'（'+phase+'）':'');}
async function action(type,data){
 const active=view;el('error').textContent='';
 try{await send(type,data);if(active===view)await load();}
 catch(e){if(active===view)el('error').textContent=e.message;}
}
function start(cycleId){return action('gradesStart',cycleId?{cycleId}:{});}
function render(){
 el('platform').value=platform;el('filter').querySelector('option[value=learn]').textContent=platform==='chaoxing'?'未结课':'开课中';el('filter').querySelector('option[value=nostart]').hidden=platform==='chaoxing';el('centerLink').href=platform==='chaoxing'?'https://i.chaoxing.com/base':'https://www.uooc.net.cn/home#/center/course/learn';el('centerLink').textContent=platform==='chaoxing'?'打开学习通课程中心 ↗':'打开优课课程中心 ↗';el('progressHelp').textContent=platform==='chaoxing'?'学习通进度沿用网站章节任务点口径；综合成绩可能随任务和权重变化，不等同最终总评。快照仅存本机，保留30天。':'主进度为视频＋测验。当前得分与最终总评分别显示，成绩以网站为准。快照仅存本机，保留30天。';
 const running=info.job?.status==='running';el('platform').disabled=running;el('refresh').disabled=running;el('cancel').hidden=!running;el('clear').disabled=running||!info.verified;
 el('accountState').textContent=info.verified?'当前账号已确认':'等待确认账号';
 const j=info.job;
 el('scanStatus').textContent=running?(['list','verifyList','center'].includes(j.phase)?'正在读取课程列表 · 已找到 '+j.found+' 门课程':['account','verify'].includes(j.phase)?'正在再次核对账号，确认后保存结果':'正在读取成绩 · '+j.done+' / '+j.total):j?.status==='done'?(j.failed?'刷新完成 · '+j.failed+' 门未完整刷新，请查看对应课程的状态。':'刷新完成。下方显示各课程最近一次成功读取的快照。'):failureText(j)||'请先登录'+(platform==='chaoxing'?'学习通':'优课')+'，再点击“一键刷新全部课程”。';
 const query=el('search').value.trim().toLowerCase(),filter=el('filter').value;const courses=info.verified?info.courses.filter(c=>(platform==='chaoxing'?/^\d{1,20}:\d{1,20}$/:/^\d{1,20}$/).test(c.cycleId)&&c.name.toLowerCase().includes(query)&&(filter==='all'||c.status===filter)):[];
 el('courseCount').textContent=courses.length+' / '+(info.verified?info.courses.length:0)+' 门课程';
 const open=new Set(Array.from(document.querySelectorAll('.course-card details[open]')).map(e=>e.closest('.course-card').dataset.cycle));el('courses').replaceChildren();el('empty').hidden=courses.length>0;
 el('empty').textContent=!info.verified?'确认当前账号后，会在这里显示课程快照。':!info.courses.length?(j?.status==='done'&&j.found===0?'当前账号暂无已选课程。':'当前没有课程快照，请点击一键刷新。'):'没有符合筛选条件的课程。';
 for(const course of courses){
  const card=node('article',undefined,'course-card');card.dataset.cycle=course.cycleId;
  const top=node('div',undefined,'course-top'),title=node('div',undefined,'course-title'),heading=node('h2',course.name),subtitle=node('p');subtitle.append(node('span',platform==='chaoxing'&&course.status==='learn'?'未结课':statusLabels[course.status]||'课程','status'),document.createTextNode(course.term||'网站未显示学期'));title.append(heading,subtitle);
  const actions=node('div',undefined,'course-actions'),button=node('button','刷新本课'),link=node('a','打开网站成绩页 ↗');button.disabled=running;button.onclick=()=>start(course.cycleId);const address=scoreAddress(course);if(address)link.href=address;else{link.textContent='网站成绩地址不可用';link.setAttribute('aria-disabled','true');}link.target='_blank';link.rel='noopener noreferrer';actions.append(button,link);top.append(title,actions);card.append(top);
  const snapshot=course.snapshot,metrics=node('div',undefined,'metrics');
  function metric(label,value,caption){const m=node('div',undefined,'metric');m.append(node('span',label),node('strong',value,!/^[-\d.]+%?$/.test(value)?'textual':undefined));if(caption)m.append(node('small',caption));metrics.append(m);return m;}
  const progress=snapshot?.progress,value=progress?.value??null;
  const source=platform==='chaoxing'?(progress?.source||'等待网站任务数据'):progress?.source==='website'?'网站“您已完成”':progress?.source==='tasks'?'按网站视频与测验任务数计算':'等待网站提供完整任务数据';
  const hasCounts=Number.isSafeInteger(progress?.done)&&Number.isSafeInteger(progress?.total)&&progress.done>=0&&progress.done<=progress.total;
  const counts=hasCounts?(progress.total>0?' · 已完成 '+progress.done+' / '+progress.total+' 项':' · 网站任务总数为 0'):'';
  const progressMetric=metric(platform==='chaoxing'?'章节任务点完成度':'视频＋测验完成度',value===null?'暂无数据':value+'%',source+counts);
  if(value!==null){const bar=node('progress');bar.max=100;bar.value=value;bar.setAttribute('aria-label',platform==='chaoxing'?'章节任务点完成度':'视频与测验完成度');progressMetric.append(bar);}
  metric(platform==='chaoxing'?'综合成绩':'当前得分',snapshot?scalar(snapshot.current):'未读取','当前累计得分，不等同最终总评');metric('总评',snapshot?scalar(snapshot.final):'未读取','仅展示网站明确公布的总评');card.append(metrics,node('p',course.progressOnly?'进度采集时间：'+time(progress?.updatedAt)+' · 成绩采集时间：'+time(snapshot?.updatedAt):'采集时间：'+time(snapshot?.updatedAt),'snapshot'));
  if(course.lastError)card.append(node('p','本次刷新失败：'+(errorLabels[course.lastError]||'暂时无法读取')+'。'+(course.progressOnly?'进度与成绩分别显示最近的读取结果。':snapshot?'上方保留旧快照。':'尚无成功读取的快照。')+' 尝试时间：'+time(course.lastAttempt),'failure'));
  const detail=node('details');detail.open=open.has(course.cycleId);detail.append(node('summary','查看分项成绩'));
  if(snapshot?.rows?.length){const wrapper=node('div',undefined,'table-wrap'),table=node('table'),head=node('thead'),headRow=node('tr');for(const label of ['考核项','权重','任务数','完成数','平均分数','完成进度','加权得分',...(platform==='chaoxing'?['班级平均（加权）']:[])])headRow.append(node('th',label));head.append(headRow);table.append(head);const body=node('tbody');for(const row of snapshot.rows){const tr=node('tr');tr.append(node('td',row.label));for(const key of ['weight','total','finished','average','progress','weighted',...(platform==='chaoxing'?['classAverage']:[])])tr.append(node('td',scalar(row[key],'—')+((key==='progress'||platform==='chaoxing'&&key==='weight')&&row[key]?.state==='value'?'%':'')));body.append(tr);}table.append(body);wrapper.append(table);detail.append(wrapper,node('p','分项与权重沿用网站；“—”表示该字段不适用或网站未显示。','table-note'));}
  else detail.append(node('p',snapshot?.state==='unpublished'?'网站尚未公布成绩。':'尚未读取到分项成绩。','table-note'));card.append(detail);el('courses').append(card);
 }
}
async function load(){
 const active=view;
 if(active.pending){active.dirty=true;return;}
 active.pending=true;
 try{
  const result=await send('gradesGet');
  if(active===view&&!active.dirty){info=result;render();}
 }catch(e){if(active===view)el('error').textContent=e.message;}
 finally{
  active.pending=false;
  if(active===view){
   clearTimeout(pollTimer);
   if(active.dirty){active.dirty=false;void load();}
   else if(info.job?.status==='running')pollTimer=setTimeout(load,1000);
  }
 }
}
el('platform').onchange=()=>{
 clearTimeout(pollTimer);
 platform=el('platform').value;
 view={pending:false,dirty:false};info={verified:false,courses:[],job:null};
 el('error').textContent='';
 if(platform==='chaoxing'&&el('filter').value==='nostart')el('filter').value='all';
 render();return load();
};
el('refresh').onclick=()=>start();el('cancel').onclick=()=>action('gradesCancel');
el('clear').onclick=()=>{if(confirm('清空当前账号在本机保存的课程成绩快照？'))return action('gradesClear');};
el('search').oninput=render;el('filter').onchange=render;el('settings').onclick=()=>chrome.runtime.openOptionsPage();
chrome.storage.onChanged.addListener((changes,area)=>{
 const relevant=platform==='chaoxing'?['cxGradeJob','cxGradeAccount','cxGradeCache']:['gradeJob','gradeAccount','gradeCache'];
 if(area==='session'&&changes[relevant[1]]){
  const {oldValue,newValue}=changes[relevant[1]];
  if(oldValue?.hash!==newValue?.hash){info={...info,verified:false,courses:[]};render();}
 }
 if((area==='session'&&(changes[relevant[0]]||changes[relevant[1]]))||(area==='local'&&changes[relevant[2]]))load();
});load();
