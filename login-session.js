(() => {
 const ORIGINS=['https://www.uooc.net.cn/*','https://uooc.net.cn/*'],PROBE='https://www.uooc.net.cn/home/announce/getUnreadCnt?hidemsg_=true';
 const NAMES=new Set(['JSESSID','uooc_auth','uooc_auth_fake']),DAYS=7,ALARM='uooc-login-keeper';let queue=Promise.resolve(),generation=0,changePending=false,cookieEventsBound=false;
 const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 const valid=c=>NAMES.has(c.name)&&['uooc.net.cn','www.uooc.net.cn'].includes(c.domain.replace(/^\./,''))&&!c.partitionKey&&c.storeId==='0';
 const key=c=>[c.storeId,c.domain,c.path,c.name].join('|');
 const url=c=>'https://'+c.domain.replace(/^\./,'')+c.path;
 async function granted(){return !!(chrome.cookies&&await chrome.permissions.contains({permissions:['cookies'],origins:ORIGINS}));}
 async function config(){const {loginKeeper={}}=await chrome.storage.local.get('loginKeeper');return {enabled:loginKeeper.enabled===true,owned:Array.isArray(loginKeeper.owned)?loginKeeper.owned:[],state:loginKeeper.state||'unverified',checkedAt:loginKeeper.checkedAt||null};}
 async function save(data){await chrome.storage.local.set({loginKeeper:data});}
 async function list(){return (await chrome.cookies.getAll({url:'https://www.uooc.net.cn/',storeId:'0'})).filter(valid);}
 async function current(c){return chrome.cookies.get({url:url(c),name:c.name,storeId:c.storeId});}
 function details(c,expirationDate){const d={url:url(c),name:c.name,value:c.value,path:c.path,secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite,storeId:c.storeId};if(!c.hostOnly)d.domain=c.domain;if(expirationDate!==undefined)d.expirationDate=expirationDate;return d;}
 async function view(){const data=await config(),allowed=await granted();return {enabled:data.enabled,state:allowed?data.enabled?data.state:'disabled':'permission',checkedAt:data.checkedAt,retainedCookies:data.enabled?data.owned.length:0,days:DAYS};}
 async function check(){
  let data=await config();if(!data.enabled)return view();if(!await granted())return view();
  const token=generation,cookies=await list();if(!cookies.some(c=>c.value)){data.state='loginRequired';data.owned=[];await save(data);return view();}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);let state;
  try{const response=await fetch(PROBE,{method:'GET',credentials:'include',cache:'no-store',redirect:'follow',signal:controller.signal,headers:{'Accept':'application/json'}});if(response.url&&/^https:\/\/(?:www\.)?uooc\.net\.cn\/user\/login(?:[?/#]|$)/.test(response.url))state='loginRequired';else if(response.url&&!/^https:\/\/(?:www\.)?uooc\.net\.cn\/home\/announce\/getUnreadCnt(?:[?]|$)/.test(response.url))state='unverified';else if(response.status===401||response.status===403)state='loginRequired';else if(!response.ok)state='network';else{const json=await response.json();state=Number(json.code)===1?'valid':Number(json.code)===401?'loginRequired':'unverified';}}
  catch{state='network';}finally{clearTimeout(timeout);}
  if(token!==generation)return view();data=await config();if(!data.enabled)return view();data.state=state;data.checkedAt=Date.now();
  if(state==='loginRequired')data.owned=[];
  if(state==='valid'){
   const latest=await list();data.owned=data.owned.filter(row=>latest.some(c=>key(c)===row.key&&c.expirationDate===row.until));
   for(const c of latest.filter(c=>c.session&&c.value)){
    if(generation!==token)return view();const now=await current(c);if(generation!==token||!now||now.value!==c.value||!now.session)continue;
    const until=Math.floor(Date.now()/1000)+DAYS*86400;const stored=await chrome.cookies.set(details(c,until));
    if(generation!==token){const after=await current(c);if(after?.value===c.value&&after.expirationDate===until)await chrome.cookies.remove({url:url(c),name:c.name,storeId:c.storeId});return view();}
    if(!stored||stored.session||stored.expirationDate!==until)throw Error('COOKIE_WRITE_FAILED');
    data.owned.push({key:key(c),name:c.name,domain:c.domain,path:c.path,storeId:c.storeId,until});
   }
  }
  await save(data);return view();
 }
 async function toggle(enabled){
  if(typeof enabled!=='boolean')throw Error('登录保持开关格式错误');if(enabled&&!await granted())throw Error('请先授权优课登录保持权限');
  bindCookieEvents();const data=await config();data.enabled=enabled;
  if(!enabled&&await granted()){for(const row of data.owned){const c=await current(row);if(c&&c.expirationDate===row.until)await chrome.cookies.set(details(c));}}
  if(!enabled){data.owned=[];data.state='disabled';await chrome.alarms.clear(ALARM);}else await chrome.alarms.create(ALARM,{periodInMinutes:15});
  await save(data);return enabled?check():view();
 }
 async function restore(){bindCookieEvents();const data=await config();if(data.enabled&&await granted()){await chrome.alarms.create(ALARM,{periodInMinutes:15});return check();}return view();}
 const types=new Set(['loginStatus','loginCheck','loginToggle']);
 globalThis.UoocLogin={types,restore:()=>serial(restore),handle:(m,sender,role)=>{if(role!=='options')return Promise.reject(Error('登录保持仅供设置页使用'));if(m.type==='loginToggle'){generation++;return serial(()=>toggle(m.enabled));}return m.type==='loginCheck'?serial(check):serial(view);}};
 function bindCookieEvents(){if(cookieEventsBound||!chrome.cookies)return;chrome.cookies.onChanged.addListener(change=>{
  const c=change.cookie;if(!valid(c))return;
  if(change.removed){if(change.cause==='overwrite')return;generation++;serial(async()=>{const data=await config();data.owned=data.owned.filter(row=>row.key!==key(c));data.state='unverified';await save(data);}).catch(()=>{});}
  else if(c.session&&c.value&&!changePending){generation++;changePending=true;serial(check).catch(()=>{}).finally(()=>{changePending=false;});}
 });cookieEventsBound=true;}
 bindCookieEvents();
 chrome.alarms.onAlarm.addListener(a=>{if(a.name!==ALARM)return;serial(async()=>{const tabs=await chrome.tabs.query({url:ORIGINS});if(tabs.length)await check();}).catch(()=>{});});
 chrome.runtime.onStartup?.addListener(()=>serial(restore).catch(()=>{}));
 chrome.tabs.onUpdated?.addListener((id,change,tab)=>{if(change.status==='complete'&&/^https:\/\/(?:www\.)?uooc\.net\.cn\//.test(tab.url||''))serial(async()=>{const data=await config();if(!data.checkedAt||Date.now()-data.checkedAt>60000)await check();}).catch(()=>{});});
})();
