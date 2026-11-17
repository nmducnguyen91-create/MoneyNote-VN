/* MoneyNote VN — HOÀN TIỀN THẺ TÍN DỤNG (cashback). Dùng chung cho bản điện thoại và desktop.
 * Nguồn duy nhất: sửa ở app/moneynote-cashback.js rồi copy y nguyên sang desktop/ (và moneynote-github/ khi xuất).
 * Nạp SAU script chính (cần db, save, renderAll, switchPersonalTab, renderKpiStrip, lastStmtDate, stmtDateOf, fmtK của lõi).
 *
 * Dữ liệu: chính sách lưu trên từng thẻ  a.cashback = {
 *   period:'stmt'|'month'|'custom', startDay:N,        // kỳ hoàn: theo kỳ sao kê / tháng dương lịch / bắt đầu ngày N mỗi tháng
 *   cap:0,                                              // trần hoàn cả thẻ mỗi kỳ (0 = không trần)
 *   base:{rate:0,cap:0},                                // % hoàn cho danh mục khác (không thuộc nhóm nào, không bị loại trừ)
 *   rules:[{id,name,cats:[],rate,cap,min}],             // nhóm danh mục: % hoàn, trần nhóm, chi tối thiểu trong nhóm mới được hoàn
 *   conds:[{id,label,scope:'all'|'other'|'cats',cats:[],min}], // điều kiện của thẻ: chưa đạt → cả kỳ không được hoàn
 *   excl:[],                                            // danh mục không được hoàn, không tính vào chi tiêu đủ điều kiện
 *   target:0, note:'' }                                 // mục tiêu chi cá nhân mỗi kỳ, ghi chú chính sách
 * Lịch sử thực nhận: a.cbHist = [{id:'YYYY-MM-DD'(ngày bắt đầu kỳ), s, e, actual, at}]
 * Giao dịch tính hoàn: flow 'out', group khác 'company', account = thẻ, ngày trong kỳ hoàn, theo t.category.
 */
