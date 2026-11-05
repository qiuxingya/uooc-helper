// Read-only DOM parsers for the observed Chaoxing student pages.
(() => {
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const id=v=>typeof v==='string'&&/^\d{1,20}$/.test(v);
 const numeric=value=>{const s=String(value??'').trim();return /^-?\d+(?:\.\d+)?$/.test(s)&&Number.isFinite(Number(s))?Number(s):null;};
 const value=raw=>{const n=numeric(raw);return n!==null?{state:'value',value:n}:/未公布|未发布|暂未/.test(raw||'')?{state:'unpublished',value:null}:{state:'unread',value:null};};
 const count=(root,a,b)=>{const done=numeric(text(root.querySelector(a))),total=numeric(text(root.querySelector(b)));return done!==null&&total!==null&&Number.isSafeInteger(done)&&Number.isSafeInteger(total)&&done>=0&&done<=total?{done,total}:null;};
 function readList(root=document){
  if(!root.querySelector('#stukc'))return null;
  const courses=[],accounts=new Set(),keys=new Set();
  for(const card of root.querySelectorAll('#stukc li.w_couritem')){
   const link=card.querySelector('h3 a'),name=text(card.querySelector('.course-name'))||text(link);if(!link||!name)continue;
   let url;try{url=new URL(link.getAttribute('href'),link.ownerDocument.baseURI);}catch{continue;}
   if(url.protocol!=='https:'||!/(^|\.)chaoxing\.com$/.test(url.hostname)||url.username||url.password||url.port||!/^\/fyportal\/courselist\/entercoursenewfy$/.test(url.pathname)||url.searchParams.get('role')!=='3')continue;
   const courseId=url.searchParams.get('courseId'),classId=url.searchParams.get('clazzId'),account=url.searchParams.get('cpi');if(![courseId,classId,account].every(id))continue;
   accounts.add(account);const key=courseId+':'+classId;if(keys.has(key))continue;keys.add(key);
   courses.push({platform:'chaoxing',cycleId:key,courseId,classId,name:name.slice(0,160),term:'',status:/已结课/.test(text(card))?'ended':'unknown',entry:url.href});
  }
  if(accounts.size!==1)return null;
  return {accountId:[...accounts][0],courses};
 }
 function progress(root=document){
  const tasks=count(root,'#jobfinish','#jobPublish');if(!tasks)return null;
  const quiz=count(root,'#testNum','#publishTestNum');
  // The task total can already include quizzes; adding the quiz count double-counts them.
  return {tasks,quiz,progress:{value:tasks.total>0?Math.round(tasks.done/tasks.total*10000)/100:null,source:'网站章节任务点（可能包含视频、音频和测验等）',label:'章节任务点',done:tasks.done,total:tasks.total}};
 }
 function readScore(root=document){
  // Layui renders header/body separately and repeats fixed columns. Match by data-field.
  const headers=new Map();for(const h of root.querySelectorAll('.layui-table th[data-field]')){const k=h.getAttribute('data-field'),label=text(h);if(k&&label&&!headers.has(k))headers.set(k,label);}
  const rows=new Map();for(const row of root.querySelectorAll('.layui-table tbody tr')){
   const cells=Array.from(row.querySelectorAll('td[data-field]')),label=text(cells.find(c=>c.getAttribute('data-field')==='username'));if(!['所占权重','我的成绩','班级平均'].includes(label))continue;
   const values=rows.get(label)||new Map();for(const c of cells){const k=c.getAttribute('data-field');if(k!=='username'){const t=text(c);if(values.has(k)&&values.get(k)!==t)throw Error('SCORE_TABLE_CONFLICT');values.set(k,t);}}rows.set(label,values);
  }
  if(!headers.size||!rows.has('我的成绩')||!rows.has('所占权重'))return null;
  const mine=rows.get('我的成绩'),weights=rows.get('所占权重'),average=rows.get('班级平均'),components=[];
  const scoreField=[...headers].find(([,label])=>label==='综合成绩')?.[0];if(!scoreField||!mine.has(scoreField))return null;
  for(const [field,label] of headers){
   if(field==='username'||field===scoreField)continue;
   const rawWeight=weights.get(field),match=rawWeight?.match(/^(\d+(?:\.\d+)?)%$/),weight=match?Number(match[1]):null;
   components.push({name:label.replace(/\s*[(（]\s*\d+(?:\.\d+)?%\s*[)）]\s*$/,''),weight:weight!==null&&weight<=100?weight:null,weighted:value(mine.get(field)),classAverage:value(average?.get(field)),scoreSource:'网站“我的成绩”（已加权）',completed:null,tasks:null,average:null});
  }
  if(!components.length)return null;
  return {platform:'chaoxing',current:value(mine.get(scoreField)),currentLabel:'综合成绩',final:{state:'unpublished',value:null},components,progress:{value:null,source:'待读取章节任务点和章节测验数量'},source:'学习通综合成绩页面；网站说明该成绩可随任务和权重变化'};
 }
 function catalog(root=document){
  const current=root.querySelector('#coursetree .posCatalog_active'),all=Array.from(root.querySelectorAll('#coursetree .posCatalog_select[id^=cur]'));
  const leaves=all.filter(e=>!e.parentElement?.querySelector(':scope > ul .posCatalog_select[id^=cur],:scope > .posCatalog_level .posCatalog_select[id^=cur]'));
  return {current:current?.id.replace(/^cur/,'')||null,entries:leaves.map(e=>({id:e.id.replace(/^cur/,''),title:text(e.querySelector('.posCatalog_name')),done:!!e.querySelector('.icon_Completed'),locked:!!e.querySelector('.icon_Lock,.icon_lock,[aria-label*=未解锁]'),element:e.querySelector('.posCatalog_name[onclick]')})).filter(x=>id(x.id)&&x.element)};
 }
 globalThis.ChaoxingParser={readList,progress,readScore,catalog,value};
})();
