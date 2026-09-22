export const fmt = {
 usd:v=>{const a=Math.abs(v);const s=v<0?"-":"";if(a>=1e9)return s+"$"+(a/1e9).toFixed(a%1e9?2:0).replace(/\.?0+$/,"")+"B";if(a>=1e6)return s+"$"+(a/1e6).toFixed(1).replace(/\.0$/,"")+"M";if(a>=1e3)return s+"$"+Math.round(a/1e3)+"K";return s+"$"+Math.round(a)},
 usdFull:v=>(v<0?"-$":"$")+Math.round(Math.abs(v)).toLocaleString("en-US"),
 pct:v=>(v*100).toFixed(Math.abs(v*100)%1?1:0)+"%", pct1:v=>(v*100).toFixed(1)+"%", pct2:v=>(v*100).toFixed(2)+"%",
 x:v=>v.toFixed(2)+"x", dx:v=>(v>=0?"+":"")+v.toFixed(2)+"x", yr:v=>"Year "+v, n:v=>String(v)
};
