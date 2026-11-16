// POLYMAS 智能体课程：只读取页面标记，不读取令牌、Cookie 或框架私有状态。
(() => {
 const HOST='hike-teaching-center.polymas.com',PLAYER='polymas.com';
 const base=/^\/custom-stu-hike\/agent-course-full\/([A-Za-z0-9_-]{1,100})/;
 function course(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!==HOST||u.port||u.username||u.password)return null;const m=u.pathname.match(base);return m&&/^\/(?:stu\/(?:study|course-home|task)|[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/stu\/study\/resource-detail)\/?$/.test(u.pathname.slice(m[0].length))?{id:m[1],url:u.origin+m[0]+'/stu/study?activeTab=resource',resource:u.pathname.slice(m[0].length).match(/^\/[^/]+\/([^/]+)\/[^/]+\/stu\/study\/resource-detail\/?$/)?.[1]||null}:null;}catch{return null;}}
 function player(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!==PLAYER||u.port||u.username||u.password||u.pathname!=='/resource/online/preview/')return null;for(const k of ['courseId','fileId'])if(u.searchParams.getAll(k).length!==1||!/^[A-Za-z0-9_-]{1,100}$/.test(u.searchParams.get(k)||''))return null;return {course:u.searchParams.get('courseId'),file:u.searchParams.get('fileId')};}catch{return null;}}
 const text=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
 function entries(doc=document){return [...doc.querySelectorAll('[role=treeitem][data-key]')].filter(e=>!e.querySelector('[role=treeitem]')).map(e=>{
  const name=e.querySelector('.file-name'),id=e.getAttribute('data-key'),title=text(name),rate=text(e.querySelector('.node-action-rate-text'));
  const progress=/^(?:100|\d{1,2})(?:\.\d+)?%$/.test(rate)?Number(rate.slice(0,-1)):null;
  return {id,title,video:/\.(?:mp4|webm|m4v|mov)$/i.test(title),element:name,progress,done:progress===100||!!e.querySelector('.node-actions .agent-course-form-item-checkbox.success'),required:text(e.querySelector('.file-tag'))==='必学'};
 }).filter(e=>/^[A-Za-z0-9_-]{1,100}$/.test(e.id||'')&&e.title&&e.element);}
 function title(doc=document){return text(doc.querySelector('.drawer-title .line1'))||text(doc.querySelector('.course-title .line1'));}
 globalThis.PolymasParser={HOST,PLAYER,course,player,entries,title};
})();
