javascript:(()=>{/* ===== Defense Cutter — MVP v2 ===== */

const SEL={
  // Incomings
  incomingRow:'#incomings_table tr.nowrap',
  destCell:'td:nth-child(2)',            // "(513|369) ..."
  arrivalCell:'td:nth-child(6)',         // "today at 21:44:20:" + <span class="grey small">159</span>
  arrivalMs:'.grey.small',               // τα ms
  addBtnHost:'td:last-child',
  // Confirm
  sendBtn:'#troop_confirm_submit'
};

// ---------- helpers ----------
const $=(s,d=document)=>d.querySelector(s);
const $$=(s,d=document)=>Array.from(d.querySelectorAll(s));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bc=new BroadcastChannel('defcutter');

// ---------- clock sync (NTP-like) ----------
const Clock=(()=>{let off=0,jit=0,ew=null;const alpha=.30;
  async function sample(){
    const t0=performance.now();
    const r=await fetch(`/game.php?screen=overview&t=${Math.random()}`,{cache:'no-store'});
    const t1=performance.now();
    const date=r.headers.get('Date'); if(!date) throw 0;
    const srv=Date.parse(date), rtt=t1-t0;
    const clientAtMid=performance.timeOrigin+t1;
    const est=srv+rtt/2;
    return {off:est-clientAtMid, rtt};
  }
  async function calibrate(n=6){
    const xs=[];
    for(let i=0;i<n;i++){try{xs.push(await sample())}catch{} await sleep(60+Math.random()*40)}
    xs.sort((a,b)=>a.rtt-b.rtt);
    const keep=xs.slice(0,Math.max(2,Math.ceil(xs.length*.7)));
    const o=keep.reduce((a,x)=>a+x.off,0)/keep.length;
    const r=keep.reduce((a,x)=>a+x.rtt,0)/keep.length;
    ew=ew==null?o:alpha*o+(1-alpha)*ew; off=ew; jit=r/2; return {off,jit};
  }
  const srvNow=()=>performance.timeOrigin+performance.now()+off;
  return{cal:calibrate, now:srvNow, get off(){return off}, get jit(){return jit}};
})();

// ---------- audio ----------
const Beep=(()=>{let ctx;function ping(d=.06,f=880){try{ctx=ctx||new (AudioContext||webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=f;g.gain.value=.05;o.start();setTimeout(()=>o.stop(),d*1000);}catch{}}return{ping}})();

// ---------- parse helpers ----------
function parseCoords(s){const m=String(s).match(/(\d{3})\|(\d{3})/);return m?{x:+m[1],y:+m[2]}:null;}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function getServerYMD(){
  // TW συνήθως έχει #serverTime / #serverDate. fallback: Clock.now()
  const timeEl=$('#serverTime'), dateEl=$('#serverDate');
  if(timeEl&&dateEl){
    const [H,M,S]=timeEl.textContent.trim().split(':').map(Number);
    const [d,m,y]=dateEl.textContent.trim().split('/').map(Number); // 28/08/2025
    return {y,m,d,H,M,S};
  }
  const t=new Date(Clock.now());
  return {y:t.getFullYear(),m:t.getMonth()+1,d:t.getDate(),H:t.getHours(),M:t.getMinutes(),S:t.getSeconds()};
}
function parseArrival(cell){
  if(!cell) return null;
  const txt=cell.textContent;
  const m=txt.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if(!m) return null;
  const [H,M,S]=m.slice(1).map(Number);
  const msEl=$(SEL.arrivalMs,cell); const ms=msEl?parseInt(msEl.textContent.trim(),10):0;

  // today/tomorrow
  const base=txt.toLowerCase();
  const {y,m,d}=getServerYMD();
  let dt=new Date(y, m-1, d, H, M, S, ms);
  if(/tomorrow/.test(base)) dt=new Date(dt.getTime()+86400000);
  if(/yesterday/.test(base)) dt=new Date(dt.getTime()-86400000);
  return dt.getTime(); // server ms
}

// ---------- speeds (sec/field), βραδύτερη μονάδα ----------
const DEFAULT={spear:18*60,sword:22*60,heavy:11*60,archer:18*60};
function unitSpeeds(){
  try{
    const ws=+window.game_data?.world_speed||1;
    const info=window.TW?.unit_info||{};
    const out={};
    ['spear','sword','axe','archer','spy','light','heavy','ram','catapult','knight','snob']
      .forEach(k=>{const s=info?.[k]?.speed||DEFAULT[k]||18*60; out[k]=s/ws;});
    return out;
  }catch{return DEFAULT;}
}
const SPEEDS=unitSpeeds();
function secPerField(units){const xs=units.map(u=>SPEEDS[u]).filter(Boolean);return xs.length?Math.max(...xs):SPEEDS.spear;}

// ---------- UI ----------
function panel(){
  let el=$('#dc-panel'); if(el) return el;
  el=document.createElement('div'); el.id='dc-panel';
  el.style.cssText='position:fixed;top:0;right:0;width:380px;height:100vh;background:#111;color:#eee;z-index:2147483647;display:flex;flex-direction:column;gap:8px;padding:12px;box-shadow:-6px 0 18px rgba(0,0,0,.5);font:14px system-ui,Arial';
  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-weight:700;font-size:16px">Defense Cutter</div>
      <button id="dc-load" style="margin-left:auto;padding:4px 8px;background:#333;color:#fff;border:1px solid #444;border-radius:6px">Load villages</button>
    </div>
    <div id="dc-info" style="opacity:.9"></div>
    <div>
      <label><input type="checkbox" data-u="spear" checked> spear</label>
      <label><input type="checkbox" data-u="sword" checked> sword</label>
      <label><input type="checkbox" data-u="heavy"> heavy</label>
      <label><input type="checkbox" data-u="archer"> archer</label>
    </div>
    <div>Offset: <span id="dc-offv">0</span> ms</div>
    <input id="dc-off" type="range" min="-500" max="500" step="1" value="0">
    <div id="dc-vill" style="flex:1;overflow:auto;border:1px solid #333;padding:6px;border-radius:8px"></div>
    <div id="dc-prev" style="font-weight:600"></div>
    <button id="dc-open" style="padding:8px;background:#0a84ff;color:#fff;border:0;border-radius:8px">Άνοιγμα Rally/Confirm (lock)</button>
    <div id="dc-jitter" style="opacity:.8"></div>
    <div style="opacity:.7">Calibration/Dry-run: πάτα <b>Numpad +</b></div>
  `;
  document.body.appendChild(el);
  return el;
}

const state={target:null,arrival:null,offset:0,units:['spear','sword'],sendAt:null,chosen:null,villages:[],unitsOrder:[]};

function mountCutButtons(){
  $$(SEL.incomingRow).forEach(row=>{
    if(row.querySelector('.dc-btn')) return;
    const host=row.querySelector(SEL.addBtnHost)||row.lastElementChild||row;
    const b=document.createElement('button'); b.className='dc-btn'; b.textContent='Κόψ’το';
    b.style.cssText='padding:4px 8px;background:#222;color:#0f0;border:1px solid #444;border-radius:6px;cursor:pointer';
    b.onclick=()=>pickRow(row);
    host.appendChild(b);
  });
}

async function pickRow(row){
  panel();
  const destTxt=row.querySelector(SEL.destCell)?.textContent||'';
  const target=parseCoords(destTxt);
  const arrTs=parseArrival(row.querySelector(SEL.arrivalCell));
  state.target=target; state.arrival=arrTs;

  $('#dc-info').textContent= target&&arrTs
    ? `Προς ${target.x}|${target.y} — Άφιξη: ${new Date(arrTs).toLocaleTimeString()}.${String(arrTs%1000).padStart(3,'0')}`
    : 'Δεν βρέθηκαν στόχος/ώρα';

  $('#dc-off').oninput=e=>{state.offset=+e.target.value; $('#dc-offv').textContent=state.offset; renderVillages(); renderPreview();}
  $$('#dc-panel input[data-u]').forEach(c=>c.onchange=()=>{
    state.units=$$('#dc-panel input[data-u]:checked').map(x=>x.dataset.u); renderVillages(); renderPreview();
  });
  $('#dc-open').onclick=openChildFlow;

  const {jit}=await Clock.cal(6);
  $('#dc-jitter').textContent=`Clock jitter ≈ ±${Math.round(jit)} ms`;

  renderVillages(); renderPreview();
}

// ---------- villages loader (scrape units overview) ----------
async function fetchHTML(url){
  const res=await fetch(url,{credentials:'same-origin'}); const tx=await res.text();
  const doc=new DOMParser().parseFromString(tx,'text/html'); return doc;
}
// χαρτογράφηση της σειράς μονάδων με βάση game_data.units
function getUnitsOrder(){
  const u=(window.game_data?.units)||['spear','sword','axe','archer','spy','light','heavy','ram','catapult','knight','snob'];
  return u;
}
// parse ενός page
function parseUnitsPage(doc){
  const tb=doc.querySelector('table.vis.overview_table'); if(!tb) return [];
  const order=getUnitsOrder(); // σειρά στη γραμμή "in village"
  const groups=Array.from(tb.querySelectorAll('tbody.row_marker'));
  const out=[];
  groups.forEach(g=>{
    // link με coords
    const a=g.querySelector('a[href*="screen=overview"][href*="village="]')||g.querySelector('a[href*="village="]');
    const coords=parseCoords(a?.textContent||'');
    // Action: Troops -> παίρνω village id/URL προς place
    const troopsLink=g.querySelector('a[href*="screen=place"]');
    const href=troopsLink?.getAttribute('href')||'';
    const vid=(href.match(/village=(\d+)/)||[])[1];
    // "in village" row: συνήθως 2ο tr
    let tr=Array.from(g.querySelectorAll('tr')).find(tr=>/in village/i.test(tr.textContent))||g.querySelector('tr:nth-of-type(2)');
    const cells=tr?Array.from(tr.querySelectorAll('td.unit-item')):[];
    const countsByUnit={};
    // Αν δεν υπάρχουν όλα, γεμίζω 0
    order.forEach((u,i)=>{ const td=cells[i]; const v=td?parseInt(td.textContent.trim(),10)||0:0; countsByUnit[u]=v;});
    out.push({coords,vid,hrefToPlace:href,counts:{spear:countsByUnit.spear||0,sword:countsByUnit.sword||0,heavy:countsByUnit.heavy||0}});
  });
  return out.filter(v=>v.coords&&v.vid);
}

async function loadVillages(){
  const base=`/game.php?screen=overview_villages&mode=units&type=there`;
  const doc=await fetchHTML(base);
  // Προσπαθώ να βρω σελιδοποίηση
  const pager=doc.querySelector('#paged_view_content')||doc;
  const pageLinks=Array.from(pager.querySelectorAll('a[href*="screen=overview_villages"][href*="mode=units"]')).map(a=>new URL(a.href,location.origin).href);
  const unique=[...new Set([new URL(base,location.origin).href, ...pageLinks])].slice(0,20); // ασφάλεια
  let all=[];
  for (let i=0;i<unique.length;i++){
    try{ const d=(i===0)?doc:await fetchHTML(unique[i]); all=all.concat(parseUnitsPage(d)); }catch{}
    await sleep(40);
  }
  // cache σε sessionStorage
  sessionStorage.setItem('dc_villages',JSON.stringify(all));
  state.villages=all;
  renderVillages();
}

$('#dc-load')?.addEventListener('click', e=>{e.preventDefault(); loadVillages().catch(()=>alert('Load villages: πρόβλημα φόρτωσης.'));});

// αρχική ανάγνωση cache
try{ const cached=sessionStorage.getItem('dc_villages'); if(cached) state.villages=JSON.parse(cached);}catch{}

// ---------- render villages (όσα προλαβαίνουν) ----------
function renderVillages(){
  const box=$('#dc-vill'); if(!box) return;
  box.innerHTML='';
  if(!state.target||!state.arrival){ box.innerHTML='<div style="opacity:.7">Διάλεξε επίθεση για να δούμε χωριά.</div>'; return; }
  const spf=secPerField(state.units); // sec/field της βραδύτερης
  // φτιάχνω λίστα με ταξίδι & sendAt
  const rows=state.villages.map(v=>{
    const d=dist(v.coords,state.target);
    const tsec=d*spf;
    const sendAt=state.arrival - tsec*1000 + state.offset;
    const can=Clock.now() <= sendAt; // προλαβαίνει
    return {...v,d,tsec,sendAt,can};
  }).filter(x=>x.can).sort((a,b)=>a.tsec-b.tsec); // κοντινότερα πρώτα

  if(!rows.length){ box.innerHTML='<div style="opacity:.7">Κανένα χωριό δεν προλαβαίνει με τις τωρινές επιλογές.</div>'; return; }

  rows.forEach(r=>{
    const div=document.createElement('div');
    div.style.cssText='display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px;border-bottom:1px solid #333;cursor:pointer';
    div.innerHTML=`
      <div>
        <div><b>${r.coords.x}|${r.coords.y}</b> · travel ${Math.round(r.tsec)}s</div>
        <div style="opacity:.8">spear ${r.counts.spear} · sword ${r.counts.sword} · heavy ${r.counts.heavy}</div>
      </div>
      <div style="text-align:right">
        <div style="font-feature-settings:'tnum' 1">${new Date(r.sendAt).toLocaleTimeString()}.${String(r.sendAt%1000).padStart(3,'0')}</div>
        <div style="opacity:.7">Send at</div>
      </div>
    `;
    div.onclick=()=>{ state.chosen=r; renderPreview(); };
    box.appendChild(div);
  });
}

function renderPreview(){
  const p=$('#dc-prev'); if(!p) return;
  if(!state.arrival){ p.textContent='—'; return; }
  const sa=state.chosen?state.chosen.sendAt:(state.arrival+state.offset);
  p.textContent=`Target: ${new Date(state.arrival).toLocaleTimeString()}.${String(state.arrival%1000).padStart(3,'0')} | Send at: ${new Date(sa).toLocaleTimeString()}.${String(sa%1000).padStart(3,'0')}`;
}

// ---------- child tab + lock across redirects ----------
let child=null;
async function openChildFlow(){
  if(!state.arrival){ alert('Διάλεξε επίθεση πρώτα.'); return; }
  Beep.ping(.05,700);
  await Clock.cal(4);
  const sendAt = state.chosen? state.chosen.sendAt : (state.arrival + state.offset);
  state.sendAt=sendAt;
  sessionStorage.setItem('defcutter_sendAt',String(sendAt));
  bc.postMessage({kind:'schedule',sendAt});

  const url = state.chosen?.hrefToPlace || '/game.php?screen=place';
  child=window.open(url,'_blank','noopener'); if(!child){ alert('Pop-up blocked—επέτρεψέ το.'); return; }
  watchChild(sendAt);
}

function watchChild(targetMs){
  const reinject=()=>{
    try{
      if(!child||child.closed) return;
      const d=child.document; if(!d||d.readyState!=='complete') return;
      const s=d.createElement('script');
      s.textContent=`(function(){
        if(window.__dc_lock)return; window.__dc_lock=true;
        const sendSel='${SEL.sendBtn}'; const target=${JSON.stringify(targetMs)};
        const off=${Clock.off};
        const srvNow=()=>performance.timeOrigin+performance.now()+off;
        function toClient(){return target-(performance.timeOrigin+performance.now()+off);}
        function label(m){let el=document.getElementById('dc-lock-label'); if(!el){el=document.createElement('div');el.id='dc-lock-label';el.style.cssText='position:fixed;bottom:12px;right:12px;background:#000;color:#fff;padding:6px 10px;border-radius:8px;z-index:2147483647';document.body.appendChild(el);} el.textContent=m;}
        function beep(){try{const c=new (AudioContext||webkitAudioContext)();const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=1200;g.gain.value=.05;o.start();setTimeout(()=>o.stop(),60);}catch{}}
        function lock(){
          const btn=document.querySelector(sendSel);
          if(!btn){ label('Βρες το Send/Support και ξαναφόρτωσε.'); return; }
          btn.disabled=true; btn.setAttribute('disabled','disabled'); btn.style.outline='3px solid #f00'; label('Locked…');
          setTimeout(()=>beep(), Math.max(0,toClient()-1000));
          setTimeout(()=>beep(), Math.max(0,toClient()-300));
          setTimeout(()=>beep(), Math.max(0,toClient()-100));
          const wait=Math.max(0,toClient()-120);
          setTimeout(async()=>{
            window.focus(); btn.focus();
            const spinUntil=target-8;
            function raf(){ if(srvNow()>=spinUntil) return Promise.resolve(); return new Promise(r=>requestAnimationFrame(r)).then(raf); }
            await raf();
            while(srvNow()<target){}
            btn.disabled=false; btn.removeAttribute('disabled'); btn.style.outline='3px solid #0f0'; label('UNLOCK'); beep();
          }, wait);
        }
        window.addEventListener('pageshow', lock, {once:true});
        lock();
      })();`;
      d.documentElement.appendChild(s);
    }catch{}
  };
  const iv=setInterval(()=>{
    if(!child||child.closed){ clearInterval(iv); return; }
    try{ if(child.document && child.document.readyState==='complete') reinject(); }catch{}
  },120);
}

// ---------- dry-run (Numpad +) ----------
window.addEventListener('keydown',async e=>{
  if(e.code==='NumpadAdd'){ e.preventDefault(); panel(); $('#dc-prev').textContent='Calibration…'; await Clock.cal(6);
    const tgt=Clock.now()+2500; $('#dc-prev').textContent='Dry-run σε 2.5s';
    setTimeout(()=>Beep.ping(),1500); setTimeout(()=>Beep.ping(),2200);
    let b=$('#dc-dummy'); if(!b){ b=document.createElement('button'); b.id='dc-dummy'; b.textContent='DUMMY (locked)'; b.style.cssText='position:fixed;bottom:12px;left:12px;padding:6px 10px;background:#333;color:#fff;border:0;border-radius:8px;z-index:2147483647'; document.body.appendChild(b);}
    b.disabled=true;
    const srv=()=>Clock.now(); const spin=tgt-8;
    (async()=>{ while(srv()<spin){ await new Promise(r=>requestAnimationFrame(r)); } while(srv()<tgt){} b.disabled=false; b.textContent='DUMMY (UNLOCK)'; Beep.ping(.06,1200); })();
  }
},{passive:false});

// ---------- boot ----------
(async function(){
  panel(); try{await Clock.cal(6);}catch{}
  mountCutButtons();
  // auto-wire Load villages button (αν το panel φτιάχτηκε πριν)
  $('#dc-load')?.addEventListener('click', e=>{e.preventDefault(); loadVillages().catch(()=>alert('Load villages: πρόβλημα.'));});
})();
/* ===== /Defense Cutter ===== */})();
