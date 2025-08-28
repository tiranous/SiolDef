javascript:(()=>{/* ===== Defense Cutter — v3.2 (auto-load + loader fallbacks) ===== */
const SEL={incomingRow:'#incomings_table tr.nowrap',destCell:'td:nth-child(2)',arrivalCell:'td:nth-child(6)',arrivalMs:'.grey.small',arrivesInCell:'td:nth-child(7)',addBtnHost:'td:last-child',sendBtn:'#troop_confirm_submit'};
const $=(s,d=document)=>d.querySelector(s),$$=(s,d=document)=>Array.from(d.querySelectorAll(s));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fmtClock=ts=>{const d=new Date(ts),p=n=>String(n).padStart(2,'0');return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3,'0')}`};
const fmtDur=s=>{s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60,p=n=>String(n).padStart(2,'0');return h?`${h}:${p(m)}:${p(ss)}`:`${m}:${p(ss)}`};
const cOf=t=>{const m=String(t).match(/(\d{3})\|(\d{3})/);return m?{x:+m[1],y:+m[2]}:null}, same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y, dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

/* clock */
const Clock=(()=>{let off=0,jit=0,ew=null;const alpha=.3;
  async function sample(){const t0=performance.now();const r=await fetch(`/game.php?screen=overview&t=${Math.random()}`,{cache:'no-store'});const t1=performance.now();const date=r.headers.get('Date');if(!date)throw 0;const srv=Date.parse(date),rtt=t1-t0,est=srv+rtt/2;return{off:est-(performance.timeOrigin+t1),rtt}}
  async function cal(n=6){const xs=[];for(let i=0;i<n;i++){try{xs.push(await sample())}catch{}await sleep(60+Math.random()*40)}xs.sort((a,b)=>a.rtt-b.rtt);const keep=xs.slice(0,Math.max(2,Math.ceil(xs.length*.7)));const o=keep.reduce((a,x)=>a+x.off,0)/keep.length;const r=keep.reduce((a,x)=>a+x.rtt,0)/keep.length;ew=ew==null?o:alpha*o+(1-alpha)*ew;off=ew;jit=r/2;return{off,jit}}const now=()=>performance.timeOrigin+performance.now()+off;return{cal,now,get off(){return off},get jit(){return jit}}})();

/* arrival */
const serverSec=()=>{const t=$('#serverTime');if(t){const a=t.textContent.trim().split(':').map(Number);if(a.length===3)return a[0]*3600+a[1]*60+a[2]}const d=new Date(Clock.now());return d.getHours()*3600+d.getMinutes()*60+d.getSeconds()};
function parseArrivalRel(cell){
  if(!cell) return null;
  const txt=cell.textContent||''; const m=txt.match(/(\d{1,2}):(\d{2}):(\d{2})/); if(!m) return null;
  let [HH,MM,SS]=m.slice(1).map(Number),ms=0; const msEl=cell.querySelector(SEL.arrivalMs);
  if(msEl) ms=parseInt(msEl.textContent.trim(),10)||0; else { const m2=txt.match(/:(\d{1,3})(?!\d)/); if(m2) ms=parseInt(m2[1],10)||0; }
  const targetSec=HH*3600+MM*60+SS+ms/1000; const nowSec=serverSec();
  const low=txt.toLowerCase(); let delta=targetSec-nowSec;
  if(low.includes('tomorrow')) delta=(86400-nowSec)+targetSec;
  else if(low.includes('yesterday')) delta=-(nowSec+(86400-targetSec));
  else if(delta<-43200) delta+=86400; // πέρασμα μεσονυχτίου
  return Clock.now()+delta*1000;
}
function parseArrivesIn(cell){ if(!cell) return null; const t=cell.textContent||''; const m=t.match(/(\d+):(\d{2}):(\d{2})/); if(!m) return null; return Clock.now()+((+m[1]*3600+ +m[2]*60+ +m[3])*1000); }

/* speeds (χωρίς ram) */
const DEFAULT_SEC={spear:18*60,sword:22*60,heavy:11*60,archer:18*60,catapult:30*60,knight:10*60,snob:35*60};
function speedsSec(){const ws=+window.game_data?.world_speed||1,us=+window.game_data?.unit_speed||1,info=window.TW?.unit_info||{},keys=['spear','sword','axe','archer','spy','light','heavy','catapult','knight','snob'],out={};keys.forEach(k=>{let v=info?.[k]?.speed;if(v==null)v=DEFAULT_SEC[k]||18*60;else{v=+v;if(!Number.isFinite(v))v=DEFAULT_SEC[k]||18*60;else if(v<120)v*=60}out[k]=v/(ws*us)});return out}
const SPEEDS=speedsSec(), spfOf=units=>{const xs=units.map(u=>SPEEDS[u]).filter(Boolean);return xs.length?Math.max(...xs):SPEEDS.spear};

/* UI */
function panel(){let el=$('#dc-panel'); if(el) return el;
  el=document.createElement('div'); el.id='dc-panel';
  el.style.cssText='position:fixed;top:8px;right:8px;width:360px;max-height:95vh;background:#111;color:#eee;z-index:2147483647;display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid #2a2a2a;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.55);font:13px system-ui,Arial';
  el.innerHTML=`<div id="dc-head" style="display:flex;gap:8px;align-items:center;cursor:move"><div style="font-weight:700;font-size:14px">Defense Cutter</div><button id="dc-load" type="button" style="margin-left:auto;padding:3px 8px;background:#333;color:#fff;border:1px solid #444;border-radius:6px">Load villages</button></div><div id="dc-info" style="opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div><div id="dc-units" style="display:flex;flex-wrap:wrap;gap:6px"></div><div style="display:flex;align-items:center;gap:6px"><span>Offset:</span><span id="dc-offv">0</span><span>ms</span></div><input id="dc-off" type="range" min="-500" max="500" step="1" value="0" style="accent-color:#0a84ff"><div id="dc-vill" style="flex:1;overflow:auto;border:1px solid #222;padding:6px;border-radius:8px"></div><div id="dc-prev" style="font-weight:600"></div><div id="dc-dbg" style="opacity:.65"></div><button id="dc-open" type="button" style="padding:8px;background:#0a84ff;color:#fff;border:0;border-radius:8px">Άνοιγμα Rally/Confirm (lock)</button><div id="dc-jitter" style="opacity:.7"></div>`;
  document.body.appendChild(el);
  // units (χωρίς ram)
  const units=[['spear'],['sword'],['heavy'],['archer'],['catapult'],['knight'],['snob']];
  const wrap=$('#dc-units'), iconURL=u=>`/graphic/unit/unit_${u}.png`;
  units.forEach(([u])=>{const id=`dc-u-${u}`;const lbl=document.createElement('label');lbl.htmlFor=id;lbl.style.cssText='display:flex;align-items:center;gap:6px;background:#191919;border:1px solid #2a2a2a;border-radius:8px;padding:4px 6px;cursor:pointer';lbl.innerHTML=`<input id="${id}" data-u="${u}" type="checkbox" ${(['spear','sword','heavy'].includes(u))?'checked':''} style="margin:0"><span style="width:16px;height:16px;background:url('${iconURL(u)}') 0/16px 16px no-repeat;filter:grayscale(.1)"></span><span style="opacity:.9">${u}</span>`;wrap.appendChild(lbl)});
  $('#dc-off').addEventListener('input',e=>{state.offset=+e.target.value;$('#dc-offv').textContent=state.offset;renderVillages();renderPreview()},{passive:true});
  $$('#dc-units input[type=checkbox]').forEach(c=>c.addEventListener('change',()=>{state.units=$$('#dc-units input[type=checkbox]:checked').map(x=>x.dataset.u);renderVillages();renderPreview()}));
  attachLoadBtn(); makeDraggable(el,$('#dc-head')); return el;
}
function makeDraggable(box,handle){let sx=0,sy=0,ox=0,oy=0,drag=false;handle.addEventListener('mousedown',e=>{drag=true;const r=box.getBoundingClientRect();ox=r.left;oy=r.top;sx=e.clientX;sy=e.clientY;e.preventDefault()});window.addEventListener('mousemove',e=>{if(!drag)return;const nx=ox+(e.clientX-sx),ny=oy+(e.clientY-sy);box.style.left=`${Math.min(innerWidth-80,Math.max(0,nx))}px`;box.style.top=`${Math.min(innerHeight-60,Math.max(0,ny))}px`;box.style.right='auto'});window.addEventListener('mouseup',()=>drag=false)}

