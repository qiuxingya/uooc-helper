(() => {
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const digits=v=>typeof v==='string'&&/^\d{1,20}$/.test(v);
 function cycle(raw){try{const u=new URL(raw,location.href);if(!/(^|\.)uooc\.net\.cn$/i.test(u.hostname))return null;return u.pathname.match(/^\/home\/course\/(\d+)/)?.[1]||u.pathname.match(/^\/home\/learn\/new\/(\d+)/)?.[1]||u.searchParams.get('cycleid')||u.hash.match(/^#\/(\d+)\//)?.[1]||null;}catch{return null;}}
 function account(){const match=text(document.querySelector('.user-id')).match(/\bID\s*[:：]\s*(\d{1,20})\b/i);return match?.[1]||null;}
 function login(){return /^\/user\/login/.test(location.pathname)||Array.from(document.querySelectorAll('iframe')).some(f=>visible(f)&&/\/user\/login/.test(f.getAttribute('src')||''));}
 function number(value){const s=String(value??'').trim();if(!/^-?\d+(?:\.\d+)?%?$/.test(s))return null;const n=Number(s.replace('%',''));return Number.isFinite(n)?n:null;}
 function cell(value){const raw=String(value??'').trim().slice(0,100);return {value:number(raw),state:/未公布|待公布|未发布|未出分/.test(raw)?'unpublished':number(raw)!==null?'value':raw?'unavailable':'loading',text:raw};}
 function readScore(){
  const table=Array.from(document.querySelectorAll('table')).find(t=>visible(t)&&/考核项/.test(text(t))&&/加权得分/.test(text(t)));
  if(!table){if(/暂无成绩|成绩未公布|成绩尚未公布|成绩未发布/.test(text(document.body)))return {state:'unpublished',current:cell('未公布'),final:cell('未公布'),progress:{value:null,source:'none'},rows:[]};return null;}
  const headers=Array.from(table.querySelectorAll('thead th,thead td')).map(text);const fields={weight:'权重',total:'任务数',finished:'完成数',average:'平均分数',progress:'完成进度',weighted:'加权得分'};
  if(!headers.includes('考核项')||Object.values(fields).some(f=>!headers.includes(f)))throw Error('UNSUPPORTED_TABLE');
  const rows=[];let current=cell('—'),final=cell('—');
  for(const tr of table.querySelectorAll('tbody tr')){
   const cells=Array.from(tr.querySelectorAll('td')).map(text);if(!cells.length)continue;
   const summary=/^(当前得分|当前成绩|总评|最终总评|总评成绩|最终成绩)$/.test(cells[0]);const label=summary?cells[0]:cells[headers.indexOf('考核项')]||'';
   if(/^(当前得分|当前成绩|总评|最终总评|总评成绩|最终成绩)$/.test(label)){
    const candidate=cells.slice(1).reverse().find(v=>number(v)!==null||/未公布|待公布|未发布|未出分/.test(v))||'';
    if(/当前/.test(label))current=cell(candidate);else final=cell(candidate);continue;
   }
   if(!label)continue;const row={label:label.slice(0,64)};for(const [key,heading] of Object.entries(fields))row[key]=cell(cells[headers.indexOf(heading)]||'');rows.push(row);
  }
  if(!rows.length)return null;
  // A skeleton includes fixed labels and a video dash; these are not loaded grades.
  const gradeLoaded=rows.some(r=>r.weight.value!==null&&r.total.value!==null&&r.finished.value!==null&&r.weighted.value!==null);
  if(!gradeLoaded||current.state==='loading'||final.state==='loading'||rows.some(r=>['签到','视频','作业','测验','讨论','考试','教师调分'].includes(r.label)&&Object.keys(fields).some(k=>r[k].state==='loading')))return null;
  for(const row of rows)for(const key of Object.keys(fields))if(row[key].state==='loading')row[key]={value:null,state:'unavailable',text:''};
  let progress={value:null,source:'none'};
  const completion=text(document.body).match(/您已完成\s*[:：]\s*(\d+(?:\.\d+)?)\s*%/);
  if(completion&&Number(completion[1])<=100)progress={value:Number(completion[1]),source:'website'};
  else{
   const video=rows.find(r=>r.label==='视频'),quiz=rows.find(r=>r.label==='测验');
   if(video&&quiz&&[video,quiz].every(r=>Number.isInteger(r.total.value)&&Number.isInteger(r.finished.value)&&r.total.value>=0&&r.finished.value>=0&&r.finished.value<=r.total.value)){
    const total=video.total.value+quiz.total.value;if(total>0)progress={value:Math.round((video.finished.value+quiz.finished.value)/total*10000)/100,source:'tasks'};
   }
  }
  return {state:'read',current,final,progress,rows};
 }
 function nextButton(){
  const roots=Array.from(document.querySelectorAll('.pagination,.uooc-pagination,.pager,[pagination],[class*=pagination]')).filter(visible);
  const controls=[...new Set(roots.flatMap(root=>Array.from(root.querySelectorAll('a,button,[role=button],li.next')).filter(e=>visible(e)&&(/^(下一页|下一頁|下页|Next|›|»|>)$/i.test(text(e))||/下一页|next/i.test(e.getAttribute('aria-label')||'')||e.matches('.next')))))];
  const nodes=controls.filter(e=>!controls.some(other=>other!==e&&e.contains(other)));
  const enabled=nodes.filter(e=>!e.disabled&&!e.closest('.disabled,[disabled],[aria-disabled=true]'));
  if(enabled.length>1)throw Error('AMBIGUOUS_PAGER');const next=enabled[0];if(next){const href=next.getAttribute('href');if(href&&!/^#?$|^javascript:(?:;|void\(0\);?)$/i.test(href)){const target=new URL(href,location.href),current=new URL(location.href);if(target.origin!==current.origin||target.pathname!==current.pathname||target.hash.split('?')[0]!==current.hash.split('?')[0])throw Error('PAGER_CHANGED');}}return next||null;
 }
 function readList(category){
  const id=account();if(!id)return null;
  const active=document.querySelector('.uooc-tabs-item.active');
  if(active&&!text(active).includes({learn:'开课中',nostart:'即将开始',finish:'已结束'}[category]))return null;
  const cards=Array.from(document.querySelectorAll('.course-item')).filter(visible),courses=[];
  for(const card of cards){const name=card.querySelector('.course-name,h3'),nameText=text(name),term=text(card.querySelector('.course-cycle-name'));
   const links=Array.from(card.querySelectorAll('a[href]'));const id=digits(card.id)?card.id:links.map(a=>cycle(a.href)).find(digits);
   if(!id||!nameText)throw Error('UNSUPPORTED_COURSE_CARD');
   const parsedTerm=term||nameText.match(/\(([^)]+)\)\s*$/)?.[0]||'';
   courses.push({cycleId:id,name:nameText.replace(parsedTerm,'').trim().slice(0,200),term:parsedTerm.replace(/^\(|\)$/g,'').slice(0,120),status:category});
  }
  if(!cards.length&&!/暂无[^。\n]{0,40}课程|没有[^。\n]{0,20}课程/.test(text(document.body)))return null;
  const next=nextButton(),page=text(document.querySelector('.pagination .active,.uooc-pagination .active,.pager .active'));
  return {accountId:id,courses,next:!!next,pageKey:category+'|'+page+'|'+courses.map(c=>c.cycleId).join(',')+'|'+(!courses.length?'empty':'')};
 }
 globalThis.UoocCourseParser={cycle,account,login,number,readScore,readList,nextButton};
})();
