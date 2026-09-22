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
  ["sh1", "mul1", "ex1", "Returns capital"],
  ["sh2", "mul2", "ex2", "Solid outcome"],
  ["sh3", "mul3", "ex3", "Strong outcome"],
  ["sh4", "mul4", "ex4", "Outlier"],
];

export const G = [
 {id:"fund",section:"shared",title:"Fund",open:true,f:[
  ["F","Fund size",10e6,300e6,5e6,"usd"],
  ["MFY","Management fee period (years)",5,12,1,"n"],
  ["MF","Management fee (annual)",0,.05,.0025,"pct"],
  ["carry","Carried interest",0,.3,.05,"pct"],
  ["checksPerMonth","Checks written per month",1,20,1,"n","For context only. The model treats all initial checks as written in year 1 either way (a single vintage, matching the workbook) — see the deployment pace shown below."]]},
 {id:"out",section:"shared",title:"Outcomes (same companies, both strategies)",open:true,f:[]},
 {id:"fo",section:"shared",title:"Follow-on reserve (same for both strategies)",f:[
  ["reserve","Follow-on reserve (% of investable capital)",0,.5,.01,"pct","Held back by both strategies, so the comparison is fair. This is why it moves both sides' numbers."],
  ["foMult","Follow-on multiple (gross)",1,6,.25,"x","Same for both strategies."],
  ["foYear","Follow-ons deployed (years after initial check)",0,6,1,"yr"],
  ["foExit","Follow-ons exit (years after initial check)",1,11,1,"yr"]]},

 {id:"checkT",section:"T",title:"Check size",open:true,f:[
  ["checkT","SAFE only: check size",50e3,3e6,25e3,"usd","The whole check. Unprotected."]]},

 {id:"checks",section:"K",title:"Initial checks",open:true,f:[
  ["safeK","SAFE amount",0,3e6,25e3,"usd","The unprotected part of the check. Lost in full on failure."],
  ["optK","Option amount",0,3e6,25e3,"usd","The protected part. Redeemable if the company fails, converts if it succeeds."],
  ["premium","Valuation premium on Option rounds",0,.4,.01,"pct","0% = same price as a normal round."],
  ["roundVal","Round valuation (post-money)",1e6,100e6,500e3,"usd","For context only — doesn't affect returns. Used to show the founder's dilution."],
  ["totalOpt","Total Option amount in the round",0,10e6,50e3,"usd","Across every protected investor, not just this fund. For the founder view."]]},
 {id:"dec",section:"K",title:"Keel decisions",open:true,f:[
  ["redRate","Redemption rate (failures redeemed before converting)",0,1,.05,"pct","Most important unknown."],
  ["dConv","Years protected before converting (winners)",0,3,1,"n"],
  ["dRed","Years protected before redeeming (failures)",0,3,1,"n"]]},
 {id:"yld",section:"K",title:"Reserve yield",f:[
  ["yld","Reserve yield (annual)",0,.12,.005,"pct"],
  ["yldInv","Share of reserve yield paid to the investor",0,1,.05,"pct","Conservative default 0%: the rest goes to the company."]]},
 {id:"rec",section:"K",title:"Recycling",f:[
  ["recShare","Share of recovered capital recycled into follow-ons",0,1,.05,"pct","Into winners' next Series A. The rest is distributed to LPs."],
  ["recCap","Recycling cap (% of fund size)",0,.4,.01,"pct","The most that can be recycled into follow-ons, as a share of the whole fund — even if more is recovered from failures, anything above the cap goes straight to LPs instead."],
  ["recMult","Multiple on recycled capital (gross)",1,6,.25,"x"],
  ["recExit","Recycled capital exits (years after initial check)",1,11,1,"yr","Must be later than the redemption year."]]},
 {id:"pricing",section:"K",title:"Keel pricing",f:[
  ["keelFee","Reserve fee paid by the fund (annual)",0,.05,.0025,"pct2","Charged on the protected (Option) balance, while it's protected."]]},
];
export const DEF = {F:50e6,MFY:10,MF:.02,carry:.2,checksPerMonth:8,
  checkT:500e3,safeK:0,optK:500e3,premium:0,roundVal:10e6,totalOpt:1e6,
  reserve:.2,foMult:3,foYear:2,foExit:7,
  sh0:.7,sh1:0,mul1:1,ex1:5,sh2:.2,mul2:3,ex2:6,sh3:.08,mul3:10,ex3:7,sh4:.02,mul4:50,ex4:8,
  redRate:.75,dConv:2,dRed:3,
  yld:.04,yldInv:0,
  recShare:.5,recCap:.15,recMult:3,recExit:8,
  keelFee:.025};
export const PRESETS = {
 "Your base case": {},
 "Higher redemption rate": {redRate:.9},
 "Bigger power-law year": {sh3:.1,mul3:15,sh4:.03,mul4:75},
 "Harsh market": {sh0:.85,sh2:.1,sh3:.04,sh4:.01}
};
