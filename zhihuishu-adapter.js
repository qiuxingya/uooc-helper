// Shared-course DOM adapter. Never calls course-progress, score or exam submission APIs.
(() => {
 const studyHost='studyvideoh5.zhihuishu.com',workHost='onlineexamh5new.zhihuishu.com';
 const homework=()=>location.hostname===workHost&&/^#\/webExamList\/dohomework\/[A-Za-z0-9/_-]+$/.test(location.hash);
 const visible=e=>!!e?.isConnected&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const popup=()=>[...document.querySelectorAll('[role=dialog][aria-label="弹题测验"]')].find(visible);
 function activatePopupControl(node,valid=()=>true){
  const allowed=()=>valid()&&!blocked()&&visible(node)&&!node.disabled&&!node.matches('.disabled,[aria-disabled=true]')&&!!node.closest('[role=dialog][aria-label="弹题测验"]');
  if(!allowed())return false;
  const win=node.ownerDocument.defaultView,rect=node.getBoundingClientRect();
  const init={bubbles:true,cancelable:true,composed:true,view:win,button:0,detail:1,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2};
  // Ordinary synthetic events: no trusted-input spoofing or browser debugging permission.
  const types=win.PointerEvent?['pointerdown','mousedown','pointerup','mouseup','click']:['mousedown','mouseup','click'];
  for(const type of types){
   if(!allowed())return false;
   const buttons=type.endsWith('down')?1:0;
   const event=type.startsWith('pointer')&&win.PointerEvent?new win.PointerEvent(type,{...init,buttons,pointerId:1,pointerType:'mouse',isPrimary:true}):new win.MouseEvent(type,{...init,buttons});
   node.dispatchEvent(event);
  }
  return true;
 }
 const facades=new WeakMap();
 function option(node){if(!facades.has(node))facades.set(node,{ownerDocument:node.ownerDocument,get isConnected(){return node.isConnected;},get disabled(){return node.matches('.disabled,[aria-disabled=true]');},get checked(){return !!node.querySelector('.topic-option-item.active,.item-topic.active');},click:valid=>activatePopupControl(node,valid)});return facades.get(node);}
 const text=e=>{
  if(!e)return '';const out=[],seen=new Set();
  function walk(node){if(seen.has(node))return;seen.add(node);if(node.nodeType===3){out.push(node.textContent);return;}if(node.nodeType===1&&node.matches('script,style,noscript'))return;
   let shadow=node.shadowRoot;try{shadow||=chrome.dom?.openOrClosedShadowRoot(node);}catch{}
   for(const child of (shadow||node).childNodes||[])walk(child);
  }walk(e);return out.join(' ').replace(/\s+/g,' ').trim();
 };
 const rows=()=>[...document.querySelectorAll('li.video')].filter(visible);
 const key=e=>String(rows().indexOf(e))+':'+(e.querySelector('.hour')?.textContent.trim()||'');
 const done=e=>!!e.querySelector('.time_icofinish')||!![...e.querySelectorAll('[role=progressbar]')].find(p=>Number(p.getAttribute('aria-valuenow'))===100);
 const active=()=>rows().find(e=>e.classList.contains('current_play'));
 let lastPopup=null,lastResource='',popupEpisode=0;
 function popupScope(){const dialog=popup(),row=active(),resource=row?key(row):'';if(dialog!==lastPopup||resource!==lastResource){lastPopup=dialog;lastResource=resource;popupEpisode++;}return dialog?popupEpisode:null;}
 // Vue may reuse the same dialog and option nodes for a later popup.
 new MutationObserver(()=>popupScope()).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden']});
 let ended=new Set();
 const context=()=>{const row=active();return {resource:row?'zhihuishu:'+key(row):null,chapter:row?.querySelector('.catalogue_title')?.textContent.trim()||'当前视频',finished:!!row&&(done(row)||ended.has(key(row)))};};
 function questions(all=false){
  if(!homework()){
   const dialog=popup(),scope=popupScope();if(!dialog)return [];
   return [...dialog.querySelectorAll('.topic-title')].filter(visible).map(title=>{
    const root=title.parentElement,copy=title.cloneNode(true);copy.querySelectorAll('.title-tit,.right,.wrong,.error').forEach(e=>e.remove());
    const stem=title.querySelector(':scope > span:last-child');
    const question=text(stem&&!stem.matches('.title-tit')?stem:copy),nodes=[...root.querySelectorAll('.topic-list .topic-item')],options=nodes.map(e=>text(e.querySelector('.item-topic')));
    if(!question||nodes.length<2||nodes.length>12||options.some(s=>!s)||new Set(options).size!==options.length)return null;
    const type=/多选/.test(title.textContent)?'multiple':'single',payload={text:question,type,options};return {root,scope,inputs:nodes.map(option),payload,signature:JSON.stringify(payload)};
   }).filter(Boolean);
  }
  return [...document.querySelectorAll('.examPaper_subject')].filter(e=>all||visible(e)).map(root=>{
   const stem=root.querySelector('.subject_describe'),question=text(stem),kind=root.querySelector('.subject_type')?.textContent||'';
   if(!question)return null;const inputs=[...root.querySelectorAll('.subject_node input[type=radio],.subject_node input[type=checkbox]')];
   if(inputs.length>=2&&inputs.length<=12&&!inputs.some(i=>i.disabled)&&new Set(inputs.map(i=>i.type)).size===1){
    const options=inputs.map(i=>text(i.closest('.nodeLab')?.querySelector('.node_detail')));
    if(options.some(o=>!o)||new Set(options).size!==options.length)return null;
    const type=inputs[0].type==='checkbox'?'multiple':'single',payload={text:question,type,options};
    return {root,inputs,payload,signature:JSON.stringify(payload)};
   }
   if(!/填空/.test(kind))return null;
   const blanks=[...root.querySelectorAll('input[type=text],textarea')].filter(e=>all||visible(e));
   if(!blanks.length||blanks.length>20||blanks.some(i=>i.disabled||i.readOnly))return null;
   const payload={text:question,type:'blank',blankCount:blanks.length};return {root,inputs:blanks,payload,signature:JSON.stringify(payload)};
  }).filter(Boolean);
 }
 const buttons=label=>[...document.querySelectorAll('button')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&e.textContent.trim()===label);
 const number=q=>Number(q.root.querySelector('.subject_num')?.textContent.trim());
 const total=()=>document.querySelectorAll('.answerCard_list li').length;
 async function advance(cancelled,pause=250,initial=false){
  const entries=rows(),current=active(),index=entries.indexOf(current);
  const next=(initial&&!current?entries:entries.slice(index+1)).find(e=>!done(e)&&!ended.has(key(e))&&!e.matches('.locked,[aria-disabled=true]'));
  if(!next)throw Object.assign(Error('当前目录没有后续待播放视频，请核对课程目录'),{code:'UNSUPPORTED'});
  if(cancelled())return false;next.click();await new Promise(r=>setTimeout(r,pause));return !cancelled();
 }
 const popupButton=label=>{const dialog=popup();return dialog?[...dialog.querySelectorAll('.dialog-footer .btn,.dialog-footer button')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&e.textContent.trim()===label):[];};
 const popupPages=new WeakMap();
 async function morePopupPages(dialog,valid){
  const scope=popupScope();let state=popupPages.get(dialog);if(!state||state.scope!==scope){state={scope,seen:new Set()};popupPages.set(dialog,state);}const seen=state.seen;
  const current=dialog.querySelector('.el-pager .number.active')?.textContent.trim()||'1';seen.add(current);
  if(seen.size>500)throw Object.assign(Error('弹题分页数量异常，请人工检查'),{code:'UNSUPPORTED'});
  const other=[...dialog.querySelectorAll('.el-pager .number')].find(e=>visible(e)&&!seen.has(e.textContent.trim()));
  const arrow=dialog.querySelector('.el-pagination .btn-next');
  const next=other||(arrow&&visible(arrow)&&!arrow.disabled?arrow:null);if(!next)return false;
  const before=questions()[0],markup=before?.root.innerHTML;
  if(!valid())return true;if(!activatePopupControl(next,valid))return true;
  for(let n=0;n<60;n++){if(!valid())return true;if(!popup())throw Object.assign(Error('弹题分页时页面关闭，请核对后继续'),{code:'PAGE_CHANGED'});const page=dialog.querySelector('.el-pager .number.active')?.textContent.trim(),after=questions()[0];if(page&&page!==current&&after&&(after.root!==before?.root||after.signature!==before?.signature||after.root.innerHTML!==markup))return true;await new Promise(r=>setTimeout(r,200));}
  throw Object.assign(Error('弹题分页未切换，请检查网站反馈'),{code:'CONFIRM'});
 }
 async function confirmPopup(valid){
  const dialog=popup();if(!dialog)return true;
  const close=popupButton('关闭');
  if(close.length===1){if(await morePopupPages(dialog,valid))return false;if(!activatePopupControl(close[0],valid))return false;}
  else{
   const submit=[...popupButton('提交'),...popupButton('确定')];if(submit.length!==1)throw Object.assign(Error('未找到唯一的视频弹题确认按钮，请检查页面'),{code:'CONFIRM'});
   if(!activatePopupControl(submit[0],valid))return false;
   for(let n=0;n<60;n++){if(!valid())return false;if(!popup())return true;const close=popupButton('关闭');if(close.length===1){if(await morePopupPages(dialog,valid))return false;if(!activatePopupControl(close[0],valid))return false;break;}await new Promise(r=>setTimeout(r,200));}
  }
  for(let n=0;n<30;n++){if(!valid())return false;if(!popup())return true;await new Promise(r=>setTimeout(r,200));}
  throw Object.assign(Error('弹题尚未关闭，请检查网站反馈后继续'),{code:'CONFIRM'});
 }
 function challengeVisible(frame){
  if(!visible(frame))return false;
  const rect=frame.getBoundingClientRect();
  if(rect.width<=20||rect.height<=20||rect.bottom<=0||rect.right<=0||rect.top>=innerHeight||rect.left>=innerWidth)return false;
  for(let node=frame;node;node=node.parentElement){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;}
  return true;
 }
 const scriptWarning=()=>[...document.querySelectorAll('.el-message-box,.el-dialog,[role=dialog]')].some(e=>challengeVisible(e)&&/检测到异常脚本/.test(e.innerText));
 const blocked=()=>scriptWarning()||!UoocPlatforms.study(location.href)||[...document.querySelectorAll('iframe[src*="captcha.gtimg.com"],iframe[src*="captcha.163.com"]')].some(challengeVisible);
 const rateLimit=rate=>Math.min(Number(rate)||1,1.5);
 const stopReason=()=>scriptWarning()?'网站检测到异常脚本，助手已停止；请按网站提示关闭插件后返回学堂重新进入课程':'遇到考试或验证，请人工处理';
 function setSpeed(video,requested){
  if(homework())return;const rate=rateLimit(requested);if(scriptWarning())throw Object.assign(Error(stopReason()),{code:'MANUAL'});
  if(video.playbackRate===rate)return;
  const controls=[...document.querySelectorAll('.speedBox .speedTab[rate]')].filter(e=>Number(e.getAttribute('rate'))===rate&&!e.matches('.disabled,[aria-disabled=true]'));
  if(controls.length!==1)throw Object.assign(Error('未找到唯一的网站倍速按钮，请在播放器选择倍速后继续'),{code:'UNSUPPORTED'});
  controls[0].click();
 }
 globalThis.ZhihuishuLearning={rateLimit,setSpeed,stopReason,name:'智慧树',homework,questions,text,number,total,buttons,context,popup,confirmPopup,blocked,popupComplete:()=>popupButton('关闭').length===1&&!!popup()?.querySelector('.answer'),title:()=>document.querySelector('.el-header .source-name,.courseName,.course-name,.courseTitle')?.textContent.trim()||document.querySelector('.examInfo li span[title]')?.textContent.trim()||'',markEnded:()=>{const row=active();if(row)ended.add(key(row));}};
 if(location.hostname===studyHost)globalThis.UoocCatalog={available:()=>rows().length>0,name:()=> '智慧树共享课',context,advance,reset:()=>ended.clear(),picker:()=>false};
})();