(function(){
'use strict';
const DESK=/desktop/i.test(location.pathname);
const T_TITLE=DESK?18:17;
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const dm=s=>s?s.slice(8,10)+'/'+s.slice(5,7):'';
const day0=d=>{d=d?new Date(d):new Date();d.setHours(0,0,0,0);return d};
const addDay=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const K=n=>{try{return fmtK(Math.round(+n||0))}catch(e){return String(Math.round(+n||0))}};
const num=v=>{const x=parseFloat(String(v==null?'':v).replace(',','.'));return isFinite(x)?x:0};
const money=v=>+String(v==null?'':v).replace(/\D/g,'')||0;
const moneyTxt=n=>n?new Intl.NumberFormat('vi-VN').format(Math.round(n)):'';
const pct=r=>String(+(+r||0).toFixed(2)).replace('.',',')+'%';
const uid=()=>'cb'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const cn=c=>String(c==null||c===''?'Khác':c).trim();
const sn=a=>String((a&&a.name)||'').replace(/^thẻ\s+/i,'').replace(/\s+bank$/i,'').trim()||String((a&&a.name)||'');   // tên gọn: "Thẻ VP Bank" → "VP"

/* ══ LÕI TÍNH ══ */
const ONLINE_KW_DEF=['xanh sm','green sm','tiktok','shopee','lazada','tiki','google','youtube','anthropic','claude','openai','chatgpt','zalopay','momo','grab','netflix','spotify','thế giới di động','thegioididong','tgdd','điện máy xanh'];
const fold=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
function normTiers(t){return (Array.isArray(t)?t:[]).map(x=>({min:+x.min||0,rate:+x.rate||0,cap:+x.cap||0})).filter(x=>x.min>0).sort((a,b)=>a.min-b.min)}
function cbPol(a){
  const c=a&&a.cashback;if(!c||typeof c!=='object')return null;
  const p={period:['stmt','month','custom'].includes(c.period)?c.period:'stmt',startDay:Math.min(31,Math.max(1,+c.startDay||1)),
    cap:+c.cap||0,base:{rate:+(c.base&&c.base.rate)||0,cap:+(c.base&&c.base.cap)||0},
    rules:(c.rules||[]).map(r=>({id:r.id||uid(),name:r.name||'',match:r.match==='online'?'online':'cats',cats:(r.cats||[]).map(cn),rate:+r.rate||0,cap:+r.cap||0,min:+r.min||0,tiers:normTiers(r.tiers)})),
    conds:(c.conds||[]).map(x=>({id:x.id||uid(),label:x.label||'',scope:['all','other','cats'].includes(x.scope)?x.scope:'all',cats:(x.cats||[]).map(cn),min:+x.min||0})),
    excl:(c.excl||[]).map(cn),target:+c.target||0,note:c.note||'',
    onlineKw:Array.isArray(c.onlineKw)?c.onlineKw.map(s=>String(s).trim()).filter(Boolean):ONLINE_KW_DEF.slice(),onlineCats:(c.onlineCats||[]).map(cn)};
  // dạng cũ (bản thử trước): cats:[{c,rate,cap}], special:[{label,scope,cats,min}]
  if(!p.rules.length&&Array.isArray(c.cats))p.rules=c.cats.map(r=>({id:uid(),name:'',match:'cats',cats:[cn(r.c)],rate:+r.rate||0,cap:+r.cap||0,min:0,tiers:[]}));
  if(!p.conds.length&&Array.isArray(c.special))p.conds=c.special.filter(s=>+s.min>0).map(s=>({id:uid(),label:s.label||'',scope:['all','other','cats'].includes(s.scope)?s.scope:'other',cats:(s.cats||[]).map(cn),min:+s.min||0}));
  p.ok=p.rules.some(r=>(r.rate>0||r.tiers.some(t=>t.rate>0))&&(r.match==='online'||r.cats.length))||p.base.rate>0;
  p.hasOnline=p.rules.some(r=>r.match==='online');
  return p;
}
// Giao dịch online: đánh dấu tay (t.online true/false) được ưu tiên; nếu chưa đánh dấu thì nhận theo từ khoá trong mô tả
function txText(t){return fold([t.desc,t.note,t.merchant,t.title].filter(Boolean).join(' '))}
function isOnline(t,p){if(t.online===true)return true;if(t.online===false)return false;if(p&&p.onlineCats&&p.onlineCats.includes(cn(t.category)))return true;const s=txText(t);if(!s)return false;return (p?p.onlineKw:ONLINE_KW_DEF).some(k=>{k=fold(k);return k&&s.includes(k)})}
function tierOf(r,base){let x={rate:r.rate,cap:r.cap,min:0,idx:-1};r.tiers.forEach((t,i)=>{if(base>=t.min)x={rate:t.rate,cap:t.cap,min:t.min,idx:i}});return x}
function cbPeriod(a,ref){
  const p=cbPol(a)||{period:'stmt'};const r=day0(ref);const y=r.getFullYear(),m=r.getMonth();let s,e;
  if(p.period==='month'){s=new Date(y,m,1);e=new Date(y,m+1,0)}
  else if(p.period==='custom'){const N=p.startDay||1;s=stmtDateOf(y,m,N);if(r<s)s=stmtDateOf(y,m-1,N);e=addDay(stmtDateOf(s.getFullYear(),s.getMonth()+1,N),-1)}
  else{const st=a.stDay||1;let c=stmtDateOf(y,m,st);if(r>c)c=stmtDateOf(y,m+1,st);e=c;s=addDay(stmtDateOf(c.getFullYear(),c.getMonth()-1,st),1)}
  const td=day0();return {s:iso(s),e:iso(e),daysLeft:Math.max(0,Math.round((e-td)/864e5)),current:td>=s&&td<=e};
}
function ruleLabel(r){return r.name||(r.match==='online'?'Chi tiêu trực tuyến':r.cats.join(', '))||'Nhóm danh mục'}
function scopeLabel(c){return c.scope==='other'?'lĩnh vực khác':c.scope==='cats'?(c.cats.join(', ')||'danh mục chọn'):'tổng chi tiêu'}
// Gán từng giao dịch vào nhóm: nhóm đầu tiên khớp (online hoặc danh mục) thắng; danh mục loại trừ chỉ áp khi giao dịch không thuộc nhóm online
function ruleIdxOf(t,p){const c=cn(t.category);for(let i=0;i<p.rules.length;i++){const r=p.rules[i];if(r.match==='online'?isOnline(t,p):r.cats.includes(c))return i}return p.excl.includes(c)?-2:-1}
function cbCalc(a,o){
  o=o||{};const p=cbPol(a);if(!p||!p.ok)return null;const per=cbPeriod(a,o.ref);
  const tx=(db.transactions||[]).filter(t=>t&&t.flow==='out'&&t.group!=='company'&&(t.account||'')===a.id&&(t.date||'')>=per.s&&(t.date||'')<=per.e&&(o.exclId==null||String(t.id)!==String(o.exclId)));
  const all=tx.concat((o.extra||[]).map(x=>({category:x.category,amount:+x.amount||0,online:x.online===true?true:x.online===false?false:undefined,_x:1})));
  const byCat={},rSp=p.rules.map(()=>0);let spent=0,other=0,exclSpent=0,onlineN=0;
  all.forEach(t=>{const v=+t.amount||0,c=cn(t.category),i=ruleIdxOf(t,p);if(i===-2){exclSpent+=v;return}
    spent+=v;byCat[c]=(byCat[c]||0)+v;if(i>=0){rSp[i]+=v;if(p.rules[i].match==='online'&&!t._x)onlineN++}else other+=v});
  const tierBase=spent+exclSpent+(+o.tierAdd||0);   // bậc tính theo tổng doanh số kỳ (gồm cả giao dịch không được hoàn)
  const rules=p.rules.map((r,i)=>{const sp=rSp[i],T=tierOf(r,tierBase);const rate=T.rate,cap=T.cap;
    const locked=r.min>0&&sp<r.min,raw=sp*rate/100,got=cap?Math.min(raw,cap):raw,earned=locked?0:got;
    const nx=r.tiers.find(t=>t.min>tierBase);
    return {id:r.id,label:ruleLabel(r),match:r.match,cats:r.cats,rate,cap,min:r.min,tier:T,next:nx||null,tiers:r.tiers,spent:sp,raw,earned,locked,need:locked?r.min-sp:0,
      remain:cap?Math.max(0,cap-got):null,full:!!cap&&raw>=cap}});
  const bRaw=other*p.base.rate/100,bEarn=p.base.cap?Math.min(bRaw,p.base.cap):bRaw;
  const base={rate:p.base.rate,cap:p.base.cap,spent:other,earned:bEarn,remain:p.base.cap?Math.max(0,p.base.cap-bEarn):null,full:!!p.base.cap&&bRaw>=p.base.cap};
  const conds=p.conds.map(c=>{const v=c.scope==='all'?spent:c.scope==='cats'?c.cats.filter(x=>!p.excl.includes(x)).reduce((s,x)=>s+(byCat[x]||0),0):other;
    return {id:c.id,label:c.label||((c.scope==='all'?'Tổng chi tiêu':c.scope==='other'?'Lĩnh vực khác':'Chi '+scopeLabel(c))+' ≥ '+K(c.min)),scope:c.scope,scopeTxt:scopeLabel(c),min:c.min,spent:v,met:v>=c.min,need:Math.max(0,c.min-v)}});
  const gross=rules.reduce((s,r)=>s+r.earned,0)+base.earned;
  const afterCap=p.cap?Math.min(gross,p.cap):gross;const qualified=conds.every(c=>c.met);
  const capRoom=p.cap?Math.max(0,p.cap-gross):Infinity;
  const maxPossible=p.cap||(p.rules.every(r=>r.cap)&&(!p.base.rate||p.base.cap)?rules.reduce((s,r)=>s+(r.cap||0),0)+(p.base.rate?p.base.cap:0):0);
  const total=qualified?afterCap:0;
  // Gợi ý "Nên làm"
  const tips=[];
  conds.filter(c=>!c.met).forEach(c=>tips.push({k:'cond',gain:afterCap||maxPossible,html:'chi thêm <b>'+K(c.need)+'</b>'+(c.scope==='all'?'':' cho <b>'+esc(c.scopeTxt)+'</b>')+' để đạt điều kiện <b>'+esc(c.label)+'</b>'+((afterCap||maxPossible)?' — điều kiện để nhận '+(afterCap?'':'tới ')+'<b>'+K(afterCap||maxPossible)+'</b>':'')+'.'}));
  // lên bậc: tổng doanh số đạt mốc kế tiếp → % và trần của các nhóm tăng
  if(!o.noTier){const mins=[...new Set(p.rules.flatMap(r=>r.tiers.map(t=>t.min)))].filter(m=>m>tierBase).sort((x,y)=>x-y);
    if(mins.length){const need=mins[0]-tierBase;const up=cbCalc(a,Object.assign({},o,{tierAdd:(+o.tierAdd||0)+need,noTier:1}));const g=up?up.total-total:0;
      if(g>0)tips.push({k:'tier',gain:g,html:'chi thêm <b>'+K(need)+'</b> để tổng chi kỳ này đạt <b>'+K(mins[0])+'</b> — lên bậc hoàn cao hơn, nhận thêm ~<b>'+K(g)+'</b> trên các khoản đã chi.'})}}
  if(capRoom>0){
    rules.forEach(r=>{if(r.rate<=0)return;
      if(r.locked){const g=Math.min(r.cap?Math.min(r.min*r.rate/100,r.cap):r.min*r.rate/100,capRoom);if(g>0)tips.push({k:'lock',gain:g,html:'chi thêm <b>'+K(r.need)+'</b> cho <b>'+esc(r.label)+'</b> để mở hoàn '+pct(r.rate)+' (nhận ~<b>'+K(g)+'</b>).'})}
      else if(r.remain>0){const g=Math.min(r.remain,capRoom);tips.push({k:'room',gain:g,html:'chi thêm <b>'+K(g/(r.rate/100))+'</b> cho <b>'+esc(r.label)+'</b> để nhận thêm <b>'+K(g)+'</b>.'})}});
  }else if(p.cap&&gross>=p.cap)tips.push({k:'capfull',gain:0,html:'đã đạt <b>trần hoàn của thẻ</b> ('+K(p.cap)+') — chi tiêu tiếp nên chuyển sang thẻ khác.'});
  tips.sort((x,y)=>(x.k==='cond'?-1:0)-(y.k==='cond'?-1:0)||y.gain-x.gain);
  return Object.assign({},per,{p,tx,txN:tx.length,byCat,spent,exclSpent,other,tierBase,onlineN,rules,base,conds,gross,afterCap,qualified,total,
    capRoom,cap:p.cap,maxPossible,target:p.target,tips});
}
// Thứ tự thẻ user chọn (17/11/2026): VP → VIB → Lion → MB; thẻ khác xếp sau theo thứ tự sẵn có
const CARD_ORDER=['vp','vib','lion','mb'];
function cardRank(a){const n=fold(String((a&&a.name)||'').replace(/^thẻ\s+/i,'').replace(/\s+bank$/i,'').trim());const i=CARD_ORDER.findIndex(k=>n===k||n.startsWith(k+' '));return i<0?99:i}
function cbCards(){return (db.accounts||[]).filter(a=>a.type==='credit'&&!a.hidden).map((a,i)=>[a,i]).sort((x,y)=>cardRank(x[0])-cardRank(y[0])||x[1]-y[1]).map(x=>x[0])}
function cbActive(){return cbCards().filter(a=>{const p=cbPol(a);return p&&p.ok})}
function cbTotalNow(){return cbActive().reduce((s,a)=>{const c=cbCalc(a);return s+(c?c.total:0)},0)}
const ONLINE_CAT='🌐 Online';
function cbSuggest(cat,amount){
  amount=+amount||0;const onl=cat===ONLINE_CAT;cat=onl?'Mua sắm':cn(cat);
  return cbActive().map(a=>{const ex={category:cat,amount,online:onl?true:false};const b=cbCalc(a),w=cbCalc(a,{extra:[ex]});
    const gain=Math.max(0,w.total-b.total),pot=Math.max(0,w.afterCap-b.afterCap);
    const ri=ruleIdxOf(ex,w.p);const r=ri>=0?w.rules[ri]:null;const excluded=ri===-2;
    const rate=excluded?0:r?r.rate:w.base.rate;let note='';
    if(excluded)note='Danh mục không được hoàn';
    else if(!w.qualified&&pot>0){const c=w.conds.find(x=>!x.met);note='Chưa đạt điều kiện: '+c.label+' (thiếu '+K(c.need)+')'}
    else if(r&&r.locked)note='Cần chi '+K(r.need)+' nữa cho nhóm '+r.label+' mới được hoàn';
    else if(rate>0&&gain<amount*rate/100-1)note=(w.capRoom===0||(w.cap&&w.gross>=w.cap))?'Gần/đã chạm trần thẻ':'Gần/đã chạm trần nhóm';
    if(r&&b.rules[ri]&&r.tier.idx>b.rules[ri].tier.idx)note='Khoản này giúp lên bậc '+pct(r.rate);
    if(!b.qualified&&w.qualified)note='Quẹt khoản này sẽ đủ điều kiện của thẻ';
    return {a,gain,pot,rate,note,eff:amount?gain/amount*100:0,per:w}}).sort((x,y)=>y.gain-x.gain||y.pot-x.pot||y.rate-x.rate);
}
function cbHistory(a,n){
  n=n||6;const out=[];let per=cbPeriod(a);const H=a.cbHist||[];
  for(let i=0;i<=n;i++){const c=cbCalc(a,{ref:per.s});const h=H.find(x=>x.id===per.s||x.s===per.s);
    out.push({s:per.s,e:per.e,current:i===0,est:c?c.total:0,spent:c?c.spent:0,actual:h&&h.actual!=null?+h.actual:null,note:h&&h.note||''});
    per=cbPeriod(a,addDay(new Date(per.s+'T00:00:00'),-1))}
  return out;
}
window.cbPol=cbPol;window.cbPeriod=cbPeriod;window.cbCalc=cbCalc;window.cbTotalNow=cbTotalNow;window.cbSuggest=cbSuggest;window.cbHistory=cbHistory;window.cbActive=cbActive;window.cbIsOnline=isOnline;

/* ══ GIAO DIỆN ══ */
function css(){if(document.getElementById('mncb-css'))return;const s=document.createElement('style');s.id='mncb-css';s.textContent=`
#personal-account .mncb-panel{padding:0 14px 18px}
#personal-account .mncb-acbar{margin-bottom:4px}
.mncb-link{display:block;width:100%;text-align:left;font:inherit;color:var(--text);cursor:pointer}
.mncb-txrow{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:8px 0;border:none;border-top:1px solid var(--bdr);background:none;color:var(--text);font:inherit;cursor:pointer}
.mncb-txrow .n{font-size:15px;font-weight:600}.mncb-txrow .m{font-size:13px;color:var(--muted);margin-top:2px}.mncb-txrow .r{font-weight:700;white-space:nowrap;flex-shrink:0}
@media(min-width:900px){#acp-cards-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:0 16px;align-items:start}#acp-cards-list>:first-child,#acp-cards-list>.mncb-sec{grid-column:1/-1}}
.mncb-card{background:var(--card);border:1px solid var(--bdr);border-radius:16px;padding:14px 16px;margin:0 0 10px}
.mncb-hero{background:linear-gradient(135deg,#0f6b47,#14825a);border:none;color:#fff}
.mncb-hero .l{font-size:13px;opacity:.92}
.mncb-hero .big{font-size:30px;font-weight:800;letter-spacing:-.6px;margin:4px 0 12px;font-variant-numeric:tabular-nums}
.mncb-hstats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;border-top:1px solid rgba(255,255,255,.22);padding-top:10px}
.mncb-hstats div{min-width:0}.mncb-hstats .v{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.mncb-row{display:flex;justify-content:space-between;align-items:center;gap:10px}
.mncb-btn{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--bdr);background:var(--card);color:var(--text);font-size:15px;font-weight:600;cursor:pointer;font-family:inherit}
.mncb-btn.pri{background:var(--navy);border-color:var(--navy);color:#fff}
.mncb-btn.sm{min-height:36px;font-size:13px;padding:0 12px;position:relative}
.mncb-btn.sm::after{content:'';position:absolute;inset:-4px}
.mncb-btn.link{border:none;background:none;color:var(--navy);padding:0 4px}
.mncb-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}
#acct-subbar{display:flex}#acct-subbar .tab-item{flex:1 1 0;min-width:0;white-space:nowrap;text-align:center;padding-left:6px;padding-right:6px}
#acp-cb-sg .mncb-card{margin-top:0}
.mncb-cardrow{display:flex;flex-wrap:wrap;gap:6px}.mncb-cardrow .mncb-chip{flex:1 1 0;min-width:64px;padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
.mncb-sec{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin:12px 0 6px}
.mncb-bar{height:6px;background:var(--light);border-radius:3px;overflow:hidden;margin-top:6px}
.mncb-bar>i{display:block;height:100%;border-radius:3px;background:var(--green)}
.mncb-tip{background:rgba(20,130,90,.08);border:1px solid rgba(20,130,90,.35);border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.55;margin-top:10px;color:var(--text)}
.mncb-tip b{font-weight:700}
.mncb-tiles{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-top:10px}
.mncb-tile{background:var(--light);border-radius:12px;padding:10px 12px;min-width:0}
.mncb-tile .l{font-size:13px;color:var(--muted)}.mncb-tile .v{font-size:20px;font-weight:800;margin-top:2px;white-space:nowrap;font-variant-numeric:tabular-nums}
.mncb-tile .s{font-size:12px;color:var(--muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mncb-line{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--bdr)}
.mncb-line .n{font-size:15px;font-weight:600;min-width:0}.mncb-line .m{font-size:13px;color:var(--muted);margin-top:2px}
.mncb-line .r{font-size:13px;font-weight:700;white-space:nowrap;text-align:right;flex-shrink:0}
.mncb-pill{display:inline-block;font-size:12px;font-weight:700;padding:2px 7px;border-radius:8px;background:rgba(20,130,90,.12);color:#0f6b47;vertical-align:1px}
.mncb-ok{color:#0f6b47}.mncb-warn{color:#b4470b}.mncb-bad{color:var(--red)}
body.dark .mncb-ok,body.dark .mncb-pill{color:#5fd39f}body.dark .mncb-warn{color:#ffb27a}
.mncb-days{font-size:12px;font-weight:600;color:var(--muted);background:var(--light);border-radius:8px;padding:3px 8px;white-space:nowrap}
.mncb-ov{position:fixed;inset:0;background:rgba(10,20,32,.45);z-index:1400;display:flex;align-items:flex-end;justify-content:center}
.mncb-sh{background:var(--card);color:var(--text);width:100%;max-width:520px;max-height:90vh;border-radius:22px 22px 0 0;display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(0,0,0,.2)}
@media(min-width:900px){.mncb-ov{align-items:center}.mncb-sh{border-radius:18px;max-width:620px}}
.mncb-shh{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--bdr)}
.mncb-shh b{font-size:${T_TITLE}px}
.mncb-shb{overflow:auto;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px));-webkit-overflow-scrolling:touch}
.mncb-x{width:44px;height:44px;border:none;background:var(--light);border-radius:12px;font-size:16px;color:var(--muted);cursor:pointer}
.mncb-f{display:block;margin:0 0 10px}.mncb-f>span{display:block;font-size:13px;color:var(--muted);margin-bottom:4px}
.mncb-in{width:100%;box-sizing:border-box;min-height:44px;padding:9px 12px;border:1px solid var(--bdr);border-radius:10px;background:var(--card);color:var(--text);font-size:16px;font-family:inherit}
.mncb-g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.mncb-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.mncb-box{border:1px solid var(--bdr);border-radius:12px;padding:10px 12px 2px;margin:0 0 10px}
.mncb-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
.mncb-chip{min-height:36px;padding:0 12px;border-radius:18px;border:1px solid var(--bdr);background:var(--card);color:var(--text);font-size:13px;cursor:pointer;font-family:inherit}
.mncb-chip[aria-pressed="true"]{background:var(--navy);border-color:var(--navy);color:#fff}
.mncb-res{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--bdr)}
.mncb-rank{width:28px;height:28px;border-radius:14px;background:var(--light);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}
.mncb-res.top .mncb-rank{background:#0f6b47;color:#fff}
.mncb-kpi{grid-column:1/-1}
`;document.head.appendChild(s)}

function catList(extra){
  const set=new Set();
  document.querySelectorAll('#personal-cat-sel option').forEach(o=>{if(o.value&&o.value!=='all')set.add(o.value)});
  if(!set.size)['Ăn uống','Di chuyển','Mua sắm','Giáo dục','Y tế','Gia đình','Điện','Nước','Internet','Điện thoại','Thuê nhà','Bảo hiểm','Giải trí'].forEach(c=>set.add(c));
  (db.transactions||[]).forEach(t=>{if(t&&t.flow==='out'&&t.group!=='company'&&t.category)set.add(cn(t.category))});
  (extra||[]).forEach(c=>c&&set.add(c));
  return [...set];
}
function bar(p,color){p=Math.max(0,Math.min(100,p||0));return '<div class="mncb-bar"><i style="width:'+p+'%'+(color?';background:'+color:'')+'"></i></div>'}

/* ── Tab Tài khoản: thanh tab con Tài khoản · Thẻ · Hoàn tiền · Sao kê & góp · Giao dịch thẻ ── */
const SUBS=[['acct','Tài khoản'],['cards','Thẻ'],['cb','Hoàn tiền'],['stmt','Sao kê']];   // gộp: Lịch trả thẻ → Thẻ; Giao dịch thẻ + Trả góp → Sao kê; Nên quẹt → Hoàn tiền
let acSub=(()=>{try{let v=localStorage.getItem('mnAcctSub');if(v==='tx')v='stmt';return SUBS.some(s=>s[0]===v)?v:'acct'}catch(e){return 'acct'}})();
const $=id=>document.getElementById(id);
function setupAcct(){
  const pa=$('personal-account');if(!pa)return null;
  // gỡ tab "Hoàn tiền" cũ trong Thu chi (nếu còn)
  document.querySelectorAll('#screen-personal > .tab-bar .tab-item').forEach(b=>{if((b.getAttribute('onclick')||'').includes("'cashback'"))b.remove()});
  const oldBox=$('personal-cashback');if(oldBox&&!pa.contains(oldBox))oldBox.remove();
  if(pa.dataset.cbx)return pa;pa.dataset.cbx=1;
  const bar=document.createElement('div');bar.className='tab-bar mncb-acbar';bar.id='acct-subbar';bar.setAttribute('role','tablist');
  bar.innerHTML=SUBS.map(s=>'<button class="tab-item" role="tab" data-acsub="'+s[0]+'">'+s[1]+'</button>').join('');
  const wrap=document.createElement('div');wrap.id='acp-acct';while(pa.firstChild)wrap.appendChild(pa.firstChild);
  pa.appendChild(bar);pa.appendChild(wrap);
  ['cards','cb','stmt'].forEach(k=>{const d=document.createElement('div');d.id='acp-'+k;d.className='mncb-panel';d.style.display='none';pa.appendChild(d)});
  $('acp-cards').innerHTML='<div id="acp-cards-top"></div><div id="acp-cards-list"></div><div class="mncb-sec" style="margin:16px 2px 8px">Lịch trả thẻ</div><div class="card" style="margin:0 0 10px"><div id="acp-cal"></div></div>';
  $('acp-stmt').innerHTML='<div id="acp-stmt-hist"></div><div id="acp-tx-list"></div><div id="acp-inst" style="margin-top:6px"></div>';
  bar.addEventListener('click',e=>{const b=e.target.closest('[data-acsub]');if(b)showSub(b.dataset.acsub)});
  showSub(acSub,true);
  return pa;
}
function showSub(k,quiet){
  acSub=k;try{localStorage.setItem('mnAcctSub',k)}catch(e){}
  document.querySelectorAll('#acct-subbar [data-acsub]').forEach(b=>{const on=b.dataset.acsub===k;b.classList.toggle('active',on);b.setAttribute('aria-selected',on)});
  const w=$('acp-acct');if(w)w.style.display=k==='acct'?'':'none';
  ['cards','cb','stmt'].forEach(x=>{const d=$('acp-'+x);if(d)d.style.display=x===k?'':'none'});
  if(k==='cards'||k==='acct'){try{renderAcctReport()}catch(e){}}
  if(k==='acct'){try{renderAcctList();renderInstList()}catch(e){}}
  renderSub();
  if(!quiet){const b=document.querySelector('#acct-subbar [data-acsub="'+k+'"]');if(b&&b.scrollIntoView)try{b.scrollIntoView({block:'nearest',inline:'center'})}catch(e){}try{window.scrollTo(0,0)}catch(e){}}
}
window.mncbOpen=function(k){try{ftNavSub('account')}catch(e){}setupAcct();showSub(k||'cards')};
function visible(){const pa=$('personal-account');return pa&&pa.style.display!=='none'&&typeof curTab!=='undefined'&&curTab==='personal'}
function renderSub(){if(!$('acct-subbar'))return;css();
  try{if(acSub==='cb')render();else if(acSub==='cards'){renderCardsTop();renderCal()}else if(acSub==='stmt'){renderStmt();renderTx()}}catch(e){console.warn('cb sub',e)}}

/* Tách thẻ tín dụng khỏi danh sách Tài khoản → Tổng quan thẻ */
function splitCards(){
  const rep=$('acct-report'),dst=$('acp-cards-list');if(!rep||!dst)return;
  const kids=[...rep.children];dst.innerHTML='';
  const sum=kids.find(k=>{const s=k.querySelector&&k.querySelector('span');return s&&s.textContent.trim()==='Thẻ tín dụng'&&/Đã dùng/.test(k.textContent)});
  if(sum)dst.appendChild(sum);
  const hi=kids.findIndex(k=>!k.children.length&&k.textContent.trim().toLowerCase()==='thẻ tín dụng');
  if(hi>=0){const head=kids[hi];const t=document.createElement('div');t.className='mncb-sec';t.style.margin='14px 2px 8px';t.textContent='Từng thẻ';dst.appendChild(t);
    const moved=[];for(let i=hi+1;i<kids.length;i++){const k=kids[i];if(k.getAttribute('style')==='height:6px')break;if(!k.children.length&&/^[^a-z]*$/.test(k.textContent.trim())&&k.textContent.trim()&&k.style.textTransform==='uppercase')break;moved.push(k)}
    // xếp theo thứ tự thẻ đã chọn: tìm tên thẻ trong dòng tiêu đề của khung
    const accs=cbCards();const rankOf=k=>{const t=(k.querySelector('[style*="font-weight:700"]')||k).textContent.trim();const a=accs.filter(x=>t.startsWith(x.name)).sort((x,y)=>y.name.length-x.name.length)[0];return a?accs.indexOf(a):99};
    moved.map((k,i)=>[k,rankOf(k),i]).sort((x,y)=>x[1]-y[1]||x[2]-y[2]).forEach(x=>dst.appendChild(x[0]));
    head.remove()}
  if(!dst.children.length)dst.innerHTML='<div class="mncb-card"><div style="font-size:15px;font-weight:700">Chưa có thẻ tín dụng</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Thêm thẻ ở tab con Tài khoản › Quản lý tài khoản, chọn loại “Thẻ tín dụng”.</div></div>';
}
function renderCardsTop(){
  const el=$('acp-cards-top');if(!el)return;const act=cbActive();
  if(!act.length){el.innerHTML='';return}
  let tot=0,tip=null;act.forEach(a=>{const c=cbCalc(a);if(!c)return;tot+=c.total;const t=c.tips.find(x=>x.k!=='capfull');if(t&&(!tip||t.gain>tip.gain))tip={t,a}});
  el.innerHTML='<button class="mncb-card mncb-link" style="margin-top:12px" onclick="mncbOpen(\'cb\')"><div class="mncb-row"><span style="font-size:15px;font-weight:700">Hoàn tiền dự kiến kỳ này</span><span class="mncb-ok" style="font-size:20px;font-weight:800">'+K(tot)+'</span></div>'
    +(tip?'<div style="font-size:13px;color:var(--muted);margin-top:4px;text-align:left">'+esc(sn(tip.a))+': '+tip.t.html+'</div>':'')+'</button>';
}

/* ── Sao kê các kỳ ── */
function stmtHist(a,n){
  const st=a.stDay||1,last=lastStmtDate(st);const out=[];ensureInst();const insts=(db.installments||[]).filter(i=>i.card===a.id);
  for(let k=0;k<n;k++){
    const C=stmtDateOf(last.getFullYear(),last.getMonth()-k,st),P=stmtDateOf(last.getFullYear(),last.getMonth()-k-1,st),N=stmtDateOf(last.getFullYear(),last.getMonth()-k+1,st);
    const cs=iso(C),ps=iso(P),ns=iso(N);
    const spend=(db.transactions||[]).filter(t=>t.flow==='out'&&t.group!=='company'&&(t.account||'')===a.id&&t.date>ps&&t.date<=cs).reduce((s,t)=>s+(+t.amount||0),0);
    let inst=0,fee=0,any=false;insts.forEach(i=>{const v=instInStmt(i,cs);if(v){any=true;inst+=v}fee+=instFeeInStmt(i,cs)});if(any)fee+=(+a.instFeeMonthly||0);
    let total=spend+inst+fee,bank=false;if(k===0&&a.stmtOverride!=null&&(!a.stmtOverrideKey||a.stmtOverrideKey===cs)){total=+a.stmtOverride;bank=true}
    const paid=(db.transactions||[]).filter(t=>t.flow==='xfer'&&t.to===a.id&&t.date>=cs&&(k===0||t.date<ns)).reduce((s,t)=>s+(+t.amount||0),0);
    const due=a.dueDay?new Date(C.getFullYear(),C.getMonth()+(+a.dueDay<=st?1:0),a.dueDay):null;
    out.push({ps,cs,spend,inst,fee,total,bank,paid,remain:Math.max(0,total-paid),due:due?iso(due):''});
  }
  return out;
}
let stCard='';
function renderStmt(){
  const cards=cbCards();const H=$('acp-stmt-hist');if(!H)return;
  if(!cards.length){H.innerHTML='<div class="mncb-card" style="margin-top:12px">Chưa có thẻ tín dụng.</div>'}
  else{if(!cards.some(a=>a.id===stCard))stCard=cards[0].id;const a=cards.find(x=>x.id===stCard);const L=stmtHist(a,6);
    H.innerHTML='<div class="mncb-chips mncb-cardrow" style="margin-top:12px">'+cards.map(c=>'<button class="mncb-chip" aria-pressed="'+(c.id===stCard)+'" data-stc="'+c.id+'">'+esc(sn(c))+'</button>').join('')+'</div>'
      +'<div class="mncb-card"><div class="mncb-row"><span style="font-size:'+T_TITLE+'px;font-weight:700">Sao kê các kỳ</span><span style="font-size:13px;color:var(--muted)">chốt ngày '+(a.stDay||1)+(a.dueDay?' · hạn ngày '+a.dueDay:'')+'</span></div>'
      +L.map((s,i)=>{const st=s.total<=0?'<span style="color:var(--muted)">Không phát sinh</span>':s.remain<=0?'<span class="mncb-ok">Đã trả đủ</span>':'<span class="mncb-bad">Còn '+K(s.remain)+'</span>';
        const parts=[['Chi tiêu',s.spend],['Trả góp',s.inst],['Lãi & phí góp',s.fee]].filter(p=>p[1]).map(p=>p[0]+' '+K(p[1])).join(' · ');
        return '<div class="mncb-line"><div style="min-width:0;flex:1"><div class="n">Chốt '+dm(s.cs)+(i===0?' <span class="mncb-pill">gần nhất</span>':'')+'</div><div class="m">'+dm(iso(addDay(new Date(s.ps+'T00:00:00'),1)))+' – '+dm(s.cs)+(s.due?' · hạn '+dm(s.due):'')+'</div>'+(parts||s.bank?'<div class="m">'+(s.bank?'Số ngân hàng':parts)+(s.paid?' · đã trả '+K(s.paid):'')+'</div>':'')+'</div><div class="r"><div style="font-size:15px">'+K(s.total)+'</div><div style="font-weight:600;margin-top:2px">'+st+'</div></div></div>'}).join('')
      +'<div style="font-size:12px;color:var(--muted);margin-top:8px">Kỳ gần nhất theo cách tính sao kê của app (gồm số ngân hàng nếu đã nhập). Các kỳ cũ tính lại từ giao dịch đã ghi, chưa gồm nợ liên kết thẻ.</div></div>';
    H.querySelectorAll('[data-stc]').forEach(b=>b.onclick=()=>{stCard=b.dataset.stc;txF.n=60;renderStmt();renderTx()})}
  // Trả góp: chuyển khối quản lý trả góp sẵn có vào đây
  const box=$('acp-inst'),il=$('inst-list');
  if(box&&il&&!box.contains(il)){const card=il.closest('.card')||il;const head=card.previousElementSibling;if(head&&head.classList.contains('sec-head')&&/góp/i.test(head.textContent))box.appendChild(head);box.appendChild(card)}
  try{renderInstList()}catch(e){}
}
// Lịch trả thẻ (tab Thẻ): dùng lại hàm của Tổng quan
function renderCal(){
  const cal=$('acp-cal');if(cal&&typeof window.renderCardCal==='function'){const home=$('cardcal-list');const hs=['cardcal-head','cardcal-card'].map(id=>{const e=$(id);return [e,e?e.style.display:'']});
    try{if(home)home.id='cardcal-list-home';cal.id='cardcal-list';window.renderCardCal()}catch(e){console.warn('cb cal',e)}finally{cal.id='acp-cal';if(home)home.id='cardcal-list';hs.forEach(x=>{if(x[0])x[0].style.display=x[1]})}}
}

/* ── Giao dịch thẻ (trong tab Sao kê, theo thẻ đang chọn) ── */
let txF={card:'all',per:'cyc',kind:'all',n:60};
function renderTx(){
  const el=$('acp-tx-list');if(!el)return;const cards=cbCards();txF.card=stCard||'all';
  if(!cards.length){el.innerHTML='<div class="mncb-card">Chưa có thẻ tín dụng.</div>';return}
  const ids=new Set(cards.map(a=>a.id));const td=day0();const name=id=>{const a=cards.find(x=>x.id===id);return a?sn(a):''};
  const from=a=>{if(txF.per==='cyc'){try{return iso(addDay(lastStmtDate(a.stDay||1),1))}catch(e){return ''}}if(txF.per==='prev'){const l=lastStmtDate(a.stDay||1);return iso(addDay(stmtDateOf(l.getFullYear(),l.getMonth()-1,a.stDay||1),1))}
    if(txF.per==='m0')return iso(new Date(td.getFullYear(),td.getMonth(),1));if(txF.per==='m1')return iso(new Date(td.getFullYear(),td.getMonth()-1,1));return iso(addDay(td,-89))};
  const to=a=>{if(txF.per==='prev')return iso(lastStmtDate(a.stDay||1));if(txF.per==='m1')return iso(new Date(td.getFullYear(),td.getMonth(),0));return '9999'};
  const rng={};cards.forEach(a=>rng[a.id]=[from(a),to(a)]);
  const L=(db.transactions||[]).filter(t=>{if(!t)return false;let id=null;
      if(t.flow==='out'&&t.group!=='company'&&ids.has(t.account||''))id=t.account;else if(t.flow==='xfer'&&ids.has(t.to))id=t.to;else return false;
      if(txF.card!=='all'&&id!==txF.card)return false;if(txF.kind==='out'&&t.flow!=='out')return false;if(txF.kind==='pay'&&t.flow!=='xfer')return false;
      const r=rng[id];return (t.date||'')>=r[0]&&(t.date||'')<=r[1]}).sort((x,y)=>(y.date||'').localeCompare(x.date||'')||String(y.id).localeCompare(String(x.id)));
  const spend=L.filter(t=>t.flow==='out').reduce((s,t)=>s+(+t.amount||0),0),pay=L.filter(t=>t.flow==='xfer').reduce((s,t)=>s+(+t.amount||0),0);
  const calcOf={};const rateOf=t=>{const a=cards.find(x=>x.id===t.account);const p=cbPol(a);if(!p||!p.ok)return null;const i=ruleIdxOf(t,p);if(i===-2)return 0;if(i<0)return p.base.rate;const k=a.id+'|'+t.date;if(!calcOf[k])calcOf[k]=cbCalc(a,{ref:t.date});return calcOf[k]?calcOf[k].rules[i].rate:p.rules[i].rate};
  const onl=t=>{const a=cards.find(x=>x.id===t.account);const p=cbPol(a);return p&&p.hasOnline?p:null};
  const PER=[['cyc','Kỳ sao kê này'],['prev','Kỳ trước'],['m0','Tháng này'],['m1','Tháng trước'],['90','90 ngày']];
  let h='<div class="mncb-sec" style="margin-top:14px">Giao dịch '+esc(name(stCard)||'trên thẻ')+'</div>'
    +'<div class="mncb-g2"><label class="mncb-f"><span>Thời gian</span><select class="mncb-in" id="acp-tx-per">'+PER.map(p=>'<option value="'+p[0]+'"'+(txF.per===p[0]?' selected':'')+'>'+p[1]+'</option>').join('')+'</select></label>'
    +'<label class="mncb-f"><span>Loại</span><select class="mncb-in" id="acp-tx-kind"><option value="all"'+(txF.kind==='all'?' selected':'')+'>Chi tiêu & thanh toán</option><option value="out"'+(txF.kind==='out'?' selected':'')+'>Chỉ chi tiêu</option><option value="pay"'+(txF.kind==='pay'?' selected':'')+'>Chỉ thanh toán thẻ</option></select></label></div>'
    +'<div class="mncb-tiles" style="margin:0 0 10px"><div class="mncb-tile"><div class="l">Chi tiêu</div><div class="v">'+K(spend)+'</div><div class="s">'+L.filter(t=>t.flow==='out').length+' giao dịch</div></div><div class="mncb-tile"><div class="l">Đã thanh toán</div><div class="v mncb-ok">'+K(pay)+'</div><div class="s">'+L.filter(t=>t.flow==='xfer').length+' lần</div></div></div>'
    +'<button class="mncb-btn pri" style="width:100%;margin-bottom:10px" onclick="try{openAddModal()}catch(e){}">+ Ghi giao dịch</button>';
  if(!L.length)h+='<div class="mncb-card" style="font-size:15px;color:var(--muted)">Không có giao dịch trong khoảng này.</div>';
  else{let last='';h+='<div class="mncb-card" style="padding:4px 16px">'+L.slice(0,txF.n).map(t=>{const hd=t.date!==last?(last=t.date,'<div class="mncb-sec" style="margin:12px 0 2px">'+dm(t.date)+'/'+(t.date||'').slice(0,4)+'</div>'):'';
      const pay=t.flow==='xfer',r=pay?null:rateOf(t);const ttl=pay?'Thanh toán thẻ':(t.category||'Chi tiêu');const sub=[pay?name(t.to):name(t.account),t.desc||t.note||''].filter(Boolean).join(' · ');
      const op=pay?null:onl(t),io=op?isOnline(t,op):false;
      return hd+'<div style="display:flex;align-items:center;gap:8px;border-top:1px solid var(--bdr)">'+'<button class="mncb-txrow" style="border-top:none;flex:1;min-width:0" data-txid="'+esc(t.id)+'"><div style="min-width:0;flex:1;text-align:left"><div class="n">'+esc(ttl)+(r?' <span class="mncb-pill">hoàn '+pct(r)+'</span>':'')+'</div><div class="m" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(sub)+'</div></div><div class="r '+(pay?'mncb-ok':'')+'" style="font-size:15px">'+(pay?'−':'')+K(t.amount)+'</div></button>'+(op?'<button class="mncb-chip" style="min-height:32px;padding:0 10px;font-size:12px;flex-shrink:0" aria-pressed="'+io+'" aria-label="Đánh dấu giao dịch online" title="'+(t.online==null?'Tự nhận theo từ khoá':'Đã đánh dấu tay')+'" data-onl="'+esc(t.id)+'">Online'+(t.online==null?'':' •')+'</button>':'')+'</div>'}).join('')+'</div>';
    if(L.length>txF.n)h+='<button class="mncb-btn" style="width:100%" id="acp-tx-more">Xem thêm ('+(L.length-txF.n)+')</button>'}
  el.innerHTML=h;
  $('acp-tx-per').onchange=e=>{txF.per=e.target.value;txF.n=60;renderTx()};$('acp-tx-kind').onchange=e=>{txF.kind=e.target.value;renderTx()};
  const m=$('acp-tx-more');if(m)m.onclick=()=>{txF.n+=60;renderTx()};
  el.querySelectorAll('[data-txid]').forEach(b=>b.onclick=()=>{try{openEditTx(b.dataset.txid)}catch(e){}});
  el.querySelectorAll('[data-onl]').forEach(b=>b.onclick=()=>{const t=(db.transactions||[]).find(x=>String(x.id)===b.dataset.onl);if(!t)return;const p=onl(t);const cur=isOnline(t,p);
    const auto=(()=>{const o=t.online;delete t.online;const v=isOnline(t,p);t.online=o;return v})();
    if(!cur===auto)delete t.online;else t.online=!cur;   // về đúng trạng thái tự nhận thì bỏ đánh dấu tay
    persist();try{toast(cur?'Đã bỏ đánh dấu online':'Đã đánh dấu online')}catch(e){}});
}

/* ── Màn Hoàn tiền ── */
function render(){
  const box=$('acp-cb');if(!box||box.style.display==='none')return;css();
  const cards=cbCards();
  if(!cards.length){box.innerHTML='<div class="mncb-card" style="margin-top:8px"><div style="font-size:15px;font-weight:700">Chưa có thẻ tín dụng</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Thêm thẻ tín dụng ở Tài khoản › Quản lý tài khoản rồi cài chính sách hoàn tiền cho từng thẻ.</div></div>';return}
  const act=cards.map(a=>({a,c:cbCalc(a)})).filter(x=>x.c);
  const none=cards.filter(a=>!act.some(x=>x.a===a));
  const tot=act.reduce((s,x)=>s+x.c.total,0),spent=act.reduce((s,x)=>s+x.c.spent,0);
  let prevAct=0,prevN=0;act.forEach(x=>{const h=cbHistory(x.a,1)[1];if(h&&h.actual!=null){prevAct+=h.actual;prevN++}});
  let h='<div class="mncb-card mncb-hero" style="margin-top:8px"><div class="l">Hoàn tiền dự kiến kỳ này</div><div class="big">'+K(tot)+'</div>'
    +'<div class="mncb-hstats"><div><div class="l">Chi tiêu tính hoàn</div><div class="v">'+K(spent)+'</div></div>'
    +'<div><div class="l">Thẻ có chính sách</div><div class="v">'+act.length+'/'+cards.length+'</div></div>'
    +'<div><div class="l">Kỳ trước thực nhận</div><div class="v">'+(prevN?K(prevAct):'—')+'</div></div></div></div>'
    +'<div id="acp-cb-sg" style="margin-top:-2px"></div><button class="mncb-btn" style="width:100%;margin:0 0 12px" onclick="mncbHist()">Lịch sử hoàn tiền</button>';
  h+=act.map(x=>cardHtml(x.a,x.c)).join('');
  if(none.length)h+='<div class="mncb-card"><div class="mncb-row"><span style="font-size:15px;font-weight:700">Chưa cài chính sách</span><span style="font-size:13px;color:var(--muted)">'+none.length+' thẻ</span></div>'
    +none.map(a=>'<div class="mncb-line"><span class="n">'+esc(sn(a))+((a.cbHist||[]).length?'<div class="m">Đã ghi thực nhận '+(a.cbHist||[]).length+' kỳ · gần nhất '+K(a.cbHist.slice().sort((x,y)=>y.id.localeCompare(x.id))[0].actual)+'</div>':'')+'</span><span style="display:flex;gap:6px">'+((a.cbHist||[]).length?'<button class="mncb-btn sm" onclick="mncbHist(\''+a.id+'\')">Lịch sử</button>':'')+'<button class="mncb-btn sm" onclick="mncbEdit(\''+a.id+'\')">+ Cài chính sách</button></span></div>').join('')
    +'<div style="font-size:12px;color:var(--muted);margin-top:6px">Nhập % hoàn, trần và điều kiện theo biểu phí/thể lệ của ngân hàng.</div></div>';
  box.innerHTML=h;const sgb=$('acp-cb-sg');if(sgb)drawSuggest(sgb,true);
}
function cardHtml(a,c){
  const tip=c.tips[0];const capT=c.cap||c.maxPossible;
  let h='<div class="mncb-card"><div class="mncb-row" style="align-items:flex-start"><div style="min-width:0"><div style="font-size:'+T_TITLE+'px;font-weight:700">'+esc(sn(a))+'</div>'
    +'<div style="font-size:13px;color:var(--muted);margin-top:2px">Kỳ hoàn '+dm(c.s)+' – '+dm(c.e)+'</div></div><span class="mncb-days">'+(c.current?(c.daysLeft?'Còn '+c.daysLeft+' ngày':'Hôm nay hết kỳ'):'')+'</span></div>';
  if(tip)h+='<div class="mncb-tip"><b class="mncb-ok">Nên làm:</b> '+tip.html+'</div>';
  h+='<div class="mncb-tiles"><div class="mncb-tile"><div class="l">Đã chi kỳ này</div><div class="v">'+K(c.spent)+'</div>'
    +(c.target?bar(c.spent/c.target*100,'var(--navy)')+'<div class="s">Mục tiêu '+K(c.target)+(c.spent<c.target?' · <span class="mncb-warn">thiếu '+K(c.target-c.spent)+'</span>':' · <span class="mncb-ok">đã đạt</span>')+'</div>':'<div class="s">'+c.txN+' giao dịch'+(c.exclSpent?' · loại trừ '+K(c.exclSpent):'')+'</div>')+'</div>'
    +'<div class="mncb-tile"><div class="l">Hoàn dự kiến</div><div class="v '+(c.total?'mncb-ok':'')+'" style="'+(c.total?'':'color:var(--muted)')+'">'+K(c.total)+'</div>'
    +(capT?bar(c.afterCap/capT*100)+'<div class="s">Trần '+K(capT)+' · còn '+K(Math.max(0,capT-c.afterCap))+'</div>':'<div class="s">Không giới hạn trần</div>')
    +(!c.qualified&&c.afterCap?'<div class="s mncb-warn">Chờ đủ điều kiện: '+K(c.afterCap)+'</div>':'')+'</div></div>';
  const rows=c.rules.filter(r=>r.rate>0||r.tiers.length);
  if(rows.length||c.base.rate){
    const full=rows.filter(r=>r.full).length;
    h+='<div class="mncb-row"><div class="mncb-sec">Hoàn theo nhóm</div><div style="font-size:12px;color:var(--muted);margin-top:6px">'+(rows.length-full)+' còn'+(full?' · '+full+' hết':'')+'</div></div>';
    h+=rows.map(r=>{const st=r.locked?'<span class="mncb-warn">Cần chi '+K(r.need)+'</span>':r.full?'<span class="mncb-warn">Hết trần</span>':r.cap?'<span class="mncb-ok">Còn '+K(r.remain)+'</span>':'<span class="mncb-ok">'+K(r.earned)+'</span>';
      return '<div class="mncb-line"><div style="min-width:0;flex:1"><div class="n">'+esc(r.label)+' <span class="mncb-pill">'+pct(r.rate)+'</span></div>'
      +'<div class="m">Chi '+K(r.spent)+(r.min?' / tối thiểu '+K(r.min):'')+' · hoàn '+K(r.earned)+(r.cap?' / '+K(r.cap):'')+(r.tiers.length?' · bậc '+(r.tier.idx>=0?'tổng chi ≥ '+K(r.tier.min):'cơ bản'):'')+'</div>'
      +(r.next?'<div class="m">Tổng chi đạt '+K(r.next.min)+' → '+pct(r.next.rate)+(r.next.cap?', trần '+K(r.next.cap):'')+'</div>':'')+(r.cap?bar((r.locked?0:Math.min(r.raw,r.cap))/r.cap*100,r.full?'#c9731f':''):'')+'</div><div class="r">'+st+'</div></div>'}).join('');
    if(c.base.rate)h+='<div class="mncb-line"><div style="min-width:0;flex:1"><div class="n">Danh mục khác <span class="mncb-pill">'+pct(c.base.rate)+'</span></div><div class="m">Chi '+K(c.base.spent)+' · hoàn '+K(c.base.earned)+(c.base.cap?' / '+K(c.base.cap):'')+'</div></div><div class="r">'+(c.base.full?'<span class="mncb-warn">Hết trần</span>':c.base.cap?'<span class="mncb-ok">Còn '+K(c.base.remain)+'</span>':'<span class="mncb-ok">'+K(c.base.earned)+'</span>')+'</div></div>';
  }
  if(c.conds.length){h+='<div class="mncb-sec">Điều kiện của thẻ</div>'+c.conds.map(x=>'<div class="mncb-line"><div style="min-width:0;flex:1"><div class="n '+(x.met?'':'mncb-bad')+'">'+(x.met?'✓ ':'○ ')+esc(x.label)+'</div><div class="m">Đã chi '+K(x.spent)+' / '+K(x.min)+' ('+esc(x.scopeTxt)+')</div>'+bar(x.min?x.spent/x.min*100:100,x.met?'':'var(--red)')+'</div><div class="r">'+(x.met?'<span class="mncb-ok">Đã đạt</span>':'<span class="mncb-bad">Thiếu '+K(x.need)+'</span>')+'</div></div>').join('')}
  if(c.p.note)h+='<div style="font-size:12px;color:var(--muted);margin-top:8px;white-space:pre-line">'+esc(c.p.note)+'</div>';
  h+='<div class="mncb-g2" style="margin-top:12px"><button class="mncb-btn" onclick="mncbEdit(\''+a.id+'\')">Chính sách</button><button class="mncb-btn" onclick="mncbHist(\''+a.id+'\')">Ghi số thực nhận</button></div></div>';
  return h;
}

/* ── Hộp trượt ── */
let ovEl=null;
function sheet(title,body){close();css();ovEl=document.createElement('div');ovEl.className='mncb-ov';
  ovEl.innerHTML='<div class="mncb-sh" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="mncb-shh"><b>'+esc(title)+'</b><button class="mncb-x" aria-label="Đóng" onclick="mncbClose()">✕</button></div><div class="mncb-shb"></div></div>';
  ovEl.addEventListener('click',e=>{if(e.target===ovEl)close()});document.body.appendChild(ovEl);setBody(body);return ovEl.querySelector('.mncb-shb')}
function setBody(html){const b=ovEl&&ovEl.querySelector('.mncb-shb');if(b)b.innerHTML=html;return b}
function close(){if(ovEl){ovEl.remove();ovEl=null}}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ovEl)close()});
document.addEventListener('input',e=>{const t=e.target;if(t&&t.classList&&t.classList.contains('mncb-money')){const d=t.value.replace(/\D/g,'');t.value=d===''?'':new Intl.NumberFormat('vi-VN').format(+d)}},true);
function persist(){try{save()}catch(e){console.warn('cb save',e)}try{renderAll()}catch(e){try{render()}catch(_){}}}

/* ── Gợi ý nên quẹt ── */
let sg={cat:'',amt:0,open:false};
window.mncbSuggest=function(){
  if(!cbActive().length){sheet('Nên quẹt thẻ nào?','<div style="font-size:15px;color:var(--muted)">Chưa có thẻ nào cài chính sách hoàn tiền. Vào Tài khoản › Hoàn tiền → “+ Cài chính sách” cho từng thẻ trước.</div>');return}
  drawSuggest(sheet('Nên quẹt thẻ nào?',''),false)};
function drawSuggest(box,inline){
  if(!box)return;
  if(!cbActive().length){box.innerHTML=inline?'<div class="mncb-card" style="margin-top:12px"><div style="font-size:15px;font-weight:700">Nên quẹt thẻ nào?</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Cài chính sách hoàn tiền ở tab con Hoàn tiền để app gợi ý thẻ có lợi nhất.</div></div>':'';return}
  const cats=(cbActive().some(a=>cbPol(a).hasOnline)?[ONLINE_CAT]:[]).concat(catList(cbActive().flatMap(a=>cbPol(a).rules.flatMap(r=>r.cats))));if(!sg.cat||!cats.includes(sg.cat))sg.cat=cats[0]||'';
  if(inline&&!sg.open){box.innerHTML='<button class="mncb-card mncb-link" style="margin-top:12px" data-sgopen="1"><div class="mncb-row"><span style="font-size:15px;font-weight:700">Nên quẹt thẻ nào?</span><span style="font-size:13px;color:var(--navy);font-weight:600">Mở ▾</span></div><div style="font-size:13px;color:var(--muted);margin-top:2px;text-align:left">Chọn danh mục và số tiền, app xếp thẻ theo tiền hoàn thực nhận.</div></button>';
    box.querySelector('[data-sgopen]').onclick=()=>{sg.open=true;drawSuggest(box,true)};return}
  const amt=sg.amt||1000000;const res=cbSuggest(sg.cat,amt);
  box.innerHTML=(inline?'<div class="mncb-card" style="margin-top:12px"><div class="mncb-row" style="margin-bottom:8px"><span style="font-size:15px;font-weight:700">Nên quẹt thẻ nào?</span><button class="mncb-btn sm link" data-sgclose="1">Thu gọn ▴</button></div>':'')
    +'<div class="mncb-f"><span>Danh mục chi tiêu</span></div><div class="mncb-chips">'+cats.map(c=>'<button class="mncb-chip" aria-pressed="'+(c===sg.cat)+'" data-sgc="'+esc(c)+'">'+esc(c)+'</button>').join('')+'</div>'
    +'<label class="mncb-f"><span>Số tiền dự kiến (đ)</span><input class="mncb-in mncb-money" data-sgamt="1" inputmode="numeric" placeholder="1.000.000" value="'+moneyTxt(sg.amt)+'"></label>'
    +'<div style="font-size:13px;color:var(--muted);margin:2px 0 4px">'+(sg.amt?'':'Chưa nhập số tiền — tạm tính cho 1tr. ')+'Đã trừ phần hết trần và kiểm tra điều kiện của kỳ hiện tại.</div>'
    +res.map((r,i)=>'<div class="mncb-res'+(i===0&&r.gain>0?' top':'')+'"><div class="mncb-rank">'+(i+1)+'</div><div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700">'+esc(sn(r.a))+'</div><div style="font-size:13px;color:var(--muted)">'+(r.rate?'Hoàn '+pct(r.rate):'Không hoàn')+(r.gain?' · thực nhận ~'+pct(r.eff):'')+(r.note?' · '+esc(r.note):'')+'</div></div><div style="text-align:right;flex-shrink:0"><div style="font-size:15px;font-weight:800" class="'+(r.gain?'mncb-ok':'')+'">+'+K(r.gain)+'</div>'+(!r.gain&&r.pot?'<div style="font-size:12px;color:var(--muted)">chờ ĐK +'+K(r.pot)+'</div>':'')+'</div></div>').join('')
    +(inline?'</div>':'');
  box.querySelectorAll('[data-sgc]').forEach(b=>b.onclick=()=>{sg.cat=b.dataset.sgc;drawSuggest(box,inline)});
  const c=box.querySelector('[data-sgclose]');if(c)c.onclick=()=>{sg.open=false;drawSuggest(box,true)};
  const inp=box.querySelector('[data-sgamt]');const upd=()=>{const v=money(inp.value);if(v!==sg.amt){sg.amt=v;drawSuggest(box,inline)}};inp.onchange=upd;inp.onkeydown=e=>{if(e.key==='Enter')upd()};
}
/* ── Lịch sử & số thực nhận ── */
window.mncbHist=function(id){
  const list=id?cbCards().filter(a=>a.id===id):cbActive();
  if(!list.length){sheet('Lịch sử hoàn tiền','<div style="font-size:15px;color:var(--muted)">Chưa có thẻ nào cài chính sách hoàn tiền.</div>');return}
  let tE=0,tA=0;
  const body=list.map(a=>{const H=cbHistory(a,6);return '<div class="mncb-sec" style="margin-top:4px">'+esc(sn(a))+'</div>'+H.map(x=>{
      if(!x.current&&x.actual!=null){tE+=x.est;tA+=x.actual}
      const diff=x.actual!=null?x.actual-x.est:null;
      return '<div class="mncb-line"><div style="min-width:0;flex:1"><div class="n" style="font-size:13px">'+dm(x.s)+' – '+dm(x.e)+(x.current?' <span class="mncb-pill">kỳ này</span>':'')+'</div>'+(x.note?'<div class="m">'+esc(x.note)+'</div>':'')+'<div class="m">Chi '+K(x.spent)+' · dự kiến '+K(x.est)+(diff!=null&&Math.abs(diff)>=1000?' · <span class="'+(diff<0?'mncb-bad':'mncb-ok')+'">lệch '+(diff>0?'+':'−')+K(Math.abs(diff))+'</span>':'')+'</div></div>'
        +('<input class="mncb-in mncb-money" style="width:130px;flex-shrink:0;text-align:right" inputmode="numeric" aria-label="Thực nhận kỳ '+dm(x.s)+' – '+dm(x.e)+'" placeholder="Thực nhận" data-a="'+a.id+'" data-s="'+x.s+'" data-e="'+x.e+'" value="'+(x.actual!=null?moneyTxt(x.actual)||'0':'')+'">')+'</div>'}).join('')}).join('');
  sheet(id?'Hoàn tiền · '+sn(list[0]):'Lịch sử hoàn tiền','<div style="font-size:13px;color:var(--muted);margin-bottom:4px">Nhập số tiền ngân hàng đã hoàn thực tế để so với số dự kiến. Dự kiến các kỳ cũ tính theo chính sách hiện tại.</div>'+body
    +(tA||tE?'<div class="mncb-line" style="font-weight:700"><span>Tổng các kỳ đã ghi</span><span>'+K(tA)+' / dự kiến '+K(tE)+'</span></div>':'')
    +'<button class="mncb-btn pri" style="width:100%;margin-top:12px" id="mncb-h-save">Lưu số thực nhận</button>');
  document.getElementById('mncb-h-save').onclick=()=>{let n=0;ovEl.querySelectorAll('input[data-a]').forEach(inp=>{const a=cbCards().find(x=>x.id===inp.dataset.a);if(!a)return;
      const raw=inp.value.trim();a.cbHist=Array.isArray(a.cbHist)?a.cbHist:[];const i=a.cbHist.findIndex(x=>x.id===inp.dataset.s);
      if(raw===''){if(i>=0){a.cbHist.splice(i,1);n++}return}
      const v=money(raw),rec={id:inp.dataset.s,s:inp.dataset.s,e:inp.dataset.e,actual:v,at:iso(new Date())};
      if(i>=0){if(+a.cbHist[i].actual!==v){a.cbHist[i]=rec;n++}}else{a.cbHist.push(rec);n++}});
    close();if(n){persist();try{toast('Đã lưu số hoàn thực nhận')}catch(e){}}};
};

/* ── Chính sách từng thẻ ── */
let ed=null,edCard=null,edOpen={};
window.mncbEdit=function(id){
  const a=cbCards().find(x=>x.id===id);if(!a)return;edCard=a;edOpen={};
  const p=cbPol(a)||cbPol({cashback:{}});ed=JSON.parse(JSON.stringify({period:p.period,startDay:p.startDay,cap:p.cap,base:p.base,rules:p.rules,conds:p.conds,excl:p.excl,target:p.target,note:p.note,onlineKw:p.onlineKw,onlineCats:p.onlineCats}));
  if(!ed.rules.length)ed.rules.push({id:uid(),name:'',match:'cats',cats:[],rate:0,cap:0,min:0,tiers:[]});
  sheet('Chính sách hoàn tiền · '+sn(a),'');drawEdit()};
function catPicker(key,sel){
  const open=edOpen[key];const all=catList(sel);
  return '<div class="mncb-f"><span>Danh mục</span></div><div class="mncb-chips">'+(open?all:sel).map(c=>'<button class="mncb-chip" aria-pressed="'+sel.includes(c)+'" data-pick="'+key+'" data-c="'+esc(c)+'">'+esc(c)+'</button>').join('')
    +'<button class="mncb-chip" data-toggle="'+key+'" style="border-style:dashed">'+(open?'Xong':sel.length?'Sửa danh mục':'+ Chọn danh mục')+'</button></div>';
}
function drawEdit(){
  const e=ed;const pv=cbPeriod(Object.assign({},edCard,{cashback:e}));
  let h='<div class="mncb-sec" style="margin-top:0">Kỳ tính hoàn</div><div class="mncb-g2"><label class="mncb-f"><span>Cách tính kỳ</span><select class="mncb-in" data-k="period"><option value="stmt"'+(e.period==='stmt'?' selected':'')+'>Theo kỳ sao kê (chốt ngày '+(edCard.stDay||1)+')</option><option value="month"'+(e.period==='month'?' selected':'')+'>Theo tháng dương lịch</option><option value="custom"'+(e.period==='custom'?' selected':'')+'>Bắt đầu ngày cố định</option></select></label>'
    +(e.period==='custom'?'<label class="mncb-f"><span>Ngày bắt đầu kỳ (1–31)</span><input class="mncb-in" data-k="startDay" inputmode="numeric" value="'+e.startDay+'"></label>':'<div></div>')+'</div>'
    +'<div style="font-size:13px;color:var(--muted);margin:-4px 0 6px">Kỳ hiện tại: '+dm(pv.s)+' – '+dm(pv.e)+'</div>'
    +'<div class="mncb-g2"><label class="mncb-f"><span>Trần hoàn cả thẻ / kỳ (đ, 0 = không)</span><input class="mncb-in mncb-money" data-k="cap" inputmode="numeric" value="'+moneyTxt(e.cap)+'"></label>'
    +'<label class="mncb-f"><span>Mục tiêu chi cá nhân / kỳ (đ)</span><input class="mncb-in mncb-money" data-k="target" inputmode="numeric" value="'+moneyTxt(e.target)+'"></label></div>';
  h+='<div class="mncb-sec">Nhóm danh mục được hoàn</div>'+e.rules.map((r,i)=>'<div class="mncb-box"><div class="mncb-row" style="margin-bottom:6px"><b style="font-size:15px">Nhóm '+(i+1)+'</b><button class="mncb-btn sm link" data-del="rules" data-i="'+i+'">Xoá nhóm</button></div>'
    +'<label class="mncb-f"><span>Tên nhóm (tuỳ chọn)</span><input class="mncb-in" data-r="'+i+'" data-f="name" value="'+esc(r.name)+'" placeholder="Ví dụ: Ăn uống & Siêu thị"></label>'
    +'<label class="mncb-f"><span>Áp dụng cho</span><select class="mncb-in" data-r="'+i+'" data-f="match"><option value="cats"'+(r.match!=='online'?' selected':'')+'>Danh mục chọn</option><option value="online"'+(r.match==='online'?' selected':'')+'>Giao dịch trực tuyến (online)</option></select></label>'
    +(r.match==='online'?'<div style="font-size:13px;color:var(--muted);margin:-4px 0 10px">Nhận online theo từ khoá trong mô tả (ô “Từ khoá online” bên dưới) hoặc nút Online ở tab Giao dịch thẻ. Nhóm xếp trên được ưu tiên khi một giao dịch khớp nhiều nhóm.</div>':catPicker('r'+i,r.cats))
    +'<div class="mncb-g3"><label class="mncb-f"><span>% hoàn'+(r.tiers.length?' (bậc thấp nhất)':'')+'</span><input class="mncb-in" data-r="'+i+'" data-f="rate" inputmode="decimal" value="'+(r.rate?String(r.rate).replace('.',','):'')+'" placeholder="0"></label>'
    +'<label class="mncb-f"><span>Trần nhóm (đ)</span><input class="mncb-in mncb-money" data-r="'+i+'" data-f="cap" inputmode="numeric" value="'+moneyTxt(r.cap)+'" placeholder="0"></label>'
    +'<label class="mncb-f"><span>Chi tối thiểu (đ)</span><input class="mncb-in mncb-money" data-r="'+i+'" data-f="min" inputmode="numeric" value="'+moneyTxt(r.min)+'" placeholder="0"></label></div>'
    +(r.tiers.length?'<div style="font-size:13px;color:var(--muted);margin:0 0 6px">Bậc theo tổng chi tiêu của thẻ trong kỳ (tổng chi đạt mốc → dùng % và trần của bậc đó):</div>':'')
    +r.tiers.map((t,j)=>'<div class="mncb-g3" style="grid-template-columns:repeat(3,minmax(0,1fr)) 44px;align-items:end"><label class="mncb-f"><span>Tổng chi từ (đ)</span><input class="mncb-in mncb-money" data-t="'+i+':'+j+'" data-f="min" inputmode="numeric" value="'+moneyTxt(t.min)+'"></label><label class="mncb-f"><span>% hoàn</span><input class="mncb-in" data-t="'+i+':'+j+'" data-f="rate" inputmode="decimal" value="'+(t.rate?String(t.rate).replace('.',','):'')+'"></label><label class="mncb-f"><span>Trần (đ)</span><input class="mncb-in mncb-money" data-t="'+i+':'+j+'" data-f="cap" inputmode="numeric" value="'+moneyTxt(t.cap)+'"></label><button class="mncb-x" style="margin-bottom:10px" aria-label="Xoá bậc" data-delt="'+i+':'+j+'">✕</button></div>').join('')
    +'<button class="mncb-btn sm" style="margin:0 0 10px" data-addt="'+i+'">+ Bậc theo tổng chi tiêu</button></div>').join('')
    +'<button class="mncb-btn" style="width:100%;margin-bottom:6px" data-add="rules">+ Thêm nhóm danh mục</button>';
  if(e.rules.some(r=>r.match==='online'))h+='<div class="mncb-sec">Nhận diện giao dịch online</div><div style="font-size:13px;color:var(--muted);margin:-2px 0 8px">Danh mục luôn tính là online (ví dụ Di chuyển nếu anh đi xe công nghệ bằng thẻ này):</div>'+catPicker('o',e.onlineCats=e.onlineCats||[])+'<label class="mncb-f"><span>Từ khoá online (cách nhau bằng dấu phẩy, không phân biệt dấu)</span><textarea class="mncb-in" data-k="onlineKw" rows="3" style="resize:vertical">'+esc((e.onlineKw||[]).join(', '))+'</textarea></label>';
  h+='<div class="mncb-sec">Danh mục khác</div><div class="mncb-g2"><label class="mncb-f"><span>% hoàn mặc định</span><input class="mncb-in" data-k="base.rate" inputmode="decimal" value="'+(e.base.rate?String(e.base.rate).replace('.',','):'')+'" placeholder="0"></label>'
    +'<label class="mncb-f"><span>Trần (đ, 0 = không)</span><input class="mncb-in mncb-money" data-k="base.cap" inputmode="numeric" value="'+moneyTxt(e.base.cap)+'" placeholder="0"></label></div>';
  h+='<div class="mncb-sec">Điều kiện của thẻ</div><div style="font-size:13px;color:var(--muted);margin:-2px 0 8px">Chưa đạt đủ mọi điều kiện → kỳ đó không được hoàn.</div>'+e.conds.map((c,i)=>'<div class="mncb-box"><div class="mncb-row" style="margin-bottom:6px"><b style="font-size:15px">Điều kiện '+(i+1)+'</b><button class="mncb-btn sm link" data-del="conds" data-i="'+i+'">Xoá</button></div>'
    +'<label class="mncb-f"><span>Tên điều kiện (tuỳ chọn)</span><input class="mncb-in" data-c="'+i+'" data-f="label" value="'+esc(c.label)+'" placeholder="Ví dụ: Chi tiêu tối thiểu"></label>'
    +'<div class="mncb-g2"><label class="mncb-f"><span>Tính trên</span><select class="mncb-in" data-c="'+i+'" data-f="scope"><option value="all"'+(c.scope==='all'?' selected':'')+'>Tổng chi tiêu</option><option value="other"'+(c.scope==='other'?' selected':'')+'>Lĩnh vực khác (ngoài các nhóm)</option><option value="cats"'+(c.scope==='cats'?' selected':'')+'>Danh mục chọn</option></select></label>'
    +'<label class="mncb-f"><span>Tối thiểu (đ)</span><input class="mncb-in mncb-money" data-c="'+i+'" data-f="min" inputmode="numeric" value="'+moneyTxt(c.min)+'"></label></div>'
    +(c.scope==='cats'?catPicker('c'+i,c.cats):'')+'</div>').join('')
    +'<button class="mncb-btn" style="width:100%;margin-bottom:6px" data-add="conds">+ Thêm điều kiện</button>';
  h+='<div class="mncb-sec">Không được hoàn</div><div style="font-size:13px;color:var(--muted);margin:-2px 0 8px">Ví dụ rút tiền, nạp ví, đóng học phí qua cổng không hoàn… Không tính vào chi tiêu đủ điều kiện.</div>'+catPicker('x',e.excl)
    +'<label class="mncb-f"><span>Ghi chú chính sách</span><textarea class="mncb-in" data-k="note" rows="3" style="resize:vertical">'+esc(e.note)+'</textarea></label>'
    +'<div class="mncb-g2" style="margin-top:6px">'+(edCard.cashback?'<button class="mncb-btn" id="mncb-e-off" style="color:var(--red)">Xoá chính sách</button>':'<button class="mncb-btn" onclick="mncbClose()">Huỷ</button>')+'<button class="mncb-btn pri" id="mncb-e-save">Lưu chính sách</button></div>';
  const top=ovEl.querySelector('.mncb-shb').scrollTop;setBody(h);ovEl.querySelector('.mncb-shb').scrollTop=top;
  const B=ovEl.querySelector('.mncb-shb');
  B.querySelectorAll('[data-k]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{const k=el.dataset.k,mon=el.classList.contains('mncb-money');
    const v=k==='note'?el.value:k==='onlineKw'?el.value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean):k==='period'?el.value:mon?money(el.value):num(el.value);
    if(k.startsWith('base.'))e.base[k.slice(5)]=v;else e[k]=k==='startDay'?Math.min(31,Math.max(1,Math.round(v)||1)):v;if(k==='period'||k==='startDay')drawEdit()}));
  B.querySelectorAll('[data-r],[data-c][data-f]').forEach(el=>{const arr=el.dataset.r!=null?e.rules:e.conds,i=+(el.dataset.r!=null?el.dataset.r:el.dataset.c),f=el.dataset.f;
    el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{const mon=el.classList.contains('mncb-money');arr[i][f]=(f==='name'||f==='label'||f==='scope'||f==='match')?el.value:mon?money(el.value):num(el.value);if(f==='scope'||f==='match')drawEdit()})});
  B.querySelectorAll('[data-t]').forEach(el=>{const[i,j]=el.dataset.t.split(':').map(Number),f=el.dataset.f;el.addEventListener('input',()=>{e.rules[i].tiers[j][f]=el.classList.contains('mncb-money')?money(el.value):num(el.value)})});
  B.querySelectorAll('[data-addt]').forEach(b=>b.onclick=()=>{const r=e.rules[+b.dataset.addt];r.tiers=r.tiers||[];r.tiers.push({min:0,rate:r.rate,cap:r.cap});drawEdit()});
  B.querySelectorAll('[data-delt]').forEach(b=>b.onclick=()=>{const[i,j]=b.dataset.delt.split(':').map(Number);e.rules[i].tiers.splice(j,1);drawEdit()});
  B.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const k=b.dataset.pick,c=b.dataset.c;const arr=k==='x'?e.excl:k==='o'?e.onlineCats:k[0]==='r'?e.rules[+k.slice(1)].cats:e.conds[+k.slice(1)].cats;
    const j=arr.indexOf(c);if(j>=0)arr.splice(j,1);else arr.push(c);drawEdit()});
  B.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{edOpen[b.dataset.toggle]=!edOpen[b.dataset.toggle];drawEdit()});
  B.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(b.dataset.add==='rules'){e.rules.push({id:uid(),name:'',match:'cats',cats:[],rate:0,cap:0,min:0,tiers:[]});edOpen['r'+(e.rules.length-1)]=true}else{e.conds.push({id:uid(),label:'',scope:'all',cats:[],min:0})}drawEdit()});
  B.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{e[b.dataset.del].splice(+b.dataset.i,1);edOpen={};drawEdit()});
  const off=document.getElementById('mncb-e-off');if(off)off.onclick=()=>{const old=edCard.cashback,a=edCard;delete a.cashback;close();persist();try{toastUndo('Đã xoá chính sách hoàn tiền '+a.name,()=>{a.cashback=old;persist()})}catch(_){}};
  document.getElementById('mncb-e-save').onclick=()=>{
    const hasT=r=>r.match==='online'||r.cats.length>0,hasR=r=>r.rate>0||(r.tiers||[]).some(t=>t.min>0&&t.rate>0);
    const rules=e.rules.filter(r=>hasT(r)&&hasR(r)).map(r=>({id:r.id,name:String(r.name||'').trim(),match:r.match==='online'?'online':'cats',cats:r.match==='online'?[]:r.cats,rate:+r.rate||0,cap:+r.cap||0,min:+r.min||0,tiers:normTiers(r.tiers)}));
    const empty=r=>r.match!=='online'&&!r.cats.length&&!hasR(r);const bad=e.rules.find(r=>!empty(r)&&!(hasT(r)&&hasR(r)));
    if(bad){try{toast('Mỗi nhóm cần có danh mục (hoặc chọn online) và % hoàn — hoặc xoá nhóm trống')}catch(_){}return}
    if(rules.some(r=>r.rate>100||r.tiers.some(t=>t.rate>100))||e.base.rate>100){try{toast('% hoàn không được quá 100')}catch(_){}return}
    if(!rules.length&&!(e.base.rate>0)){try{toast('Cần ít nhất một nhóm danh mục hoặc % hoàn mặc định')}catch(_){}return}
    edCard.cashback={period:e.period,startDay:e.startDay,cap:+e.cap||0,base:{rate:+e.base.rate||0,cap:+e.base.cap||0},rules,
      conds:e.conds.filter(c=>c.min>0&&(c.scope!=='cats'||c.cats.length)).map(c=>({id:c.id,label:String(c.label||'').trim(),scope:c.scope,cats:c.scope==='cats'?c.cats:[],min:+c.min})),
      excl:e.excl,target:+e.target||0,note:String(e.note||'').trim(),onlineKw:(e.onlineKw||[]).slice(),onlineCats:(e.onlineCats||[]).slice(),updated:iso(new Date())};
    close();persist();try{toast('Đã lưu chính sách hoàn tiền')}catch(_){}};
}
window.mncbClose=close;


