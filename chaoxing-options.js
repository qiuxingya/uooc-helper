(() => {
 const el=id=>document.getElementById(id),send=async(type,data={})=>{const r=await chrome.runtime.sendMessage({type,...data});if(!r||r.error)throw Error(r?.error||'后台未响应');return r.result;};
 function render(d){el('keepCxLogin').checked=d.enabled;const labels={valid:'登录有效，已保留本机会话；服务器可能仍有独立有效期',permission:'尚未授权学习通 Cookie 访问',disabled:'学习通登录保持已关闭',loginRequired:'当前未登录或已失效，请先登录学习通',network:'检查时网络异常，现有会话未清除',unverified:'尚未确认登录状态，请先打开学习通'};el('cxLoginResult').textContent=(labels[d.state]||labels.unverified)+(d.checkedAt?' · '+new Date(d.checkedAt).toLocaleString():'');}
 el('keepCxLogin').onchange=async()=>{const input=el('keepCxLogin'),wanted=input.checked;input.disabled=true;try{if(wanted&&!await chrome.permissions.request({permissions:['cookies'],origins:['https://*.chaoxing.com/*']}))throw Error('未授权，学习通登录保持未开启');render(await send('cxLoginToggle',{enabled:wanted}));}catch(e){input.checked=!wanted;el('cxLoginResult').textContent=e.message;}finally{input.disabled=false;}};
 el('checkCxLogin').onclick=async()=>{el('checkCxLogin').disabled=true;try{render(await send('cxLoginCheck'));}catch(e){el('cxLoginResult').textContent=e.message;}finally{el('checkCxLogin').disabled=false;}};
 send('cxLoginStatus').then(render).catch(()=>{});
})();