const state={target:null,arrival:null,offset:0,units:['spear','sword','heavy'],chosen:null,villages:[]};

/* buttons */
function mountCutButtons(){$$(SEL.incomingRow).forEach(row=>{if(row.querySelector('.dc-btn'))return;const host=row.querySelector(SEL.addBtnHost)||row.lastElementChild||row;const b=document.createElement('button');b.type='button';b.className='dc-btn';b.textContent='Κόψ’το';b.style.cssText='padding:3px 8px;background:#222;color:#0f0;border:1px solid #444;border-radius:6px;cursor:pointer';b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();pickRow(row)});host.appendChild(b)})}

/* pick row (+AUTO-LOAD villages if empty) */
async function pickRow(row){
  panel();
  const dest=row.querySelector(SEL.destCell)?.textContent||'';
  state.target=cOf(dest);
  state.arrival=parseArrivalRel(row.querySelector(SEL.arrivalCell)) ?? parseArrivesIn(row.querySelector(SEL.arrivesInCell));
  $('#dc-info').textContent=(state.target&&state.arrival)?`Προς ${state.target.x}|${state.target.y} — Άφιξη: ${fmtClock(state.arrival)}`:'Δεν βρέθηκαν στόχος/ώρα';
  $('#dc-open').onclick=openChildFlow;
  const {jit}=await Clock.cal(6); $('#dc-jitter').textContent=`Clock jitter ≈ ±${Math.round(jit)} ms`;
  // AUTO-LOAD αν δεν έχουμε χωριά
  if(!state.villages.length){ $('#dc-dbg').textContent='Φόρτωση χωριών…'; await ensureVillagesLoaded(); }
  renderVillages(); renderPreview();
}

