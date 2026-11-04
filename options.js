const fields=['model',...Object.keys(UoocSettings.defaults)];
const el=id=>document.getElementById(id);
let state='empty',busy=false,testing=false,saving=false,baseline=null;
const normalSnapshot=()=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,typeof UoocSettings.defaults[k]==='boolean'?el(k).checked:el(k).value])));
function dirty(){return baseline!==null&&normalSnapshot()!==baseline;}
function showSaveState(){if(!saving){result('status',baseline===null?'正在读取设置…':dirty()?'有未保存修改':'未修改');el('status').dataset.state=dirty()?'dirty':'clean';}}
el('form').addEventListener('input',showSaveState);el('form').addEventListener('change',showSaveState);addEventListener('beforeunload',e=>{if(dirty()||el('apiKey').value){e.preventDefault();e.returnValue='';}});

async function send(type,data={}){
  let timeout;const response=await Promise.race([chrome.runtime.sendMessage({type,...data}),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Object.assign(Error('后台响应超时，请确认状态后重试'),{code:'TIMEOUT'})),30000))]).finally(()=>clearTimeout(timeout));
  if(!response||response.error)throw Object.assign(Error(response?.error||'后台未响应，请重新加载扩展后重试'),{code:response?.code});
  return response.result;
}
function result(id,text,error=false){el(id).textContent=text;el(id).dataset.error=String(error);}
function clearSecrets(){for(const id of ['apiKey'])el(id).value='';el('apiKey').type='password';el('toggleKey').textContent='显示';el('toggleKey').setAttribute('aria-pressed','false');el('toggleKey').setAttribute('aria-label','显示 API Key');}
async function refresh(){
  const info=await send('keyStatus');state=info.state;
  const names={empty:'尚未配置',saved:'已保存 · 免密码',passwordLegacy:'旧版密钥 · 请重新粘贴',legacy:'旧版明文 · 可一键迁移'};
  el('keyState').textContent=names[state];el('keyState').dataset.state=state;
  el('saveKey').textContent=state==='legacy'?'加密迁移密钥':state==='saved'?'更换密钥':'保存密钥';
  el('keyHelp').textContent=state==='passwordLegacy'?'原 Key 使用密码加密，无法直接转为免密码模式。请重新粘贴 API Key 并保存；原数据会保留到保存成功。':state==='legacy'?'检测到旧版明文密钥，点击“加密迁移密钥”即可，无需重新粘贴。':state==='saved'?'密钥已保存，无需密码或解锁。输入新 Key 可替换，留空使用已保存的密钥。':'从 DeepSeek 开放平台获取密钥，粘贴并保存即可。';
}
async function action(fn){if(busy)return;busy=true;const buttons=['saveKey','clear','toggleKey'];buttons.forEach(id=>el(id).disabled=true);try{await fn();}catch(e){result('vaultResult',e.message,true);}finally{busy=false;buttons.forEach(id=>el(id).disabled=false);}}
el('toggleKey').onclick=()=>{const show=el('apiKey').type==='password';el('apiKey').type=show?'text':'password';el('toggleKey').textContent=show?'隐藏':'显示';el('toggleKey').setAttribute('aria-pressed',String(show));el('toggleKey').setAttribute('aria-label',show?'隐藏 API Key':'显示 API Key');};
const retrySettings=document.createElement('button');retrySettings.type='button';retrySettings.textContent='重新读取设置';retrySettings.className='secondary';retrySettings.hidden=true;el('status').after(retrySettings);
async function loadSettings(){fields.forEach(id=>el(id).disabled=true);retrySettings.hidden=true;let timer;try{const data=await Promise.race([chrome.storage.local.get(fields),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('读取设置超时')),12000))]);fields.forEach(k=>{const value=data[k]??UoocSettings.defaults[k];if(value!==undefined){if(typeof UoocSettings.defaults[k]==='boolean')el(k).checked=value;else el(k).value=value;}});renderTimer();baseline=normalSnapshot();fields.forEach(id=>el(id).disabled=false);showSaveState();}catch(error){result('status','无法读取设置，请重试。',true);retrySettings.hidden=false;}finally{clearTimeout(timer);}}retrySettings.onclick=loadSettings;loadSettings();
refresh().catch(e=>result('vaultResult',e.message,true));
el('saveKey').onclick=()=>action(async()=>{
  if(state==='saved'&&!el('apiKey').value.trim())throw Error('请填写要更换的新 API Key');
  await send('keySave',{apiKey:el('apiKey').value.trim()});clearSecrets();await refresh();result('vaultResult','密钥已在本机加密保存，可直接使用。');
});
el('clear').onclick=()=>action(async()=>{if(!window.confirm('删除已保存的 API Key？'))return;await send('keyDelete');clearSecrets();await refresh();result('vaultResult','API Key 已删除。');});
el('testConnection').onclick=async()=>{
  if(busy)return;busy=true;const button=el('testConnection');button.disabled=true;button.textContent='正在连接…';result('testResult','正在调用当前模型，请稍候…');
  try{const info=await send('testConnection',{apiKey:el('apiKey').value.trim(),model:el('model').value.trim()});result('testResult','连接成功 · '+info.model+' · '+(info.elapsedMs/1000).toFixed(2)+' 秒');}catch(e){result('testResult',e.message,true);}finally{testing=false;button.disabled=false;button.textContent='测试连接 ↗';}
};
function collect(){const data=Object.fromEntries(Object.keys(UoocSettings.defaults).map(k=>[k,typeof UoocSettings.defaults[k]==='boolean'?el(k).checked:['rate','delay','timerMinutes'].includes(k)?Number(el(k).value):el(k).value.trim()]));if(el('timerPreset').value==='custom'&&data.timerMinutes<1)throw Error('自定义定时应为 1–240 分钟');const settings=UoocSettings.validate(data);UoocSettings.selectorCheck(settings);return settings;}
function renderTimer(){const value=Number(el('timerMinutes').value),preset=[0,15,30,60,120].includes(value);el('timerPreset').value=preset?String(value):'custom';el('timerMinutes').hidden=preset;el('timerLabel').hidden=preset;}
el('timerPreset').onchange=()=>{const custom=el('timerPreset').value==='custom';el('timerLabel').hidden=!custom;el('timerMinutes').hidden=!custom;if(custom)el('timerMinutes').value=30;else el('timerMinutes').value=el('timerPreset').value;};
el('form').onsubmit=async e=>{
 e.preventDefault();if(saving||baseline===null)return;
 if(el('apiKey').value){document.getElementById('tab-account')?.click();el('saveKey').focus();return result('status','密钥尚未保存，请先点击保存密钥或更换密钥。',true);}
 saving=true;const button=el('form').querySelector('button[type=submit]');button.disabled=true;const sent=normalSnapshot();result('status','保存中…');el('status').dataset.state='saving';
 try{const settings=collect();const saved=await send('settingsSave',{settings,model:el('model').value.trim()});baseline=sent;const changed=dirty();result('status',changed?'已保存提交时的设置；还有未保存修改':saved?.syncWarning?'本机已保存，同步失败；可重新保存重试':'已保存；播放设置已同步，定时在下次开始生效。',!!saved?.syncWarning);el('status').dataset.state=changed?'dirty':saved?.syncWarning?'warning':'saved';}catch(error){result('status','保存失败：'+(error.message||'请重试'),true);el('status').dataset.state='error';}finally{saving=false;button.disabled=false;}
};
function download(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function utility(fn){try{await fn();}catch(e){result('utilityResult',e.message||'操作失败，请重试',true);}}
let pendingImport=null;
el('exportSettings').onclick=()=>utility(async()=>{const settings=await send('settingsGet');download('uooc-settings.json',UoocSettings.backup(settings));result('utilityResult','已导出设置，不包含密钥或学习记录。');});
el('exportLogs').onclick=()=>utility(async()=>{download('uooc-logs.json',await send('logsExport'));result('utilityResult','已导出脱敏运行日志。');});
el('importFile').onchange=()=>utility(async()=>{
 pendingImport=null;el('importPreview').hidden=true;const file=el('importFile').files[0];if(!file)return;if(file.size>65536)throw Error('备份文件不能超过 64 KB');
 const next=UoocSettings.parse(await file.text());UoocSettings.selectorCheck(next);const previous=await send('settingsGet');el('importChanges').replaceChildren();
 for(const key of Object.keys(next))if(previous[key]!==next[key]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=UoocSettings.labels[key];dd.textContent=String(previous[key]??'')+' → '+String(next[key]);el('importChanges').append(dt,dd);}
 if(!el('importChanges').childElementCount)el('importChanges').textContent='与当前已保存设置相同。';pendingImport=next;el('importPreview').hidden=false;result('utilityResult','请检查变更，确认后应用。');
});
el('applyImport').onclick=()=>utility(async()=>{if(!pendingImport)return;const settings=await send('settingsSave',{settings:pendingImport});for(const [k,v] of Object.entries(settings))if(typeof UoocSettings.defaults[k]==='boolean')el(k).checked=v;else el(k).value=v;renderTimer();const savedModel=baseline===null?el('model').value:JSON.parse(baseline).model;baseline=JSON.stringify({...JSON.parse(normalSnapshot()),model:savedModel});showSaveState();pendingImport=null;el('importPreview').hidden=true;el('importFile').value='';result('utilityResult','设置已导入，API Key 保持不变。');});
el('cancelImport').onclick=()=>{pendingImport=null;el('importPreview').hidden=true;el('importFile').value='';};
el('resetOrb').onclick=()=>utility(async()=>{await send('resetOrb');result('utilityResult','悬浮球已重置到右下角。');});
el('clearHistory').onclick=()=>utility(async()=>{if(!confirm('清空本机学习统计、最近位置和脱敏日志？'))return;await send('clearHistory');result('utilityResult','学习记录与日志已清空；连播运行中会继续记录。');});
chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.keyVault)refresh().catch(()=>{});});

const importButton=el('importFile').parentElement;importButton.tabIndex=0;importButton.setAttribute('role','button');importButton.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el('importFile').click();}};
