(() => {
 if(window.top!==window)return;
 const parser=UoocCourseParser;let activeToken='',aborted=false,running=false,lastOutcome=null;
 const send=(type,data={})=>chrome.runtime.sendMessage({type,...data});
 async function hash(id){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('uooc-account:'+id));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function execute(task){
  if(activeToken===task.token){if(lastOutcome)await send('gradeResult',lastOutcome).catch(()=>{});return;}activeToken=task.token;aborted=false;running=true;lastOutcome=null;
  try{
   let previous='',stableAt=Date.now(),clicked=task.action!=='next';
   const end=Date.now()+20000;
   while(Date.now()<end){
    if(aborted||activeToken!==task.token)return;
    if(parser.login())throw Error('LOGIN_REQUIRED');
    let data;
    if(task.kind==='account'){
     const id=parser.account();data=id?{account:await hash(id)}:null;
    }else if(task.kind==='list'){
     data=parser.readList(task.category);
     if(data){
      if(!clicked){if(data.pageKey===task.beforePageKey){const next=parser.nextButton();if(!next)throw Error('PAGER_CHANGED');next.click();clicked=true;previous='';await sleep(150);continue;}clicked=true;}
      if(task.action==='next'&&data.pageKey===task.beforePageKey){await sleep(150);continue;}
      data.account=await hash(data.accountId);delete data.accountId;
     }
    }else data=parser.readScore();
    const signature=data?JSON.stringify(data):'';
    if(signature!==previous){previous=signature;stableAt=Date.now();}
    if(data&&Date.now()-stableAt>=750){lastOutcome={jobId:task.jobId,token:task.token,data};await send('gradeResult',lastOutcome);return;}
    await sleep(150);
   }
   throw Error('PAGE_TIMEOUT');
  }catch(e){if(!aborted&&activeToken===task.token)await send('gradeResult',{jobId:task.jobId,token:task.token,error:['LOGIN_REQUIRED','PAGE_TIMEOUT','UNSUPPORTED_TABLE','AMBIGUOUS_PAGER','PAGER_CHANGED','UNSUPPORTED_COURSE_CARD'].includes(e.message)?e.message:'READ_FAILED'}).catch(()=>{});}
 }
 async function hello(){try{const r=await send('gradeHello');if(r?.result?.task)execute(r.result.task);return !!r?.result?.scan;}catch{return false;}}
 const ready=hello();globalThis.UoocCourseReader={ready};
 chrome.runtime.onMessage.addListener((message,sender)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(message.type==='gradeTask')hello();
  if(message.type==='gradeAbort'){aborted=true;activeToken='';}
 });
 // Only center pages expose the visible ID used to confirm the current account.
 ready.then(scan=>{
  if(scan)return;let last='',pending=false;
  const inspect=async()=>{if(pending)return;pending=true;try{const id=parser.account();const state=id?await hash(id):parser.login()?'logout':'';if(state&&state!==last){last=state;await send('gradeAccount',{account:state});}}catch{}finally{pending=false;}};
  inspect();let scheduled=false;new MutationObserver(()=>{if(!scheduled){scheduled=true;setTimeout(()=>{scheduled=false;inspect();},300);}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
 });
})();
