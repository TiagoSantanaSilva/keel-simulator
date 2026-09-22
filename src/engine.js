// Pure model engine: no DOM access. Every function is deterministic
// (the Monte Carlo uses a seeded RNG), so results are reproducible and testable.
// Mirrors Keel_Fund_Model.xlsx (Inputs + Fund Model tabs). See docs/model-spec.md.
//
// Years are 0-indexed and mean "years after the initial check" directly: index t
// is the year in which an input like `foYear` or an outcome's `exit` fires. YR
// holds the 1-based labels shown in the UI (YR[t] === t+1), matching the
// workbook's own year numbering, where "year 1" is the year of the initial checks.
export const YR = [1,2,3,4,5,6,7,8,9,10,11,12];

// p.sh0 (share) is the failure bucket: no multiple, no exit -- it never returns
// anything, so it only ever appears in write-off/redemption math. Every other
// outcome bucket lives in p.outcomes, a user-editable array of
// {label, share, mult, exit}, so the table can grow or shrink freely and each
// row is looked up by array position instead of a fixed field name.
const successMix=p=>p.outcomes.reduce((a,o)=>a+o.share*o.mult,0);

export function irr(cf){
  const npv=r=>{let f=1,s=0;for(let i=0;i<cf.length;i++){s+=cf[i]/f;f*=(1+r)}return s};
  let best=NaN;
  for(let r=-0.95;r<3;r+=0.005){const a=npv(r),b=npv(r+0.005);
    if(a===0) {best=r;break}
    if(a*b<0){let lo=r,hi=r+0.005;for(let i=0;i<40;i++){const m=(lo+hi)/2;(npv(lo)*npv(m)<=0)?hi=m:lo=m}
      const root=(lo+hi)/2; if(isNaN(best)||Math.abs(root)<Math.abs(best)) best=root}}
  return best;
}

export function derive(p){
  const d={};
  d.I=p.F*(1-p.MF*p.MFY);
  d.checkPool=d.I*(1-p.reserve);
  d.foReserve=d.I*p.reserve;
  d.checkK=p.safeK+p.optK;

  // SAFE only
  d.NT=p.checkT>0?d.checkPool/p.checkT:0;
  d.failedT=d.NT*p.sh0;
  d.successT=d.NT*p.checkT*successMix(p);
  d.grossT=d.successT+d.foReserve*p.foMult;
  d.writeOffT=d.failedT*p.checkT;

  // SAFE + Option
  d.NK=d.checkK>0?d.checkPool/d.checkK:0;
  d.failedK=d.NK*p.sh0;
  d.redeemedK=d.failedK*p.redRate;
  d.convertedK=d.NK-d.redeemedK;
  d.feePerPos=p.keelFee*p.optK;
  d.licence=0;
  d.totalFees=d.convertedK*d.feePerPos*p.dConv+d.redeemedK*d.feePerPos*p.dRed;
  d.foReserveK=Math.max(0,d.foReserve-d.totalFees);
  // All reserve yield goes to the company (see docs/model-spec.md), so redemption recovers
  // exactly the protected balance -- no yield boost on top.
  d.recovered=d.redeemedK*p.optK;
  d.recycled=d.recovered*p.recShare;
  d.distFromRed=d.recovered-d.recycled;
  d.successK=d.NK*d.checkK*successMix(p);
  d.grossK=d.successK/(1+p.premium)+d.foReserveK*p.foMult+d.distFromRed+d.recycled*p.foMult;
  d.writeOffK=d.failedK*p.safeK+(d.failedK-d.redeemedK)*p.optK+d.totalFees;

  return d;
}