/* ── Dữ liệu user cung cấp 17/11/2026 (điền 1 lần, có cờ trên thẻ; không đụng sao kê/dư nợ) ──
 * VP StepUp (…6799, chốt 20): chính sách theo app VPBank NEO; kỳ 21/09–20/10/2026 thực nhận 812.911 đ
 *   (online 15% = 994.482 → chạm trần 700.000; ăn uống 4% = 107.669; còn lại 0,1% = 5.242; FPT Telecom 215.000 không hoàn).
 * VIB Max Card (…8729): sao kê điểm 15/11/2026: +161.726 điểm, −7.616 (hoàn trả mua hàng Shopee) → 154.110 điểm = 154.110 đ (1 điểm = 1 đ). */
const SEED_VP={period:'stmt',cap:0,base:{rate:0.1,cap:0},
  rules:[{id:'vp_online',name:'Chi tiêu trực tuyến',match:'online',cats:[],rate:6,cap:300000,min:0,tiers:[{min:10000000,rate:15,cap:700000},{min:100000000,rate:15,cap:1500000}]},
         {id:'vp_anuong',name:'Ăn uống',match:'cats',cats:['Ăn uống'],rate:2,cap:100000,min:0,tiers:[{min:10000000,rate:4,cap:200000},{min:100000000,rate:4,cap:200000}]}],
  conds:[],excl:[],target:0,onlineKw:ONLINE_KW_DEF.slice(),onlineCats:['Di chuyển'],
  note:'VPBank StepUp — bậc theo tổng doanh số kỳ sao kê: dưới 10tr: online 6% (tối đa 300K), ăn uống 2% (tối đa 100K) · 10tr–dưới 100tr: online 15% (700K), ăn uống 4% (200K) · từ 100tr: online 15% (1,5tr), ăn uống 4% (200K) · còn lại 0,1% không giới hạn. Một số giao dịch không được hoàn (ví dụ FPT Telecom kỳ 10/2026). Chính sách có thể thay đổi theo VPBank.'};
