(() => {
 const KEY='pmLoginKeeper',ALARM='pm-login-keeper',DAYS=7;let queue=Promise.resolve(),generation=0;
 const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
 const identity=c=>[c.storeId,c.domain,c.path,c.name].join('|');
 const address=c=>'https://'+c.domain.replace(/^\./,'')+c.path;
 const current=c=>chrome.cookies.get({url:address(c),name:c.name,storeId:c.storeId});
 const details=(c,expires)=>({url:address(c),name:c.name,value:c.value,path:c.path,secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite,storeId:c.storeId,...(!c.hostOnly?{domain:c.domain}:{}),...(expires!==undefined?{expirationDate:expires}:{})});
 const config=async()=>{const d=(await chrome.storage.local.get(KEY))[KEY]||{};return {enabled:d.enabled===true,state:d.state||'unverified',checkedAt:d.checkedAt||null,owned:Array.isArray(d.owned)?d.owned:[]};};
 const save=d=>chrome.storage.local.set({[KEY]:d});
 async function view(){const d=await config();return {enabled:d.enabled,state:await PolymasAPI.granted()?d.enabled?d.state:'disabled':'permission',checkedAt:d.checkedAt,days:DAYS,retainedCookies:d.owned.length};}
 async function check(){
  let d=await config();if(!d.enabled||!await PolymasAPI.granted())return view();const epoch=generation;
  try{await PolymasAPI.profile();}catch(e){if(epoch!==generation)return view();d.state=e.code==='LOGIN_REQUIRED'?'loginRequired':e.code==='NETWORK'||e.code==='PAGE_TIMEOUT'?'network':'unverified';if(d.state==='loginRequired')d.owned=[];d.checkedAt=Date.now();await save(d);return view();}
  if(epoch!==generation)return view();d=await config();if(!d.enabled)return view();const jar=await PolymasAPI.cookies();d.owned=d.owned.filter(row=>jar.some(c=>identity(c)===row.key&&c.expirationDate===row.until));
  for(const c of jar.filter(c=>c.session&&c.value)){
   if(epoch!==generation)return view();const fresh=await current(c);if(epoch!==generation||!fresh||fresh.value!==c.value||!fresh.session)continue;
   const until=Math.floor(Date.now()/1000)+DAYS*86400;const stored=await chrome.cookies.set(details(c,until));
   if(epoch!==generation){const after=await current(c);if(after?.value===c.value&&after.expirationDate===until)await chrome.cookies.remove({url:address(c),name:c.name,storeId:c.storeId});return view();}
   if(!stored||stored.session||stored.expirationDate!==until)throw Error('无法保留登录状态，请重试');
   d.owned.push({key:identity(c),name:c.name,domain:c.domain,path:c.path,storeId:c.storeId,until});
  }
  d.state='valid';d.checkedAt=Date.now();await save(d);return view();
 }
 async function toggle(enabled){bind();if(typeof enabled!=='boolean')throw Error('登录开关格式错误');if(enabled&&!await PolymasAPI.granted())throw Error('请先授权 AI教学中心登录保持');const d=await config();d.enabled=enabled;if(!enabled&&await PolymasAPI.granted())for(const row of d.owned){const c=await current(row);if(c&&c.expirationDate===row.until)await chrome.cookies.set(details(c));}if(!enabled){d.owned=[];d.state='disabled';await chrome.alarms.clear(ALARM);}else await chrome.alarms.create(ALARM,{periodInMinutes:15});await save(d);return enabled?check():view();}
 async function restore(){bind();const d=await config();if(d.enabled&&await PolymasAPI.granted()){await chrome.alarms.create(ALARM,{periodInMinutes:15});await check();}}
 globalThis.PolymasLogin={types:new Set(['pmLoginStatus','pmLoginCheck','pmLoginToggle']),restore:()=>serial(restore),handle:(m,s,role)=>{if(role!=='options')return Promise.reject(Error('登录保持仅供设置页使用'));if(m.type==='pmLoginToggle'){generation++;return serial(()=>toggle(m.enabled));}return serial(m.type==='pmLoginCheck'?check:view);}};
 let bound=false;function bind(){if(bound||!chrome.cookies?.onChanged)return;bound=true;chrome.cookies.onChanged.addListener(change=>{if(!PolymasAPI.valid(change.cookie)||change.removed&&change.cause==='overwrite')return;if(change.removed){generation++;serial(async()=>{const d=await config();d.owned=d.owned.filter(r=>r.key!==identity(change.cookie));d.state='unverified';await save(d);}).catch(()=>{});}else if(change.cookie.session)serial(check).catch(()=>{});});}bind();
 chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)serial(async()=>{if((await chrome.tabs.query({url:['https://hike-teaching-center.polymas.com/*']})).length)await check();}).catch(()=>{});});
})();
