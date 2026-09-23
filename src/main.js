import "./styles.css";
import * as XLSX from "xlsx";
import { G, DEF } from "./config.js";
import { fmt } from "./format.js";
import { YR, run, monte, outcomeMultiples, FAIL_RAMP_YEARS } from "./engine.js";

// Bump whenever the input schema changes shape or meaning, so a stale save from an
// older version of the model isn't silently merged onto new defaults.
// Bumped from 4: the follow-on step-up is no longer one shared `foVal` -- each outcome
// bucket now carries its own `foPct` (follow-on valuation as a % of that bucket's own exit
// value). A saved outcomes array from before would have no `foPct` on any row, which
// foMult() reads as 0 (no follow-on return at all) -- silently zeroing out follow-on capital
// instead of erroring, so this has to force a reset rather than merge quietly.
const SCHEMA_VERSION = 5;

// DEF.outcomes is an array of objects -- a plain Object.assign would copy the reference,
// not the contents, so editing a row in S would silently mutate the shared default too.
const cloneDef=()=>({...DEF, outcomes: DEF.outcomes.map(o=>({...o}))});
let S = cloneDef();

/* ---------------- controls ---------------- */
const $=id=>document.getElementById(id);

/* ---------------- theme ---------------- */
const THEME_KEY="keel-sim-theme";
function applyTheme(t){
  document.documentElement.setAttribute("data-theme",t);
  const btn=$("themebtn"); if(btn) btn.textContent=t==="dark"?"☀️ Day":"🌙 Night";
  try{localStorage.setItem(THEME_KEY,t)}catch(e){}
}
applyTheme(document.documentElement.getAttribute("data-theme")==="dark"?"dark":"light");
$("themebtn").addEventListener("click",()=>{
  applyTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark");
});

/* ---------------- sidebar resize ---------------- */
const RAIL_KEY="keel-sim-rail-w", RAIL_MIN=260, RAIL_MAX=560;
(function initRailResize(){
  const handle=$("railResize"), app=$("app");
  if(!handle||!app) return;
  const setW=w=>{
    w=Math.max(RAIL_MIN,Math.min(RAIL_MAX,w));
    app.style.setProperty("--rail-w",w+"px");
    return w;
  };
  try{const saved=parseFloat(localStorage.getItem(RAIL_KEY));if(!isNaN(saved))setW(saved)}catch(e){}
  let dragging=false;
  handle.addEventListener("pointerdown",e=>{
    dragging=true; handle.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
    document.body.style.userSelect="none";
  });
  handle.addEventListener("pointermove",e=>{
    if(!dragging) return;
    const w=setW(e.clientX-app.getBoundingClientRect().left);
    try{localStorage.setItem(RAIL_KEY,w)}catch(err){}
  });
  const stop=()=>{dragging=false; handle.classList.remove("dragging"); document.body.style.userSelect=""};
  handle.addEventListener("pointerup",stop);
  handle.addEventListener("pointercancel",stop);
  handle.addEventListener("keydown",e=>{
    const cur=parseFloat(getComputedStyle(app).getPropertyValue("--rail-w"))||340;
    if(e.key==="ArrowLeft"){setW(cur-20); e.preventDefault()}
    else if(e.key==="ArrowRight"){setW(cur+20); e.preventDefault()}
    else return;
    try{localStorage.setItem(RAIL_KEY,parseFloat(getComputedStyle(app).getPropertyValue("--rail-w")))}catch(err){}
  });
})();
const SECTION={shared:["Shared assumptions",null],
  T:["SAFE only",null],K:["SAFE + Keel",null]};
