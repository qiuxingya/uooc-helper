// Account hints only invalidate old snapshots; only a completed scan can confirm an account.
(() => {
 let previous='',busy=false;
 async function inspect(){if(busy)return;busy=true;try{
  let account=null;const url=new URL(location.href);
  if(document.querySelector('form input[type=password]')){if(previous!=='logout'){previous='logout';await chrome.runtime.sendMessage({type:'cxAccountHint',logout:true});}return;}
  if(url.hostname==='fycourse.fanya.chaoxing.com'&&url.pathname==='/fyportal/courselist/course')account=globalThis.ChaoxingParser?.readList()?.accountId;
  else if(/\/studentstudy$/.test(url.pathname))account=url.searchParams.get('cpi');
  if(!/^\d{1,20}$/.test(account||''))return;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('chaoxing-account:'+account)),hash=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==previous){previous=hash;await chrome.runtime.sendMessage({type:'cxAccountHint',account:hash});}
 }catch{}finally{busy=false;}}
 inspect();let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(inspect,500);}).observe(document.documentElement,{childList:true,subtree:true});
})();
