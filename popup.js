document.querySelector('#grades').onclick=()=>chrome.runtime.sendMessage({type:'gradesOpen'}).catch(()=>{});
document.querySelector('#settings').onclick=()=>chrome.runtime.openOptionsPage();
const el=id=>document.getElementById(id),duration=ms=>Math.floor(ms/3600000)+' 小时 '+Math.floor(ms/60000)%60+' 分';
chrome.runtime.sendMessage({type:'overview'}).then(response=>{
 if(!response||response.error)throw Error(response?.error||'后台未响应，请重新加载扩展');const data=response.result;
 el('todayTime').textContent=duration(data.today.milliseconds);el('todayVideos').textContent=data.today.videos+' 个视频';el('monthTime').textContent=duration(data.recent30.milliseconds);el('monthVideos').textContent=data.recent30.videos+' 个视频';el('recent').replaceChildren();
 if(!data.recent.length){const p=document.createElement('p');p.textContent='开始连播后，这里会记录最近学习的位置。';el('recent').append(p);}
 for(const item of data.recent){const u=new URL(item.url);if(!/^https?:$/.test(u.protocol)||!/(^|\.)uooc\.net\.cn$/i.test(u.hostname)||u.username||u.password||u.port)continue;const section=document.createElement('section'),title=document.createElement('strong'),chapter=document.createElement('small'),time=document.createElement('p'),link=document.createElement('a');section.className='course';title.textContent=item.title;chapter.textContent=item.chapter;time.textContent='上次位置 '+Math.floor(item.seconds/60)+':'+String(Math.floor(item.seconds)%60).padStart(2,'0')+' · '+new Date(item.time).toLocaleDateString();link.textContent='返回学习 ↗';link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';section.append(title,chapter,time,link);el('recent').append(section);}
}).catch(error=>el('status').textContent=error.message);

document.querySelector('#updates').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('options.html')+'#updates'});