/* loader with fallbacks */
async function fetchHTML(url){const r=await fetch(url,{credentials:'same-origin'});return new DOMParser().parseFromString(await r.text(),'text/html')}
function unitOrder(){return window.game_data?.units||['spear','sword','axe','archer','spy','light','heavy','catapult','knight','snob']}
function parseUnitsPage(doc){
  const tb=doc.querySelector('table.vis.overview_table'); if(!tb) return [];
  const order=unitOrder(); const out=[];
  for(const g of tb.querySelectorAll('tbody.row_marker')){
    const a=g.querySelector('a[href*="screen=overview"][href*="village="]')||g.querySelector('a[href*="village="]');
    const coords=cOf(a?.textContent||''); const link=g.querySelector('a[href*="screen=place"]'); const href=link?.getAttribute('href')||''; const vid=(href.match(/village=(\d+)/)||[])[1];
    const trs=[...g.querySelectorAll('tr')]; const trAvail=trs.find(t=>/in village/i.test(t.textContent))||g.querySelector('tr:nth-of-type(2)');
    const cells=trAvail?[...trAvail.querySelectorAll('td.unit-item')]:[]; const counts={}; order.forEach((u,i)=>{const td=cells[i];counts[u]=td?parseInt(td.textContent.trim(),10)||0:0});
    if(coords&&vid) out.push({vid,coords,hrefToPlace:href,counts:{spear:counts.spear||0,sword:counts.sword||0,heavy:counts.heavy||0}});
  }
  return out;
}
async function loadVillagesOnce(url){
  try{const doc=await fetchHTML(url);const list=parseUnitsPage(doc);return list}catch{return []}
}
async function ensureVillagesLoaded(){
  // κύριο URL
  let all=await loadVillagesOnce(`/game.php?screen=overview_villages&mode=units&type=there`);
  // fallback αν δεν βρέθηκαν
  if(!all.length){ all=await loadVillagesOnce(`/game.php?screen=overview_villages&mode=units`); }
  // paged links (αν υπάρχουν)
  if(all.length){
    try{
      const pagerDoc=await fetchHTML(`/game.php?screen=overview_villages&mode=units&type=there`);
      const pager=pagerDoc.querySelector('#paged_view_content')||pagerDoc;
      const links=[...new Set([...pager.querySelectorAll('a[href*="screen=overview_villages"][href*="mode=units"]')].map(a=>new URL(a.href,location.origin).href))].slice(0,30);
      for(const href of links){ const more=await loadVillagesOnce(href); all=all.concat(more); await sleep(40); }
    }catch{}
  }
  // dedupe
  const byId=new Map(); all.forEach(v=>{if(!byId.has(v.vid))byId.set(v.vid,v)});
  const byCoord=new Map(); [...byId.values()].forEach(v=>{const k=`${v.coords.x}|${v.coords.y}`; if(!byCoord.has(k)) byCoord.set(k,v);});
  state.villages=[...byCoord.values()];
  try{sessionStorage.setItem('dc_villages',JSON.stringify(state.villages))}catch{}
}
function attachLoadBtn(){const btn=$('#dc-load'); if(!btn||btn.__dc_bound) return; btn.__dc_bound=true; btn.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation(); $('#dc-dbg').textContent='Φόρτωση χωριών…'; await ensureVillagesLoaded(); renderVillages(); });}
try{const c=sessionStorage.getItem('dc_villages'); if(c) state.villages=JSON.parse(c);}catch{}