// Waterfall + DPI/RVPI/TVPI/IRR from yearly paid-in and gross-distribution arrays.
// European waterfall, no hurdle: LPs get commitments back first, then (1-carry) of the rest.
export function metrics(p,paid,dist,nav){
  const N=YR.length;
  const o={paid,dist,nav,cpaid:[],cgd:[],lpc:[],lpd:[],net:[],cnet:[],tv:[],lptv:[],dpi:[],rvpi:[],tvpi:[],moic:[]};
  const wf=x=>Math.min(x,p.F)+(1-p.carry)*Math.max(0,x-p.F);
  for(let i=0;i<N;i++){
    o.cpaid[i]=(i?o.cpaid[i-1]:0)+paid[i];
    o.cgd[i]=(i?o.cgd[i-1]:0)+dist[i];
    o.lpc[i]=wf(o.cgd[i]);
    o.lpd[i]=o.lpc[i]-(i?o.lpc[i-1]:0);
    o.net[i]=o.lpd[i]-paid[i];
    o.cnet[i]=(i?o.cnet[i-1]:0)+o.net[i];
    o.tv[i]=o.cgd[i]+nav[i];
    o.lptv[i]=wf(o.tv[i]);
    o.dpi[i]=o.cpaid[i]?o.lpc[i]/o.cpaid[i]:0;
    o.rvpi[i]=o.cpaid[i]?(o.lptv[i]-o.lpc[i])/o.cpaid[i]:0;
    o.tvpi[i]=o.dpi[i]+o.rvpi[i];
    o.moic[i]=o.cpaid[i]?o.tv[i]/o.cpaid[i]:0;
  }
  o.irr=irr(o.net);
  o.TVPI=o.tvpi[N-1];
  // IRR to date: cash flows through year i, with that year's unrealised LP NAV
  // (lptv[i]-lpc[i]) added as an extra inflow, as if the position were marked and
  // liquidated at cost that year. At the final year NAV is 0 (everything has exited),
  // so this converges exactly to o.irr without needing to special-case the last point.
  o.irrToDate=[];
  for(let i=0;i<N;i++){
    const cf=o.net.slice(0,i+1);
    cf[i]+=o.lptv[i]-o.lpc[i];
    o.irrToDate[i]=irr(cf);
  }
  return o;
}

export function run(p){
  const d=derive(p);
  const N=YR.length;
  const mg=t=>t<p.MFY?p.F*p.MF:0;
  const T={paid:[],dist:[],nav:[],rows:{}}, K={paid:[],dist:[],nav:[],rows:{}};
  const R=(o,k,i,v)=>{(o.rows[k]=o.rows[k]||[])[i]=v};

  for(let t=0;t<N;t++){
    // ---- SAFE only ----
    let a=mg(t), b=(t===0?d.checkPool:0)+(t===p.foYear?d.foReserve:0);
    R(T,"Management fees called",t,a); R(T,"Capital called for investments",t,b);
    T.paid[t]=a+b;

    let e=0;
    p.outcomes.forEach(o=>{if(t===o.exit) e+=d.NT*p.checkT*o.share*o.mult});
    if(t===p.foExit) e+=d.foReserve*p.foMult;
    R(T,"Exits",t,e);
    T.dist[t]=e;

    let n=0;
    p.outcomes.forEach(o=>{if(t<o.exit) n+=d.NT*p.checkT*o.share});
    if(t>=p.foYear&&t<p.foExit) n+=d.foReserve;
    T.nav[t]=n;

    // ---- SAFE + Option ----
    a=mg(t); b=(t===0?d.checkPool:0)+(t===p.foYear?d.foReserveK:0);
    const fee=(t===0?d.licence:0)+(t>=1&&t<=p.dConv?d.convertedK*d.feePerPos:0)+(t>=1&&t<=p.dRed?d.redeemedK*d.feePerPos:0);
    R(K,"Management fees called",t,a); R(K,"Capital called for investments",t,b); R(K,"Keel fees",t,fee);
    K.paid[t]=a+b+fee;

    e=0;
    p.outcomes.forEach(o=>{if(t===o.exit) e+=d.NK*d.checkK*o.share*o.mult/(1+p.premium)});
    if(t===p.dRed) e+=d.distFromRed;
    if(t===p.foExit) e+=(d.foReserveK+d.recycled)*p.foMult;
    R(K,"Exits and redemptions",t,e);
    R(K,"Recycled into winners' next round",t,t===p.foExit?d.recycled*p.foMult:0);
    K.dist[t]=e;

    n=0;
    p.outcomes.forEach(o=>{if(t<o.exit) n+=d.NK*d.checkK*o.share});
    if(t<p.dRed) n+=d.redeemedK*p.optK;
    if(t>=p.foYear&&t<p.foExit) n+=d.foReserveK;
    if(t>=p.dRed&&t<p.foExit) n+=d.recycled;
    K.nav[t]=n;
  }

  const out={d,p};
  [["T",T],["K",K]].forEach(([k,o])=>{
    const m=metrics(p,o.paid,o.dist,o.nav);
    m.rows=o.rows;
    out[k]=m;
  });
  out.grossMultipleT=p.F?d.grossT/p.F:0;
  out.grossMultipleK=p.F?d.grossK/p.F:0;
  out.writeOffT=d.writeOffT;
  out.writeOffK=d.writeOffK;
  out.feesK=d.totalFees;
  out.feesPctK=p.F?d.totalFees/p.F:0;
  out.recycledK=d.recycled;
  out.distFromRedK=d.distFromRed;
  out.recoveredK=d.recovered;
  return out;
}

