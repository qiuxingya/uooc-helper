(() => {
 const el=id=>document.getElementById(id),input=el('keepLogin'),button=el('checkLogin');
 const send=async(type,data={})=>{const r=await chrome.runtime.sendMessage({type,...data});if(!r||r.error)throw Error(r?.error||'后台未响应');return r.result;};
 const labels={valid:'登录有效',permission:'尚未授权',disabled:'已关闭',loginRequired:'请先登录',network:'网络异常，原会话保留',unverified:'尚未确认登录'};
 async function refresh(){const rows=await Promise.allSettled([send('loginStatus'),send('cxLoginStatus')]);rows.forEach((r,i)=>el(i?'cxLoginResult':'loginResult').textContent=(i?'学习通：':'优课：')+(r.status==='fulfilled'?(labels[r.value.state]||labels.unverified):r.reason.message));const states=rows.filter(r=>r.status==='fulfilled').map(r=>!!r.value.enabled);input.checked=states.length===2&&states.every(Boolean);input.indeterminate=states.some(Boolean)&&!input.checked;}
 async function task(fn){let error='';input.disabled=button.disabled=true;try{await fn();}catch(e){error=e.message;}finally{await refresh();if(error)el('loginResult').textContent=error+'；'+el('loginResult').textContent;input.disabled=button.disabled=false;}}
 input.onchange=()=>{const enabled=input.checked;task(async()=>{if(enabled&&!await chrome.permissions.request({permissions:['cookies'],origins:['https://www.uooc.net.cn/*','https://uooc.net.cn/*','https://*.chaoxing.com/*']}))throw Error('未授权，登录保持未变更');const rows=await Promise.allSettled([send('loginToggle',{enabled}),send('cxLoginToggle',{enabled})]);if(rows.some(r=>r.status==='rejected'))throw Error('部分平台设置失败，请查看下方状态并重试');});};
 button.onclick=()=>task(async()=>{await Promise.allSettled([send('loginCheck'),send('cxLoginCheck')]);});refresh();
})();