/* render */
const hasAny=(v,units)=>units.some(u=>(v.counts[u]||0)>0);
function renderVillages(){
  const box=$('#dc-vill'); if(!box) return; box.innerHTML='';
  if(!state.target||!state.arrival){ box.innerHTML='<div style="opacity:.7">Διάλεξε επίθεση για να δούμε χωριά.</div>'; return; }
  if(!state.villages.length){ box.innerHTML='<div style="opacity:.8">Δεν έχουν φορτωθεί χωριά. Πάτα <b>Load villages</b>.</div>'; $('#dc-dbg').textContent='—'; return; }

  const secPerField=spfOf(state.units), now=Clock.now(), seen=new Set();
  const rows=state.villages
    .filter(v=>!same(v.coords,state.target))
    .filter(v=>hasAny(v,state.units))
    .map(v=>{const key=v.vid||`${v.coords.x}|${v.coords.y}`;return {...v,key}})
    .filter(v=>{if(seen.has(v.key))return false; seen.add(v.key); return true;})
    .map(v=>{const fields=dist(v.coords,state.target);const tsec=fields*secPerField;const sendAt=state.arrival - tsec*1000 + state.offset;return {...v,fields,tsec,sendAt,can: now<=sendAt}})
    .filter(x=>x.can)
    .sort((a,b)=>a.tsec-b.tsec);

  const tta=Math.max(0,Math.round((state.arrival-now)/1000));
  const minT=Math.min(...state.villages.map(v=>same(v.coords,state.target)?Infinity:dist(v.coords,state.target)*secPerField));
  $('#dc-dbg').textContent=`time-to-arrival ≈ ${fmtDur(tta)} | min-travel ≈ ${Number.isFinite(minT)?fmtDur(minT):'—'}`;

  if(!rows.length){ box.innerHTML='<div style="opacity:.75">Κανένα χωριό δεν προλαβαίνει με τις τωρινές επιλογές.</div>'; return; }

  rows.forEach(r=>{
    const isSel=state.chosen && r.key===state.chosen.key;
    const div=document.createElement('div');
    div.style.cssText=`display:flex;gap:10px;align-items:center;justify-content:space-between;padding:6px 8px;border-bottom:1px solid #222;cursor:pointer;border-radius:6px;${isSel?'background:#18222f;border:1px solid #27425f':''}`;
    div.innerHTML=`<div><div style="font-weight:600">${r.coords.x}|${r.coords.y}</div><div style="opacity:.85">travel ${fmtDur(r.tsec)}</div><div style="opacity:.75">spear ${r.counts.spear} · sword ${r.counts.sword} · heavy ${r.counts.heavy}</div></div><div style="text-align:right"><div style="font-feature-settings:'tnum' 1">${fmtClock(r.sendAt)}</div><div style="opacity:.65">Send at</div></div>`;
    div.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();state.chosen=r;renderVillages();renderPreview();});
    box.appendChild(div);
  });
}
function renderPreview(){const p=$('#dc-prev'); if(!p) return; if(!state.arrival){p.textContent='—';return} const sa=state.chosen?state.chosen.sendAt:(state.arrival+state.offset); p.textContent=`Target: ${fmtClock(state.arrival)} | Send at: ${fmtClock(sa)}${state.chosen?` | From: ${state.chosen.coords.x}|${state.chosen.coords.y}`:''}`}

