(() => {
 if(window.top!==window)return;
 let active='',running=false;
 const send=(type,data={})=>chrome.runtime.sendMessage({type,...data});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function accountHash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('chaoxing-account:'+value));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
 function login(){return /^(?:passport2|passport2-api|v8)\.chaoxing\.com$/.test(location.hostname)&&!!document.querySelector('input[type=password],iframe[src*=login]')||!!document.querySelector('form[action*=login] input[type=password]');}
 function listAddress(raw){try{const u=new URL(raw,document.baseURI);return u.origin==='https://fycourse.fanya.chaoxing.com'&&u.pathname==='/fyportal/courselist/course'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
 function enterCourseMenu(){
  // /base defaults to the school's learning workspace, including on the final account recheck.
  // Use the site's own course navigation once, and let it append its transient list token.
  const menus=Array.from(document.querySelectorAll('[role=menuitem][dataurl]')).filter(e=>(e.getAttribute('name')==='课程'||e.querySelector('h3')?.textContent.trim()==='课程')&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&listAddress(e.getAttribute('dataurl')));
  if(menus.length!==1)return false;menus[0].click();return true;
 }
 function read(kind){
  if(kind==='center'){const address=listAddress(document.querySelector('iframe#frame_content')?.getAttribute('src'));return address?{listUrl:address}:null;}
  if(kind==='list'||kind==='verifyList')return ChaoxingParser.readList();
  if(kind==='progress')return ChaoxingParser.progress();if(kind==='score')return ChaoxingParser.readScore();return null;
 }
 async function execute(task){if(running&&active===task.token)return;active=task.token;running=true;let previous='',stableAt=Date.now(),enteredCourseMenu=false;try{for(let elapsed=0;elapsed<20000;elapsed+=150){if(active!==task.token)return;if(login())throw Error('LOGIN_REQUIRED');const data=read(task.kind);if(task.kind==='center'&&!data&&!enteredCourseMenu)enteredCourseMenu=enterCourseMenu();const signature=data?JSON.stringify(data):'';if(signature!==previous){previous=signature;stableAt=Date.now();}if(data&&Date.now()-stableAt>=750){if(task.kind==='list'||task.kind==='verifyList'){data.account=await accountHash(data.accountId);data.courses=data.courses.map(c=>({...c,accountId:data.accountId}));delete data.accountId;}await send('cxGradeResult',{jobId:task.jobId,token:task.token,data});return;}await sleep(150);}throw Error('PAGE_TIMEOUT');}catch(e){if(active===task.token)await send('cxGradeResult',{jobId:task.jobId,token:task.token,error:['LOGIN_REQUIRED','PAGE_TIMEOUT','SCORE_TABLE_CONFLICT'].includes(e.message)?e.message:'READ_FAILED'}).catch(()=>{});}finally{running=false;}}
 async function hello(){try{const r=await send('cxGradeHello');if(r?.result?.task)void execute(r.result.task);return !!r?.result?.scan;}catch{return false;}}
 globalThis.UoocCourseReader={ready:hello()};
})();
