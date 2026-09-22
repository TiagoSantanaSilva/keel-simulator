// Inputs schema, defaults and presets. Values are plain numbers (0.2 = 20%).
export const G = [
 {id:"fund",title:"Fund",open:true,f:[
  ["F","Fund size",10e6,300e6,5e6,"usd"],
  ["MF","Management fee (annual)",0,.03,.0025,"pct"],
  ["carry","Carried interest",0,.3,.05,"pct"]]},
 {id:"round",title:"Round, per company",open:true,f:[
  ["V","Valuation cap (post-money)",2e6,50e6,1e6,"usd"],
  ["U","Fund's upfront SAFE",100e3,3e6,50e3,"usd","Deployed at close, unprotected."],
  ["P","Fund's protected position",0,3e6,25e3,"usd","Its share of the protected deposit."],
  ["D","Total protected deposit in the round",0,10e6,100e3,"usd","Used for the founder view."],
  ["prem","Valuation premium on Keel rounds",0,.4,.01,"pct","0% = same price as a normal round."]]},
 {id:"keel",title:"Keel terms",f:[
  ["kfee","Keel fee on protected balance (annual)",0,.06,.0025,"pct2","Paid by the fund."],
  ["yld","Yield on the deposit, paid to the company",0,.12,.005,"pct"]]},
 {id:"out",title:"Outcomes",open:true,f:[
  ["pOk","'Ok' companies (raise a Series A)",0,.6,.01,"pct"],
  ["pOut","Outliers",0,.2,.005,"pct1","Everything else fails and is worth $0 in year 3."],
  ["AOk","Series A valuation, 'ok'",5e6,200e6,5e6,"usd"],
  ["AOut","Series A valuation, outliers",10e6,1e9,10e6,"usd"],
  ["EOk","Exit value, 'ok'",0,500e6,5e6,"usd"],
  ["YOk","Exit year, 'ok'",4,10,1,"yr"],
  ["EOut","Exit value, outliers",50e6,5e9,50e6,"usd"],
  ["yO1","Outliers exit from year",4,10,1,"yr"],
  ["yO2","Outliers exit until year",4,10,1,"yr"]]},
 {id:"dil",title:"Dilution",f:[
  ["Dil","Dilution per round",0,.35,.01,"pct"],
  ["NL","Rounds after the Series A",0,4,1,"n"]]},
 {id:"dec",title:"Keel decisions",f:[
  ["c2w","Year 2: converted in future winners",0,1,.05,"pct","Before the Series A, a partial signal."],
  ["r2w","Year 2: redeemed in future winners",0,1,.05,"pct","Mistakes that cost ownership."],
  ["c2f","Year 2: converted in future failures",0,1,.05,"pct","Mistakes: this capital is lost."],
  ["r2f","Year 2: redeemed in future failures",0,1,.05,"pct","In year 3 winners convert the rest, failures redeem the rest."]]},
 {id:"rec",title:"Recycling and waiting",f:[
  ["recShare","Recovered capital recycled",0,1,.05,"pct","Into winners' Series A. The rest goes to LPs."],
  ["recCap","Recycling cap (% of fund)",0,.4,.01,"pct"],
  ["recOut","Recycled capital into outliers",0,1,.01,"pct"],
  ["wAlloc","Waiting fund's Series A allocation",0,1,.05,"pct","Share of the capital it manages to place."]]},
];
export const DEF = {F:50e6,MF:.02,MFY:10,carry:.2,V:10e6,U:500e3,P:250e3,D:1e6,prem:0,kfee:.025,yld:.06,
  pOk:.18,pOut:.02,AOk:30e6,AOut:100e6,EOk:50e6,YOk:6,EOut:250e6,yO1:5,yO2:8,Dil:.2,NL:2,
  c2w:.3,r2w:0,c2f:.1,r2f:.3,recShare:1,recCap:.2,recOut:.27,wAlloc:1};
export const PRESETS = {
 "Your base case": {},
 "Typical seed market": {pOk:.25,pOut:.05,EOk:75e6,EOut:750e6},
 "Power-law year": {pOk:.2,pOut:.05,EOk:60e6,EOut:2e9},
 "Harsh market": {pOk:.12,pOut:.01,EOk:40e6,EOut:200e6}
};