function addHist(a,ref,actual,note){const per=cbPeriod(a,ref);a.cbHist=Array.isArray(a.cbHist)?a.cbHist:[];if(a.cbHist.some(x=>x.id===per.s))return false;a.cbHist.push({id:per.s,s:per.s,e:per.e,actual,note,at:'2026-11-17'});return true}
let seedBusy=false;
function cbSeed(){
  if(seedBusy||typeof db==='undefined'||!db||!Array.isArray(db.accounts)||!db.accounts.length)return;let ch=false;const cr=db.accounts.filter(a=>a&&a.type==='credit');
  let vps=cr.filter(a=>/\bvp\b|vpbank|step\s*up/i.test(a.name||''));if(vps.length>1)vps=vps.filter(a=>+a.stDay===20);
  if(vps.length===1){const a=vps[0];if(!a._cbSeedVP){if(!a.cashback)a.cashback=JSON.parse(JSON.stringify(SEED_VP));
    addHist(a,'2026-10-20',812911,'Online 700.000 (tính ra 994.482, chạm trần) · Ăn uống 107.669 · Còn lại 5.242 · FPT Telecom không hoàn');a._cbSeedVP=1;ch=true}}
  if(vps.length===1){const a=vps[0];if(!a._cbSeedVP2){if(a.cashback&&!Array.isArray(a.cashback.onlineCats))a.cashback.onlineCats=['Di chuyển'];a._cbSeedVP2=1;ch=true}}
  let vib=cr.filter(a=>/vib/i.test(a.name||''));const mx=vib.filter(a=>/max/i.test(a.name||''));if(mx.length)vib=mx;   // user xác nhận 17/11: "Thẻ VIB" (chốt 25) chính là Max Card
  if(vib.length===1){const a=vib[0];if(!a._cbSeedVIB){addHist(a,'2026-11-15',154110,'Điểm thưởng: +161.726, −7.616 hoàn trả mua hàng Shopee · 1 điểm = 1 đ');a._cbSeedVIB=1;ch=true}}
  if(ch){seedBusy=true;setTimeout(()=>{seedBusy=false;persist()},50)}
}
/* ══ NỐI VÀO CÁC MÀN KHÁC: form nhập · Tổng quan · Thống kê · Cài đặt · Chat ══ */
const PREF_DEF={kpi:true,alert:true,hint:true};
function prefs(){try{return Object.assign({},PREF_DEF,JSON.parse(localStorage.getItem('mncbPrefs')||'{}'))}catch(e){return Object.assign({},PREF_DEF)}}
function setPref(k,v){const p=prefs();p[k]=v;try{localStorage.setItem('mncbPrefs',JSON.stringify(p))}catch(e){}try{renderAll()}catch(e){}}
window.mncbSetPref=setPref;
const gid=id=>document.getElementById(id);

