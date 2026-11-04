// DOM-only adapters for classic and modern UOOC catalogues.
(() => {
 const variants=[
  {name:'新版优课',root:'.newlearn_left_card_chapter_list',source:'.level_2_resourcelist_item,.level_3_resourcelist_item',levels:['.level_3 > li > .level_3_title','.level_2 > li > .level_2_title','.newlearn_left_card_chapter_list > li > .level_1_title'],children:'.level_2,.level_3,.level_2_resourcelist,.level_3_resourcelist'},
  {name:'经典优课',root:'ul.rank-1 .catalogItem',source:'.resourcelist > .basic',levels:['.rank-3 > li > .basic','.rank-2 > li > .basic','.rank-1 > li > .basic'],children:'.rank-2,.rank-3,.resourcelist'}
 ];
 const variant=()=>variants.find(v=>document.querySelector(v.root)),visible=e=>e.isConnected&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const all=s=>Array.from(document.querySelectorAll(s)).filter(visible),done=e=>e.classList.contains('complete')||!!e.querySelector('[class*="_icon_check"]');
 const video=e=>!!e.querySelector('.icon-video,img[src$="/video.png"],img[src$="/video_active.png"]');
 const quiz=e=>!!e.querySelector('img[src$="/test.png"],img[src$="/test_active.png"]')||/测验|作业|考试/.test(e.innerText);
 const key=e=>e.getAttribute('href')||e.id||e.parentElement.id||((e.closest('li')?.id||'resource')+':'+Array.from(e.parentElement.children).indexOf(e));
 const route=e=>{const h=e.getAttribute('href');return h&&h.startsWith('#/')&&(location.hash===h||location.hash.startsWith(h+'/'));};
 const selected=e=>route(e)||e.classList.contains('active');
 const locked=e=>!!e.closest('.unopen,.locked,.is-locked,[data-locked=true],[aria-disabled=true]')||e.disabled===true||!!e.querySelector('.icon-lock,[class$="_icon_lock"],img[src$="/lock.png"]');
 const gatePattern=/闯关(?:模式|学习).{0,80}(?:请先|必须|未|不能|无法|需)|(?:请先|必须|需先|需要).{0,70}(?:提交|通过|完成).{0,50}(?:测验|测试|前一|上一|章节|任务)|(?:测验|测试|上一|前一).{0,60}(?:未通过|未提交|未完成|通过后|完成后).{0,50}(?:学习|观看|进入|解锁)|当前.{0,30}未解锁/;
 function gateNotice(root=document){return Array.from(root.querySelectorAll('.unfoldInfo,.layui-layer-content,[role=alert],[data-gate-message],[class*=resource_error],[class*=learn_error]')).filter(visible).find(e=>{if(root===document&&e.matches('.unfoldInfo')&&e.closest('.rank-1,.newlearn_left_card_chapter_list')){const title=e.closest('li')?.querySelector(':scope > .basic,:scope > .level_1_title,:scope > .level_2_title,:scope > .level_3_title');if(title&&!selected(title))return false;}return gatePattern.test(e.innerText||'');})||null;}
 function currentTitle(v,selector){const items=all(selector);return items.filter(route).sort((a,b)=>(b.getAttribute('href')||'').length-(a.getAttribute('href')||'').length)[0]||items.find(e=>e.classList.contains('active'));}
 function scope(v){for(const selector of v.levels){const node=currentTitle(v,selector);if(node)return node.parentElement;}return null;}
 function emptyNotice(root){return Array.from(root.querySelectorAll('.unfoldInfo')).filter(visible).find(e=>/^(点击下方继续学习|暂无课程资源|暂无学习资源)$/.test((e.innerText||'').trim()))||null;}
 function picker(){const v=variant(),container=v&&scope(v);if(!container)return false;if(Array.from(container.querySelectorAll('.isloading,[aria-busy=true]')).some(visible))return false;if(Array.from(container.querySelectorAll(v.source)).filter(visible).some(selected))return false;return !!emptyNotice(container)||all('.lean_view').some(e=>/^(?:进入.{0,100}[,，])?请选择课程资源[。！]?$/.test((e.innerText||'').replace(/\s+/g,'')));}
 let skipped=new Set();
 globalThis.UoocCatalog={available:()=>!!variant(),name:()=>variant()?.name||'通用页面',gateNotice,picker,reset:()=>{skipped=new Set();},
  context:()=>{const v=variant(),active=v?all(v.source).find(selected):null;const raw=active?key(active):null;return {finished:active?done(active):false,resource:raw&&/^[a-zA-Z0-9/_#:-]{1,220}$/.test(raw)?raw:null,chapter:(active?.innerText||'当前视频').trim().slice(0,120)};},
  async advance(cancelled,pause=250,initial=false,autoExercises=false,options={}){
   const v=variant();if(!v)throw Error('未识别到优课目录');const seen=new Set();let skipCurrent=!initial,forceChapter=!!options.laterChapter;
   const wait=()=>new Promise(r=>setTimeout(r,pause)),skip=e=>{const id=key(e);if(!skipped.has(id)){skipped.add(id);options.onSkip?.();}};
   for(let attempt=0;attempt<300;attempt++){
    if(cancelled())return false;
    if(!forceChapter){
     const container=scope(v),sources=(container?Array.from(container.querySelectorAll(v.source)).filter(visible):all(v.source));const active=sources.findIndex(selected);
     for(const e of sources.slice(skipCurrent&&active>=0?active+1:0)){
      if(done(e)||skipped.has(key(e)))continue;if(locked(e)){skip(e);continue;}
      if(video(e)||quiz(e)){
       if(quiz(e)&&!autoExercises)throw Error('下一项是测验或作业，连播已暂停；请打开题目后点击“分析并填写”');
       if(cancelled())return false;options.onSelect?.(e);e.click();await wait();return !cancelled();
      }
     }
    }
    let target;
    for(const selector of forceChapter?[v.levels.at(-1)]:v.levels){
     const items=all(selector),current=currentTitle(v,selector);let index=current?items.indexOf(current):-1;
     if(index<0)index=items.findIndex(e=>e.parentElement.querySelector(v.children));
     for(const e of items.slice(index+1)){if(done(e)||seen.has(key(e))||skipped.has(key(e)))continue;if(locked(e)){skip(e);continue;}target=e;break;}
     if(target)break;
    }
    if(!target)throw Error(skipped.size?'后续没有可进入的章节，请先完成闯关测验或人工检查目录':'当前可用目录已遍历完毕，请核对网站课程进度');
    if(quiz(target)&&!autoExercises)throw Error('下一目录是测验或作业，连播已暂停');
    const id=key(target);if(!id)throw Error('目录条目缺少标识，请手动选择下一节');seen.add(id);
    if(cancelled())return false;target.click();let ready=false,gated=false,emptySince=0;
    for(let elapsed=0;elapsed<15000;elapsed+=Math.max(1,pause)){
     if(cancelled())return false;
     if(target.isConnected){
      if(locked(target)||gateNotice(target.parentElement)){skip(target);gated=true;ready=true;break;}
      if(emptyNotice(target.parentElement)&&!Array.from(target.parentElement.querySelectorAll('.isloading,[aria-busy=true]')).some(visible)){if(!emptySince)emptySince=Date.now();else if(Date.now()-emptySince>=500){ready=true;break;}}else emptySince=0;
      if(Array.from(target.parentElement.querySelectorAll(v.source+','+v.levels.join(','))).some(e=>e!==target&&visible(e))){ready=true;break;}
     }
     await wait();
    }
    if(!ready)throw Error('目录加载超时，请检查网络后重试');
    forceChapter=gated;skipCurrent=false;
   }
   throw Error('目录切换次数超限，请检查页面');
  }
 };
})();