/* RP + lock */
let child=null;
async function openChildFlow(){ if(!state.arrival){alert('Διάλεξε επίθεση πρώτα.');return}
  await Clock.cal(4);
  const sendAt=(state.chosen?state.chosen.sendAt:(state.arrival+state.offset));
  sessionStorage.setItem('defcutter_sendAt',String(sendAt));
  sessionStorage.setItem('defcutter_target',JSON.stringify(state.target));
  const vid=state.chosen?.vid; let url=`/game.php?screen=place&mode=command`; if(vid) url=`/game.php?village=${vid}&screen=place&mode=command`;
  child=window.open(url,'dc_lock'); try{child.opener=null;}catch{} if(!child){alert('Δεν μπόρεσα να ανοίξω tab (έλεγξε τα pop-ups).');return}
  watchChild(sendAt,state.target);
}
function watchChild(targetMs,targetCoords){
  const reinject=()=>{try{ if(!child||child.closed)return; const d=child.document; if(!d||d.readyState!=='complete')return;
    const s=d.createElement('script'); s.textContent=`(function(){
      if(window.__dc_lock)return; window.__dc_lock=true;
      const sendSel='${SEL.sendBtn}', target=${JSON.stringify(targetMs)}, offsetInj=${Clock.off}, coords=${JSON.stringify(targetCoords)};
      const srvNow=()=>performance.timeOrigin+performance.now()+offsetInj; const toClient=()=>target-(performance.timeOrigin+performance.now()+offsetInj);
      function label(m){let el=document.getElementById('dc-lock-label'); if(!el){el=document.createElement('div');el.id='dc-lock-label';el.style.cssText='position:fixed;bottom:12px;right:12px;background:#000;color:#fff;padding:6px 10px;border-radius:8px;z-index:2147483647';document.body.appendChild(el)} el.textContent=m}
      const url=new URL(location.href); const isConfirm = url.searchParams.get('try')==='confirm' || document.querySelector('${SEL.sendBtn}');
      const isPlace = url.searchParams.get('screen')==='place';
      if(isPlace && !isConfirm){
        if(url.searchParams.get('mode')!=='command'){ url.searchParams.set('mode','command'); location.replace(url.href); return; }
        (function autofill(){ if(!coords)return; const as=coords.x+'|'+coords.y; let t=0; const iv=setInterval(()=>{t++; let ok=false;
          const ix=document.querySelector('#inputx, input[name=x]'), iy=document.querySelector('#inputy, input[name=y]');
          if(ix&&iy){ix.value=coords.x;iy.value=coords.y;ix.dispatchEvent(new Event('input',{bubbles:true}));iy.dispatchEvent(new Event('input',{bubbles:true})); ok=true;}
          const single=document.querySelector('input[name=target], input#target, input[name=input]');
          if(single){single.value=as;single.dispatchEvent(new Event('input',{bubbles:true})); ok=true;}
          const radio=[...document.querySelectorAll('input[type=radio]')].find(r=>/coord|coordinate/i.test(r.value||'')||/coord/i.test(r.id||'')); if(radio){radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}))}
          if(ok||t>40)clearInterval(iv);
        },50)})();
      }
      function tryLock(){ const btn=document.querySelector(sendSel); if(!btn){label('…περιμένω confirm');return false}
        btn.disabled=true;btn.setAttribute('disabled','disabled');btn.style.outline='3px solid #f00';label('Locked…');
        const wait=Math.max(0,toClient()-120);
        setTimeout(async()=>{window.focus();btn.focus();const spin=target-8;function raf(){if(srvNow()>=spin)return Promise.resolve();return new Promise(r=>requestAnimationFrame(r)).then(raf)}await raf();while(srvNow()<target){}btn.disabled=false;btn.removeAttribute('disabled');btn.style.outline='3px solid #0f0';label('UNLOCK')},wait);
        return true;
      }
      if(isConfirm){ tryLock(); } else { const obs=new MutationObserver(()=>{ if(document.querySelector('${SEL.sendBtn}')){tryLock();obs.disconnect()} }); obs.observe(document.documentElement,{childList:true,subtree:true}); window.addEventListener('pageshow',()=>{ if(document.querySelector('${SEL.sendBtn}')) tryLock(); },{once:true}); }
    })();`; d.documentElement.appendChild(s);
  }catch{}};
  const iv=setInterval(()=>{ if(!child||child.closed){clearInterval(iv);return} try{ if(child.document&&child.document.readyState==='complete') reinject()}catch{} },150);
}

/* boot */
(async function(){ panel(); try{await Clock.cal(6)}catch{} mountCutButtons(); try{const c=sessionStorage.getItem('dc_villages'); if(!c){ /* lazy auto-load on first boot? όχι, μόνο όταν κάνεις Κόψ’το */ } }catch{} })();
})(); 