/* ── Form nhập giao dịch: tự tính số hoàn ── */
let fOnl=null;   // null = tự nhận; true/false = anh bấm chọn
function fState(){
  const amount=typeof getMoneyVal==='function'?getMoneyVal('f-amount'):money((gid('f-amount')||{}).value);
  return {amount,cat:String((gid('f-cat')||{}).value||'').split('|')[0],acct:(gid('f-acct')||{}).value||'',date:(gid('f-date')||{}).value||iso(new Date()),desc:(gid('f-desc')||{}).value||'',note:(gid('f-note')||{}).value||''};
}
function gainOn(a,s,onl){const ex=typeof editTxId!=='undefined'?editTxId:null;
  const ex1={category:s.cat,amount:s.amount,online:onl};const b=cbCalc(a,{ref:s.date,exclId:ex}),w=cbCalc(a,{ref:s.date,exclId:ex,extra:[ex1]});if(!b||!w)return null;
  const i=ruleIdxOf(ex1,w.p);const r=i>=0?w.rules[i]:null;
  return {gain:Math.max(0,w.total-b.total),pot:Math.max(0,w.afterCap-b.afterCap),rate:i===-2?0:r?r.rate:w.base.rate,grp:i===-2?'không được hoàn':r?(r.match==='online'?'Online':r.label):'danh mục khác',w,b,r,tierUp:!!(r&&b.rules[i]&&r.tier.idx>b.rules[i].tier.idx)}}
