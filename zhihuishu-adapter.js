// Shared-course DOM adapter. Never calls course-progress, score or exam submission APIs.
(() => {
 const studyHost='studyvideoh5.zhihuishu.com',workHost='onlineexamh5new.zhihuishu.com';
 const homework=()=>location.hostname===workHost&&/^#\/webExamList\/dohomework\/[A-Za-z0-9/_-]+$/.test(location.hash);
 const visible=e=>!!e?.isConnected&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const popup=()=>[...document.querySelectorAll('[role=dialog][aria-label="弹题测验"]')].find(visible);
 const facades=new WeakMap();
 function option(node){if(!facades.has(node))facades.set(node,{ownerDocument:node.ownerDocument,get isConnected(){return node.isConnected;},get disabled(){return node.matches('.disabled,[aria-disabled=true]');},get checked(){return !!node.querySelector('.topic-option-item.active,.item-topic.active');},click:()=>node.click()});return facades.get(node);}
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
 let ended=new Set();
 const context=()=>{const row=active();return {resource:row?'zhihuishu:'+key(row):null,chapter:row?.querySelector('.catalogue_title')?.textContent.trim()||'当前视频',finished:!!row&&(done(row)||ended.has(key(row)))};};
 function questions(all=false){
  if(!homework()){
   const dialog=popup();if(!dialog)return [];
   return [...dialog.querySelectorAll('.topic-title')].filter(visible).map(title=>{
    const root=title.parentElement,copy=title.cloneNode(true);copy.querySelectorAll('.title-tit,.right,.wrong,.error').forEach(e=>e.remove());
    const question=text(copy),nodes=[...root.querySelectorAll('.topic-list .topic-item')],options=nodes.map(e=>text(e.querySelector('.item-topic')));
    if(!question||nodes.length<2||nodes.length>12||options.some(s=>!s)||new Set(options).size!==options.length)return null;
    const type=/多选/.test(title.textContent)?'multiple':'single',payload={text:question,type,options};return {root,inputs:nodes.map(option),payload,signature:JSON.stringify(payload)};
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
  let seen=popupPages.get(dialog);if(!seen){seen=new Set();popupPages.set(dialog,seen);}
  const current=dialog.querySelector('.el-pager .number.active')?.textContent.trim()||'1';seen.add(current);
  if(seen.size>500)throw Object.assign(Error('弹题分页数量异常，请人工检查'),{code:'UNSUPPORTED'});
  const other=[...dialog.querySelectorAll('.el-pager .number')].find(e=>visible(e)&&!seen.has(e.textContent.trim()));
  const arrow=dialog.querySelector('.el-pagination .btn-next');
  const next=other||(arrow&&visible(arrow)&&!arrow.disabled?arrow:null);if(!next)return false;
  const before=questions()[0],markup=before?.root.innerHTML;
  if(!valid())return true;next.click();
  for(let n=0;n<60;n++){if(!valid())return true;if(!popup())throw Object.assign(Error('弹题分页时页面关闭，请核对后继续'),{code:'PAGE_CHANGED'});const page=dialog.querySelector('.el-pager .number.active')?.textContent.trim(),after=questions()[0];if(page&&page!==current&&after&&(after.root!==before?.root||after.signature!==before?.signature||after.root.innerHTML!==markup))return true;await new Promise(r=>setTimeout(r,200));}
  throw Object.assign(Error('弹题分页未切换，请检查网站反馈'),{code:'CONFIRM'});
 }
 async function confirmPopup(valid){
  const dialog=popup();if(!dialog)return true;
  const close=popupButton('关闭');
  if(close.length===1){if(await morePopupPages(dialog,valid))return false;if(!valid())return false;close[0].click();}
  else{
   const submit=[...popupButton('提交'),...popupButton('确定')];if(submit.length!==1)throw Object.assign(Error('未找到唯一的视频弹题确认按钮，请检查页面'),{code:'CONFIRM'});
   if(!valid())return false;submit[0].click();
   for(let n=0;n<60;n++){if(!valid())return false;if(!popup())return true;const close=popupButton('关闭');if(close.length===1){if(await morePopupPages(dialog,valid))return false;if(!valid())return false;close[0].click();break;}await new Promise(r=>setTimeout(r,200));}
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
 const blocked=()=>!UoocPlatforms.study(location.href)||[...document.querySelectorAll('iframe[src*="captcha.gtimg.com"],iframe[src*="captcha.163.com"]')].some(challengeVisible);
 globalThis.ZhihuishuLearning={name:'智慧树',homework,questions,text,number,total,buttons,context,popup,confirmPopup,blocked,popupComplete:()=>popupButton('关闭').length===1&&!!popup()?.querySelector('.answer'),title:()=>document.querySelector('.el-header .source-name,.courseName,.course-name,.courseTitle')?.textContent.trim()||document.querySelector('.examInfo li span[title]')?.textContent.trim()||'',markEnded:()=>{const row=active();if(row)ended.add(key(row));}};
 if(location.hostname===studyHost)globalThis.UoocCatalog={available:()=>rows().length>0,name:()=> '智慧树共享课',context,advance,reset:()=>ended.clear(),picker:()=>false};
})();
