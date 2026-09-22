// Inputs schema, defaults and presets. Values are plain numbers (0.2 = 20%).
// Mirrors Keel_Fund_Model.xlsx (Inputs tab). Years are "years after the initial check" throughout.
export const G = [
 {id:"fund",title:"Fund",open:true,f:[
  ["F","Fund size",10e6,300e6,5e6,"usd"],
  ["MFY","Management fee period (years)",5,12,1,"n"],
  ["MF","Management fee (annual)",0,.05,.0025,"pct"],
  ["carry","Carried interest",0,.3,.05,"pct"]]},
 {id:"checks",title:"Initial checks",open:true,f:[
  ["checkT","SAFE only: check size",50e3,3e6,25e3,"usd","The whole check for the SAFE-only strategy. Unprotected."],
  ["safeK","SAFE + Option: SAFE amount",0,3e6,25e3,"usd","The unprotected part of the check. Lost in full on failure."],
  ["optK","SAFE + Option: Option amount",0,3e6,25e3,"usd","The protected part. Redeemable if the company fails, converts if it succeeds."],
  ["premium","Valuation premium on Option rounds",0,.4,.01,"pct","0% = same price as a normal round."]]},
 {id:"fo",title:"Follow-on reserve",f:[
  ["reserve","Follow-on reserve (% of investable capital)",0,.5,.01,"pct","Held back by both strategies for follow-ons."],
  ["foMult","Follow-on multiple (gross)",1,6,.25,"x","Same for both strategies."],
  ["foYear","Follow-ons deployed (years after initial check)",0,6,1,"yr"],
  ["foExit","Follow-ons exit (years after initial check)",1,11,1,"yr"]]},
 {id:"out",title:"Outcomes",open:true,f:[
  ["sh0","Failure (share of positions)",0,1,.01,"pct","Returns nothing in the SAFE-only strategy."],
  ["sh1","Returns capital (share)",0,.5,.01,"pct1"],
  ["mul1","Returns capital: multiple",0,3,.5,"x"],
  ["ex1","Returns capital: exit year",1,11,1,"yr"],
  ["sh2","Solid outcome (share)",0,.5,.01,"pct1"],
  ["mul2","Solid outcome: multiple",1,10,.5,"x"],
  ["ex2","Solid outcome: exit year",1,11,1,"yr"],
  ["sh3","Strong outcome (share)",0,.3,.01,"pct1"],
  ["mul3","Strong outcome: multiple",1,30,1,"x"],
  ["ex3","Strong outcome: exit year",1,11,1,"yr"],
  ["sh4","Outlier (share)",0,.1,.005,"pct1"],
  ["mul4","Outlier: multiple",1,200,1,"x"],
  ["ex4","Outlier: exit year",1,11,1,"yr"]]},
 {id:"dec",title:"Keel decisions",f:[
  ["redRate","Redemption rate (failures redeemed before converting)",0,1,.05,"pct","Most important unknown."],
  ["dConv","Years protected before converting (winners)",0,3,1,"n"],
  ["dRed","Years protected before redeeming (failures)",0,3,1,"n"]]},
 {id:"yld",title:"Reserve yield",f:[
  ["yld","Reserve yield (annual)",0,.12,.005,"pct"],
  ["yldInv","Share of reserve yield paid to the investor",0,1,.05,"pct","Conservative default 0%: the rest goes to the company."]]},
 {id:"rec",title:"Recycling",f:[
  ["recShare","Share of recovered capital recycled into follow-ons",0,1,.05,"pct","Into winners' next Series A. The rest is distributed to LPs."],
  ["recCap","Recycling cap (% of fund size)",0,.4,.01,"pct"],
  ["recMult","Multiple on recycled capital (gross)",1,6,.25,"x"],
  ["recExit","Recycled capital exits (years after initial check)",1,11,1,"yr","Must be later than the redemption year."]]},
 {id:"pricing",title:"Keel pricing",f:[
  ["licT1","Licence: first commitment below",100e3,3e6,50e3,"usd"],
  ["licT2","Licence: first commitment up to",100e3,5e6,50e3,"usd"],
  ["lic1","Licence fee: small tier",0,50e3,1e3,"usd"],
  ["lic2","Licence fee: mid tier",0,50e3,1e3,"usd"],
  ["lic3","Licence fee: large tier",0,50e3,1e3,"usd"],
  ["band1","Annual fee band 1 limit",100e3,5e6,50e3,"usd"],
  ["band2","Annual fee band 2 limit",100e3,10e6,50e3,"usd"],
  ["rate1","Annual fee band 1 rate",0,.06,.0025,"pct2"],
  ["rate2","Annual fee band 2 rate",0,.06,.0025,"pct2"],
  ["rate3","Annual fee band 3 rate",0,.06,.0025,"pct2"],
  ["minFee","Minimum annual fee per position",0,20e3,500,"usd"]]},
];
export const DEF = {F:50e6,MFY:10,MF:.02,carry:.2,
  checkT:500e3,safeK:0,optK:500e3,premium:0,
  reserve:.2,foMult:3,foYear:2,foExit:7,
  sh0:.7,sh1:0,mul1:1,ex1:5,sh2:.2,mul2:3,ex2:6,sh3:.08,mul3:10,ex3:7,sh4:.02,mul4:50,ex4:8,
  redRate:.75,dConv:2,dRed:3,
  yld:.04,yldInv:0,
  recShare:.5,recCap:.15,recMult:3,recExit:8,
  licT1:500e3,licT2:2e6,lic1:5e3,lic2:10e3,lic3:15e3,
  band1:1e6,band2:3e6,rate1:.025,rate2:.0215,rate3:.0185,minFee:3e3};
export const PRESETS = {
 "Your base case": {},
 "Higher redemption rate": {redRate:.9},
 "Bigger power-law year": {sh3:.1,mul3:15,sh4:.03,mul4:75},
 "Harsh market": {sh0:.85,sh2:.1,sh3:.04,sh4:.01}
};