function renderHint(){
  const box=gid('mncb-fhint');if(!box)return;
  const off=()=>{box.style.display='none';box.innerHTML=''};
  // chỉ hiện với khoản CHI cá nhân; Thu / Chuyển / công ty: ẩn hẳn
  if(!prefs().hint||typeof txType==='undefined'||txType!=='expense'||(typeof modalDomain!=='undefined'&&modalDomain!=='personal'))return off();
  const s=fState();const act=cbActive();if(!act.length||!s.amount)return off();
  const a=cbCards().find(x=>x.id===s.acct);const p=a?cbPol(a):null;const on=a&&p&&p.ok;
  const onlAuto=on?isOnline({desc:s.desc,note:s.note,category:s.cat},p):false;const onl=fOnl==null?onlAuto:fOnl;
  let h='',cur=0;
  if(on){const g=gainOn(a,s,onl);cur=g.gain;
    const tag=g.tierUp?'lên bậc':(!g.gain&&g.pot)?'chờ điều kiện':(g.rate&&g.gain<s.amount*g.rate/100-1&&g.w.qualified)?'chạm trần':'';
    h='<div class="mncb-row" style="gap:8px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Hoàn <b class="'+(g.gain?'mncb-ok':'')+'">+'+K(g.gain)+'</b> · '+esc(g.grp)+(g.rate?' '+pct(g.rate):'')+(tag?' · <span class="mncb-ok">'+tag+'</span>':'')+'</span>'
      +(p.hasOnline?'<label style="display:flex;align-items:center;gap:6px;flex-shrink:0;min-height:32px"><input type="checkbox" id="mncb-onl"'+(onl?' checked':'')+' style="width:18px;height:18px">Online</label>':'')+'</div>'}
  if(s.cat){const best=act.filter(x=>!a||x.id!==a.id).map(x=>{const px=cbPol(x);const g=gainOn(x,s,isOnline({desc:s.desc,note:s.note,category:s.cat},px));return g?{x,g}:null}).filter(Boolean).sort((u,v)=>v.g.gain-u.g.gain)[0];
    if(best&&best.g.gain>=cur+5000)h+='<div class="mncb-row" style="gap:8px'+(h?';margin-top:4px':'')+'"><span>Quẹt <b>'+esc(sn(best.x))+'</b> hoàn <b class="mncb-ok">+'+K(best.g.gain)+'</b></span><button type="button" class="mncb-btn sm" style="min-height:30px" data-mncb-sw="'+best.x.id+'">Đổi thẻ</button></div>'}
  if(!h)return off();
  box.style.display='';box.innerHTML=h;
  const cb=gid('mncb-onl');if(cb)cb.onchange=()=>{fOnl=cb.checked;renderHint()};
  const sw=box.querySelector('[data-mncb-sw]');if(sw)sw.onclick=()=>{const sel=gid('f-acct');if(!sel)return;sel.value=sw.dataset.mncbSw;try{acctManual=true}catch(e){}sel.dispatchEvent(new Event('change',{bubbles:true}));fOnl=null;renderHint()};
}
function mountHint(){
  if(gid('mncb-fhint'))return;const row=gid('acct-note-grid')||gid('acct-row')||(gid('f-acct')&&gid('f-acct').closest('div'));   // đặt SAU cả hàng Tài khoản + Ghi chú để hai ô vẫn nằm ngang nhauif(!row)return;
  const d=document.createElement('div');d.id='mncb-fhint';d.className='mncb-tip';d.style.display='none';d.style.margin='-4px 0 10px';d.style.padding='6px 10px';row.after(d);
  const m=gid('add-modal')||document;['input','change'].forEach(ev=>m.addEventListener(ev,e=>{const id=e.target&&e.target.id;if(/^f-(amount|cat|acct|date|desc|note)$/.test(id||''))setTimeout(renderHint,0)},true));
  m.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('.type-btn,#btn-income,#btn-expense,[onclick*="setTxType"]'))setTimeout(renderHint,30)},true);
}

