// Learning-page navigation uses the site's own visible controls and completion markers.
(() => {
 if(!/(^|\.)chaoxing\.com$/.test(location.hostname)||!/\/studentstudy$/.test(location.pathname))return;
 const visible=e=>e?.isConnected&&!!e.getClientRects().length&&e.ownerDocument.defaultView.getComputedStyle(e).visibility!=='hidden';
 const docs=()=>{const out=[document];for(let n=0;n<out.length&&out.length<40;n++)for(const f of out[n].querySelectorAll('iframe')){if(!visible(f))continue;try{if(f.contentDocument&&!out.includes(f.contentDocument))out.push(f.contentDocument);}catch{}}return out;};
 let completed=new WeakSet(),selected=null,visited=new Set();
 function container(v){let doc=v.ownerDocument;for(let n=0;n<8&&doc!==document;n++){let f;try{f=doc.defaultView.frameElement;}catch{return null;}if(!f)return null;const task=f.closest('.ans-attach-ct');if(task)return {task,frame:f};doc=f.ownerDocument;}return null;}
 function finished(v){return completed.has(v)||v.ended||container(v)?.task.classList.contains('ans-job-finished');}
 function resource(v){const c=container(v),raw=c?.frame.getAttribute('objectid')||c?.frame.getAttribute('jobid');return raw&&/^[a-zA-Z0-9_-]{1,100}$/.test(raw)?'cx:'+raw:null;}
 const allVideos=()=>docs().flatMap(d=>Array.from(d.querySelectorAll('video'))).filter(visible);
 function selectVideos(list){if(selected?.isConnected&&!selected.ended&&!completed.has(selected)&&list.includes(selected))return [selected];selected=list.find(v=>!finished(v))||null;return selected?[selected]:[];}
 function context(video){const active=document.querySelector('#coursetree .posCatalog_active .posCatalog_name'),v=video||selectVideos(allVideos())[0];return {finished:!!v&&finished(v),resource:v?resource(v):null,chapter:(active?.textContent||document.querySelector('#mainid')?.firstElementChild?.textContent||'当前章节').trim().slice(0,120)};}
 function gateNotice(){return docs().flatMap(d=>Array.from(d.querySelectorAll('.layui-layer-content,[role=alert],.ans-tips'))).filter(visible).find(e=>/请先完成|未解锁|闯关|上一.{0,8}未完成|章节.{0,8}未开放/.test(e.textContent||''))||null;}
 function picker(){if(allVideos().length)return false;return !!document.querySelector('#coursetree')&&docs().some(d=>Array.from(d.querySelectorAll('.ans-attach-ct')).some(t=>t.classList.contains('ans-job-finished')));}
 function questionRoots(){return docs().flatMap(d=>Array.from(d.querySelectorAll('.singleQuesId,.TiMu,[id^=question]'))).filter(visible);}
 async function advance(cancelled,pause=250,initial=false,autoExercises=false){
  if(cancelled())return false;
  const outer=document.querySelector('iframe#iframe');
  if(outer){let card;try{card=outer.contentDocument;}catch{}if(!card)throw Error('学习通内容框架暂不可访问，请检查页面加载或站点访问权限');
   for(let n=0;n<40&&(card.readyState!=='complete'||card.body?.querySelector('iframe.ans-insertvideo-online')&&!allVideos().length);n++){if(cancelled())return false;await new Promise(r=>setTimeout(r,250));}
   if(card.readyState!=='complete'||card.body?.querySelector('iframe.ans-insertvideo-online')&&!allVideos().length)throw Error('学习通播放器仍在加载，请稍后重试');
  }
  if(selectVideos(allVideos()).length)return true;
  const tabs=Array.from(document.querySelectorAll('#mainid li[id^=dct]')).filter(visible),active=tabs.findIndex(t=>t.classList.contains('active'));
  for(const tab of tabs.slice(active+1)){
   if(!/视频|章节测验|测验|练习/.test(tab.textContent||''))throw Error('下一项需要人工阅读或处理，请完成后继续');
   if(/测验|练习/.test(tab.textContent||'')&&!autoExercises)throw Error('下一项为章节测验，请人工处理');
   if(cancelled())return false;tab.click();await new Promise(r=>setTimeout(r,pause));return !cancelled();
  }
  const data=globalThis.ChaoxingParser?.catalog(),entries=data?.entries||[],current=entries.findIndex(e=>e.id===data.current);
  if(current<0)throw Error('无法确定学习通当前章节，请人工选择下一节');
  const next=entries.slice(current+1).find(e=>!e.done&&!e.locked&&!visited.has(e.id));
  if(!next)throw Error('当前目录中没有未完成且可进入的章节，请核对网站进度');
  if(cancelled())return false;visited.add(next.id);next.element.click();selected=null;await new Promise(r=>setTimeout(r,pause));return !cancelled();
 }
 const isReview=doc=>/selectWorkQuestionYiPiYue|selectWorkQuestionWeiPiYue/.test(doc.location.pathname)||!!doc.querySelector('.mark_table,.mark_answer');
 globalThis.ChaoxingLearning={docs,container,selectVideos,markEnded:v=>{completed.add(v);if(selected===v)selected=null;},questionRoots,isReview};
 globalThis.UoocCatalog={available:()=>!!document.querySelector('#coursetree'),name:()=> '学习通网页课程',context,gateNotice,picker,advance,reset:()=>{completed=new WeakSet();selected=null;visited.clear();}};
})();
