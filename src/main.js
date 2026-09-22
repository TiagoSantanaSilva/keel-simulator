import "./styles.css";
import * as XLSX from "xlsx";
import { G, DEF, OUTCOMES } from "./config.js";
import { fmt } from "./format.js";
import { YR, run, monte, PREMIUMS, REDRATES, grid } from "./engine.js";

// Bump whenever the input schema changes shape or meaning, so a stale save from an
// older version of the model isn't silently merged onto new defaults.
const SCHEMA_VERSION = 2;

let S = Object.assign({}, DEF);

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
const SECTION={shared:["Shared assumptions","Same for both strategies, so the comparison is fair."],
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
    if(g.id==="out"){ det.appendChild(buildOutcomesTable()); host.appendChild(det); return }
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
  let h=`<table class="outtbl"><thead><tr><th>Outcome</th><th>Share</th><th>Multiple</th><th>Exit year</th></tr></thead><tbody>`;
  OUTCOMES.forEach(([shK,mulK,exK,label,hint])=>{
    h+=`<tr><td>${label}${hint?`<div class="hint">${hint}</div>`:""}</td>
      <td><input type="number" class="cell" id="in_${shK}" min="0" max="100" step="1" value="${Math.round(S[shK]*100)}"> %</td>
      <td>${mulK?`<input type="number" class="cell" id="in_${mulK}" min="0" max="500" step="0.5" value="${S[mulK]}">x`:"—"}</td>
      <td>${exK?`<input type="number" class="cell" id="in_${exK}" min="1" max="11" step="1" value="${S[exK]}">`:"—"}</td></tr>`;
  });
  h+=`</tbody><tfoot><tr><td>Total</td><td id="outtotal" colspan="3"></td></tr></tfoot></table>`;
  wrap.innerHTML=h;
  OUTCOMES.forEach(([shK,mulK,exK])=>{
    wrap.querySelector("#in_"+shK).addEventListener("input",e=>{S[shK]=parseFloat(e.target.value||0)/100; paintOutcomesTable(); schedule()});
    if(mulK) wrap.querySelector("#in_"+mulK).addEventListener("input",e=>{S[mulK]=parseFloat(e.target.value||0); schedule()});
    if(exK) wrap.querySelector("#in_"+exK).addEventListener("input",e=>{S[exK]=parseFloat(e.target.value||0); schedule()});
  });
  return wrap;
}
function paintOutcomesTable(){
  const sum=OUTCOMES.reduce((a,[shK])=>a+S[shK],0);
  const el=$("outtotal"); if(!el) return;
  const ok=Math.abs(sum-1)<0.001;
  el.textContent=(sum*100).toFixed(0)+"%"+(ok?" ✓ matches 100%":" ✗ should be 100%");
  el.className=ok?"ok":"bad";
}
function paintOut(k,f){const o=$("o_"+k); if(o) o.textContent=fmt[f](S[k])}

/* ---------------- rendering ---------------- */
const COL={T:"var(--trad)",K:"var(--keel)"}, NAME={T:"SAFE only",K:"SAFE + Keel"};
let chartKey="tvpi", heatKey="best", cfKey="K", last=null, lastMC=null, lastGrid=null;

