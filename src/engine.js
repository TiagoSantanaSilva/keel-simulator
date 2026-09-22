// Pure model engine: no DOM access. Every function is deterministic
// (the Monte Carlo uses a seeded RNG), so results are reproducible and testable.
// Mirrors Keel_Fund_Model.xlsx (Inputs + Fund Model tabs). See docs/model-spec.md.
//
// Years are 0-indexed and mean "years after the initial check" directly: index t
// is the year in which an input like `foYear` or `ex1` fires. YR holds the
// 1-based labels shown in the UI (YR[t] === t+1), matching the workbook's own
// year numbering, where "year 1" is the year of the initial checks.
export const YR = [1,2,3,4,5,6,7,8,9,10,11,12];

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
  d.successT=d.NT*p.checkT*(p.sh1*p.mul1+p.sh2*p.mul2+p.sh3*p.mul3+p.sh4*p.mul4);
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
  d.recovered=d.redeemedK*p.optK*(1+p.yld*p.yldInv*p.dRed);
  d.recycled=d.recovered>0?Math.min(d.recovered*p.recShare,p.F*p.recCap):0;
  d.distFromRed=d.recovered-d.recycled;
  d.successK=d.NK*d.checkK*(p.sh1*p.mul1+p.sh2*p.mul2+p.sh3*p.mul3+p.sh4*p.mul4);
  d.grossK=d.successK/(1+p.premium)+d.foReserveK*p.foMult+d.distFromRed+d.recycled*p.recMult;
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
  o.irrToDate=[]; for(let i=0;i<N;i++) o.irrToDate[i]=irr(o.net.slice(0,i+1));
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
    if(t===p.ex1) e+=d.NT*p.checkT*p.sh1*p.mul1;
    if(t===p.ex2) e+=d.NT*p.checkT*p.sh2*p.mul2;
    if(t===p.ex3) e+=d.NT*p.checkT*p.sh3*p.mul3;
    if(t===p.ex4) e+=d.NT*p.checkT*p.sh4*p.mul4;
    if(t===p.foExit) e+=d.foReserve*p.foMult;
    R(T,"Exits",t,e);
    T.dist[t]=e;

    let n=0;
    if(t<p.ex1) n+=d.NT*p.checkT*p.sh1;
    if(t<p.ex2) n+=d.NT*p.checkT*p.sh2;
    if(t<p.ex3) n+=d.NT*p.checkT*p.sh3;
    if(t<p.ex4) n+=d.NT*p.checkT*p.sh4;
    if(t>=p.foYear&&t<p.foExit) n+=d.foReserve;
    T.nav[t]=n;

    // ---- SAFE + Option ----
    a=mg(t); b=(t===0?d.checkPool:0)+(t===p.foYear?d.foReserveK:0);
    const fee=(t===0?d.licence:0)+(t>=1&&t<=p.dConv?d.convertedK*d.feePerPos:0)+(t>=1&&t<=p.dRed?d.redeemedK*d.feePerPos:0);
    R(K,"Management fees called",t,a); R(K,"Capital called for investments",t,b); R(K,"Keel fees",t,fee);
    K.paid[t]=a+b+fee;

    e=0;
    if(t===p.ex1) e+=d.NK*d.checkK*p.sh1*p.mul1/(1+p.premium);
    if(t===p.ex2) e+=d.NK*d.checkK*p.sh2*p.mul2/(1+p.premium);
    if(t===p.ex3) e+=d.NK*d.checkK*p.sh3*p.mul3/(1+p.premium);
    if(t===p.ex4) e+=d.NK*d.checkK*p.sh4*p.mul4/(1+p.premium);
    if(t===p.dRed) e+=d.distFromRed;
    if(t===p.foExit) e+=d.foReserveK*p.foMult;
    if(t===p.recExit) e+=d.recycled*p.recMult;
    R(K,"Exits and redemptions",t,e);
    R(K,"Recycled into winners' next Series A",t,t===p.recExit?d.recycled*p.recMult:0);
    K.dist[t]=e;

    n=0;
    if(t<p.ex1) n+=d.NK*d.checkK*p.sh1;
    if(t<p.ex2) n+=d.NK*d.checkK*p.sh2;
    if(t<p.ex3) n+=d.NK*d.checkK*p.sh3;
    if(t<p.ex4) n+=d.NK*d.checkK*p.sh4;
    if(t<p.dRed) n+=d.redeemedK*p.optK;
    if(t>=p.foYear&&t<p.foExit) n+=d.foReserveK;
    if(t>=p.dRed&&t<p.recExit) n+=d.recycled;
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
  const th=[p.sh0,p.sh0+p.sh1,p.sh0+p.sh1+p.sh2,p.sh0+p.sh1+p.sh2+p.sh3,1];
  const draw=count=>{const c=[0,0,0,0,0];for(let i=0;i<count;i++){const u=rnd();let b=4;for(let k=0;k<5;k++){if(u<th[k]){b=k;break}}c[b]++}return c};

  const paidT=[];for(let t=0;t<N;t++)paidT[t]=mg(t)+(t===0?d.checkPool:0)+(t===p.foYear?d.foReserve:0);

  const resT=[],resK=[],irrT=[],irrK=[];
  for(let r=0;r<runs;r++){
    const cT=draw(NT), cK=draw(NK);

    const distT=new Array(N).fill(0);
    if(p.ex1<N)distT[p.ex1]+=cT[1]*p.checkT*p.mul1;
    if(p.ex2<N)distT[p.ex2]+=cT[2]*p.checkT*p.mul2;
    if(p.ex3<N)distT[p.ex3]+=cT[3]*p.checkT*p.mul3;
    if(p.ex4<N)distT[p.ex4]+=cT[4]*p.checkT*p.mul4;
    if(p.foExit<N)distT[p.foExit]+=d.foReserve*p.foMult;
    let cgd=0,lpcPrev=0;const netT=new Array(N);
    for(let t=0;t<N;t++){cgd+=distT[t];const lpc=wf(cgd);netT[t]=(lpc-lpcPrev)-paidT[t];lpcPrev=lpc}
    resT.push(p.F?lpcPrev/p.F:0);
    irrT.push(irr(netT));

    const redeemedK=cK[0]*p.redRate, convertedK=NK-redeemedK;
    const totalFees=d.licence+convertedK*d.feePerPos*p.dConv+redeemedK*d.feePerPos*p.dRed;
    const foReserveK=Math.max(0,d.foReserve-totalFees);
    const recovered=redeemedK*p.optK*(1+p.yld*p.yldInv*p.dRed);
    const recycled=recovered>0?Math.min(recovered*p.recShare,p.F*p.recCap):0;
    const distFromRed=recovered-recycled;

    const paidK=new Array(N).fill(0), distK=new Array(N).fill(0);
    for(let t=0;t<N;t++){
      const a=mg(t), b=(t===0?d.checkPool+d.licence:0)+(t===p.foYear?foReserveK:0);
      const fee=(t>=1&&t<=p.dConv?convertedK*d.feePerPos:0)+(t>=1&&t<=p.dRed?redeemedK*d.feePerPos:0);
      paidK[t]=a+b+fee;
    }
    if(p.ex1<N)distK[p.ex1]+=cK[1]*d.checkK*p.mul1/(1+p.premium);
    if(p.ex2<N)distK[p.ex2]+=cK[2]*d.checkK*p.mul2/(1+p.premium);
    if(p.ex3<N)distK[p.ex3]+=cK[3]*d.checkK*p.mul3/(1+p.premium);
    if(p.ex4<N)distK[p.ex4]+=cK[4]*d.checkK*p.mul4/(1+p.premium);
    if(p.dRed<N)distK[p.dRed]+=distFromRed;
    if(p.foExit<N)distK[p.foExit]+=foReserveK*p.foMult;
    if(p.recExit<N)distK[p.recExit]+=recycled*p.recMult;
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

export const STRONG_MULTS=[5,10,15,20,30], OUTLIER_MULTS=[25,50,100,150,250,500];
export function grid(S){const g=[];STRONG_MULTS.forEach(a=>{const row=[];OUTLIER_MULTS.forEach(b=>{const r=run(Object.assign({},S,{mul3:a,mul4:b}));row.push({T:r.T.TVPI,K:r.K.TVPI})});g.push(row)});return g}
