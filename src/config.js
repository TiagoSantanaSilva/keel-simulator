// Inputs schema, defaults and presets. Values are plain numbers (0.2 = 20%).
// Mirrors Keel_Fund_Model.xlsx (Inputs tab). Years are "years after the initial check" throughout.
//
// Every group carries a `section`: "shared" (applies identically to both strategies, so the
// comparison is fair), "T" (SAFE only) or "K" (SAFE + Keel). main.js renders a labelled,
// colour-coded header whenever the section changes.
//
// The "out" (Outcomes) group is rendered as a table (see main.js) instead of sliders, one
// row per outcome bucket with Share / Multiple / Exit year columns. OUTCOMES below drives
// that table; it is the source of truth for those fields, not the `f` array on group "out".
export const OUTCOMES = [
  ["sh0", null, null, "Failure", "Returns nothing in the SAFE-only strategy."],
  ["sh2", "mul2", "ex2", "Solid outcome"],
  ["sh3", "mul3", "ex3", "Strong outcome"],
  ["sh4", "mul4", "ex4", "Outlier"],
];

export const G = [
 {id:"fund",section:"shared",title:"Fund",open:true,f:[
  ["F","Fund size",10e6,300e6,5e6,"usd"],
  ["MFY","Management fee period (years)",5,12,1,"n"],
  ["MF","Management fee (annual)",0,.05,.0025,"pct"],
  ["carry","Carried interest",0,.3,.05,"pct"]]},
 {id:"out",section:"shared",title:"Outcomes (same companies, both strategies)",open:true,f:[]},
 {id:"fo",section:"shared",title:"Follow-on reserve (same for both strategies)",f:[
  ["reserve","Follow-on reserve (% of investable capital)",0,.5,.01,"pct"],
  ["foMult","Follow-on multiple (gross)",1,6,.25,"x"],
  ["foYear","Follow-ons deployed (years after initial check)",0,6,1,"yr"],
  ["foExit","Follow-ons exit (years after initial check)",1,11,1,"yr"]]},

 {id:"checkT",section:"T",title:"Check size",open:true,f:[
  ["checkT","SAFE only: check size",50e3,3e6,25e3,"usd"]]},

 {id:"checks",section:"K",title:"Initial checks",open:true,f:[
  ["safeK","SAFE amount",0,3e6,25e3,"usd"],
  ["optK","Convertible amount",0,3e6,25e3,"usd","The protected part. Redeemable if the company fails, converts if it succeeds."],
  ["premium","Valuation premium on convertible rounds",0,.4,.01,"pct","0% = same price as a normal round."],
  ["roundVal","Round valuation (post-money)",1e6,100e6,500e3,"usd"],
  ["totalOpt","Total convertible amount in the round",0,10e6,50e3,"usd","Across every protected investor, not just this fund. For the founder view."]]},
 {id:"dec",section:"K",title:"Keel decisions",open:true,f:[
  ["redRate","Redemption rate (failures redeemed before converting)",0,1,.05,"pct"],
  ["dConv","Years protected before converting (winners)",0,3,1,"n"],
  ["dRed","Years protected before redeeming (failures)",0,3,1,"n"]]},
 {id:"yld",section:"K",title:"Reserve yield",f:[
  ["yld","Reserve yield (annual)",0,.12,.005,"pct"]]},
 {id:"rec",section:"K",title:"Recycling",f:[
  ["recShare","Share of recovered capital recycled into follow-ons",0,1,.05,"pct","Into winners' next round. The rest is distributed to LPs."],
  ["recCap","Recycling cap (% of fund size)",0,.4,.01,"pct"],
  ["recMult","Multiple on recycled capital (gross)",1,6,.25,"x"],
  ["recExit","Recycled capital exits (years after initial check)",1,11,1,"yr"]]},
 {id:"pricing",section:"K",title:"Keel pricing",f:[
  ["keelFee","Reserve fee paid by the fund (annual)",0,.05,.0025,"pct2","Charged on the Keel reserve balance, while it's deployed."]]},
];
export const DEF = {F:50e6,MFY:10,MF:.02,carry:.2,
  checkT:500e3,safeK:0,optK:500e3,premium:0,roundVal:10e6,totalOpt:1e6,
  reserve:.2,foMult:3,foYear:2,foExit:7,
  sh0:.7,sh2:.2,mul2:3,ex2:6,sh3:.08,mul3:10,ex3:7,sh4:.02,mul4:50,ex4:8,
  redRate:.75,dConv:2,dRed:3,
  yld:.04,
  recShare:.5,recCap:.15,recMult:3,recExit:8,
  keelFee:.025};