/* ── Tổng quan: nhắc sắp hết kỳ hoàn + hoàn dự kiến trong Lịch trả thẻ ── */
function homeAlert(){
  const sa=gid('smart-alerts');if(!sa)return;let el=gid('mncb-alert');
  if(!el){el=document.createElement('div');el.id='mncb-alert';sa.after(el)}
  const rows=prefs().alert?cbActive().map(a=>{const c=cbCalc(a);if(!c||!c.current||c.daysLeft>5)return null;const t=c.tips.find(x=>x.k!=='capfull'&&x.gain>=30000);return t?{a,c,t}:null}).filter(Boolean):[];
  if(!rows.length){el.innerHTML='';el.style.display='none';return}
  el.style.display='';
  el.innerHTML='<button type="button" class="mncb-card mncb-link" style="margin:10px 12px 0;width:calc(100% - 24px);padding:12px 14px" onclick="mncbOpen(\'cb\')"><div class="mncb-row"><span style="font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:.5px">Hoàn tiền sắp hết kỳ</span><span style="font-size:13px;color:var(--navy);font-weight:600">Xem ›</span></div>'
    +rows.map(r=>'<div style="padding:8px 0 2px;border-top:1px solid var(--bdr);margin-top:8px;font-size:13px;line-height:1.5;text-align:left"><b>'+esc(sn(r.a))+'</b> · '+(r.c.daysLeft?'còn '+r.c.daysLeft+' ngày':'hôm nay hết kỳ')+' · đang được <b class="mncb-ok">'+K(r.c.total)+'</b><br>'+r.t.html.charAt(0).toUpperCase()+r.t.html.slice(1)+'</div>').join('')+'</button>';
}
function calExtra(){
  const el=gid('cardcal-list');if(!el||!el.innerHTML||el.querySelector('.mncb-calx'))return;const act=cbActive();if(!act.length)return;
  const L=act.map(a=>({a,c:cbCalc(a)})).filter(x=>x.c);const tot=L.reduce((s,x)=>s+x.c.total,0);
  const d=document.createElement('div');d.className='mncb-calx';d.style.cssText='margin:4px 14px 12px;padding:10px 12px;border-radius:12px;background:rgba(20,130,90,.08);font-size:13px;line-height:1.7';
  d.innerHTML='<div class="mncb-row"><b>Hoàn tiền dự kiến kỳ này</b><b class="mncb-ok">'+K(tot)+'</b></div>'+L.map(x=>'<div class="mncb-row" style="color:var(--muted)"><span>'+esc(sn(x.a))+' · kỳ hoàn đến '+dm(x.c.e)+'</span><span>'+K(x.c.total)+'</span></div>').join('');
  el.appendChild(d);
}

