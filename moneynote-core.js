/* MoneyNote VN — LÕI TÍNH TOÁN DÙNG CHUNG cho bản điện thoại (moneynote.html) và desktop (moneynote-desktop.html).
 * Nguồn duy nhất: sửa ở app/moneynote-core.js rồi copy sang desktop/ và moneynote-github/. KHÔNG định nghĩa lại các hàm này trong file HTML.
 * Gồm: định dạng số, thẻ tín dụng (cardStmtClosed → cardDebtInfo), trả góp, phí/lãi khoản nợ, gộp đồng bộ 3 chiều.
 * Các hàm đọc biến toàn cục của trang (db, today, monthOf, acctById, ensureInst, localSeq, DEVICE_ID, ftPushed, ftGetBase…) lúc được GỌI, nên file này phải nạp TRƯỚC script chính.
 */
const fmtFull=n=>new Intl.NumberFormat('vi-VN').format(Math.round(+n||0))+' đ';
function fmtK(n){n=+n||0;const a=Math.abs(n),g=(v,d)=>String(+v.toFixed(d));if(a>=1e9)return g(n/1e9,2)+'tỷ';if(a>=1e6)return g(n/1e6,2)+'tr';if(a>=1e3)return g(n/1e3,1)+'K';return String(Math.round(n))}
const fmt=n=>fmtK(n);
function fmtVnd(n){return(n>=0?'+':'')+fmtK(n)}
function debtTermOf(d){if(+d.term>0)return +d.term;const m=+d.monthlyPayment||0;return m>0?(d.paid||0)+Math.ceil((+d.remaining||0)/m):0}
function debtFeeAt(d,k){const f=+d.fee||0;if(!f||!d||k<0)return 0;const n=debtTermOf(d);if(n&&k>=n)return 0;
  if(d.feeMode==='once')return k===0?f:0;if(d.feeMode==='fixed')return f;if(d.feeMode==='split'&&n){const b=Math.floor(f/n);return k===n-1?f-b*(n-1):b}return 0}