function renderHull(r){
  const vals=[r.T.TVPI,r.K.TVPI], max=Math.max(1.5,...vals)*1.12;
  const pos=v=>Math.max(0,Math.min(100,v/max*100));
  const sub={T:fmt.usd(S.checkT)+" check",K:fmt.usd(S.safeK)+" SAFE + "+fmt.usd(S.optK)+" Option"};
  let h="";
  ["T","K"].forEach(k=>{const v=r[k].TVPI;
    h+=`<div class="row"><div class="name">${NAME[k]}<small>${sub[k]}</small></div>
      <div class="track" role="img" aria-label="${NAME[k]} net TVPI ${v.toFixed(2)}x"><div class="bar" style="width:${pos(v)}%;background:${COL[k]}"></div><div class="waterline" style="left:${pos(1)}%"></div></div>
      <div class="val" style="color:${COL[k]}">${v.toFixed(2)}x</div></div>`});
  const ticks=[0,.5,1,1.5,2,3,4,5,6,8,10].filter(v=>v<=max);
  h+=`<div class="scale"><div></div><div class="ticks">${ticks.map(v=>`<span style="left:${pos(v)}%">${v===1?'<span class="wl-label">1.0x</span>':v+"x"}</span>`).join("")}</div><div></div></div>`;
  h+=`<div class="hulldef">Net TVPI: for every $1 an LP put in, what they'd have back today — cash already distributed plus the value of what's still held — after Keel fees, management fees and carry. 1.0x is the dashed line: below it, LPs haven't got their money back yet.</div>`;
  $("hull").innerHTML=h;
  $("headline").textContent=`What a ${fmt.usd(r.p.F)} seed fund returns to its LPs`;
}
function trio(r,fn,f){return `<div class="trio">${["T","K"].map(k=>`<div><i>${NAME[k]}</i><b class="${k.toLowerCase()}">${f(fn(r[k],k))}</b></div>`).join("")}</div>`}
function renderStats(r){
  const s=[
    ["Net IRR","Annualised return to LPs, after fees and carry.",o=>o.irr,v=>isNaN(v)?"n/a":(v*100).toFixed(1)+"%"],
    ["Gross multiple","Total proceeds before fees and carry, divided by fund size.",(o,k)=>k==="T"?r.grossMultipleT:r.grossMultipleK,fmt.x],
    ["DPI / RVPI at year 4","Cash already distributed vs. unrealised value, per dollar paid in.",o=>o,o=>o.dpi[3].toFixed(2)+" / "+o.rvpi[3].toFixed(2)],
    ["DPI / RVPI at year 6","Same, four years further into the fund's life.",o=>o,o=>o.dpi[5].toFixed(2)+" / "+o.rvpi[5].toFixed(2)],
    ["Capital lost in failures","Principal not recovered when a company fails (Keel: after fees).",(o,k)=>k==="T"?r.writeOffT:r.writeOffK,fmt.usd],
    ["Seed positions backed","Expected number of companies funded from the initial check pool.",(o,k)=>k==="T"?r.d.NT:r.d.NK,v=>v.toFixed(1)],
    ["Deployment pace","Months to write every initial check, at this pace. The model still treats them as one year-1 vintage — see the note below.",(o,k)=>Math.ceil((k==="T"?r.d.NT:r.d.NK)/S.checksPerMonth),v=>v+(v===1?" month":" months")],
  ];
  let h=s.map(([t,def,fn,f])=>`<div class="stat"><h3>${t}</h3><div class="kpidef">${def}</div>${trio(r,fn,f)}</div>`).join("");
  h+=`<div class="stat"><h3>Keel: recovered from failures</h3><div class="kpidef">Redeemed protected capital, split between recycling and an LP distribution.</div><div style="font-size:18px;font-weight:700" class="k">${fmt.usd(r.recoveredK)}</div><div class="hint" style="font-size:12px;color:var(--muted)">${fmt.usd(r.recycledK)} recycled into winners' next Series A, ${fmt.usd(r.distFromRedK)} distributed to LPs, ${fmt.usd(r.feesK)} in Keel fees</div></div>`;
  $("stats").innerHTML=h;
  const maxMonths=Math.max(Math.ceil(r.d.NT/S.checksPerMonth),Math.ceil(r.d.NK/S.checksPerMonth));
  $("deploywarn").textContent=maxMonths>12?`At this pace, writing every check takes ${maxMonths} months — longer than the model's single year-1 vintage assumes. Treat year-1 results as optimistic on timing; a future version could spread the vintage across years.`:"";
}
function tabs(host,items,cur,onPick){
  const el=$(host); el.innerHTML="";
  items.forEach(([k,l])=>{const b=document.createElement("button");b.type="button";b.role="tab";b.textContent=l;b.setAttribute("aria-selected",String(k===cur));
    b.onclick=()=>{onPick(k)}; el.appendChild(b)});
}
function lineChart(host,series,yfmt,zeroLine){
  const W=760,H=300,m={l:58,r:14,t:12,b:28};
  const all=series.flatMap(s=>s.v).filter(v=>!isNaN(v)); let lo=Math.min(0,...all), hi=Math.max(...all,zeroLine||0); if(hi===lo) hi=lo+1;
  const raw=(hi-lo)/5, mag=Math.pow(10,Math.floor(Math.log10(raw))), step=[1,2,2.5,5,10].map(f=>f*mag).find(s=>s>=raw);
  lo=Math.floor(lo/step)*step; hi=Math.ceil(hi/step)*step; const nt=Math.round((hi-lo)/step);
  const x=i=>m.l+i*(W-m.l-m.r)/(YR.length-1), y=v=>m.t+(hi-v)*(H-m.t-m.b)/(hi-lo);
  let g="";
  for(let i=0;i<=nt;i++){const v=lo+i*step; g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${m.l-8}" y="${y(v)+4}" text-anchor="end">${yfmt(v)}</text>`}
  if(zeroLine!==undefined && zeroLine>lo && zeroLine<hi) g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(zeroLine)}" y2="${y(zeroLine)}" stroke="var(--water)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  YR.forEach((t,i)=>g+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${t}</text>`);
  series.forEach(s=>{
    // Break into contiguous runs of finite values so a leading NaN (e.g. IRR before any cash returns) leaves a gap, not a bogus line to/from 0.
    let run=[];
    const flush=()=>{if(run.length>1) g+=`<polyline fill="none" stroke="${s.c}" stroke-width="2.5" stroke-linejoin="round" points="${run.map(([px,py])=>px+","+py).join(" ")}"/>`; run=[]};
    s.v.forEach((v,i)=>{if(isNaN(v)){flush()}else{run.push([x(i),y(v)]); g+=`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.c}"/>`}});
    flush();
  });
  g+=`<rect id="hov" x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="transparent"/>`;
  const el=$(host); el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Chart by year">${g}</svg>`;
  const svg=el.querySelector("svg"), tip=$("tip");
  svg.addEventListener("mousemove",ev=>{const b=svg.getBoundingClientRect(), px=(ev.clientX-b.left)*W/b.width, i=Math.round((px-m.l)/((W-m.l-m.r)/(YR.length-1)));
    if(i<0||i>=YR.length){tip.style.display="none";return}
    tip.innerHTML=`Year ${YR[i]}<br>`+series.map(s=>`${s.n}: ${isNaN(s.v[i])?"n/a":yfmt(s.v[i],true)}`).join("<br>");
    const box=el.parentElement.getBoundingClientRect(); tip.style.left=(b.left-box.left+x(i)*b.width/W)+"px"; tip.style.top=(b.top-box.top+m.t*b.height/H+20)+"px"; tip.style.display="block"});
  svg.addEventListener("mouseleave",()=>tip.style.display="none");
}
function renderChart(r){
  const opts=[["tvpi","TVPI"],["dpi","DPI"],["rvpi","RVPI"],["moic","Gross MOIC"],["irrToDate","IRR to date"],["cnet","J-curve"]];
  tabs("chartTabs",opts,chartKey,k=>{chartKey=k;renderChart(last)});
  const money=chartKey==="cnet", pctv=chartKey==="irrToDate";
  const yfmt=(v,full)=>money?(full?fmt.usdFull(v):fmt.usd(v)):pctv?(v*100).toFixed(1)+"%":v.toFixed(2)+"x";
  lineChart("chart",["T","K"].map(k=>({n:NAME[k],c:COL[k],v:r[k][chartKey]})),yfmt,money||pctv?0:1);
}
function renderHist(mc){
  const W=760,H=240,m={l:40,r:14,t:10,b:30};
  const all=[...mc.T.arr,...mc.K.arr], lo=0, hi=Math.max(2,Math.min(8,[...all].sort((a,b)=>a-b)[Math.floor(all.length*.99)]*1.05));
  const bins=40, bw=(hi-lo)/bins;
  const hist=a=>{const h=new Array(bins).fill(0);a.forEach(v=>{const i=Math.min(bins-1,Math.max(0,Math.floor((v-lo)/bw)));h[i]++});return h.map(c=>c/a.length)};
  const H2={T:hist(mc.T.arr),K:hist(mc.K.arr)}, ymax=Math.max(...H2.T,...H2.K)*1.1;
  const x=v=>m.l+(v-lo)*(W-m.l-m.r)/(hi-lo), y=v=>m.t+(ymax-v)*(H-m.t-m.b)/ymax;
  let g=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>`;
  for(let v=0;v<=hi+1e-9;v+=hi>4?1:.5) g+=`<text x="${x(v)}" y="${H-10}" text-anchor="middle">${v}x</text>`;
  g+=`<line x1="${x(1)}" x2="${x(1)}" y1="${m.t}" y2="${y(0)}" stroke="var(--water)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${x(1)+6}" y="${m.t+12}" style="fill:var(--water)">money back</text>`;
  ["T","K"].forEach(k=>{let d=`M${x(lo)},${y(0)}`;H2[k].forEach((c,i)=>{d+=` L${x(lo+i*bw)},${y(c)} L${x(lo+(i+1)*bw)},${y(c)}`});d+=` L${x(hi)},${y(0)}`;
    g+=`<path d="${d}" fill="${COL[k]}" fill-opacity="${k==='K'?.22:.1}" stroke="${COL[k]}" stroke-width="2"/>`});
  $("hist").innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Distribution of net TVPI across simulated funds">${g}</svg>`;
  $("mcstats").innerHTML=["T","K"].map(k=>{const s=mc[k];return `<div class="mc"><h3 class="${k.toLowerCase()}">${NAME[k]}</h3><dl>
    <dt>Chance LPs lose money</dt><dd>${(s.loss*100).toFixed(1)}%</dd><dt>Worst 10% of funds</dt><dd>${s.p10.toFixed(2)}x</dd>
    <dt>Median fund</dt><dd>${s.p50.toFixed(2)}x</dd><dt>Best 10% of funds</dt><dd>${s.p90.toFixed(2)}x</dd><dt>Average</dt><dd>${s.mean.toFixed(2)}x</dd>
    <dt>Average net IRR</dt><dd>${isNaN(s.irrMean)?"n/a":(s.irrMean*100).toFixed(1)+"%"}</dd></dl></div>`}).join("");
}
function renderHeat(g){
  tabs("heatTabs",[["best","Best strategy"],["kt","SAFE + Keel vs SAFE only"]],heatKey,k=>{heatKey=k;renderHeat(lastGrid)});
  let h=`<table><thead><tr><th>Premium \\ redemption rate</th>${REDRATES.map(v=>`<th>${(v*100).toFixed(0)}%</th>`).join("")}</tr></thead><tbody>`;
  g.forEach((row,i)=>{h+=`<tr><th>${(PREMIUMS[i]*100).toFixed(0)}%</th>`;row.forEach((c,j)=>{
    const cur=PREMIUMS[i]===S.premium&&REDRATES[j]===S.redRate?" cur":"";
    if(heatKey==="best"){const best=c.K>=c.T?"K":"T";
      h+=`<td class="${cur.trim()}" style="background:color-mix(in srgb, ${COL[best]} 28%, var(--surface))">${NAME[best]}<br><span style="font-weight:400;font-size:12px">${c[best].toFixed(2)}x</span></td>`}
    else{const v=c.K-c.T, a=Math.min(1,Math.abs(v)/.4), col=v>=0?"var(--pos)":"var(--neg)";
      h+=`<td class="${cur.trim()}" style="background:color-mix(in srgb, ${col} ${Math.round(a*45)}%, var(--surface))">${fmt.dx(v)}</td>`}
  });h+="</tr>"});
  $("heat").innerHTML=h+"</tbody></table>";
}
function renderFounder(){
  const p=S, keepConv=1-p.redRate, dil=v=>p.roundVal?v/p.roundVal:0;
  const cards=[
    ["Normal round (SAFE only)",[["Cash at close",p.checkT],["Total capital received",p.checkT],["Dilution at this round's valuation",dil(p.checkT),"pct"]]],
    ["SAFE + Keel round, company succeeds",[["Cash at close",p.safeK],["Option converts after "+p.dConv+" years",p.optK],["Total capital received",p.safeK+p.optK],["Dilution at this round's valuation",dil(p.safeK+p.optK),"pct"],["This fund's yield contribution over "+p.dConv+" years",p.yld*p.optK*p.dConv*(1-p.yldInv)]]],
    ["SAFE + Keel round, company fails",[["Cash at close",p.safeK],["Redeemed by investors after "+p.dRed+" years",p.optK*p.redRate],["Kept by the company",p.optK*keepConv],["Total capital received",p.safeK+p.optK*keepConv],["This fund's yield contribution over "+p.dRed+" years",p.yld*p.optK*p.dRed*(1-p.yldInv)]]],
    ["Across the whole round",[["Round valuation (post-money)",p.roundVal],["Total Option amount in the round",p.totalOpt],["This fund's share of the Option pool",p.totalOpt?p.optK/p.totalOpt:0,"pct"],["Implied number of protected investors like this fund",p.optK?p.totalOpt/p.optK:0,"n"],
      ["Total yield to the company if it succeeds (over "+p.dConv+" years)",p.yld*p.totalOpt*p.dConv*(1-p.yldInv)],
      ["Total yield to the company if it fails (over "+p.dRed+" years)",p.yld*p.totalOpt*p.dRed*(1-p.yldInv)]]]];
  $("founder").innerHTML=cards.map(([t,rows])=>`<div class="founder"><h3 style="margin:0 0 10px;font-size:15px">${t}</h3><dl>${rows.map(([a,v,f])=>`<dt>${a}</dt><dd>${f==="pct"?fmt.pct1(v):f==="n"?v.toFixed(1):fmt.usdFull(v)}</dd>`).join("")}</dl></div>`).join("");
}
function cfRows(o){
  const rows=[];Object.entries(o.rows).forEach(([k,v])=>rows.push([k,v,"usd"]));
  rows.push(["Total paid-in",o.paid,"usd",1],["Gross distributions",o.dist,"usd",1],["Unrealised value (NAV)",o.nav,"usd"],["Distributions to LPs (after carry)",o.lpd,"usd"],
    ["LP net cash flow",o.net,"usd",1],["Cumulative LP net cash flow",o.cnet,"usd"],["DPI",o.dpi,"x",1],["RVPI",o.rvpi,"x",1],["TVPI",o.tvpi,"x",1],["Gross MOIC",o.moic,"x"]);
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
  const w=[]; const shareSum=OUTCOMES.reduce((a,[shK])=>a+S[shK],0);
  if(Math.abs(shareSum-1)>0.001) w.push(`Outcome shares sum to ${(shareSum*100).toFixed(0)}%, not 100%.`);
  if(S.foExit<=S.foYear) w.push("Follow-ons must exit after they're deployed.");
  if(S.recExit<=S.dRed) w.push("Recycled capital must exit after the redemption year.");
  $("warn").textContent=w.join(" ");
  return w.length===0;
}

