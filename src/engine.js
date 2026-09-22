// Pure model engine: no DOM access. Every function is deterministic
// (the Monte Carlo uses a seeded RNG), so results are reproducible and testable.
// See docs/model-spec.md for the definitions behind each formula.
export const YR = [0,1,2,3,4,5,6,7,8,9,10], YA = 3;
export function lin(t,t0,t1,v0,v1){return (t>=t0&&t<t1)?v0+(v1-v0)*(t-t0)/(t1-t0):0}
export function irr(cf){
  const npv=r=>cf.reduce((a,c,i)=>a+c/Math.pow(1+r,i),0);
  let best=NaN;
  for(let r=-0.95;r<3;r+=0.005){const a=npv(r),b=npv(r+0.005);
    if(a===0) {best=r;break}
    if(a*b<0){let lo=r,hi=r+0.005;for(let i=0;i<60;i++){const m=(lo+hi)/2;(npv(lo)*npv(m)<=0)?hi=m:lo=m}
      const root=(lo+hi)/2; if(isNaN(best)||Math.abs(root)<Math.abs(best)) best=root}}
  return best;
}
export function derive(p){
  const d={}; d.I=p.F*(1-p.MF*p.MFY); d.Chk=p.U+p.P; const pr=1+p.prem;
  d.pF=Math.max(0,1-p.pOk-p.pOut); d.pW=p.pOk+p.pOut;
  const d3=Math.pow(1-p.Dil,1+p.NL), d2=Math.pow(1-p.Dil,p.NL);
  d.own=d.Chk/p.V; d.ownK=d.own/pr;
  d.mSok=p.EOk/p.V*d3; d.mSout=p.EOut/p.V*d3; d.mSokK=d.mSok/pr; d.mSoutK=d.mSout/pr;
  d.mAok=p.EOk/p.AOk*d2; d.mAout=p.EOut/p.AOut*d2;
  d.mkok=(1-p.Dil)*p.AOk/p.V; d.mkout=(1-p.Dil)*p.AOut/p.V;
  d.PRok=d.own*p.Dil*p.AOk; d.PRout=d.own*p.Dil*p.AOut; d.PRokK=d.PRok/pr; d.PRoutK=d.PRout/pr;
  d.Rpc=p.pOk*d.PRok+p.pOut*d.PRout; d.RpcK=p.pOk*d.PRokK+p.pOut*d.PRoutK;
  d.bal3=d.pF*(1-p.c2f-p.r2f)+d.pW*(1-p.c2w-p.r2w);
  d.Fpc=p.kfee*p.P*(2+d.bal3);
  d.NT=d.I/(d.Chk+d.Rpc); d.NK=d.I/(d.Chk+d.RpcK+d.Fpc);
  d.SW=p.U+p.P*(1-p.r2w);
  d.R2=d.NK*p.P*(d.pF*p.r2f+d.pW*p.r2w); d.R3=d.NK*p.P*d.pF*(1-p.c2f-p.r2f); d.R=d.R2+d.R3;
  d.Rec=d.pW>0?Math.min(d.R*p.recShare,p.recCap*p.F):0; d.DistR=d.R-d.Rec; d.KF=d.NK*d.Fpc;
  d.WInv=d.I*p.wAlloc; d.WRet=d.I-d.WInv;
  d.ys=[]; for(let y=Math.min(p.yO1,p.yO2);y<=Math.max(p.yO1,p.yO2);y++) d.ys.push(y); d.w=1/d.ys.length;
  return d;
}
export function metrics(p,paid,dist,nav,invd){
  const o={paid,dist,nav,invd,cpaid:[],cgd:[],lpc:[],lpd:[],net:[],cnet:[],tv:[],lptv:[],dpi:[],rvpi:[],tvpi:[],moic:[]};
  const wf=x=>Math.min(x,p.F)+(1-p.carry)*Math.max(0,x-p.F);
  YR.forEach((t,i)=>{
    o.cpaid[i]=(i?o.cpaid[i-1]:0)+paid[i]; o.cgd[i]=(i?o.cgd[i-1]:0)+dist[i];
    o.lpc[i]=wf(o.cgd[i]); o.lpd[i]=o.lpc[i]-(i?o.lpc[i-1]:0); o.net[i]=o.lpd[i]-paid[i];
    o.cnet[i]=(i?o.cnet[i-1]:0)+o.net[i]; o.tv[i]=o.cgd[i]+nav[i]; o.lptv[i]=wf(o.tv[i]);
    o.dpi[i]=o.cpaid[i]?o.lpc[i]/o.cpaid[i]:0; o.rvpi[i]=o.cpaid[i]?(o.lptv[i]-o.lpc[i])/o.cpaid[i]:0;
    o.tvpi[i]=o.cpaid[i]?o.lptv[i]/o.cpaid[i]:0; o.moic[i]=invd[i]?o.tv[i]/invd[i]:0;
  });
  o.irr=irr(o.net); const L=YR.length-1;
  o.TVPI=o.tvpi[L]; o.MOIC=o.moic[L];
  return o;
}
export function run(p){
  const d=derive(p), mg=t=>t<p.MFY?p.F*p.MF:0;
  const T={paid:[],dist:[],nav:[],invd:[],rows:{}}, K={paid:[],dist:[],nav:[],invd:[],rows:{}}, W={paid:[],dist:[],nav:[],invd:[],rows:{}};
  const R=(o,k,i,v)=>{(o.rows[k]=o.rows[k]||[])[i]=v};
  YR.forEach((t,i)=>{
    // Traditional
    let a=mg(t), b=t===0?d.NT*d.Chk:0, c=t===YA?d.NT*d.Rpc:0;
    R(T,"Management fees",i,a);R(T,"Seed investments",i,b);R(T,"Series A pro-rata",i,c); T.paid[i]=a+b+c;
    let e1=t===p.YOk?d.NT*p.pOk*(d.Chk*d.mSok+d.PRok*d.mAok):0, e2=0;
    d.ys.forEach(y=>{if(t===y)e2+=d.NT*p.pOut*d.w*(d.Chk*d.mSout+d.PRout*d.mAout)});
    R(T,"Exits: 'ok' companies",i,e1);R(T,"Exits: outliers",i,e2); T.dist[i]=e1+e2;
    let n=t<YA?d.NT*d.Chk:0;
    n+=lin(t,YA,p.YOk,d.NT*p.pOk*d.Chk*d.mkok,d.NT*p.pOk*d.Chk*d.mSok)+lin(t,YA,p.YOk,d.NT*p.pOk*d.PRok,d.NT*p.pOk*d.PRok*d.mAok);
    d.ys.forEach(y=>{n+=lin(t,YA,y,d.NT*p.pOut*d.w*d.Chk*d.mkout,d.NT*p.pOut*d.w*d.Chk*d.mSout)+lin(t,YA,y,d.NT*p.pOut*d.w*d.PRout,d.NT*p.pOut*d.w*d.PRout*d.mAout)});
    T.nav[i]=n; T.invd[i]=d.NT*d.Chk+(t>=YA?d.NT*d.Rpc:0);
    // Keel
    const pr=1+p.prem;
    a=mg(t); b=t===0?d.NK*d.Chk:0; c=t===YA?d.NK*d.RpcK:0;
    const fe=(t===1||t===2)?d.NK*p.P*p.kfee:(t===3?d.NK*p.P*p.kfee*d.bal3:0);
    R(K,"Management fees",i,a);R(K,"Seed investments (upfront + protected)",i,b);R(K,"Series A pro-rata",i,c);R(K,"Keel fees",i,fe);
    K.paid[i]=a+b+c+fe;
    const recOk=d.Rec*(p.pOut>0?1-p.recOut:1), recOut=d.Rec*(p.pOut>0?p.recOut:0);
    e1=t===p.YOk?d.NK*p.pOk*(d.SW*d.mSokK+d.PRokK*d.mAok)+recOk*d.mAok:0; e2=0;
    d.ys.forEach(y=>{if(t===y)e2+=d.NK*p.pOut*d.w*(d.SW*d.mSoutK+d.PRoutK*d.mAout)+recOut*d.w*d.mAout});
    const e3=t===YA?d.DistR:0;
    R(K,"Exits: 'ok' companies (incl. recycled)",i,e1);R(K,"Exits: outliers (incl. recycled)",i,e2);R(K,"Recovered capital paid to LPs",i,e3);
    K.dist[i]=e1+e2+e3;
    n=t<YA?d.NK*d.Chk:0;
    n+=lin(t,YA,p.YOk,d.NK*p.pOk*d.SW*d.mkok/pr,d.NK*p.pOk*d.SW*d.mSokK)+lin(t,YA,p.YOk,d.NK*p.pOk*d.PRokK+recOk,(d.NK*p.pOk*d.PRokK+recOk)*d.mAok);
    d.ys.forEach(y=>{n+=lin(t,YA,y,d.NK*p.pOut*d.w*d.SW*d.mkout/pr,d.NK*p.pOut*d.w*d.SW*d.mSoutK)+lin(t,YA,y,d.NK*p.pOut*d.w*d.PRoutK+recOut*d.w,(d.NK*p.pOut*d.w*d.PRoutK+recOut*d.w)*d.mAout)});
    K.nav[i]=n; K.invd[i]=d.NK*d.Chk+(t>=YA?d.NK*d.RpcK+d.Rec:0);
    // Waiting
    a=mg(t); b=t===YA?d.I:0; R(W,"Management fees",i,a);R(W,"Series A investments",i,b); W.paid[i]=a+b;
    const qok=d.pW?p.pOk/d.pW:0,qout=d.pW?p.pOut/d.pW:0;
    e1=t===p.YOk?d.WInv*qok*d.mAok:0; e2=0; d.ys.forEach(y=>{if(t===y)e2+=d.WInv*qout*d.w*d.mAout});
    const e4=t===YA?d.WRet:0;
    R(W,"Exits: 'ok' companies",i,e1);R(W,"Exits: outliers",i,e2);R(W,"Unplaced capital returned",i,e4); W.dist[i]=e1+e2+e4;
    n=lin(t,YA,p.YOk,d.WInv*qok,d.WInv*qok*d.mAok); d.ys.forEach(y=>{n+=lin(t,YA,y,d.WInv*qout*d.w,d.WInv*qout*d.w*d.mAout)});
    W.nav[i]=n; W.invd[i]=t>=YA?d.WInv:0;
  });
  const out={d,p};
  [["T",T],["K",K],["W",W]].forEach(([k,o])=>{out[k]=Object.assign(metrics(p,o.paid,o.dist,o.nav,o.invd),{rows:o.rows})});
  out.lossT=d.NT*d.pF*d.Chk; out.lossK=d.NK*d.pF*(p.U+p.P*p.c2f); out.recK=d.NK*d.pF*p.P*(1-p.c2f);
  return out;
}