function buildControls(){
  const host=$("controls"); host.innerHTML="";
  let curSection=null;
  G.forEach(g=>{
    if(g.section!==curSection){
      curSection=g.section;
      const [label,note]=SECTION[curSection];
      const hdr=document.createElement("div"); hdr.className="secthdr sect-"+curSection;
      hdr.innerHTML=`<span>${label}</span>${note?`<small>${note}</small>`:""}`;
      host.appendChild(hdr);
    }
    const det=document.createElement("details"); det.className="grp sect-"+g.section; if(g.open) det.open=true;
    det.innerHTML=`<summary>${g.title}</summary>`;
    if(g.id==="out") det.appendChild(buildOutcomesTable());
    g.f.forEach(([k,label,min,max,step,f,hint])=>{
      const w=document.createElement("div"); w.className="field";
      const id="in_"+k;
      w.innerHTML=`<label for="${id}"><span>${label}</span><output id="o_${k}"></output></label>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${S[k]}" aria-describedby="${hint?'h_'+k:''}">
        ${hint?`<div class="hint" id="h_${k}">${hint}</div>`:""}`;
      det.appendChild(w);
      const inp=w.querySelector("input");
      inp.addEventListener("input",()=>{S[k]=parseFloat(inp.value); paintOut(k,f); schedule()});
    });
    host.appendChild(det);
  });
  G.forEach(g=>g.f.forEach(([k,,,,,f])=>paintOut(k,f)));
  paintOutcomesTable();
}
function buildOutcomesTable(){
  const wrap=document.createElement("div"); wrap.className="outwrap";
  renderOutcomesRows(wrap);
  return wrap;
}
function renderOutcomesRows(wrap){
  let h=`<table class="outtbl"><thead><tr><th>Outcome</th><th>Share</th><th>Exit value ($M)</th><th>Follow-on val (% of exit)</th><th>Exit year</th><th></th></tr></thead><tbody>`;
  h+=`<tr><td><input type="text" class="cell cell-label" id="in_failLabel" value="${S.failLabel}"></td>
    <td><input type="number" class="cell" id="in_sh0" min="0" max="100" step="1" value="${Math.round(S.sh0*100)}"> %</td>
    <td class="dim">—</td><td class="dim">—</td><td class="dim">—</td><td></td></tr>`;
  S.outcomes.forEach((o,i)=>{
    h+=`<tr>
      <td><input type="text" class="cell cell-label" data-i="${i}" data-f="label" value="${o.label}"></td>
      <td><input type="number" class="cell" data-i="${i}" data-f="share" min="0" max="100" step="1" value="${Math.round(o.share*100)}"> %</td>
      <td><input type="number" class="cell cell-exitval" data-i="${i}" data-f="exitVal" min="0" step="0.5" value="${o.exitVal/1e6}"></td>
      <td><input type="number" class="cell" data-i="${i}" data-f="foPct" min="1" max="100" step="1" value="${Math.round(o.foPct*100)}"> %</td>
      <td><input type="number" class="cell" data-i="${i}" data-f="exit" min="1" max="11" step="1" value="${o.exit}"></td>
      <td><button type="button" class="rowdel" data-i="${i}" aria-label="Remove ${o.label}">×</button></td>
    </tr>`;
  });
  h+=`</tbody><tfoot><tr><td>Total</td><td id="outtotal" colspan="5"></td></tr></tfoot></table>
    <button type="button" class="btn ghost outadd" id="outadd">+ Add outcome</button>`;
  wrap.innerHTML=h;

  wrap.querySelector("#in_failLabel").addEventListener("input",e=>{S.failLabel=e.target.value; schedule()});
  wrap.querySelector("#in_sh0").addEventListener("input",e=>{S.sh0=parseFloat(e.target.value||0)/100; paintOutcomesTable(); schedule()});
  wrap.querySelectorAll("input[data-f]").forEach(inp=>{
    inp.addEventListener("input",()=>{
      const i=+inp.dataset.i, f=inp.dataset.f;
      if(f==="label") S.outcomes[i].label=inp.value;
      else if(f==="share"){ S.outcomes[i].share=parseFloat(inp.value||0)/100; paintOutcomesTable(); }
      else if(f==="exitVal") S.outcomes[i].exitVal=parseFloat(inp.value||0)*1e6;
      else if(f==="foPct") S.outcomes[i].foPct=parseFloat(inp.value||0)/100;
      else S.outcomes[i][f]=parseFloat(inp.value||0);
      schedule();
    });
  });
  wrap.querySelectorAll(".rowdel").forEach(btn=>{
    btn.addEventListener("click",()=>{
      S.outcomes.splice(+btn.dataset.i,1);
      renderOutcomesRows(wrap);
      schedule();
    });
  });
  wrap.querySelector("#outadd").addEventListener("click",()=>{
    const lastExit=S.outcomes.length?S.outcomes[S.outcomes.length-1].exit:YR[YR.length-1];
    S.outcomes.push({label:"New outcome",share:0,exitVal:S.roundVal,foPct:.3,exit:lastExit});
    renderOutcomesRows(wrap);
    schedule();
  });
  paintOutcomesTable();
}
function paintOutcomesTable(){
  const sum=S.sh0+S.outcomes.reduce((a,o)=>a+o.share,0);
  const el=$("outtotal"); if(!el) return;
  const ok=Math.abs(sum-1)<0.001;
  el.textContent=(sum*100).toFixed(0)+"%"+(ok?" ✓ matches 100%":" ✗ should be 100%");
  el.className=ok?"ok":"bad";
}
function paintOut(k,f){const o=$("o_"+k); if(o) o.textContent=fmt[f](S[k])}

/* ---------------- rendering ---------------- */
const COL={T:"var(--trad)",K:"var(--keel)"}, NAME={T:"SAFE only",K:"SAFE + Keel"};
let chartKey="tvpi", cfKey="K", last=null, lastMC=null;