/* ---------------- XLSX export ---------------- */
function buildWorkbook(){
  const r=last, mc=lastMC, g=lastGrid;
  const wb=XLSX.utils.book_new();

  const inputRows=[["Keel fund simulator export"],[],["INPUTS","Value"]];
  G.forEach(grp=>{
    if(grp.id==="out"){OUTCOMES.forEach(([shK,mulK,exK,label])=>{
      inputRows.push([label+": share",S[shK]]);
      if(mulK) inputRows.push([label+": multiple",S[mulK]]);
      if(exK) inputRows.push([label+": exit year",S[exK]]);
    }); return}
    grp.f.forEach(([k,label])=>inputRows.push([label,S[k]]));
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(inputRows),"Inputs");

  const results=[["RESULTS","SAFE only","SAFE + Keel"],
    ["Net TVPI",r.T.TVPI,r.K.TVPI],["Net IRR",r.T.irr,r.K.irr],["Gross multiple",r.grossMultipleT,r.grossMultipleK],
    ["DPI at year 4",r.T.dpi[3],r.K.dpi[3]],["RVPI at year 4",r.T.rvpi[3],r.K.rvpi[3]],
    ["DPI at year 6",r.T.dpi[5],r.K.dpi[5]],["RVPI at year 6",r.T.rvpi[5],r.K.rvpi[5]],
    ["Capital lost in failures",r.writeOffT,r.writeOffK],["Seed positions backed",r.d.NT,r.d.NK],
    [],["KEEL DETAIL","",""],["Recovered from failures","",r.recoveredK],["Recycled into winners' next Series A","",r.recycledK],
    ["Distributed to LPs from redemptions","",r.distFromRedK],["Total Keel fees","",r.feesK],["Keel fees as % of fund","",r.feesPctK]];
  if(mc){ results.push([],[`SIMULATION (${mc.runs} funds, net TVPI)`,"SAFE only","SAFE + Keel"]);
    [["Chance LPs lose money","loss"],["Worst 10%","p10"],["Median","p50"],["Best 10%","p90"],["Average","mean"],["Average net IRR","irrMean"]]
      .forEach(([l,k])=>results.push([l,mc.T[k],mc.K[k]])); }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(results),"Results");

  ["T","K"].forEach(k=>{
    const o=r[k], rows=[[NAME[k],...YR.map(t=>"Year "+t)]];
    cfRows(o).forEach(([l,v])=>rows.push([l,...v]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),"Cash flows - "+NAME[k]);
  });

  if(g){ const gridRows=[["Premium \\ redemption rate",...REDRATES.map(v=>(v*100).toFixed(0)+"% (SAFE only / SAFE+Keel)")]];
    g.forEach((row,i)=>gridRows.push([(PREMIUMS[i]*100).toFixed(0)+"%",...row.map(c=>`${c.T.toFixed(2)} / ${c.K.toFixed(2)}`)]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(gridRows),"Premium vs redemption grid"); }

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

/* ---------------- loop ---------------- */
let timer=null, mcTimer=null;
function schedule(now){clearTimeout(timer);timer=setTimeout(update,now?0:60)}
function update(){
  if(!warnings()) return;
  last=run(S); renderHull(last); renderStats(last); renderChart(last); renderCF(last); renderFounder();
  clearTimeout(mcTimer); mcTimer=setTimeout(()=>{lastMC=monte(S,2000);renderHist(lastMC);lastGrid=grid(S);renderHeat(lastGrid);
    try{localStorage.setItem("keel-sim-inputs",JSON.stringify({v:SCHEMA_VERSION,s:S}))}catch(e){}},180);
}
try{
  const saved=JSON.parse(localStorage.getItem("keel-sim-inputs")||"null");
  if(saved&&typeof saved==="object"&&saved.v===SCHEMA_VERSION&&saved.s&&typeof saved.s==="object"){
    const clean={}; Object.keys(DEF).forEach(k=>{if(k in saved.s) clean[k]=saved.s[k]});
    S=Object.assign({},DEF,clean);
  }else{
    localStorage.removeItem("keel-sim-inputs");
  }
}catch(e){}
buildControls(); update();