// ---------------- Monte Carlo ----------------
export function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function monte(p,runs){
  const d=derive(p), rnd=rng(42), NT=Math.max(1,Math.round(d.NT)), NK=Math.max(1,Math.round(d.NK)), N=Math.max(NT,NK);
  const wf=x=>(Math.min(x,p.F)+(1-p.carry)*Math.max(0,x-p.F))/p.F, pr=1+p.prem;
  const nW=Math.max(1,Math.round(d.WInv/d.Chk)), wChk=d.WInv/nW, qout=d.pW?p.pOut/d.pW:0;
  const res={T:[],K:[],W:[]};
  for(let r=0;r<runs;r++){
    const ty=new Array(N); for(let i=0;i<N;i++){const u=rnd(); ty[i]=u<p.pOut?2:(u<p.pOut+p.pOk?1:0)}
    // traditional
    let seed=0,need=0,prv=0,ok=0,outc=0;
    for(let i=0;i<NT;i++){if(ty[i]===1){seed+=d.Chk*d.mSok;need+=d.PRok;prv+=d.PRok*d.mAok}else if(ty[i]===2){seed+=d.Chk*d.mSout;need+=d.PRout;prv+=d.PRout*d.mAout}}
    let resv=d.I-NT*d.Chk, s=need>0?Math.min(1,resv/need):0;
    res.T.push(wf(seed+prv*s+(resv-need*s)));
    // keel
    seed=0;need=0;prv=0;let R=0,fees=0;ok=0;outc=0;
    for(let i=0;i<NK;i++){const t=ty[i];
      if(t===0){R+=p.P*(1-p.c2f);fees+=p.kfee*p.P*(2+(1-p.c2f-p.r2f))}
      else{R+=p.P*p.r2w;fees+=p.kfee*p.P*(2+(1-p.c2w-p.r2w));
        if(t===1){ok++;seed+=d.SW*d.mSokK;need+=d.PRokK;prv+=d.PRokK*d.mAok}else{outc++;seed+=d.SW*d.mSoutK;need+=d.PRoutK;prv+=d.PRoutK*d.mAout}}}
    resv=d.I-NK*d.Chk-fees; s=need>0?Math.min(1,Math.max(0,resv)/need):0;
    let rec=(ok+outc)>0?Math.min(R*p.recShare,p.recCap*p.F):0, recRet=0;
    if(rec>0){const so=outc>0?(ok>0?p.recOut:1):0; recRet=rec*(so*d.mAout+(1-so)*d.mAok)}
    res.K.push(wf(seed+prv*s+Math.max(0,resv-need*s)+recRet+(R-rec)));
    // waiting
    let wv=0; for(let i=0;i<nW;i++){wv+=wChk*(rnd()<qout?d.mAout:d.mAok)}
    res.W.push(wf(wv+d.WRet));
  }
  const st=a=>{const b=a.slice().sort((x,y)=>x-y),q=f=>b[Math.min(b.length-1,Math.floor(f*b.length))];
    return {mean:a.reduce((x,y)=>x+y,0)/a.length,p10:q(.1),p50:q(.5),p90:q(.9),loss:a.filter(v=>v<1).length/a.length,arr:a}};
  return {T:st(res.T),K:st(res.K),W:st(res.W),runs,NT,NK};
}

export const OKS=[30e6,50e6,75e6,100e6,150e6,200e6], OUTS=[100e6,250e6,500e6,1e9,2e9];
export function grid(S){const g=[];OKS.forEach(a=>{const row=[];OUTS.forEach(b=>{const r=run(Object.assign({},S,{EOk:a,EOut:b}));row.push({T:r.T.TVPI,K:r.K.TVPI,W:r.W.TVPI})});g.push(row)});return g}