function renderHull(r){
  const vals=[r.T.TVPI,r.K.TVPI], max=Math.max(1.5,...vals)*1.12;
  const pos=v=>Math.max(0,Math.min(100,v/max*100));
  const sub={T:fmt.usd(S.checkT)+" check",K:fmt.usd(S.safeK)+" SAFE + "+fmt.usd(S.optK)+" convertible"};
  let h=`<h2 class="hulltitle">Net TVPI</h2>`;
  ["T","K"].forEach(k=>{const v=r[k].TVPI;
    h+=`<div class="row"><div class="name">${NAME[k]}<small>${sub[k]}</small></div>
      <div class="track" role="img" aria-label="${NAME[k]} net TVPI ${v.toFixed(2)}x"><div class="bar" style="width:${pos(v)}%;background:${COL[k]}"></div><div class="waterline" style="left:${pos(1)}%"></div></div>
      <div class="val" style="color:${COL[k]}">${v.toFixed(2)}x</div></div>`});
  const allTicks=[0,.5,1,1.5,2,3,4,5,6,8,10].filter(v=>v<=max);
  // Below ~500px the full tick set collides into an unreadable run of labels; keep just
  // zero, the money-back line and the top of the scale.
  const ticks=window.matchMedia("(max-width:500px)").matches
    ? [0,1,Math.max(1,+max.toFixed(1))].filter((v,i,a)=>a.indexOf(v)===i)
    : allTicks;
  h+=`<div class="scale"><div></div><div class="ticks">${ticks.map(v=>`<span style="left:${pos(v)}%">${v===1?'<span class="wl-label">1.0x</span>':v+"x"}</span>`).join("")}</div><div></div></div>`;
  $("hull").innerHTML=h;
  $("headline").textContent=`What a ${fmt.usd(r.p.F)} seed fund returns to its LPs`;
}
function trio(r,fn,f){return `<div class="trio">${["T","K"].map(k=>`<div><i>${NAME[k]}</i><b class="${k.toLowerCase()}">${f(fn(r[k],k))}</b></div>`).join("")}</div>`}
function renderStats(r){
  const s=[
    ["Net IRR","Annualised return to LPs, after fees and carry.",o=>o.irr,v=>isNaN(v)?"n/a":(v*100).toFixed(1)+"%"],
    ["Gross TVPI","Total proceeds before fees and carry, divided by fund size (committed capital, not capital actually invested).",(o,k)=>k==="T"?r.grossMultipleT:r.grossMultipleK,fmt.x],
    ["DPI / RVPI at year 4","Cash already distributed vs. unrealised value, per dollar paid in.",o=>o,o=>o.dpi[3].toFixed(2)+" / "+o.rvpi[3].toFixed(2)],
    ["DPI / RVPI at year 6","Same, four years further into the fund's life.",o=>o,o=>o.dpi[5].toFixed(2)+" / "+o.rvpi[5].toFixed(2)],
    ["Capital lost in failures","Principal not recovered when a company fails (Keel: after fees).",(o,k)=>k==="T"?r.writeOffT:r.writeOffK,fmt.usd],
    ["Seed positions backed","Expected number of companies funded from the initial check pool.",(o,k)=>k==="T"?r.d.NT:r.d.NK,v=>String(Math.round(v))],
  ];
  let h=s.map(([t,def,fn,f])=>`<div class="stat"><h3>${t}</h3><div class="kpidef">${def}</div>${trio(r,fn,f)}</div>`).join("");
  h+=`<div class="stat stat-wide"><h3>Keel: recovered from failures</h3><div class="kpidef">Redeemed protected capital, split between recycling and an LP distribution.</div>
    <div class="fhero"><div class="fherolabel">Total recovered</div><div class="fheroval">${fmt.usd(r.recoveredK)}</div></div>
    <div class="ftiles">
      <div class="ftile"><div class="flabel">Recycled into winners' next round</div><div class="fval">${fmt.usd(r.recycledK)}</div></div>
      <div class="ftile"><div class="flabel">Distributed to LPs</div><div class="fval">${fmt.usd(r.distFromRedK)}</div></div>
      <div class="ftile"><div class="flabel">Keel fees</div><div class="fval">${fmt.usd(r.feesK)}</div></div>
    </div></div>`;
  $("stats").innerHTML=h;
}
function tabs(host,items,cur,onPick){
  const el=$(host); el.innerHTML="";
  items.forEach(([k,l])=>{const b=document.createElement("button");b.type="button";b.role="tab";b.textContent=l;b.setAttribute("aria-selected",String(k===cur));
    b.onclick=()=>{onPick(k)}; el.appendChild(b)});
}
function lineChart(host,series,yfmt,zeroLine){
  // SVG text is sized in viewBox units, so on a narrow phone (where the 760-wide viewBox
  // gets squeezed into ~300 real px) an "11px" label renders at under 5px on screen. Render
  // a taller, more generously margined chart with bigger label text so it scales down to
  // something still legible, instead of a fixed size tuned only for desktop widths.
  const small=window.matchMedia("(max-width:560px)").matches;
  const W=760,H=small?460:300,m=small?{l:76,r:10,t:20,b:46}:{l:58,r:14,t:12,b:28};
  const fs=small?32:11;
  const all=series.flatMap(s=>s.v).filter(v=>!isNaN(v)); let lo=Math.min(0,...all), hi=Math.max(...all,zeroLine||0); if(hi===lo) hi=lo+1;
  const raw=(hi-lo)/5, mag=Math.pow(10,Math.floor(Math.log10(raw))), step=[1,2,2.5,5,10].map(f=>f*mag).find(s=>s>=raw);
  lo=Math.floor(lo/step)*step; hi=Math.ceil(hi/step)*step; const nt=Math.round((hi-lo)/step);
  const x=i=>m.l+i*(W-m.l-m.r)/(YR.length-1), y=v=>m.t+(hi-v)*(H-m.t-m.b)/(hi-lo);
  let g="";
  for(let i=0;i<=nt;i++){const v=lo+i*step; g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${m.l-8}" y="${y(v)+4}" text-anchor="end" style="font-size:${fs}px">${yfmt(v)}</text>`}
  if(zeroLine!==undefined && zeroLine>lo && zeroLine<hi) g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(zeroLine)}" y2="${y(zeroLine)}" stroke="var(--water)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  YR.forEach((t,i)=>g+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle" style="font-size:${fs}px">${t}</text>`);
  const midY=m.t+(H-m.t-m.b)/2;
  series.forEach(s=>{
    // Break into contiguous runs of finite values so a leading NaN (e.g. IRR before any cash returns) leaves a gap, not a bogus line to/from 0.
    let run=[];
    const flush=()=>{if(run.length>1) g+=`<polyline fill="none" stroke="${s.c}" stroke-width="2.5" stroke-linejoin="round" points="${run.map(([px,py])=>px+","+py).join(" ")}"/>`; run=[]};
    s.v.forEach((v,i)=>{if(isNaN(v)){flush(); g+=`<text x="${x(i)}" y="${midY+4}" text-anchor="middle" style="fill:var(--muted);font-size:${fs}px">–</text>`}else{run.push([x(i),y(v)]); g+=`<circle cx="${x(i)}" cy="${y(v)}" r="${small?4:3}" fill="${s.c}"/>`}});
    flush();
  });
  g+=`<rect id="hov" x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="transparent"/>`;
  const el=$(host); el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Chart by year">${g}</svg>`;
  const svg=el.querySelector("svg"), tip=$("tip");
  svg.addEventListener("mousemove",ev=>{const b=svg.getBoundingClientRect(), px=(ev.clientX-b.left)*W/b.width, i=Math.round((px-m.l)/((W-m.l-m.r)/(YR.length-1)));
    if(i<0||i>=YR.length){tip.style.display="none";return}
    tip.innerHTML=`Year ${YR[i]}<br>`+series.map(s=>`${s.n}: ${isNaN(s.v[i])?"n/a":yfmt(s.v[i],true)}`).join("<br>");
    const box=el.parentElement.getBoundingClientRect(); tip.style.left=(ev.clientX-box.left+14)+"px"; tip.style.top=(ev.clientY-box.top-40)+"px"; tip.style.display="block"});
  svg.addEventListener("mouseleave",()=>tip.style.display="none");
}
function renderChart(r){
  const opts=[["tvpi","TVPI"],["dpi","DPI"],["rvpi","RVPI"],["moic","Gross TVPI"],["irrToDate","IRR to date"],["cnet","J-curve"]];
  tabs("chartTabs",opts,chartKey,k=>{chartKey=k;renderChart(last)});
  const money=chartKey==="cnet", pctv=chartKey==="irrToDate";
  const yfmt=(v,full)=>money?(full?fmt.usdFull(v):fmt.usd(v)):pctv?(v*100).toFixed(1)+"%":v.toFixed(2)+"x";
  lineChart("chart",["T","K"].map(k=>({n:NAME[k],c:COL[k],v:r[k][chartKey]})),yfmt,money||pctv?0:1);
}
function renderHist(mc){
  const small=window.matchMedia("(max-width:560px)").matches;
  const W=760,H=small?400:256,m=small?{l:70,r:10,t:18,b:72}:{l:48,r:14,t:10,b:46};
  const fs=small?32:11;
  const all=[...mc.T.arr,...mc.K.arr], lo=0, hi=Math.max(2,Math.min(8,[...all].sort((a,b)=>a-b)[Math.floor(all.length*.99)]*1.05));
  const bins=40, bw=(hi-lo)/bins;
  const hist=a=>{const h=new Array(bins).fill(0);a.forEach(v=>{const i=Math.min(bins-1,Math.max(0,Math.floor((v-lo)/bw)));h[i]++});return h.map(c=>c/a.length)};
  const H2={T:hist(mc.T.arr),K:hist(mc.K.arr)}, ymaxRaw=Math.max(...H2.T,...H2.K)*1.1;
  const mag=Math.pow(10,Math.floor(Math.log10(ymaxRaw))), ystep=[1,2,2.5,5,10].map(f=>f*mag).find(s=>s>=ymaxRaw/4)||mag;
  const ymax=Math.ceil(ymaxRaw/ystep)*ystep;
  const x=v=>m.l+(v-lo)*(W-m.l-m.r)/(hi-lo), y=v=>m.t+(ymax-v)*(H-m.t-m.b)/ymax;
  let g="";
  for(let v=0;v<=ymax+1e-9;v+=ystep) g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${m.l-8}" y="${y(v)+4}" text-anchor="end" style="font-size:${fs}px">${(v*100).toFixed(0)}%</text>`;
  for(let v=0;v<=hi+1e-9;v+=hi>4?1:.5) g+=`<text x="${x(v)}" y="${H-26}" text-anchor="middle" style="font-size:${fs}px">${v}x</text>`;
  g+=`<text x="${(m.l+W-m.r)/2}" y="${H-6}" text-anchor="middle" style="fill:var(--muted);font-size:${fs}px">Net TVPI (money multiple returned to LPs)</text>`;
  g+=`<line x1="${x(1)}" x2="${x(1)}" y1="${m.t}" y2="${y(0)}" stroke="var(--water)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${x(1)+6}" y="${m.t+12}" style="fill:var(--water);font-size:${fs}px">money back</text>`;
  ["T","K"].forEach(k=>{let d=`M${x(lo)},${y(0)}`;H2[k].forEach((c,i)=>{d+=` L${x(lo+i*bw)},${y(c)} L${x(lo+(i+1)*bw)},${y(c)}`});d+=` L${x(hi)},${y(0)}`;
    g+=`<path d="${d}" fill="${COL[k]}" fill-opacity="${k==='K'?.22:.1}" stroke="${COL[k]}" stroke-width="2"/>`});
  $("hist").innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Distribution of net TVPI across simulated funds, share of funds on the vertical axis">${g}</svg>`;
  $("mcstats").innerHTML=["T","K"].map(k=>{const s=mc[k];return `<div class="mc"><h3 class="${k.toLowerCase()}">${NAME[k]}</h3><dl>
    <dt>Chance LPs lose money</dt><dd>${(s.loss*100).toFixed(1)}%</dd><dt>Worst 10% of funds</dt><dd>${s.p10.toFixed(2)}x</dd>
    <dt>Median fund</dt><dd>${s.p50.toFixed(2)}x</dd><dt>Best 10% of funds</dt><dd>${s.p90.toFixed(2)}x</dd><dt>Average</dt><dd>${s.mean.toFixed(2)}x</dd>
    <dt>Median net IRR</dt><dd>${isNaN(s.irrMedian)?"n/a":(s.irrMedian*100).toFixed(1)+"%"}</dd></dl></div>`}).join("");
  renderBox(mc, hi);
}
function renderBox(mc,hi){
  const small=window.matchMedia("(max-width:560px)").matches;
  // Axis text (ticks/title) needs the same big bump as the other mobile charts to stay
  // legible. Row-name labels ("SAFE + Keel") are handled separately: at the axis font size
  // they're wide enough to overflow past x=0 and get clipped by the viewBox, so they get
  // their own smaller size and a left margin sized to actually fit them.
  const fs=small?32:11;
  const rowFs=small?22:13;
  const m={l:small?168:112,r:16,t:small?28:20,b:small?52:38};
  const rowH=small?150:110, gap=small?30:22, boxH=rowH*.3;
  const W=760, H=m.t+m.b+rowH*2+gap;
  const x=v=>m.l+v*(W-m.l-m.r)/hi;
  const rowY=[m.t+rowH/2, m.t+rowH+gap+rowH/2];
  let g="";
  const tickStep=hi>4?1:.5;
  for(let v=0;v<=hi+1e-9;v+=tickStep){
    g+=`<line x1="${x(v)}" x2="${x(v)}" y1="${m.t-4}" y2="${H-m.b+4}" stroke="var(--line)"/>`;
    g+=`<text x="${x(v)}" y="${H-m.b+28}" text-anchor="middle" style="font-size:${fs}px">${v}x</text>`;
  }
  g+=`<text x="${(m.l+W-m.r)/2}" y="${H-6}" text-anchor="middle" style="fill:var(--muted);font-size:${fs}px">Net TVPI (money multiple returned to LPs)</text>`;
  if(hi>1) g+=`<line x1="${x(1)}" x2="${x(1)}" y1="${m.t-4}" y2="${H-m.b+4}" stroke="var(--water)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  ["T","K"].forEach((k,i)=>{
    const s=mc[k], cy=rowY[i], col=COL[k];
    g+=`<text x="${m.l-16}" y="${cy+5}" text-anchor="end" style="fill:${col};font-weight:700;font-size:${rowFs}px">${NAME[k]}</text>`;
    g+=`<line x1="${x(s.p10)}" x2="${x(s.q1)}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="1.5"/>`;
    g+=`<line x1="${x(s.q3)}" x2="${x(s.p90)}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="1.5"/>`;
    g+=`<line x1="${x(s.p10)}" x2="${x(s.p10)}" y1="${cy-boxH/3}" y2="${cy+boxH/3}" stroke="${col}" stroke-width="1.5"/>`;
    g+=`<line x1="${x(s.p90)}" x2="${x(s.p90)}" y1="${cy-boxH/3}" y2="${cy+boxH/3}" stroke="${col}" stroke-width="1.5"/>`;
    g+=`<rect x="${x(s.q1)}" y="${cy-boxH/2}" width="${Math.max(1,x(s.q3)-x(s.q1))}" height="${boxH}" fill="${col}" fill-opacity=".25" stroke="${col}" stroke-width="1.5"/>`;
    g+=`<line x1="${x(s.p50)}" x2="${x(s.p50)}" y1="${cy-boxH/2}" y2="${cy+boxH/2}" stroke="${col}" stroke-width="2.5"/>`;
    g+=`<text x="${x(s.p50)}" y="${cy-boxH/2-10}" text-anchor="middle" style="fill:${col};font-weight:700;font-size:${rowFs}px">${s.p50.toFixed(2)}x</text>`;
  });
  $("box").innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Interquartile range of net TVPI across simulated funds, SAFE only vs SAFE + Keel">${g}</svg>`;
}
function renderFounder(){
  const p=S, keepConv=1-p.redRate, dil=v=>p.roundVal?v/p.roundVal:0;
  const fmtVal=(v,f)=>f==="pct"?fmt.pct1(v):f==="n"?v.toFixed(1):fmt.usdFull(v);
  // Each row is [label, value, format?, hero?]. The hero row gets a large, coloured
  // headline treatment; everything else sits in a compact two-column grid below it.
  const cards=[
    ["Normal round","wide",["SAFE only",[["Cash at close",p.checkT],["Dilution at this round's valuation",dil(p.checkT),"pct"],["Total capital received",p.checkT,null,true]]]],
    ["If the company succeeds","succeed",["SAFE + Keel",[["Cash at close",p.safeK],["Converts after "+p.dConv+" years",p.optK],["Dilution at this round's valuation",dil(p.safeK+p.optK),"pct"],["This fund's yield contribution, "+p.dConv+"y",p.yld*p.optK*p.dConv],["Total capital received",p.safeK+p.optK+p.yld*p.optK*p.dConv,null,true]]]],
    ["If the company fails","fail",["SAFE + Keel",[["Cash at close",p.safeK],["Dilution at this round's valuation",dil(p.safeK+p.optK),"pct"],["Redeemed after "+p.dRed+" years (received by the fund)",p.optK*p.redRate],["Kept by the company",p.optK*keepConv],["This fund's yield contribution, "+p.dRed+"y",p.yld*p.optK*p.dRed],["Total capital received",p.safeK+p.optK*keepConv+p.yld*p.optK*p.dRed,null,true]]]]];
  $("founder").innerHTML=cards.map(([t,kind,[badge,rows]])=>{
    const hero=rows.find(r=>r[3]), rest=rows.filter(r=>!r[3]);
    return `<div class="founder founder-${kind}">
      <div class="founderhd"><h3>${t}</h3><span class="fbadge fbadge-${kind}">${badge}</span></div>
      ${hero?`<div class="fhero"><div class="fherolabel">${hero[0]}</div><div class="fheroval">${fmtVal(hero[1],hero[2])}</div></div>`:""}
      <div class="ftiles">${rest.map(([a,v,f])=>`<div class="ftile"><div class="flabel">${a}</div><div class="fval">${fmtVal(v,f)}</div></div>`).join("")}</div>
    </div>`;
  }).join("");
}
function cfRows(o){
  const rows=[];Object.entries(o.rows).forEach(([k,v])=>rows.push([k,v,"usd"]));
  rows.push(["Total paid-in",o.paid,"usd",1],["Gross distributions",o.dist,"usd",1],["Unrealised value (NAV)",o.nav,"usd"],["Distributions to LPs (after carry)",o.lpd,"usd"],
    ["LP net cash flow",o.net,"usd",1],["Cumulative LP net cash flow",o.cnet,"usd"],["DPI",o.dpi,"x",1],["RVPI",o.rvpi,"x",1],["TVPI",o.tvpi,"x",1],["Gross TVPI",o.moic,"x"]);
  return rows;
}
function renderCF(r){
  tabs("cfTabs",[["T","SAFE only"],["K","SAFE + Keel"]],cfKey,k=>{cfKey=k;renderCF(last)});
  const o=r[cfKey], rows=cfRows(o);
  $("cfirr").innerHTML=`Net IRR: <b>${isNaN(o.irr)?"n/a":(o.irr*100).toFixed(1)+"%"}</b> &middot; Net TVPI: <b>${o.TVPI.toFixed(2)}x</b>`;
  $("cf").innerHTML=`<thead><tr><th>${NAME[cfKey]}</th>${YR.map(t=>`<th>Year ${t}</th>`).join("")}</tr></thead><tbody>`+
    rows.map(([l,v,f,em])=>`<tr class="${em?'em':''}"><td>${l}</td>${v.map(x=>`<td>${f==="x"?x.toFixed(2)+"x":(Math.abs(x)<0.5?"-":fmt.usdFull(x))}</td>`).join("")}</tr>`).join("")+"</tbody>";
}
function warnings(){
  const w=[]; const shareSum=S.sh0+S.outcomes.reduce((a,o)=>a+o.share,0);
  if(Math.abs(shareSum-1)>0.001) w.push(`Outcome shares sum to ${(shareSum*100).toFixed(0)}%, not 100%.`);
  const minExit=S.outcomes.length?Math.min(...S.outcomes.map(o=>o.exit)):Infinity;
  if(S.outcomes.length&&S.foYear>=minExit) w.push("Follow-ons must be deployed before the earliest outcome's exit year.");
  if(S.outcomes.length&&S.dRed>=minExit) w.push("Redemptions must happen before the earliest outcome's exit year, so recycled capital has time to be deployed.");
  $("warn").textContent=w.join(" ");
  return w.length===0;
}

