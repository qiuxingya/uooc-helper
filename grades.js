const el=id=>document.getElementById(id),statusLabels={learn:'开课中',nostart:'即将开始',finish:'已结束'};
const errorLabels={PAGE_TIMEOUT:'页面读取超时',UNSUPPORTED_TABLE:'成绩表结构暂不支持',READ_FAILED:'页面读取失败',LOGIN_REQUIRED:'需要登录',ACCOUNT_CHANGED:'账号已切换',PAGER_CHANGED:'分页内容未更新'};
let info={verified:false,courses:[],job:null},pollTimer,pending=false;
async function send(type,data={}){const r=await chrome.runtime.sendMessage({type,...data});if(!r||r.error)throw Error(r?.error||'后台未响应，请重新加载扩展');return r.result;}
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function scalar(value,missing='网站未显示'){return value?.state==='value'?String(value.value):value?.state==='unpublished'?'未公布':missing;}
function time(value){return Number.isFinite(value)?new Date(value).toLocaleString():'尚未读取';}
async function start(cycleId){try{el('error').textContent='';await send('gradesStart',cycleId?{cycleId}:{});await load();}catch(e){el('error').textContent=e.message;}}
function render(){
 const running=info.job?.status==='running';el('refresh').disabled=running;el('cancel').hidden=!running;el('clear').disabled=running||!info.verified;
 el('accountState').textContent=info.verified?'当前账号已确认':'等待确认账号';
 const j=info.job;
 el('scanStatus').textContent=running?(j.phase==='list'?'正在读取课程列表 · 已找到 '+j.found+' 门课程':j.phase==='account'?'正在再次核对账号，确认后保存结果':'正在读取成绩 · '+j.done+' / '+j.total):j?.status==='done'?(j.failed?'刷新完成 · '+j.failed+' 门读取失败，已保留旧快照。':'刷新完成。下方显示各课程最近一次成功读取的快照。'):j?.error||'请先登录优课，再点击“一键刷新全部课程”。';
 const query=el('search').value.trim().toLowerCase(),filter=el('filter').value;const courses=info.verified?info.courses.filter(c=>/^\d{1,20}$/.test(c.cycleId)&&c.name.toLowerCase().includes(query)&&(filter==='all'||c.status===filter)):[];
 el('courseCount').textContent=courses.length+' / '+(info.verified?info.courses.length:0)+' 门课程';
 const open=new Set(Array.from(document.querySelectorAll('.course-card details[open]')).map(e=>e.closest('.course-card').dataset.cycle));el('courses').replaceChildren();el('empty').hidden=courses.length>0;
 el('empty').textContent=!info.verified?'确认当前账号后，会在这里显示课程快照。':!info.courses.length?(j?.status==='done'&&j.found===0?'当前账号暂无已选课程。':'当前没有课程快照，请点击一键刷新。'):'没有符合筛选条件的课程。';
 for(const course of courses){
  const card=node('article',undefined,'course-card');card.dataset.cycle=course.cycleId;
  const top=node('div',undefined,'course-top'),title=node('div',undefined,'course-title'),heading=node('h2',course.name),subtitle=node('p');subtitle.append(node('span',statusLabels[course.status]||'课程','status'),document.createTextNode(course.term||'网站未显示学期'));title.append(heading,subtitle);
  const actions=node('div',undefined,'course-actions'),button=node('button','刷新本课'),link=node('a','打开网站成绩页 ↗');button.disabled=running;button.onclick=()=>start(course.cycleId);link.href='https://www.uooc.net.cn/home/course/'+course.cycleId+'#/result';link.target='_blank';link.rel='noopener noreferrer';actions.append(button,link);top.append(title,actions);card.append(top);
  const snapshot=course.snapshot,metrics=node('div',undefined,'metrics');
  function metric(label,value,caption){const m=node('div',undefined,'metric');m.append(node('span',label),node('strong',value,!/^[-\d.]+%?$/.test(value)?'textual':undefined));if(caption)m.append(node('small',caption));metrics.append(m);return m;}
  const progress=snapshot?.progress?.value??null,progressMetric=metric('视频＋测验完成度',progress===null?'暂无数据':progress+'%',snapshot?.progress.source==='website'?'网站“您已完成”':snapshot?.progress.source==='tasks'?'按网站视频与测验任务数计算':'等待网站提供完整任务数据');const bar=node('progress');bar.max=100;bar.value=progress??0;bar.setAttribute('aria-label','视频与测验完成度');progressMetric.append(bar);
  metric('当前得分',snapshot?scalar(snapshot.current):'未读取','当前累计得分，不等同最终总评');metric('总评',snapshot?scalar(snapshot.final):'未读取','仅展示网站明确公布的总评');card.append(metrics,node('p','采集时间：'+time(snapshot?.updatedAt),'snapshot'));
  if(course.lastError)card.append(node('p','本次刷新失败：'+(errorLabels[course.lastError]||'暂时无法读取')+'。'+(snapshot?'上方保留旧快照。':'尚无成功读取的快照。')+' 尝试时间：'+time(course.lastAttempt),'failure'));
  const detail=node('details');detail.open=open.has(course.cycleId);detail.append(node('summary','查看分项成绩'));
  if(snapshot?.rows?.length){const wrapper=node('div',undefined,'table-wrap'),table=node('table'),head=node('thead'),headRow=node('tr');for(const label of ['考核项','权重','任务数','完成数','平均分数','完成进度','加权得分'])headRow.append(node('th',label));head.append(headRow);table.append(head);const body=node('tbody');for(const row of snapshot.rows){const tr=node('tr');tr.append(node('td',row.label));for(const key of ['weight','total','finished','average','progress','weighted'])tr.append(node('td',scalar(row[key],'—')+(key==='progress'&&row[key]?.state==='value'?'%':'')));body.append(tr);}table.append(body);wrapper.append(table);detail.append(wrapper,node('p','分项与权重沿用网站；“—”表示该字段不适用或网站未显示。','table-note'));}
  else detail.append(node('p',snapshot?.state==='unpublished'?'网站尚未公布成绩。':'尚未读取到分项成绩。','table-note'));card.append(detail);el('courses').append(card);
 }
}
async function load(){if(pending)return;pending=true;try{info=await send('gradesGet');render();}catch(e){el('error').textContent=e.message;}finally{pending=false;clearTimeout(pollTimer);if(info.job?.status==='running')pollTimer=setTimeout(load,1000);}}
el('refresh').onclick=()=>start();el('cancel').onclick=async()=>{try{await send('gradesCancel');await load();}catch(e){el('error').textContent=e.message;}};
el('clear').onclick=async()=>{if(!confirm('清空当前账号在本机保存的课程成绩快照？'))return;try{await send('gradesClear');await load();}catch(e){el('error').textContent=e.message;}};
el('search').oninput=render;el('filter').onchange=render;el('settings').onclick=()=>chrome.runtime.openOptionsPage();
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&(changes.gradeJob||changes.gradeAccount)||area==='local'&&changes.gradeCache)load();});load();