// ---------------- Monte Carlo ----------------
export function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

export function monte(p,runs){
  const d=derive(p), rnd=rng(42);
  const N=YR.length;
  const NT=Math.max(1,Math.round(d.NT)), NK=Math.max(1,Math.round(d.NK));
  const mg=t=>t<p.MFY?p.F*p.MF:0;
  const wf=x=>Math.min(x,p.F)+(1-p.carry)*Math.max(0,x-p.F);
  // Bucket 0 is failure; buckets 1..n mirror p.outcomes in order. The last threshold is
  // forced to 1 so a share-sum that doesn't add to exactly 100% (e.g. mid-edit) can't
  // leave a gap no draw lands in.
  const th=[p.sh0]; p.outcomes.forEach(o=>th.push(th[th.length-1]+o.share)); th[th.length-1]=1;
  const nBuckets=p.outcomes.length+1;
  const draw=count=>{const c=new Array(nBuckets).fill(0);for(let i=0;i<count;i++){const u=rnd();let b=nBuckets-1;for(let k=0;k<th.length;k++){if(u<th[k]){b=k;break}}c[b]++}return c};

  const paidT=[];for(let t=0;t<N;t++)paidT[t]=mg(t)+(t===0?d.checkPool:0)+(t===p.foYear?d.foReserve:0);

  const resT=[],resK=[],irrT=[],irrK=[];
  for(let r=0;r<runs;r++){
    const cT=draw(NT), cK=draw(NK);

    const distT=new Array(N).fill(0);
    p.outcomes.forEach((o,i)=>{if(o.exit<N) distT[o.exit]+=cT[i+1]*p.checkT*o.mult});
    if(p.foExit<N)distT[p.foExit]+=d.foReserve*p.foMult;
    let cgd=0,lpcPrev=0;const netT=new Array(N);
    for(let t=0;t<N;t++){cgd+=distT[t];const lpc=wf(cgd);netT[t]=(lpc-lpcPrev)-paidT[t];lpcPrev=lpc}
    resT.push(p.F?lpcPrev/p.F:0);
    irrT.push(irr(netT));

    const redeemedK=cK[0]*p.redRate, convertedK=NK-redeemedK;
    const totalFees=d.licence+convertedK*d.feePerPos*p.dConv+redeemedK*d.feePerPos*p.dRed;
    const foReserveK=Math.max(0,d.foReserve-totalFees);
    const recovered=redeemedK*p.optK;
    const recycled=recovered*p.recShare;
    const distFromRed=recovered-recycled;

    const paidK=new Array(N).fill(0), distK=new Array(N).fill(0);
    for(let t=0;t<N;t++){
      const a=mg(t), b=(t===0?d.checkPool+d.licence:0)+(t===p.foYear?foReserveK:0);
      const fee=(t>=1&&t<=p.dConv?convertedK*d.feePerPos:0)+(t>=1&&t<=p.dRed?redeemedK*d.feePerPos:0);
      paidK[t]=a+b+fee;
    }
    p.outcomes.forEach((o,i)=>{if(o.exit<N) distK[o.exit]+=cK[i+1]*d.checkK*o.mult/(1+p.premium)});
    if(p.dRed<N)distK[p.dRed]+=distFromRed;
    if(p.foExit<N)distK[p.foExit]+=(foReserveK+recycled)*p.foMult;
    cgd=0;lpcPrev=0;const netK=new Array(N);
    for(let t=0;t<N;t++){cgd+=distK[t];const lpc=wf(cgd);netK[t]=(lpc-lpcPrev)-paidK[t];lpcPrev=lpc}
    resK.push(p.F?lpcPrev/p.F:0);
    irrK.push(irr(netK));
  }

  const st=(a,ia)=>{const b=a.slice().sort((x,y)=>x-y),q=f=>b[Math.min(b.length-1,Math.floor(f*b.length))];
    const vi=ia.filter(v=>!isNaN(v));
    return {mean:a.reduce((x,y)=>x+y,0)/a.length,p10:q(.1),p50:q(.5),p90:q(.9),loss:a.filter(v=>v<1).length/a.length,arr:a,
      irrMean:vi.length?vi.reduce((x,y)=>x+y,0)/vi.length:NaN};
  };
  return {T:st(resT,irrT),K:st(resK,irrK),runs,NT,NK};
}