/* ---------------- assumptions page ---------------- */
function renderAssumptions(){
  const p=S;
  const I=p.F*(1-p.MF*p.MFY), checkPool=I*(1-p.reserve), foReserve=I*p.reserve;
  const mults=outcomeMultiples(p);
  const failEnd=p.failYearStart+FAIL_RAMP_YEARS;
  const outcomeRows=p.outcomes.map((o,i)=>`<tr>
      <td>${o.label}</td>
      <td class="num">${(o.share*100).toFixed(0)}%</td>
      <td class="num">${fmt.usd(o.exitVal)}</td>
      <td class="num">${mults[i].toFixed(1)}x</td>
      <td class="num">${(o.foPct*100).toFixed(0)}%</td>
      <td class="num">${mults[i]>0?(1/o.foPct).toFixed(1)+"x":"–"}</td>
      <td class="num">Year ${o.exit+1}</td>
    </tr>`).join("");
  $("assumptionsPage").innerHTML=`<div class="doc">
    <h1 class="doctitle">Every assumption behind these numbers</h1>
    <p class="lede">This page walks through exactly what the model on the Results tab assumes, in
    plain language, using your current inputs — change anything in the sidebar and come back;
    the figures below update with it.</p>
    <p class="docupdated">Reflects the inputs currently set in the sidebar, not a fixed example.</p>

    <div class="docsec">
      <h3><span class="docnum">1</span>The fund and the round</h3>
      <p>The fund is <strong>${fmt.usd(p.F)}</strong>. Management fees run
      <strong>${fmt.pct1(p.MF)}</strong> a year for <strong>${p.MFY} years</strong>, and carried
      interest is <strong>${fmt.pct1(p.carry)}</strong>, European-style with no hurdle — LPs get
      every dollar of their commitments back before the fund keeps any share of the rest.
      After fees, <strong>${fmt.usd(I)}</strong> is actually investable. Of that,
      <strong>${fmt.pct1(p.reserve)}</strong> (${fmt.usd(foReserve)}) is set aside as a follow-on
      reserve up front, and the rest — <strong>${fmt.usd(checkPool)}</strong> — funds the initial
      checks.</p>
      <p>Every company in the portfolio is assumed to raise its seed round at the same
      <strong>${fmt.usd(p.roundVal)}</strong> post-money entry valuation. That single number is
      the yardstick every outcome below is measured against.</p>
    </div>

    <div class="docsec">
      <h3><span class="docnum">2</span>What happens to each company</h3>
      <p>Every company lands in exactly one outcome bucket. <strong>${fmt.pct1(p.sh0)}</strong> of
      them fail outright and return nothing. The rest exit at one of the values below — a
      company's <em>multiple</em> isn't typed in directly, it's its exit value divided by the
      ${fmt.usd(p.roundVal)} entry valuation above, so raising the entry price lowers every
      multiple at once, and vice versa.</p>
      <table class="doctbl"><thead><tr><th>Outcome</th><th>Share</th><th>Exit value</th>
        <th>Multiple</th><th>Follow-on at</th><th>Follow-on return</th><th>Exit year</th></tr></thead>
        <tbody>${outcomeRows}</tbody></table>
      <p class="muted">"Follow-on at" is that company's follow-on round as a percentage of its
      own eventual exit value — see section 4. "Follow-on return" is what a follow-on dollar in
      that company is worth by exit: 1 ÷ that percentage, independent of the company's own
      multiple.</p>
    </div>

    <div class="docsec">
      <h3><span class="docnum">3</span>Two ways to write the check</h3>
      <p><strong>SAFE only:</strong> every position is a single unprotected check of
      <strong>${fmt.usd(p.checkT)}</strong>. Nothing comes back if the company fails.</p>
      <p><strong>SAFE + Keel:</strong> every position instead splits into
      <strong>${fmt.usd(p.safeK)}</strong> of ordinary, unprotected SAFE and
      <strong>${fmt.usd(p.optK)}</strong> of Keel-protected convertible. Both strategies draw
      from the <em>same</em> ${fmt.usd(checkPool)} check pool and the same
      ${fmt.usd(foReserve)} follow-on reserve, funding the same companies at the same odds — the
      only thing that differs is what happens to the protected slice on failure (see section 5).
      On success, the whole check converts at a
      <strong>${fmt.pct1(p.premium)}</strong> premium over the entry valuation, so Keel's
      convertible buys in slightly more expensively than a plain SAFE would.</p>
    </div>

    <div class="docsec">
      <h3><span class="docnum">4</span>The follow-on reserve</h3>
      <p>The ${fmt.usd(foReserve)} reserve is deployed in year <strong>${p.foYear+1}</strong>,
      split across whichever companies are still <em>eligible</em> at that point — not just the
      ones that will definitely survive. A company that hasn't yet been recognised as a failure
      (see section 7) can still receive follow-on money and go on to fail anyway; that slice is
      simply lost, the same way it would be for a real fund that can't tell winners from losers
      in advance.</p>
      <p>How that reserve is split across companies is controlled by
      <strong>follow-on allocation skill (${fmt.pct1(p.foSkill)})</strong>: at 0% it's spread
      evenly per eligible company; at 100% it's weighted toward the companies that turn out to be
      the biggest winners, as if the fund already knew. ${fmt.pct1(p.foSkill)} blends the two.</p>
      <div class="callout"><b>There's no interior optimum on the reserve size.</b> Because this
      is an expected-value model, moving the <em>reserve</em> slider just shifts capital between
      two pools with fixed blended returns — whichever pool is more efficient wins at every level
      of the slider, so returns move in one direction the whole way, never peaking in the middle.
      What the reserve size actually trades off — fewer initial checks, more variance — only
      shows up in the Monte Carlo section (see section 9), not in the headline TVPI/IRR.</div>
    </div>

    <div class="docsec">
      <h3><span class="docnum">5</span>Keel's protection decisions</h3>
      <p>When a protected company fails, Keel redeems <strong>${fmt.pct1(p.redRate)}</strong> of
      the protected balance after <strong>${p.dRed} years</strong>; the rest is lost along with
      the unprotected portion of the check. While a position is still protected and awaiting its
      conversion or redemption decision, Keel charges an annual fee of
      <strong>${fmt.pct2(p.keelFee)}</strong> on the protected balance — for
      <strong>${p.dConv} years</strong> on positions headed for conversion,
      <strong>${p.dRed} years</strong> on positions headed for redemption.</p>
      <p class="muted">If that fee would ever add up to more than the follow-on reserve can
      absorb, the model shrinks the number of companies backed rather than calling extra capital
      beyond the fund's own size — fees are a real cost, never a source of free capital.</p>
    </div>

    <div class="docsec">
      <h3><span class="docnum">6</span>Recycling redeemed capital</h3>
      <p>Of the capital Keel recovers from redemptions,
      <strong>${fmt.pct1(p.recShare)}</strong> is recycled into winners' next round (uncapped),
      earning that winner's own follow-on return just like the primary reserve. The rest is
      distributed straight to LPs. If there's nothing left to recycle into — no survivors at
      all — the recycled share is paid out to LPs directly instead of disappearing.</p>
    </div>

    <div class="docsec">
      <h3><span class="docnum">7</span>How unrealised value is marked</h3>
      <p>The RVPI/TVPI-over-time chart needs some convention for what an unrealised position is
      "worth" before it exits — this never touches DPI or IRR, which only look at cash actually
      paid or received. A company destined to succeed is held at cost until the follow-on round
      in year ${p.foYear+1}, then marked up to reflect that round's pricing, until it finally
      exits at its full multiple. A company destined to fail is held at cost through year
      ${p.failYearStart}, then written down gradually — not all at once — until it reaches zero
      in year ${failEnd}, since real portfolios take time to recognise a loss rather than marking
      it to zero the instant the outcome is known.</p>
    </div>

    <div class="docsec">
      <h3><span class="docnum">8</span>The waterfall</h3>
      <p>European, no hurdle: LPs receive every dollar of their ${fmt.usd(p.F)} in commitments
      back first, and only after that does the fund keep
      <strong>${fmt.pct1(p.carry)}</strong> of anything further. Net IRR is solved from the
      resulting yearly LP cash flows; "IRR to date" does the same thing year by year, treating
      that year's unrealised value as if it were cashed out then, so it stops reading as
      meaningless (or undefined) before any real money has moved.</p>
    </div>

    <div class="docsec">
      <h3><span class="docnum">9</span>The Monte Carlo simulation</h3>
      <p>The charts above are an <em>expected value</em> — a blend across every possible outcome,
      weighted by its odds, as if you could run the fund many times and average the results.
      "Across 2,000 simulated funds" instead draws 2,000 individual, whole-number portfolios from
      those same odds, the way one actual fund's actual portfolio would turn out.</p>
      <div class="callout"><b>The average and the median can differ a lot when a fund makes few
      bets.</b> With a skewed, power-law-ish outcome mix like this one, most of a fund's expected
      value comes from rare, huge winners. A fund with only a handful of positions is quite
      likely to land zero of them — so its <em>median</em> simulated outcome can sit well below
      the <em>average</em>, which is inflated by the rare runs that do hit the outlier. The fewer
      companies a strategy backs, the more this gap matters — check the median fund, worst-decile
      and best-decile figures in that section, not just the average, especially at smaller check
      sizes.</div>
      <p class="muted">The simulation is seeded, so re-running it with the same inputs always
      reproduces the same 2,000 funds.</p>
    </div>
  </div>`;
}

