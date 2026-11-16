// 官方只读接口。凭据仅在后台请求期间使用，不返回给页面，也不另存备份。
(() => {
 const ORIGINS=['https://cloudapi.polymas.com/*','https://polymas.com/*','https://hike-teaching-center.polymas.com/*'];
 const NAMES=['jt-cas','ai-poly','openapi-token','cloudapi-token'],BASE='https://cloudapi.polymas.com';
 const methods={'/user/user/v2/get-current-user-detail':'POST','/student-course/student/term/list':'POST','/student-course/student/index/queryStudentCourse':'POST','/student-course/student/classList':'POST','/score-manage/api/totalScore/getCourseScore':'GET','/score-manage/api/totalScore/getCourseSetting':'GET'};
 let generation=0;const requests=new Set();
 const error=(code,message)=>Object.assign(Error(message),{code});
 const valid=c=>c&&NAMES.includes(c.name)&&['polymas.com','hike-teaching-center.polymas.com','cloudapi.polymas.com'].includes(c.domain.replace(/^\./,''))&&c.storeId==='0'&&!c.partitionKey;
 async function granted(){bind();return !!(chrome.cookies&&await chrome.permissions.contains({permissions:['cookies'],origins:ORIGINS}));}
 async function cookies(){if(!await granted())throw error('PERMISSION','请先授权 AI教学中心的账号与成绩读取');return (await chrome.cookies.getAll({domain:'polymas.com',storeId:'0'})).filter(valid);}
 async function credential(){const jar=await cookies();for(const name of NAMES){const found=jar.filter(c=>c.name===name&&c.value&&(c.session||!c.expirationDate||c.expirationDate>Date.now()/1000));if(found.length){if(new Set(found.map(c=>c.value)).size!==1)throw error('LOGIN_REQUIRED','检测到多个不同的认证会话，请重新登录网站');return found[0];}}throw error('LOGIN_REQUIRED','请先登录 AI教学中心');}
 async function request(path,data={},signal){
  const method=methods[path];if(!method)throw error('READ_FAILED','不支持的只读接口');
  const cookie=await credential(),epoch=generation,controller=new AbortController();requests.add(controller);
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},12000);
  try{
   const address=new URL(BASE+path);if(method==='GET')for(const [k,v]of Object.entries(data))address.searchParams.set(k,String(v));
   let token;try{token=decodeURIComponent(cookie.value);}catch{throw error('LOGIN_REQUIRED','认证会话格式异常，请重新登录');}
   const response=await fetch(address.href,{method,credentials:'include',redirect:'error',cache:'no-store',headers:{Authorization:token,'Content-Type':'application/json;charset=UTF-8'},...(method==='POST'?{body:JSON.stringify(data)}:{}),signal:controller.signal});
   if(epoch!==generation||signal?.aborted)throw error('CANCELLED','账号已变化或操作已取消');
   if([401,403].includes(response.status))throw error('LOGIN_REQUIRED','网站登录已失效，请重新登录');
   if(!response.ok)throw error('NETWORK','网站接口暂时不可用，请稍后重试');
   const result=await response.json();if(epoch!==generation||signal?.aborted)throw error('CANCELLED','账号已变化或操作已取消');
   if([401,403].includes(Number(result?.code)))throw error('LOGIN_REQUIRED','网站登录已失效，请重新登录');
   if(Number(result?.code)!==200)throw error('READ_FAILED','网站未返回可读取的数据');return result.data;
  }catch(e){if(e.code)throw e;throw error(signal?.aborted||epoch!==generation?'CANCELLED':timedOut?'PAGE_TIMEOUT':'NETWORK',signal?.aborted||epoch!==generation?'操作已取消':timedOut?'网站读取超时，请稍后重试':'无法连接网站，请检查网络');}
  finally{clearTimeout(timeout);requests.delete(controller);signal?.removeEventListener('abort',abort);}
 }
 const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
 async function stamp(){const c=await credential();return digest('polymas-session:'+c.name+'|'+c.domain+'|'+c.value);}
 async function profile(signal){const epoch=generation,d=await request('/user/user/v2/get-current-user-detail',{},signal);if(!d||typeof d.userNid!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(d.userNid)||Number(d.authType)!==0)throw error('LOGIN_REQUIRED','未确认当前学生账号，请先在网站登录学生身份');const result={account:await digest('polymas:'+d.userNid),schoolNid:typeof d.schoolInfo?.nid==='string'?d.schoolInfo.nid:null,stamp:await stamp()};if(epoch!==generation)throw error('CANCELLED','账号已变化');return result;}
 globalThis.PolymasAPI={ORIGINS,NAMES,valid,cookies,granted,request,profile,stamp,error,get generation(){return generation;}};
 let bound=false;function bind(){if(bound||!chrome.cookies?.onChanged)return;bound=true;chrome.cookies.onChanged.addListener(change=>{if(!valid(change.cookie)||change.removed&&change.cause==='overwrite')return;generation++;for(const c of requests)c.abort();chrome.storage.session.remove('pmGradeAccount').catch(()=>{});});}bind();
})();
