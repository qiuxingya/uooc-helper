const el=id=>document.getElementById(id);
const duration=ms=>Math.floor(ms/3600000)+' 小时 '+Math.floor(ms/60000)%60+' 分';
let overviewTask=0,refreshTimer,hasOverview=false,recentExpanded=false,closed=false;
const reloadOverview=document.createElement('button');
reloadOverview.id='reloadOverview';
reloadOverview.textContent='重新读取';
reloadOverview.hidden=true;
el('status').after(reloadOverview);
el('grades').onclick=()=>chrome.runtime.sendMessage({type:'gradesOpen'}).catch(()=>{});
el('settings').onclick=()=>chrome.runtime.openOptionsPage();

function expandRecent(){
 const courses=el('recent').querySelectorAll('.course');
 courses.forEach((course,index)=>course.hidden=!recentExpanded&&index>=3);
 el('expandRecent').hidden=courses.length<=3;
 el('expandRecent').textContent=recentExpanded?'收起记录':'展开全部';
}
function recentCourse(item){
 if(!item||typeof item.url!=='string'||typeof item.title!=='string'||!item.title.trim()||typeof item.chapter!=='string'
  ||!Number.isFinite(item.seconds)||item.seconds<0||item.seconds>86400||!Number.isFinite(item.time)||item.time<=0||item.time>8640000000000000)return null;
 let url;
 try{
  url=new URL(item.url);
  const allowed=globalThis.UoocPlatforms?UoocPlatforms.study(url.href):/^https?:$/.test(url.protocol)&&/(^|\.)uooc\.net\.cn$/i.test(url.hostname);
  if(!allowed||url.username||url.password||url.port)return null;
 }catch{return null;}
 const section=document.createElement('section'),title=document.createElement('strong'),chapter=document.createElement('small'),time=document.createElement('p'),link=document.createElement('a');
 section.className='course';
 title.textContent=item.title;
 chapter.textContent=item.chapter;
 time.textContent='上次位置 '+Math.floor(item.seconds/60)+':'+String(Math.floor(item.seconds)%60).padStart(2,'0')+' · '+new Date(item.time).toLocaleDateString();
 link.textContent='返回学习 ↗';link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
 section.append(title,chapter,time,link);
 return section;
}
function renderOverview(data){
 if(!data||!Array.isArray(data.recent)||![data.today,data.recent30].every(item=>item&&Number.isFinite(item.milliseconds)&&item.milliseconds>=0&&Number.isSafeInteger(item.videos)&&item.videos>=0)){
  throw Error('学习记录格式异常，请重新读取');
 }
 const records=document.createDocumentFragment();
 for(const item of data.recent){
  const course=recentCourse(item);
  if(course)records.append(course);
 }
 if(!records.childElementCount){
  const empty=document.createElement('p');
  empty.textContent=data.recent.length?'没有可显示的学习记录，请进入课程并开始连播。':'开始连播后，这里会记录最近学习的位置。';
  records.append(empty);
 }
 el('todayTime').textContent=duration(data.today.milliseconds);
 el('todayVideos').textContent=data.today.videos+' 个视频';
 el('monthTime').textContent=duration(data.recent30.milliseconds);
 el('monthVideos').textContent=data.recent30.videos+' 个视频';
 el('recent').replaceChildren(records);
 expandRecent();
 hasOverview=true;
}
async function overview(){
 if(closed)return;
 const token=++overviewTask;
 reloadOverview.hidden=true;reloadOverview.disabled=true;
 el('status').textContent=hasOverview?'正在更新学习记录…':'正在读取学习记录…';
 let timeout;
 try{
  const response=await Promise.race([
   chrome.runtime.sendMessage({type:'overview'}),
   new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('后台读取超时，请重试')),12000))
  ]);
  if(token!==overviewTask||closed)return;
  if(!response||response.error)throw Error(response?.error||'后台未响应，请重新加载扩展');
  renderOverview(response.result);
  el('status').textContent='';
 }catch(error){
  if(token!==overviewTask||closed)return;
  el('status').textContent=(hasOverview?'更新失败，保留上次读取结果。':'')+error.message;
  if(!hasOverview){el('recent').replaceChildren();expandRecent();}
  reloadOverview.hidden=false;
 }finally{
  clearTimeout(timeout);
  if(token===overviewTask)reloadOverview.disabled=false;
 }
}
function recordsChanged(changes,area){
 const relevant=area==='local'?['activityData','gradeCache','cxGradeCache']:area==='session'?['gradeAccount','cxGradeAccount']:[];
 if(closed||!relevant.some(key=>Object.hasOwn(changes,key)))return;
 overviewTask++;
 clearTimeout(refreshTimer);
 refreshTimer=setTimeout(overview,250);
}
reloadOverview.onclick=()=>{clearTimeout(refreshTimer);overview();};
el('expandRecent').onclick=()=>{recentExpanded=!recentExpanded;expandRecent();};
chrome.storage?.onChanged?.addListener(recordsChanged);
addEventListener('pagehide',()=>{
 closed=true;overviewTask++;clearTimeout(refreshTimer);
 chrome.storage?.onChanged?.removeListener?.(recordsChanged);
});
overview();