/* ---------------- XLSX export ---------------- */
function buildWorkbook(){
  const r=last, mc=lastMC;
  const wb=XLSX.utils.book_new();

  const inputRows=[["Keel fund simulator export"],[],["INPUTS","Value"]];
  G.forEach(grp=>{
    if(grp.id==="out"){
      inputRows.push([S.failLabel+": share",S.sh0]);
      S.outcomes.forEach(o=>{
        inputRows.push([o.label+": share",o.share]);
        inputRows.push([o.label+": exit value",o.exitVal]);
        inputRows.push([o.label+": multiple (derived)",S.roundVal?o.exitVal/S.roundVal:0]);
        inputRows.push([o.label+": follow-on valuation (% of exit)",o.foPct]);
        inputRows.push([o.label+": exit year",o.exit]);
      });
      return;
    }
    grp.f.forEach(([k,label])=>inputRows.push([label,S[k]]));
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(inputRows),"Inputs");

  const results=[["RESULTS","SAFE only","SAFE + Keel"],
    ["Net TVPI",r.T.TVPI,r.K.TVPI],["Net IRR",r.T.irr,r.K.irr],["Gross TVPI",r.grossMultipleT,r.grossMultipleK],
    ["DPI at year 4",r.T.dpi[3],r.K.dpi[3]],["RVPI at year 4",r.T.rvpi[3],r.K.rvpi[3]],
    ["DPI at year 6",r.T.dpi[5],r.K.dpi[5]],["RVPI at year 6",r.T.rvpi[5],r.K.rvpi[5]],
    ["Capital lost in failures",r.writeOffT,r.writeOffK],["Seed positions backed",r.d.NT,r.d.NK],
    [],["KEEL DETAIL","",""],["Recovered from failures","",r.recoveredK],["Recycled into winners' next round","",r.recycledK],
    ["Distributed to LPs from redemptions","",r.distFromRedK],["Total Keel fees","",r.feesK],["Keel fees as % of fund","",r.feesPctK]];
  if(mc){ results.push([],[`SIMULATION (${mc.runs} funds, net TVPI)`,"SAFE only","SAFE + Keel"]);
    [["Chance LPs lose money","loss"],["Worst 10%","p10"],["Median","p50"],["Best 10%","p90"],["Average","mean"],["Median net IRR","irrMedian"]]
      .forEach(([l,k])=>results.push([l,mc.T[k],mc.K[k]])); }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(results),"Results");

  ["T","K"].forEach(k=>{
    const o=r[k], rows=[[NAME[k],...YR.map(t=>"Year "+t)]];
    cfRows(o).forEach(([l,v])=>rows.push([l,...v]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),"Cash flows - "+NAME[k]);
  });

  return wb;
}
let downloads=null;
// Inside a claude.ai artifact viewer, use the platform's downloads capability.
// Anywhere else (local dev, static hosting), fall back to a normal browser download.
if(window.claude&&typeof window.claude.use==="function"){
  window.claude.use("downloads").then(dl=>{downloads=dl; if(dl) $("dl").hidden=false}).catch(()=>{});
}else{
  downloads={save:async({filename,data})=>{const url=URL.createObjectURL(new Blob([data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);return {status:"saved"}}};
  $("dl").hidden=false;
}
$("dl").onclick=async()=>{
  const st=$("dlstatus"); st.textContent="";
  try{
    const wb=buildWorkbook();
    const bin=XLSX.write(wb,{bookType:"xlsx",type:"array"});
    await downloads.save({filename:"keel-simulation.xlsx",data:bin});
    st.textContent="Saved keel-simulation.xlsx.";
  }catch(e){const c=e&&e.code; st.textContent=c==="declined"?"Download cancelled.":c==="rate_limited"?"A download prompt is already open. Try again in a moment.":"Downloads aren't available here."; if(c&&c!=="declined"&&c!=="rate_limited"){$("dl").hidden=true}}
};

/* ---------------- pages (Results / Assumptions) ---------------- */
let pageKey="results";
function renderPageTabs(){
  tabs("pageTabs",[["results","Results"],["assumptions","Assumptions"]],pageKey,k=>{pageKey=k; applyPage()});
}
function applyPage(){
  renderPageTabs();
  $("resultsPage").hidden=pageKey!=="results";
  $("assumptionsPage").hidden=pageKey!=="assumptions";
  if(pageKey==="assumptions") renderAssumptions();
}

/* ---------------- loop ---------------- */
let timer=null, mcTimer=null;
function schedule(now){clearTimeout(timer);timer=setTimeout(update,now?0:60)}
function update(){
  if(!warnings()) return;
  last=run(S); renderHull(last); renderStats(last); renderChart(last); renderCF(last); renderFounder();
  if(pageKey==="assumptions") renderAssumptions();
  clearTimeout(mcTimer); mcTimer=setTimeout(()=>{lastMC=monte(S,2000);renderHist(lastMC);
    try{localStorage.setItem("keel-sim-inputs",JSON.stringify({v:SCHEMA_VERSION,s:S}))}catch(e){}},180);
}
try{
  const saved=JSON.parse(localStorage.getItem("keel-sim-inputs")||"null");
  if(saved&&typeof saved==="object"&&saved.v===SCHEMA_VERSION&&saved.s&&typeof saved.s==="object"){
    const clean={}; Object.keys(DEF).forEach(k=>{if(k in saved.s) clean[k]=saved.s[k]});
    S=Object.assign(cloneDef(),clean);
    if(!Array.isArray(S.outcomes)||!S.outcomes.every(o=>o&&typeof o.label==="string")) S.outcomes=cloneDef().outcomes;
  }else{
    localStorage.removeItem("keel-sim-inputs");
  }
}catch(e){}
buildControls(); renderPageTabs(); update();