/* ── Thống kê: khối Hoàn tiền thẻ ── */
function statsBlock(){
  const ins=gid('ps-insights');if(!ins)return;const host=ins.closest('.card')||ins;let el=gid('mncb-stats');
  const cards=cbCards().filter(a=>{const p=cbPol(a);return (p&&p.ok)||(a.cbHist||[]).length});
  if(!cards.length){if(el)el.remove();return}
  if(!el){el=document.createElement('div');el.id='mncb-stats';el.className='card';host.after(el)}
  const by={};let sEst=0,sSp=0,sAct=0,nAct=0;
  cards.forEach(a=>cbHistory(a,5).forEach(h=>{const m=h.e.slice(0,7);const o=by[m]=by[m]||{est:0,act:0,hasAct:false,spent:0};o.est+=h.est;o.spent+=h.spent;if(h.actual!=null){o.act+=h.actual;o.hasAct=true;if(!h.current){sAct+=h.actual;nAct++}}if(!h.current){sEst+=h.est;sSp+=h.spent}}));
  const months=Object.keys(by).sort().slice(-6);const mx=Math.max(1,...months.map(m=>Math.max(by[m].est,by[m].act)));
  const cur=cbActive().reduce((s,a)=>{const c=cbCalc(a);return s+(c?c.total:0)},0);
  el.innerHTML='<div class="card-h">Hoàn tiền thẻ</div><div style="padding:4px 15px 14px">'
    +'<div class="mncb-tiles" style="margin-top:4px"><div class="mncb-tile"><div class="l">Dự kiến kỳ này</div><div class="v mncb-ok">'+K(cur)+'</div><div class="s">'+cbActive().length+' thẻ có chính sách</div></div>'
    +'<div class="mncb-tile"><div class="l">Tỉ lệ hoàn TB</div><div class="v">'+(sSp?pct(sEst/sSp*100):'—')+'</div><div class="s">trên chi tiêu bằng thẻ, 6 kỳ</div></div></div>'
    +'<div class="mncb-sec">Theo kỳ (tháng kết thúc) · dự kiến / thực nhận</div>'
    +months.map(m=>{const o=by[m];return '<div style="padding:6px 0;border-top:1px solid var(--bdr)"><div class="mncb-row" style="font-size:13px"><span>T'+(+m.slice(5))+'/'+m.slice(0,4)+'</span><span><span style="color:var(--muted)">'+K(o.est)+'</span>'+(o.hasAct?' / <b class="mncb-ok">'+K(o.act)+'</b>':'')+'</span></div>'
      +'<div class="mncb-bar" style="height:5px"><i style="width:'+(o.est/mx*100)+'%;background:var(--navy);opacity:.45"></i></div>'+(o.hasAct?'<div class="mncb-bar" style="height:5px;margin-top:3px"><i style="width:'+(o.act/mx*100)+'%"></i></div>':'')+'</div>'}).join('')
    +(nAct?'<div style="font-size:13px;color:var(--muted);margin-top:8px">Các kỳ đã ghi thực nhận: tổng <b class="mncb-ok">'+K(sAct)+'</b>.</div>':'')
    +'<button type="button" class="mncb-btn" style="width:100%;margin-top:10px" onclick="mncbOpen(\'cb\')">Xem chi tiết hoàn tiền</button></div>';
}

/* ── Cài đặt › Dữ liệu: mục Thẻ & hoàn tiền ── */
function settingsBlock(){
  const ex=gid('settings-export');if(!ex)return;let el=gid('mncb-set');
  if(!el){const head=document.createElement('div');head.className='sec-head';head.id='mncb-set-head';head.innerHTML='<span class="sec-head-title">Thẻ & hoàn tiền</span>';
    el=document.createElement('div');el.className='card';el.id='mncb-set';el.style.padding='6px 16px 12px';
    const ref=[...ex.querySelectorAll('.sec-head')][0];if(ref){ref.before(head);head.after(el)}else{ex.prepend(el);ex.prepend(head)}}
  const P=prefs();const sw=(k,label,sub)=>'<div class="mncb-row" style="padding:9px 0;border-top:1px solid var(--bdr)"><div><div style="font-size:15px">'+label+'</div><div style="font-size:12px;color:var(--muted)">'+sub+'</div></div><button type="button" role="switch" aria-checked="'+P[k]+'" aria-label="'+esc(label)+'" onclick="mncbSetPref(\''+k+'\','+(!P[k])+')" style="flex-shrink:0;width:48px;height:30px;border-radius:15px;border:none;padding:3px;cursor:pointer;background:'+(P[k]?'var(--green)':'#c9d1dc')+'"><span style="display:block;width:24px;height:24px;border-radius:50%;background:#fff;transform:translateX('+(P[k]?'18px':'0')+');transition:transform .15s"></span></button></div>';
  el.innerHTML=cbCards().map((a,i)=>{const p=cbPol(a);const c=p&&p.ok?cbCalc(a):null;return '<div class="mncb-row" style="padding:9px 0;'+(i?'border-top:1px solid var(--bdr)':'')+'"><div style="min-width:0"><div style="font-size:15px;font-weight:600">'+esc(sn(a))+'</div><div style="font-size:12px;color:var(--muted)">'+(c?'Kỳ hoàn '+dm(c.s)+'–'+dm(c.e)+' · dự kiến '+K(c.total):'Chưa cài chính sách hoàn tiền')+((a.cbHist||[]).length?' · đã ghi '+a.cbHist.length+' kỳ':'')+'</div></div><button type="button" class="mncb-btn sm" onclick="mncbEdit(\''+a.id+'\')">'+(c?'Chính sách':'+ Cài')+'</button></div>'}).join('')
    +sw('kpi','Ô hoàn tiền ở Tổng quan','Hiện "Hoàn tiền dự kiến kỳ này" trong Chỉ số nhanh')
    +sw('alert','Nhắc sắp hết kỳ hoàn','Tổng quan báo khi còn ≤ 5 ngày mà còn nhận thêm được')
    +sw('hint','Tính hoàn khi nhập giao dịch','Hiện số hoàn và gợi ý đổi thẻ ngay trong form nhập');
}

/* ── Chat: lệnh mở và câu hỏi về hoàn tiền ── */
function chatAnswer(t){
  const n=fold(t).trim();
  let m=/^(mo|xem|vao|toi|qua)\s+(tab\s+|muc\s+)?(hoan tien|cashback|sao ke the|sao ke|the tin dung|tab the|the)$/.exec(n);
  if(m){const k=/hoan|cash/.test(m[3])?'cb':/sao ke/.test(m[3])?'stmt':'cards';setTimeout(()=>{try{closeQaChat()}catch(e){}window.mncbOpen(k)},350);return 'Đang mở '+({cb:'Tài khoản › Hoàn tiền',stmt:'Tài khoản › Sao kê',cards:'Tài khoản › Thẻ'}[k])+'…'}
  if(!/(hoan tien|cashback|tien hoan|duoc hoan)/.test(n))return null;
  const act=cbActive();if(!act.length)return 'Chưa có thẻ nào cài chính sách hoàn tiền. Vào <b>Tài khoản › Hoàn tiền</b> để cài.';
  const pick=act.filter(a=>{const s=fold(sn(a));return new RegExp('(^|[^a-z])'+s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z]|$)').test(n)});const L=(pick.length?pick:act).map(a=>({a,c:cbCalc(a)})).filter(x=>x.c);
  const tot=L.reduce((s,x)=>s+x.c.total,0);
  return (L.length>1?'Hoàn tiền dự kiến kỳ này: <b>'+K(tot)+'</b><br>':'')+L.map(x=>'<b>'+esc(sn(x.a))+'</b> · kỳ '+dm(x.c.s)+'–'+dm(x.c.e)+' · chi '+K(x.c.spent)+' → hoàn <b>'+K(x.c.total)+'</b>'+(x.c.tips[0]&&x.c.tips[0].k!=='capfull'?'<br><span class="qa-why">Nên: '+x.c.tips[0].html+'</span>':'')).join('<br>');
}
function hookChat(){
  if(typeof window.qaSend!=='function'||window.qaSend.__cb)return;const orig=window.qaSend;
  const w=function(){const inp=gid('qa-input');const t=inp?inp.value.trim():'';let r=null;try{r=t?chatAnswer(t):null}catch(e){}
    if(r){const lg=gid('qa-log');inp.value='';inp.style.height='auto';if(lg){lg.insertAdjacentHTML('beforeend','<div class="qa-me">'+esc(t)+'</div><div class="qa-bot">'+r+'</div>');lg.scrollTop=lg.scrollHeight}return}
    return orig.apply(this,arguments)};
  w.__cb=1;window.qaSend=w;
}
function integ(){try{mountHint()}catch(e){}try{homeAlert()}catch(e){console.warn('cb alert',e)}try{settingsBlock()}catch(e){console.warn('cb set',e)}try{hookChat()}catch(e){}}

/* ── Ô "Hoàn tiền dự kiến" ở Tổng quan ── */
function kpiTile(){
  const el=document.getElementById('kpi-strip');if(!el)return;const old=el.querySelector('.mncb-kpi');if(old)old.remove();
  const act=cbActive();if(!act.length||!prefs().kpi)return;
  let tot=0,spent=0,tip=null;act.forEach(a=>{const c=cbCalc(a);if(!c)return;tot+=c.total;spent+=c.spent;const t=c.tips.find(x=>x.k!=='capfull');if(t&&(!tip||t.gain>tip.gain))tip={gain:t.gain,a}});
  const d=document.createElement('div');d.className='kpi-card mncb-kpi';d.setAttribute('role','button');d.tabIndex=0;
  d.innerHTML='<div class="kpi-top">'+((typeof I!=='undefined'&&I.card)||'')+' Hoàn tiền dự kiến kỳ này<span class="kpi-arrow">›</span></div><div class="kpi-val" style="color:#14825a">'+K(tot)+'</div><div class="kpi-sub">'+act.length+' thẻ · chi tính hoàn '+K(spent)+(tip&&tip.gain>0?' · '+esc(sn(tip.a))+' còn nhận thêm được '+K(tip.gain):'')+'</div>';
  const go=()=>window.mncbOpen('cb');d.onclick=go;d.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}};
  el.appendChild(d);
}

/* ── Nối vào app ── */
function hook(){
  if(window.__mncbHooked)return;
  if(typeof window.renderAll!=='function'||typeof window.renderAcctReport!=='function'||!$('personal-account'))return setTimeout(hook,300);
  window.__mncbHooked=1;css();setupAcct();
  const rar=window.renderAcctReport;window.renderAcctReport=function(){const r=rar.apply(this,arguments);try{splitCards()}catch(e){console.warn('cb split',e)}return r};
  const ra=window.renderAll;window.renderAll=function(){const r=ra.apply(this,arguments);try{integ()}catch(e){}try{cbSeed()}catch(e){console.warn('cb seed',e)}try{kpiTile()}catch(e){console.warn('cb kpi',e)}try{if(visible())renderSub()}catch(e){}return r};
  if(typeof window.renderKpiStrip==='function'){const rk=window.renderKpiStrip;window.renderKpiStrip=function(){const r=rk.apply(this,arguments);try{kpiTile()}catch(e){}return r}}
  if(typeof window.ftNavSub==='function'){const fn=window.ftNavSub;const w=function(s){if(s==='cashback'){const r=fn.call(this,'account');showSub('cb');return r}const r=fn.apply(this,arguments);if(s==='account'){setupAcct();showSub(acSub,true)}return r};w.__mg=fn.__mg;w.__mnu=fn.__mnu;window.ftNavSub=w}
  if(typeof window.renderCardCal==='function'){const rc=window.renderCardCal;window.renderCardCal=function(){const r=rc.apply(this,arguments);try{calExtra()}catch(e){}return r}}
  if(typeof window.renderPersonalStats==='function'){const rs=window.renderPersonalStats;window.renderPersonalStats=function(){const r=rs.apply(this,arguments);try{statsBlock()}catch(e){console.warn('cb stats',e)}return r}}
  if(typeof window.saveTransaction==='function'){const st=window.saveTransaction;window.saveTransaction=function(){
    const before=new Set((db.transactions||[]).map(t=>String(t.id)));const eid=typeof editTxId!=='undefined'?editTxId:null;const want=fOnl;const isExp=typeof txType!=='undefined'&&txType==='expense';
    const r=st.apply(this,arguments);
    try{if(isExp&&want!=null){const t=eid!=null?(db.transactions||[]).find(x=>String(x.id)===String(eid)):(db.transactions||[]).find(x=>!before.has(String(x.id))&&x.flow==='out');
      if(t){const a=cbCards().find(x=>x.id===t.account);const p=a?cbPol(a):null;if(p&&p.hasOnline){const auto=isOnline(Object.assign({},t,{online:undefined}),p);if(want===auto)delete t.online;else t.online=want;try{save()}catch(e){}}}}}catch(e){console.warn('cb save onl',e)}
    fOnl=null;return r}}
  if(typeof window.setTxType==='function'){const tt=window.setTxType;window.setTxType=function(){const r=tt.apply(this,arguments);setTimeout(renderHint,0);return r}}
  ['openAddModal','openEditTx'].forEach(fn=>{if(typeof window[fn]==='function'){const f=window[fn];window[fn]=function(){fOnl=null;const r=f.apply(this,arguments);try{if(fn==='openEditTx'){const t=(db.transactions||[]).find(x=>String(x.id)===String(arguments[0]));if(t&&typeof t.online==='boolean')fOnl=t.online}}catch(e){}setTimeout(renderHint,60);return r}}});
  try{renderAcctReport()}catch(e){}try{kpiTile()}catch(e){}try{integ()}catch(e){}
  setTimeout(()=>{try{cbSeed()}catch(e){}try{setupAcct();renderAcctReport();renderSub()}catch(e){}},900);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(hook,0));else setTimeout(hook,0);
})();