function debtFeeNext(d){return debtFeeAt(d,d.paid||0)}
function debtFeeLeft(d){const n=debtTermOf(d);if(!n)return d.feeMode==='fixed'?0:0;let s=0;for(let k=(d.paid||0);k<n;k++)s+=debtFeeAt(d,k);return s}
function acctBalance(a){let b=a.opening||0;const _all=(typeof ftHid!=='undefined'&&ftHid&&ftHid.txs&&ftHid.txs.length)?(db.transactions||[]).concat(ftHid.txs):(db.transactions||[]);_all.forEach(t=>{if(t.flow==='xfer'){if(t.from===a.id)b-=t.amount;if(t.to===a.id)b+=t.amount}else if(t.group!=='company'&&(t.account||'cash')===a.id){b+=(t.flow==='in'?t.amount:-t.amount)}});return b}
function stmtDateOf(y,m,st){return new Date(y,m,Math.min(+st||1,new Date(y,m+1,0).getDate()))}
function lastStmtDate(st,td){td=td||new Date();let c=stmtDateOf(td.getFullYear(),td.getMonth(),st);if(td.getDate()<c.getDate())c=stmtDateOf(td.getFullYear(),td.getMonth()-1,st);return c}
function cardStmtClosed(card){
  // Số phải trả kỳ đã chốt = tổng dư nợ hiện tại − phần quẹt trong kỳ CHƯA chốt (tự gồm dư nợ cũ/ban đầu)
  const st=card.stDay||1;
  const fmtD=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const close=lastStmtDate(st);
  const cStr=fmtD(close);
  const pStr=fmtD(stmtDateOf(close.getFullYear(),close.getMonth()-1,st));
  ensureInst();
  // Chi tiêu đúng trong kỳ = giao dịch phát sinh (pStr, cStr] — không suy ra từ dư nợ hiện tại (tránh bị hụt khi đã có thanh toán bù trừ)
  const spend=(db.transactions||[]).filter(t=>t.group!=='company'&&t.flow==='out'&&(t.account||'')===card.id&&t.date>pStr&&t.date<=cStr).reduce((s,t)=>s+t.amount,0);
  const paidSince=(db.transactions||[]).filter(t=>t.flow==='xfer'&&t.to===card.id&&t.date>=cStr).reduce((s,t)=>s+t.amount,0);
  const inst=db.installments.filter(i=>i.card===card.id).reduce((s,i)=>s+instInStmt(i,cStr),0);
  const dmp=(db.debts||[]).filter(d=>d.acct===card.id&&d.kind!=='receivable'&&(+d.remaining||0)>0&&+d.monthlyPayment&&(d.lastPayDate||d.lastPayMonth||'')<cStr).reduce((s,d)=>s+(+d.monthlyPayment)+debtFeeNext(d),0);
  const _ia=db.installments.filter(i=>i.card===card.id);const instFee=(_ia.some(i=>instInStmt(i,cStr))?(+card.instFeeMonthly||0):0)+_ia.reduce((s,i)=>s+instFeeInStmt(i,cStr),0);
  const paidInst=0; // kỳ góp luôn nằm trong sao kê của nó — mọi khoản trả đều trừ vào sao kê
  const _raw=spend+inst+dmp+instFee,_paid=Math.max(0,paidSince-paidInst);
  let stmt=Math.max(0,_raw-_paid),over=Math.max(0,_paid-_raw);
  if(card.stmtOverride!=null&&(!card.stmtOverrideKey||card.stmtOverrideKey===cStr)){stmt=Math.max(0,(+card.stmtOverride)-paidSince);over=Math.max(0,paidSince-(+card.stmtOverride))}
  // over = phần trả vượt sao kê đã chốt → trừ vào chi tiêu kỳ đang mở (trả trước)
  return {stmt,over,spend,inst:inst+dmp+instFee,instOnly:inst+dmp,fee:instFee,paidSince,closeStr:cStr};
}
function stmtSplit(a){const s=cardStmtClosed(a);const pay=s.stmt||0;let spend=s.spend||0,inst=s.instOnly!=null?s.instOnly:(s.inst||0),fee=s.fee||0;const raw=spend+inst+fee;if(raw>pay&&raw>0){const k=pay/raw;spend=Math.round(spend*k);inst=Math.round(inst*k);fee=Math.max(0,pay-spend-inst)}let other=Math.max(0,pay-spend-inst-fee);if(other<50000){spend+=other;other=0}return {pay,spend,inst,fee,other,s}}
function stmtParts(x){return [['Chi tiêu đã chốt',x.spend],['Trả góp',x.inst],['Lãi & phí trả góp',x.fee],['Khác · chưa khớp giao dịch',x.other]].filter(r=>r[1]>0)}
function stmtSplitTxt(x,fm){fm=fm||fmtK;return stmtParts(x).map(r=>r[0]+' '+fm(r[1])).join(' · ')}
function cardTotDebt(a){return cardDebtInfo(a).total}
function instMo(s){s=String(s||'');return +s.slice(0,4)*12+(+s.slice(5,7)-1)}
function instMoStr(n){return Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0')}
function instLastClose(card){const c=lastStmtDate(card.stDay||1,new Date());return c.getFullYear()+'-'+String(c.getMonth()+1).padStart(2,'0')+'-'+String(c.getDate()).padStart(2,'0')}
function instSetStart(it,paid,cs){const p=Math.max(0,+paid||0);it.startStmt=instMoStr(p>0?instMo(cs)-p:instMo(cs)+1)}
function instSync(it){if(it.settled){const ch=(it.paid||0)!==it.term;it.paid=it.term;return ch}const c=acctById(it.card);if(!c||c.type!=='credit')return false;const cs=instLastClose(c);
  if(!it.startStmt){const l=it.lastPayDate||it.lastPayMonth||'';let n=(it.paid||0);
    // trạng thái cũ: kỳ trong sao kê vừa chốt = paid+1 nếu khoản đã lên sao kê này
    let billed;if(l)billed=l<cs;else if(n>0)billed=true;else{let d=it.start||it.date||'';if(!d){const m=/(\d{13})/.exec(it.id||'');if(m){const x=new Date(+m[1]);d=x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}}billed=d?d<=cs:true}
    if(n>=it.term&&!billed){it.startStmt=instMoStr(instMo(cs)-it.term);}else it.startStmt=instMoStr(instMo(cs)-n-(billed?0:-1));}
  const k=instMo(cs)-instMo(it.startStmt)+1;const np=k>it.term?it.term:Math.max(0,k-1);
  const ch=np!==(it.paid||0)||it.lastStmt!==cs;it.paid=np;it.lastStmt=cs;return ch}
function cardSpendCycle(card){return cardDebtInfo(card).cyc}
function cardInstDue(card){ensureInst();return db.installments.filter(i=>i.card===card.id&&(i.paid||0)<i.term).reduce((s,i)=>s+i.per,0)}
function instRemaining(i){const per=+i.per||0,left=Math.max(0,(i.term||0)-(i.paid||0));return per&&i.term?per*left:Math.max(0,(+i.total||0)-(i.paid||0)*per)}
function instBilled(i,cs){if(!i.startStmt)instSync(i);return i.startStmt?instMo(cs)>=instMo(i.startStmt):true}
function instInStmt(i,cs){if(!i.startStmt)instSync(i);const k=instMo(cs)-instMo(i.startStmt);return k>=0&&k<i.term?(+i.per||0):0}
function instExtraAt(i,k){if(!i||k<0||k>=i.term)return 0;let x=0;const f=+i.fee||0;
  if(f){if(i.feeMode==='once')x+=k===0?f:0;else if(i.feeMode==='split'){const b=Math.floor(f/i.term);x+=k===i.term-1?f-b*(i.term-1):b}}
  const r=(+i.rate||0)/100;if(r&&(i.rateMode==='flat'||i.rateMode==='reducing')){const P=+i.total||0;const base=i.rateMode==='reducing'?Math.max(0,P-k*(+i.per||0)):P;x+=Math.round(base*r)}
  return x}
function instFeeInStmt(i,cs){if(i.settled)return 0;if(!i.startStmt)instSync(i);return instExtraAt(i,instMo(cs)-instMo(i.startStmt))}
function instPartsMonth(list,mo,card){let p=0,f=0,any=false;(list||[]).forEach(i=>{if(i.settled)return;if(!i.startStmt)instSync(i);const k=mo-instMo(i.startStmt);if(k>=0&&k<i.term){any=true;p+=+i.per||0;f+=instExtraAt(i,k)}});if(any)f+=(+(card&&card.instFeeMonthly)||0);return {p,f}}
function instExtraTotal(i){let s=0;for(let k=0;k<(i.term||0);k++)s+=instExtraAt(i,k);return s}
function instExtraLeft(i){let s=0;for(let k=(i.paid||0);k<(i.term||0);k++)s+=instExtraAt(i,k);return s}
function instRemNow(i,cs){return Math.max(0,instRemaining(i)-instInStmt(i,cs))}
function cardDebtInfo(a){ensureInst();const s=cardStmtClosed(a),cs=s.closeStr;
  const cycTx=(db.transactions||[]).filter(t=>t.group!=='company'&&t.flow==='out'&&(t.account||'')===a.id&&t.date>cs);
  const cyc=cycTx.reduce((x,t)=>x+t.amount,0);
  const insts=db.installments.filter(i=>i.card===a.id&&(i.paid||0)<i.term);
  const instRem=insts.reduce((x,i)=>x+instRemNow(i,cs),0);
  const linked=(db.debts||[]).filter(d=>d.acct===a.id&&d.kind!=='receivable'&&!d.settled).reduce((x,d)=>x+(+d.remaining||0),0);
  const prepaid=Math.min(cyc,s.over||0);
  const revolving=(s.stmt||0)+cyc-prepaid;
  return {stmt:s.stmt||0,cyc,prepaid,cycN:cycTx.length,cycTx,instRem,insts,linked,revolving,total:revolving+instRem+linked,closeStr:cs,s,avail:a.limit?Math.max(0,a.limit-(revolving+instRem+linked)):null}}
function cardsDebtTotal(){return (db.accounts||[]).filter(a=>a.type==='credit').reduce((s,a)=>s+cardDebtInfo(a).total,0)}
function nextDueDate(card){
  if(!card.dueDay)return null;const td=new Date();td.setHours(0,0,0,0);
  let d=new Date(td.getFullYear(),td.getMonth(),card.dueDay);
  if(d<td)d=new Date(td.getFullYear(),td.getMonth()+1,card.dueDay);
  return d;
}
function ftH(v){const s=JSON.stringify(v===undefined?null:v,(k,x)=>typeof x==='string'&&(x==='[IMG_LOCAL]'||(x.length>2000&&x.startsWith('data:')))?'#img':x)||'';let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return h+':'+s.length}
const ftIsIdArr=v=>Array.isArray(v)&&v.every(x=>x&&typeof x==='object'&&x.id!=null);
function ftBaseOf(d){const b={};for(const k in d){const v=d[k];if(ftIsIdArr(v)){const m={};v.forEach(x=>m[String(x.id)]=ftH(x));b[k]={a:m}}else b[k]={h:ftH(v)}}return b}
function ftMerge(L,C,B){B=B||{};const out={};const keys=new Set([...Object.keys(L||{}),...Object.keys(C||{})]);
  keys.forEach(k=>{const lv=L[k],cv=C[k],b=B[k];
    if(ftIsIdArr(lv)&&ftIsIdArr(cv)&&(!b||b.a)){const bm=b?b.a:{};const cm=new Map(cv.map(x=>[String(x.id),x]));const lm=new Set();const res=[];
      lv.forEach(l=>{const id=String(l.id);lm.add(id);const c=cm.get(id),lh=ftH(l);
        if(c){res.push(lh===bm[id]?c:l)}else if(!(id in bm&&lh===bm[id]))res.push(l)});
      cv.forEach(c=>{const id=String(c.id);if(lm.has(id))return;if(id in bm&&ftH(c)===bm[id])return;res.push(c)});
      out[k]=res;return}
    const lh=ftH(lv);const pick=(b&&b.h===lh)?cv:(lv===undefined&&!(b)?cv:lv);if(pick!==undefined)out[k]=pick});
  return out}
function ftDecide(data,cloudDb){const cs=data._seq||0;if(data._deviceId&&data._deviceId===DEVICE_ID)return['ignore'];const pushed=ftPushed(),pending=localSeq>pushed;
  if(!pending&&cs>localSeq)return['adopt'];
  if(cs>pushed)return['merge',ftGetBase(false)];
  if(ftH(cloudDb)===ftH(ftFull()))return['ignore'];
  return['merge',ftGetBase(cs===pushed)||ftGetBase(false)]}
const FT_OWN={accounts:['instFeeMonthly','stmtOverride','stmtOverrideKey'],installments:['startStmt','feeMode','fee','rateMode','rate'],debts:['feeMode','fee','rateMode','rate']};
function ftProtect(cloudDb){let n=0;for(const k in FT_OWN){const loc=new Map((db[k]||[]).map(x=>[String(x.id),x]));(cloudDb[k]||[]).forEach(c=>{const l=loc.get(String(c.id));if(!l)return;FT_OWN[k].forEach(f=>{if(f in l&&JSON.stringify(c[f])!==JSON.stringify(l[f])){c[f]=l[f];n++}})})}
  for(const k in db){if(k[0]==='_'&&!(k in cloudDb)){cloudDb[k]=db[k];n++}}return n}
