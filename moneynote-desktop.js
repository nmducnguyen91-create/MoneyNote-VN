// MoneyNote VN — desktop extras: bảng kê, báo cáo, lịch, nhập nhanh, phím tắt, CSV
(function(){
  const GROUPS={personal:'Cá nhân'};
  let sort={col:'date',dir:-1};
  let selTxId=null,qaEditId=null,repGroup='',repMonth=new Date().toISOString().slice(0,7),calMonth=new Date().toISOString().slice(0,7),calDay=null;
  const acctName=id=>{const a=(db.accounts||[]).find(x=>x.id===id);return a?a.name:(id||'')};
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dt=d=>{if(!d)return'';const p=d.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:d};
  const monthLabel=m=>{const p=m.split('-');return'T'+(+p[1])+'/'+p[0]};

  // ══ INJECT UI ══
  const css=document.createElement('style');
  css.textContent=`
  .dx-card{background:var(--card);border:1px solid var(--bdr);border-radius:16px;box-shadow:0 2px 10px rgba(16,40,64,.05)}
  .dx-h{font-size:16px;font-weight:800;padding:16px 18px 0}
  .dx-sel{padding:10px 14px;border:1px solid var(--bdr);border-radius:10px;background:var(--light);font-size:14px;color:var(--text)}
  .dx-btn{padding:10px 18px;border:none;border-radius:10px;background:var(--navy);color:#fff;font-size:14px;font-weight:700;cursor:pointer}
  .dx-btn2{padding:10px 16px;border:1px solid var(--bdr);border-radius:10px;background:var(--light);color:var(--text);font-size:14px;font-weight:600;cursor:pointer}
  .dx-kbd{display:inline-block;background:var(--light);border:1px solid var(--bdr);border-radius:5px;padding:1px 6px;font-size:11px;font-weight:700;color:var(--muted)}
  #qa-panel{position:fixed;right:24px;bottom:24px;width:330px;z-index:1200;display:none;padding:16px;box-shadow:0 12px 40px rgba(16,40,64,.22)}
  #qa-panel.open{display:block}
  #qa-panel input,#qa-panel select,#qa-panel textarea{width:100%;padding:10px 13px;border:1px solid var(--bdr);border-radius:10px;background:var(--light);font-size:14px;color:var(--text);box-sizing:border-box}
  #tx-detail{position:fixed;right:24px;top:90px;width:310px;z-index:1150;display:none;padding:16px}
  #tx-detail.open{display:block}
  #csv-overlay{display:none;position:fixed;inset:0;background:rgba(10,20,32,.45);z-index:1300;align-items:center;justify-content:center}
  #csv-overlay.open{display:flex}
  #screen-cal.active{display:grid!important;grid-template-columns:minmax(0,1fr) 340px;gap:0 16px;align-items:start;padding:4px 12px 0!important;box-sizing:border-box}
  #screen-cal>.card{margin:0 0 14px!important}
  #screen-cal>.cal-bar{grid-column:1/-1}
  #screen-cal>#cal-side{position:sticky;top:12px;max-height:calc(100vh - 24px);overflow:auto}
  @media (max-width:1180px){#screen-cal.active{grid-template-columns:minmax(0,1fr)}#screen-cal>#cal-side{position:static;max-height:none}}
  .cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;padding:14px 16px 16px}
  .rf-v{opacity:0;transition:opacity .12s;pointer-events:none}
  .rf-col:hover .rf-v,.rf-col.rf-on .rf-v{opacity:1}
  .cal-wk{text-align:center;font-size:12px;font-weight:700;color:var(--muted);padding:2px 0}
  .cal-cell{position:relative;height:108px;display:flex;flex-direction:column;gap:2px;border:1px solid var(--bdr);border-radius:10px;padding:8px 10px;font-size:13px;cursor:pointer;background:var(--card);overflow:hidden;font-variant-numeric:tabular-nums;transition:border-color .12s}
  .cal-cell:hover{border-color:var(--navy)}
  .cal-cell.sel{outline:2px solid var(--navy);outline-offset:-1px}
  .cal-cell .cal-dn{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:13px;margin-bottom:auto}
  .cal-cell.today .cal-dn>span:first-child{background:var(--navy);color:#fff;border-radius:999px;min-width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px}
  .cal-cell.wkend .cal-dn>span:first-child{color:var(--red)}
  .cal-cell.today.wkend .cal-dn>span:first-child{color:#fff}
  .cal-cell .cal-n{font-size:11px;font-weight:600;color:var(--muted)}
  .cal-cell .cal-a{text-align:right;font-weight:700;line-height:1.35}
  .cal-cell .cal-due{font-size:11px;background:var(--wbg,#fff8e1);color:var(--amber,#b26a00);border-radius:6px;padding:1px 6px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cal-empty{height:108px}
  .cal-sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 16px}
  .cal-sum>div{background:var(--light);border-radius:10px;padding:10px 12px;min-width:0}
  .cal-sum span{display:block;font-size:12px;color:var(--muted)}
  .cal-sum b{display:block;font-size:16px;margin-top:2px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .cal-row{display:flex;gap:10px;align-items:baseline;justify-content:space-between;padding:10px 0;border-top:1px solid var(--bdr);font-size:14px;cursor:pointer}
  .cal-row:hover{color:var(--navy)}
  .cal-row b{white-space:nowrap;font-variant-numeric:tabular-nums}
  .rep-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .tt-edit-input{width:110px;padding:4px 6px;border:1px solid var(--navy);border-radius:6px;font-size:13px}
  @media (max-width:900px){#nav-report,#nav-cal,#qa-panel,#tx-detail{display:none!important}}
  @media print{#qa-panel,#tx-detail,.dx-noprint{display:none!important}}`;
  document.head.appendChild(css);

  // Nav buttons
  const nav=document.querySelector('.bottom-nav');
  const mkNav=(id,label,svg,fn)=>{const b=document.createElement('button');b.className='nav-btn';b.id='nav-'+id;b.innerHTML=svg+label;b.onclick=fn;nav.appendChild(b)};
  mkNav('report','Báo cáo','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="4" y1="20" x2="20" y2="20"/><rect x="5" y="11" width="3" height="7"/><rect x="10.5" y="6" width="3" height="12"/><rect x="16" y="9" width="3" height="9"/></svg>',()=>{showTab('report');renderReport()});
  mkNav('cal','Lịch','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>',()=>{showTab('cal');renderCal()});
  mkNav('settings','Cài đặt','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',()=>showTab('settings'));

  // Screens
  // Bảng kê: tự tạo nếu HTML thiếu
  if(!document.getElementById('screen-table')){
    const s=document.createElement('div');s.className='screen';s.id='screen-table';
    s.innerHTML=`<div class="card" id="tt-controls" style="padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input id="tt-search" class="tt-sel" placeholder="Tìm nội dung, danh mục…" style="flex:1;min-width:200px" oninput="renderTxTable()">
      <input type="month" id="tt-month" class="tt-sel" onchange="renderTxTable()">
      <select id="tt-group" class="tt-sel" onchange="renderTxTable()"><option value="">Tất cả nhóm</option><option value="personal">Cá nhân</option></select>
      <select id="tt-flow" class="tt-sel" onchange="renderTxTable()"><option value="">Thu &amp; chi</option><option value="in">Thu</option><option value="out">Chi</option><option value="xfer">Chuyển khoản</option></select>
      <select id="tt-acct" class="tt-sel" onchange="renderTxTable()"></select>
    </div>
    <div class="card"><div id="tt-summary"></div><div style="overflow:auto;max-height:calc(100vh - 260px)"><table class="tt-table" id="tt-table"></table></div></div>`;
    const home=document.getElementById('screen-home');(home||document.querySelector('.screen')).after(s);
  }
  if(!document.getElementById('nav-table'))mkNav('table','Bảng kê','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="9" y1="9" x2="9" y2="20"/></svg>',()=>{showTab('table');renderTxTable()});
  const tableScr=document.getElementById('screen-table');
  const repScr=document.createElement('div');repScr.className='screen';repScr.id='screen-report';
  repScr.innerHTML=`
  <div class="card dx-noprint" style="padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <select id="rep-group" class="dx-sel"><option value="">Tất cả nhóm</option><option value="personal">Cá nhân</option></select>
    <input type="month" id="rep-month" class="dx-sel">
    <span style="flex:1"></span>
    <button class="dx-btn" onclick="window.print()">In / Xuất PDF</button>
  </div>
  <div class="card dx-noprint" style="padding:10px 16px;display:flex;gap:8px">
    <button class="dx-btn2" id="rep-tab-m" onclick="repView('month')">Theo tháng</button>
    <button class="dx-btn2" id="rep-tab-y" onclick="repView('year')">Cả năm</button>
    <button class="dx-btn2" id="rep-tab-f" onclick="repView('forecast')">Dự báo dòng tiền</button>
  </div>
  <div id="rep-view-month">
  <div class="card"><div class="dx-h" id="rep-flow-title">Dòng tiền năm tài chính</div><div id="rep-flow" style="padding:10px 16px 16px"></div></div>
  <div class="rep-grid" style="margin:0 12px 12px">
    <div class="dx-card"><div class="dx-h">So sánh tháng</div><div id="rep-compare" style="padding:10px 16px 16px"></div></div>
    <div class="dx-card"><div class="dx-h">Theo nhóm — <span id="rep-mlabel"></span></div><div id="rep-groups" style="padding:10px 16px 16px"></div></div>
    <div class="dx-card"><div class="dx-h">Cơ cấu chi tiêu</div><div id="rep-cats" style="padding:10px 16px 16px"></div></div>
    <div class="dx-card"><div class="dx-h">Top 10 khoản chi</div><div id="rep-top" style="padding:10px 16px 16px"></div></div>
  </div>
  </div>
  <div id="rep-view-year" style="display:none">
    <div class="card" style="padding:12px 16px;display:flex;gap:10px;align-items:center" >
      <button class="dx-btn2" onclick="repYearShift(-1)">‹</button><b id="rep-year-label" style="font-size:15px"></b><button class="dx-btn2" onclick="repYearShift(1)">›</button>
    </div>
    <div class="card"><div class="dx-h">Tổng kết năm</div><div id="rep-year-sum" style="padding:10px 16px 16px"></div></div>
    <div class="card"><div class="dx-h">Bảng thu chi 12 tháng</div><div style="overflow:auto"><table class="tt-table" id="rep-year-table"></table></div></div>
    <div class="card"><div class="dx-h">Xu hướng danh mục chi theo năm</div><div id="rep-year-cats" style="padding:10px 16px 16px"></div></div>
  </div>
  <div id="rep-view-forecast" style="display:none">
    <div class="card" style="padding:12px 16px;display:flex;gap:10px;align-items:center">
      <span style="font-size:13px;color:var(--muted)">Dự báo số dư khả dụng (tiền mặt + ngân hàng + ví) trong</span>
      <select id="fc-days" class="dx-sel" onchange="renderReport()"><option value="30">30 ngày</option><option value="60" selected>60 ngày</option><option value="90">90 ngày</option></select>
      <span style="font-size:12px;color:var(--muted)">— gồm giao dịch định kỳ, hạn thẻ tín dụng, dịch vụ đến hạn và mức chi tiêu trung bình</span>
    </div>
    <div class="card"><div class="dx-h">Đường số dư dự kiến</div><div id="fc-chart" style="padding:10px 16px 16px"></div></div>
    <div class="card"><div class="dx-h">Các khoản sắp tới</div><div id="fc-events" style="padding:6px 16px 14px"></div></div>
  </div>`;
  tableScr.after(repScr);
  const calScr=document.createElement('div');calScr.className='screen';calScr.id='screen-cal';
  calScr.innerHTML=`
  <div class="card dx-noprint cal-bar" style="padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="dx-btn2" onclick="calShift(-1)" title="Tháng trước">‹</button>
    <input type="month" id="cal-month" class="dx-sel">
    <button class="dx-btn2" onclick="calShift(1)" title="Tháng sau">›</button>
    <button class="dx-btn2" onclick="calToday()">Hôm nay</button>
    <span style="margin-left:auto;font-size:12px;color:var(--muted)">Màu nền đậm = chi nhiều · Bấm ngày để xem giao dịch</span>
  </div>
  <div class="card"><div id="cal-grid-wrap"></div></div>
  <div class="card" id="cal-side"><div class="dx-h" id="cal-sum-title">Tổng tháng</div><div class="cal-sum" id="cal-sum"></div>
    <div class="dx-h" id="cal-day-title" style="border-top:1px solid var(--bdr)"></div><div id="cal-day-list" style="padding:0 16px 14px"></div></div>`;
  repScr.after(calScr);

  // Quick add panel
  const qa=document.createElement('div');qa.className='dx-card';qa.id='qa-panel';
  qa.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <b style="font-size:14px" id="qa-title">Nhập nhanh</b>
    <span style="font-size:11px;color:var(--muted)"><span class="dx-kbd">Enter</span> lưu · <span class="dx-kbd">Esc</span> đóng</span>
  </div>
  <div style="display:grid;gap:9px">
    <div style="display:flex;gap:8px">
      <button class="dx-btn2" id="qa-out" style="flex:1" onclick="qaFlow('out')">Chi</button>
      <button class="dx-btn2" id="qa-in" style="flex:1" onclick="qaFlow('in')">Thu</button>
    </div>
    <input id="qa-amount" class="money-input" placeholder="Số tiền" inputmode="numeric" autocomplete="off">
    <div id="qa-amount-display" style="font-size:11px;color:var(--muted);margin:-4px 2px 0;min-height:14px"></div>
    <input id="qa-desc" placeholder="Nội dung" autocomplete="off">
    <div style="display:flex;gap:8px">
      <select id="qa-group" style="flex:1" onchange="qaFillCats()"><option value="personal">Cá nhân</option></select>
      <select id="qa-cat" style="flex:1"></select>
    </div>
    <div style="display:flex;gap:8px">
      <select id="qa-acct" style="flex:1"></select>
      <input type="date" id="qa-date" style="flex:1">
    </div>
    <input id="qa-note" placeholder="Ghi chú (tuỳ chọn)" autocomplete="off">
    <button class="dx-btn" onclick="qaSave()" id="qa-save">Lưu giao dịch (Enter)</button>
  </div>`;
  document.body.appendChild(qa);

  // Detail panel
  const det=document.createElement('div');det.className='dx-card';det.id='tx-detail';document.body.appendChild(det);

  // CSV import overlay
  const ov=document.createElement('div');ov.id='csv-overlay';
  ov.innerHTML=`<div class="dx-card" style="width:640px;max-width:92vw;max-height:86vh;overflow:auto;padding:18px" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="font-size:15px">Nhập giao dịch từ CSV</b><button class="dx-btn2" onclick="csvClose()">Đóng</button></div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.6">Dán nội dung CSV / sao kê (mỗi dòng: <b>Ngày, Nội dung, Số tiền</b> — số âm hoặc có dấu − là chi) hoặc chọn file. Hỗ trợ ngày dd/mm/yyyy và yyyy-mm-dd, phân cách phẩy / chấm phẩy / tab.</div>
    <textarea id="csv-text" rows="6" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--bdr);border-radius:10px;background:var(--light);font-size:12px;font-family:monospace" placeholder="05/07/2026, Cà phê, -45000\n06/07/2026, Lương tháng 7, 25000000" oninput="csvPreview()"></textarea>
    <div style="display:flex;gap:10px;margin:10px 0;flex-wrap:wrap;align-items:center">
      <input type="file" id="csv-file" accept=".csv,.txt" style="font-size:12px">
      <select id="csv-group" class="dx-sel"><option value="personal">Cá nhân</option></select>
      <select id="csv-acct" class="dx-sel"></select>
    </div>
    <div id="csv-prev" style="font-size:12px"></div>
    <button class="dx-btn" id="csv-commit" style="margin-top:10px;display:none" onclick="csvCommit()"></button>
  </div>`;
  ov.onclick=()=>csvClose();
  document.body.appendChild(ov);
  document.getElementById('csv-file').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{document.getElementById('csv-text').value=ev.target.result;csvPreview()};r.readAsText(f,'utf-8')});

  // Thêm nút xuất CSV + nhập CSV vào thanh lọc bảng kê
  const ctr=document.querySelector('#tt-controls>div');
  if(ctr){const b1=document.createElement('button');b1.className='dx-btn2';b1.textContent='Xuất CSV';b1.onclick=()=>ttExportCSV();
    const b2=document.createElement('button');b2.className='dx-btn2';b2.textContent='Nhập CSV';b2.onclick=()=>csvOpen();
    ctr.insertBefore(b2,ctr.lastElementChild);ctr.insertBefore(b1,b2);}

  // ══ QUICK ADD ══
  let qaF='out';
  window.qaFlow=f=>{qaF=f;
    document.getElementById('qa-out').style.cssText='flex:1;'+(f==='out'?'background:var(--red);color:#fff;border-color:var(--red)':'');
    document.getElementById('qa-in').style.cssText='flex:1;'+(f==='in'?'background:var(--green);color:#fff;border-color:var(--green)':'');
    qaFillCats()};
  window.qaFillCats=()=>{const g=document.getElementById('qa-group').value;
    const cats=((DOMAIN_CATS[g]||DOMAIN_CATS.personal)[qaF==='in'?'in':'out'])||[];
    document.getElementById('qa-cat').innerHTML=cats.map(c=>'<option>'+esc(c[0])+'</option>').join('')};
  const qaFillAccts=()=>{document.getElementById('qa-acct').innerHTML=(db.accounts||[]).map(a=>`<option value="${a.id}"${a.id===mainAcctId()?' selected':''}>${esc(a.name)}</option>`).join('')};
  window.openQuickPanel=(txId)=>{
    qaEditId=txId||null;qaFillAccts();
    document.getElementById('qa-title').textContent=qaEditId?'Sửa giao dịch':'Nhập nhanh';
    document.getElementById('qa-save').textContent=qaEditId?'Cập nhật (Enter)':'Lưu giao dịch (Enter)';
    if(qaEditId){const t=db.transactions.find(x=>x.id===qaEditId);if(t){
      qaFlow(t.flow==='in'?'in':'out');
      document.getElementById('qa-group').value=t.group||'personal';qaFillCats();
      document.getElementById('qa-cat').value=t.category||'';
      setMoneyVal('qa-amount',t.amount);
      document.getElementById('qa-desc').value=t.desc||'';
      document.getElementById('qa-note').value=t.note||'';
      document.getElementById('qa-date').value=t.date||today();
      if(t.account)document.getElementById('qa-acct').value=t.account;
    }}else{qaFlow('out');document.getElementById('qa-date').value=today()}
    document.getElementById('qa-panel').classList.add('open');
    initMoneyInputs();
    setTimeout(()=>document.getElementById('qa-amount').focus(),50)};
  window.closeQuickPanel=()=>{qaEditId=null;document.getElementById('qa-panel').classList.remove('open')};
  window.qaSave=()=>{
    const amount=getMoneyVal('qa-amount');if(!amount)return toast('Nhập số tiền');
    const g=document.getElementById('qa-group').value;
    const o={amount,desc:document.getElementById('qa-desc').value||document.getElementById('qa-cat').value,
      category:document.getElementById('qa-cat').value,group:g,flow:qaF,
      date:document.getElementById('qa-date').value||today(),note:document.getElementById('qa-note').value,
      account:g==='personal'?document.getElementById('qa-acct').value:undefined};
    if(qaEditId){const t=db.transactions.find(x=>x.id===qaEditId);if(t)Object.assign(t,o);qaEditId=null;toast('Đã cập nhật ✓');closeQuickPanel()}
    else{db.transactions.push({id:Date.now(),...o});toast('Đã ghi ✓');
      setMoneyVal('qa-amount',0);document.getElementById('qa-desc').value='';document.getElementById('qa-note').value='';
      document.getElementById('qa-amount').focus()}
    save();renderAll();refreshCur()};
  qa.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA'){e.preventDefault();qaSave()}});

  // ══ PHÍM TẮT ══
  document.addEventListener('keydown',e=>{
    const tag=(e.target.tagName||'').toLowerCase();
    if(e.key==='Escape'){closeQuickPanel();txDetClose();csvClose();return}
    if(tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable)return;
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.key==='n'||e.key==='N'){e.preventDefault();openQuickPanel()}
    else if(e.key==='/'){e.preventDefault();showTab('table');renderTxTable();setTimeout(()=>document.getElementById('tt-search').focus(),50)}
    else if(/^[1-9]$/.test(e.key)){const btns=[...document.querySelectorAll('.nav-btn:not(#dx-mini-btn)')];const b=btns[+e.key-1];if(b)b.click()}});

  // ══ BẢNG KÊ ══
  window.ttSetSort=function(col){if(sort.col===col)sort.dir*=-1;else{sort.col=col;sort.dir=col==='date'?-1:1}renderTxTable()};
  let lastRows=[];
  window.renderTxTable=function(){
    const scr=document.getElementById('screen-table');if(!scr)return;
    const accSel=document.getElementById('tt-acct');
    if(accSel){const cur=accSel.value;
      accSel.innerHTML='<option value="">Tất cả tài khoản</option>'+(db.accounts||[]).map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
      accSel.value=cur;}
    const q=(document.getElementById('tt-search').value||'').toLowerCase();
    const g=document.getElementById('tt-group').value;
    const f=document.getElementById('tt-flow').value;
    const ac=accSel?accSel.value:'';
    const m=document.getElementById('tt-month').value;
    let rows=(db.transactions||[]).filter(t=>{
      if(g&&t.group!==g)return false;
      if(f&&t.flow!==f)return false;
      if(ac&&t.account!==ac&&t.from!==ac&&t.to!==ac)return false;
      if(m&&(t.date||'').slice(0,7)!==m)return false;
      if(q){const hay=((t.desc||'')+' '+(t.category||'')+' '+(t.note||'')+' '+acctName(t.account)).toLowerCase();if(!hay.includes(q))return false}
      return true});
    const key=t=>{switch(sort.col){case 'amount':return +t.amount||0;case 'desc':return (t.desc||'').toLowerCase();case 'category':return (t.category||'').toLowerCase();case 'group':return t.group||'';case 'acct':return acctName(t.account).toLowerCase();default:return t.date||''}};
    rows.sort((a,b)=>{const x=key(a),y=key(b);return ((x<y?-1:x>y?1:0)*sort.dir)||((b.id||0)-(a.id||0))});
    lastRows=rows;
    let tin=0,tout=0;rows.forEach(t=>{if(t.flow==='in')tin+=+t.amount||0;else if(t.flow==='out')tout+=+t.amount||0});
    document.getElementById('tt-summary').innerHTML=`<div style="display:flex;gap:26px;flex-wrap:wrap;padding:13px 16px;border-bottom:1px solid var(--bdr);font-size:13px">
      <span style="font-size:14px">Số dòng <b>${rows.length}</b></span>
      <span>Tổng thu <b style="color:var(--green)">${fmtK(tin)} đ</b></span>
      <span>Tổng chi <b style="color:var(--red)">${fmtK(tout)} đ</b></span>
      <span>Chênh lệch <b style="color:${tin-tout>=0?'var(--green)':'var(--red)'}">${tin-tout<0?'−':''}${fmtK(Math.abs(tin-tout))} đ</b></span>
      <span style="margin-left:auto;color:var(--muted);font-size:11px">Bấm dòng: chi tiết · Bấm đúp ô: sửa nhanh</span></div>`;
    const arrow=c=>sort.col===c?(sort.dir>0?' ↑':' ↓'):'';
    const th=(c,label,align)=>`<th onclick="ttSetSort('${c}')" style="text-align:${align||'left'}">${label}${arrow(c)}</th>`;
    const flowCell=t=>t.flow==='in'?'<span style="color:var(--green);font-weight:700">Thu</span>':t.flow==='out'?'<span style="color:var(--red);font-weight:700">Chi</span>':'<span style="color:var(--muted);font-weight:700">CK</span>';
    const amtCell=t=>{const v=fmtK(+t.amount||0)+' đ';
      return t.flow==='in'?`<b style="color:var(--green)">+${v}</b>`:t.flow==='out'?`<b style="color:var(--red)">−${v}</b>`:`<b style="color:var(--muted)">${v}</b>`};
    const accCell=t=>t.flow==='xfer'?esc(acctName(t.from))+' → '+esc(acctName(t.to)):esc(acctName(t.account));
    document.getElementById('tt-table').innerHTML=`<thead><tr>
      ${th('date','Ngày')}${th('desc','Nội dung')}${th('category','Danh mục')}${th('group','Nhóm')}${th('acct','Tài khoản')}<th>Loại</th>${th('amount','Số tiền','right')}
      </tr></thead><tbody>${rows.map(t=>`<tr data-id="${t.id}" onclick="txDetOpen('${t.id}')">
      <td style="white-space:nowrap">${dt(t.date)}</td>
      <td ondblclick="ttEdit(event,'${t.id}','desc')">${esc(t.desc||t.category)}${t.note?`<div style="font-size:11px;color:var(--muted)">${esc(t.note)}</div>`:''}</td>
      <td>${esc(t.category)}</td><td>${GROUPS[t.group]||esc(t.group)}</td>
      <td>${accCell(t)}</td><td>${flowCell(t)}</td>
      <td style="text-align:right;white-space:nowrap" ondblclick="ttEdit(event,'${t.id}','amount')">${amtCell(t)}</td></tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:30px">Không có giao dịch phù hợp</td></tr>'}</tbody>`;
  };
  // Sửa nhanh trong ô
  window.ttEdit=function(ev,id,field){
    ev.stopPropagation();
    const t=db.transactions.find(x=>String(x.id)===String(id));if(!t)return;
    const td=ev.currentTarget;
    const cur=field==='amount'?formatMoney(t.amount):(t.desc||'');
    td.innerHTML=`<input class="tt-edit-input" value="${esc(cur)}" style="${field==='amount'?'text-align:right':'width:90%'}">`;
    const inp=td.querySelector('input');inp.focus();inp.select();
    const commit=()=>{if(field==='amount'){const v=parseMoney(inp.value);if(v)t.amount=v}else t.desc=inp.value;
      save();renderAll();renderTxTable()};
    inp.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')commit();if(e.key==='Escape')renderTxTable()});
    inp.addEventListener('blur',commit);
    if(field==='amount'){inp.addEventListener('input',function(){const n=parseMoney(this.value);this.value=n?formatMoney(n):''})}};
  // Panel chi tiết
  window.txDetOpen=function(id){
    const t=db.transactions.find(x=>String(x.id)===String(id));if(!t)return;selTxId=t.id;
    det.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="font-size:14px">Chi tiết giao dịch</b><button class="dx-btn2" onclick="txDetClose()" style="padding:4px 10px">✕</button></div>
      <div style="font-size:20px;font-weight:800;color:${t.flow==='in'?'var(--green)':t.flow==='out'?'var(--red)':'var(--muted)'};margin-bottom:8px">${t.flow==='in'?'+':t.flow==='out'?'−':''}${fmt(+t.amount||0)}</div>
      <div style="font-size:13px;font-weight:700;margin-bottom:10px">${esc(t.desc||t.category)}</div>
      <div style="font-size:12px;line-height:2;color:var(--muted)">
        <div style="display:flex;justify-content:space-between"><span>Ngày</span><b style="color:var(--text)">${dt(t.date)}</b></div>
        <div style="display:flex;justify-content:space-between"><span>Danh mục</span><b style="color:var(--text)">${esc(t.category)}</b></div>
        <div style="display:flex;justify-content:space-between"><span>Nhóm</span><b style="color:var(--text)">${GROUPS[t.group]||esc(t.group)}</b></div>
        <div style="display:flex;justify-content:space-between"><span>Tài khoản</span><b style="color:var(--text)">${t.flow==='xfer'?esc(acctName(t.from))+' → '+esc(acctName(t.to)):esc(acctName(t.account))||'—'}</b></div>
        ${t.note?`<div style="display:flex;justify-content:space-between;gap:10px"><span>Ghi chú</span><b style="color:var(--text);text-align:right">${esc(t.note)}</b></div>`:''}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        ${t.flow!=='xfer'?`<button class="dx-btn" style="flex:1" onclick="openQuickPanel(${JSON.stringify(t.id)});txDetClose()">Sửa</button>`:''}
        <button class="dx-btn2" style="flex:1;color:var(--red)" onclick="txDetDel()">Xoá</button>
      </div>`;
    det.classList.add('open')};
  window.txDetClose=()=>{selTxId=null;det.classList.remove('open')};
  window.txDetDel=()=>{if(!selTxId)return;if(!confirm('Xoá giao dịch này?'))return;
    const i=db.transactions.findIndex(x=>x.id===selTxId);if(i>=0)db.transactions.splice(i,1);
    txDetClose();save();renderAll();renderTxTable();toast('Đã xoá ✓')};
  // Xuất CSV
  window.ttExportCSV=function(){
    const head='Ngày;Nội dung;Danh mục;Nhóm;Tài khoản;Loại;Số tiền;Ghi chú';
    const lines=lastRows.map(t=>[dt(t.date),t.desc,t.category,GROUPS[t.group]||t.group,
      t.flow==='xfer'?acctName(t.from)+' -> '+acctName(t.to):acctName(t.account),
      t.flow==='in'?'Thu':t.flow==='out'?'Chi':'CK',
      (t.flow==='out'?-1:1)*(+t.amount||0),t.note||''].map(v=>String(v==null?'':v).replace(/;/g,',')).join(';'));
    const blob=new Blob(['\ufeff'+head+'\n'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fintrack-bangke.csv';a.click();
    toast('Đã xuất '+lastRows.length+' dòng ✓')};
  window.printTxTable=function(){window.print()};

  // ══ CSV IMPORT ══
  let csvRows=[];
  window.csvOpen=()=>{document.getElementById('csv-acct').innerHTML=(db.accounts||[]).map(a=>`<option value="${a.id}"${a.id===mainAcctId()?' selected':''}>${esc(a.name)}</option>`).join('');document.getElementById('csv-overlay').classList.add('open')};
  window.csvClose=()=>document.getElementById('csv-overlay').classList.remove('open');
  const parseDate=s=>{s=(s||'').trim();let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return null};
  window.csvPreview=function(){
    const text=document.getElementById('csv-text').value.trim();csvRows=[];
    if(!text){document.getElementById('csv-prev').innerHTML='';document.getElementById('csv-commit').style.display='none';return}
    const lines=text.split(/\r?\n/).filter(l=>l.trim());
    const first=lines[0];const delim=[';','\t',','].reduce((a,b)=>first.split(b).length>first.split(a).length?b:a);
    lines.forEach(l=>{
      const parts=l.split(delim).map(x=>x.trim().replace(/^"|"$/g,''));
      if(parts.length<3)return;
      const date=parseDate(parts[0]);if(!date)return; // bỏ dòng tiêu đề / không hợp lệ
      const amtRaw=parts[parts.length-1].replace(/[^\d\-−]/g,'').replace('−','-');
      const amt=parseInt(amtRaw)||0;if(!amt)return;
      csvRows.push({date,desc:parts.slice(1,parts.length-1).join(' ').trim()||'Giao dịch nhập',amount:Math.abs(amt),flow:amt<0?'out':'in'})});
    document.getElementById('csv-prev').innerHTML=csvRows.length?
      `<table class="tt-table"><thead><tr><th>Ngày</th><th>Nội dung</th><th>Loại</th><th style="text-align:right">Số tiền</th></tr></thead><tbody>
      ${csvRows.slice(0,8).map(r=>`<tr><td>${dt(r.date)}</td><td>${esc(r.desc)}</td><td>${r.flow==='in'?'Thu':'Chi'}</td><td style="text-align:right"><b style="color:${r.flow==='in'?'var(--green)':'var(--red)'}">${fmtK(r.amount)} đ</b></td></tr>`).join('')}
      ${csvRows.length>8?`<tr><td colspan="4" style="color:var(--muted)">… và ${csvRows.length-8} dòng nữa</td></tr>`:''}</tbody></table>`
      :'<div style="color:var(--red)">Không nhận diện được dòng nào — kiểm tra định dạng.</div>';
    const btn=document.getElementById('csv-commit');btn.style.display=csvRows.length?'':'none';btn.textContent='Nhập '+csvRows.length+' giao dịch'};
  window.csvCommit=function(){
    const g=document.getElementById('csv-group').value,ac=document.getElementById('csv-acct').value;
    let base=Date.now();
    csvRows.forEach((r,i)=>db.transactions.push({id:base+i,amount:r.amount,desc:r.desc,category:'Khác',group:g,flow:r.flow,date:r.date,note:'Nhập CSV',account:g==='personal'?ac:undefined}));
    save();renderAll();renderTxTable();csvClose();toast('Đã nhập '+csvRows.length+' giao dịch ✓')};

  // ══ BÁO CÁO ══
  const sumMonth=(m,g)=>{let tin=0,tout=0;(db.transactions||[]).forEach(t=>{
    if(t.flow==='xfer')return;if((t.date||'').slice(0,7)!==m)return;if(g&&t.group!==g)return;
    if(t.flow==='in')tin+=+t.amount||0;else tout+=+t.amount||0});return{tin,tout}};
  window.renderReport=function(){
    const gSel=document.getElementById('rep-group'),mSel=document.getElementById('rep-month');
    if(!gSel.dataset.wired){gSel.dataset.wired=1;gSel.onchange=()=>{repGroup=gSel.value;renderReport()};mSel.onchange=()=>{repMonth=mSel.value;renderReport()}}
    gSel.value=repGroup;mSel.value=repMonth;
    document.getElementById('rep-mlabel').textContent=monthLabel(repMonth);
    // 12 tháng
    const months=[];const d=new Date(repMonth+'-01T12:00:00');
    const fy=d.getFullYear();for(let i=1;i<=12;i++)months.push(fy+'-'+String(i).padStart(2,'0'));
    const fyT=months.reduce((a,m)=>{const s=sumMonth(m,repGroup);a.tin+=s.tin;a.tout+=s.tout;return a},{tin:0,tout:0});
    const ft=document.getElementById('rep-flow-title');if(ft)ft.innerHTML='Dòng tiền năm tài chính '+fy+'<span style="font-weight:500;color:var(--muted);font-size:13px;margin-left:10px">Thu <b style="color:var(--green)">+'+fmtK(fyT.tin)+'</b> · Chi <b style="color:var(--red)">−'+fmtK(fyT.tout)+'</b> · Ròng <b style="color:'+(fyT.tin-fyT.tout>=0?'var(--green)':'var(--red)')+'">'+(fyT.tin-fyT.tout>=0?'+':'−')+fmtK(Math.abs(fyT.tin-fyT.tout))+'</b></span>';
    const LY=window._repLy||(window._repLy=(()=>{try{return Object.assign({net:1,bud:1,prev:1,fc:1,rate:1},JSON.parse(localStorage.getItem('dk_repLayers')||'{}'))}catch(e){return {net:1,bud:1,prev:1,fc:1,rate:1}}})());
    window.repLy=k=>{LY[k]=LY[k]?0:1;try{localStorage.setItem('dk_repLayers',JSON.stringify(LY))}catch(e){}renderReport()};
    const nowD=new Date(),nowM=nowD.getFullYear()+'-'+String(nowD.getMonth()+1).padStart(2,'0');
    const data=months.map(m=>{const s=sumMonth(m,repGroup);const pm=(fy-1)+m.slice(4);const p=sumMonth(pm,repGroup);return {m,...s,ptin:p.tin,ptout:p.tout,past:m<nowM,cur:m===nowM,fut:m>nowM}});
    const done=data.filter(x=>x.past&&(x.tin||x.tout));
    const avgIn=done.length?done.reduce((s,x)=>s+x.tin,0)/done.length:0,avgOut=done.length?done.reduce((s,x)=>s+x.tout,0)/done.length:0;
    data.forEach(x=>{x.fc=LY.fc&&x.fut&&done.length?{tin:avgIn,tout:avgOut}:null});
    const bud=repGroup?(+db.budgets?.[repGroup]||0):Object.values(db.budgets||{}).reduce((s,v)=>s+(+v||0),0);
    const hasPrev=data.some(x=>x.ptin||x.ptout);
    const vals=[1];data.forEach(x=>{vals.push(x.tin,x.tout);if(LY.prev)vals.push(x.ptin,x.ptout);if(x.fc)vals.push(x.fc.tin,x.fc.tout)});if(LY.bud&&bud)vals.push(bud);
    const max=Math.max(...vals);
    const nice=v=>{const p=Math.pow(10,Math.floor(Math.log10(v*1.08)));const n=v*1.08/p;return ([1,1.2,1.6,2,2.4,3,4,5,6,8,10].find(s=>s>=n))*p};
    const yTop=nice(max),step=yTop/4;
    const nets=data.filter(x=>!x.fut&&(x.tin||x.tout)).map(x=>x.tin-x.tout);
    const minNet=LY.net&&nets.length?Math.min(0,...nets):0;
    const yLo=minNet<0?-Math.ceil(-minNet/step)*step:0;
    const H=260+(yLo<0?Math.round(-yLo/step)*30:0),span=yTop-yLo,Y=v=>Math.round((yTop-v)/span*H),zY=Y(0);
    const ticks=[];for(let v=yTop;v>=yLo-1;v-=step)ticks.push(v);
    const lbl=v=>{const s=v<0?'−':'';v=Math.abs(v);return s+(v>=1e9?(+(v/1e9).toFixed(2))+' tỷ':v>=1e6?(+(v/1e6).toFixed(v>=1e8?0:1))+'tr':v>=1e3?Math.round(v/1e3)+'K':'0')};
    const bh=v=>Math.max(0,Math.round(v/span*H));
    const bar=(cur,prev,fc,col)=>`<div style="position:relative;width:40%;max-width:30px;height:100%">
        ${LY.prev&&prev?`<div style="position:absolute;bottom:0;left:-3px;right:-3px;height:${bh(prev)}px;background:${col};opacity:.18;border-radius:5px 5px 0 0"></div>`:''}
        ${fc?`<div style="position:absolute;bottom:0;left:0;right:0;height:${bh(fc)}px;border:2px dashed ${col};border-bottom:0;border-radius:5px 5px 0 0;opacity:.75;box-sizing:border-box"></div>`:''}
        ${cur?`<div style="position:absolute;bottom:0;left:0;right:0;height:${bh(cur)}px;min-height:2px;background:${col};border-radius:5px 5px 0 0"><span class="rf-v" style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);padding-bottom:3px;font-size:11px;font-weight:700;color:${col};white-space:nowrap">${lbl(cur)}</span></div>`:''}
      </div>`;
    const tip=x=>{const n=x.tin-x.tout;let t='T'+(+x.m.slice(5))+'/'+fy+' · Thu '+fmtK(x.tin)+' · Chi '+fmtK(x.tout)+' · Ròng '+(n>=0?'+':'−')+fmtK(Math.abs(n));
      if(x.tin)t+=' · Tiết kiệm '+Math.round(n/x.tin*100)+'%';if(bud&&x.tout>bud)t+=' · Vượt ngân sách '+fmtK(x.tout-bud);
      if(x.ptin||x.ptout)t+='\nCùng kỳ '+(fy-1)+': Thu '+fmtK(x.ptin)+' · Chi '+fmtK(x.ptout);if(x.fc)t+='\nDự báo: Thu '+fmtK(x.fc.tin)+' · Chi '+fmtK(x.fc.tout);return t};
    const pts=data.map((x,i)=>(!x.fut&&(x.tin||x.tout))?{i,n:x.tin-x.tout}:null).filter(Boolean);
    const netSvg=LY.net&&pts.length?`<svg viewBox="0 0 1200 ${H}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible"><polyline points="${pts.map(p=>((p.i+.5)*100)+','+Y(p.n)).join(' ')}" fill="none" stroke="var(--navy)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`
      +pts.map(p=>`<div title="Ròng ${lbl(p.n)}" style="position:absolute;left:calc(${(p.i+.5)/12*100}% - 5px);top:${Y(p.n)-5}px;width:10px;height:10px;border-radius:50%;background:${p.n<0?'var(--red)':'var(--navy)'};border:2px solid var(--card);box-sizing:content-box;margin:-2px;pointer-events:none"></div>`).join(''):'';
    const budLine=LY.bud&&bud?`<div style="position:absolute;left:0;right:0;top:${Y(bud)}px;border-top:2px dashed var(--amber,#d08a00);pointer-events:none"><span style="position:absolute;right:0;bottom:2px;font-size:11px;font-weight:700;color:var(--amber,#d08a00);background:var(--card);padding:0 4px;border-radius:4px">Ngân sách chi ${lbl(bud)}</span></div>`:'';
    const chip=(k,label,sw,dis)=>`<span onclick="repLy('${k}')" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;padding:4px 10px;border-radius:999px;border:1px solid var(--bdr);${LY[k]?'':'opacity:.45;text-decoration:line-through'}${dis?';display:none':''}">${sw}${label}</span>`;
    document.getElementById('rep-flow').innerHTML=`
      <div style="display:grid;grid-template-columns:56px minmax(0,1fr);gap:0 8px">
        <div></div>
        <div style="display:flex;height:20px;${LY.rate?'':'visibility:hidden'}">${data.map(x=>{const r=x.tin&&!x.fut?Math.round((x.tin-x.tout)/x.tin*100):null;return `<div style="flex:1;text-align:center;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;color:${r===null?'transparent':r<0?'var(--red)':r>=20?'var(--green)':'var(--muted)'}">${r===null?'·':r+'%'}</div>`}).join('')}</div>
        <div style="position:relative;height:${H}px">${ticks.map(t=>`<div style="position:absolute;right:0;top:${Y(t)-8}px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap">${lbl(t)}</div>`).join('')}</div>
        <div style="position:relative;height:${H}px">
          ${ticks.map(t=>`<div style="position:absolute;left:0;right:0;top:${Y(t)}px;border-top:1px ${Math.abs(t)<1?'solid var(--muted)':'dashed var(--bdr)'}"></div>`).join('')}
          <div style="position:absolute;left:0;right:0;top:0;height:${zY}px;display:flex;align-items:flex-end">${data.map(x=>`
            <div class="rf-col${x.m===repMonth?' rf-on':''}" style="flex:1;height:100%;display:flex;align-items:flex-end;gap:3px;justify-content:center;cursor:pointer;border-radius:6px 6px 0 0;padding:0 4px;${x.m===repMonth?'background:color-mix(in srgb,var(--navy) 7%,transparent)':''}" onclick="repMonthSet('${x.m}')" title="${esc(tip(x))}">
              ${bar(x.tin,x.ptin,x.fc&&x.fc.tin,'var(--green)')}${bar(x.tout,x.ptout,x.fc&&x.fc.tout,'var(--red)')}
            </div>`).join('')}</div>
          ${budLine}${netSvg}
        </div>
        <div></div>
        <div style="display:flex;margin-top:6px">${data.map(x=>{const over=bud&&LY.bud&&x.tout>bud;return `<div style="flex:1;text-align:center;font-size:12px;color:${x.m===repMonth?'var(--navy)':over?'var(--red)':'var(--muted)'};font-weight:${x.m===repMonth||over?800:400}">T${+x.m.split('-')[1]}${over?' ▲':''}</div>`}).join('')}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--muted);margin-top:12px;align-items:center">
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 6px"><span style="width:10px;height:10px;background:var(--green);border-radius:3px"></span>Thu</span>
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 6px"><span style="width:10px;height:10px;background:var(--red);border-radius:3px"></span>Chi</span>
        ${chip('net','Dòng tiền ròng','<span style="width:14px;height:0;border-top:2.5px solid var(--navy)"></span>')}
        ${chip('bud','Ngân sách chi','<span style="width:14px;height:0;border-top:2px dashed var(--amber,#d08a00)"></span>',!bud)}
        ${chip('prev','Cùng kỳ '+(fy-1),'<span style="width:10px;height:10px;background:var(--muted);opacity:.35;border-radius:3px"></span>',!hasPrev)}
        ${chip('fc','Dự báo','<span style="width:10px;height:10px;border:1.5px dashed var(--muted);border-radius:3px;box-sizing:border-box"></span>',!data.some(x=>x.fut))}
        ${chip('rate','Tỷ lệ tiết kiệm','<b style="font-size:11px">%</b>')}
        <span style="margin-left:auto">Bấm nhãn để ẩn/hiện · Rê chuột hoặc bấm cột xem số</span>
      </div>`;
    // So sánh tháng
    const cur=sumMonth(repMonth,repGroup);
    const pd=new Date(d.getFullYear(),d.getMonth()-1,1);const pm=pd.getFullYear()+'-'+String(pd.getMonth()+1).padStart(2,'0');
    const prev=sumMonth(pm,repGroup);
    const delta=(a,b)=>b?Math.round((a-b)/b*100):null;
    const dRow=(label,a,b,goodUp)=>{const dl=delta(a,b);
      return`<div style="display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px dashed var(--bdr)">
        <span style="font-size:14px;color:var(--muted)">${label}</span>
        <span style="text-align:right"><b style="font-size:16px">${fmtK(a)} đ</b>
        ${dl!=null?`<span style="font-size:11px;font-weight:700;margin-left:7px;color:${(dl>=0)===goodUp?'var(--green)':'var(--red)'}">${dl>=0?'+':''}${dl}%</span>`:''}</span></div>`};
    document.getElementById('rep-compare').innerHTML=
      `<div style="font-size:11px;color:var(--muted);margin-bottom:5px">${monthLabel(repMonth)} so với ${monthLabel(pm)}</div>`+
      dRow('Tổng thu',cur.tin,prev.tin,true)+dRow('Tổng chi',cur.tout,prev.tout,false)+
      `<div style="display:flex;justify-content:space-between;padding:11px 0"><b style="font-size:14px">Tích luỹ</b><b style="font-size:16px;color:${cur.tin-cur.tout>=0?'var(--green)':'var(--red)'}">${cur.tin-cur.tout<0?'−':''}${fmtK(Math.abs(cur.tin-cur.tout))} đ</b></div>`;
    // Theo nhóm
    document.getElementById('rep-groups').innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">${Object.entries(GROUPS).map(([k,label])=>{
      const s=sumMonth(repMonth,k);return`<div style="background:var(--light);border-radius:12px;padding:11px 12px">
        <div style="font-size:13px;font-weight:700;margin-bottom:6px">${label}</div>
        <div style="font-size:13px;color:var(--green)">+${fmtK(s.tin)}</div>
        <div style="font-size:13px;color:var(--red)">−${fmtK(s.tout)}</div>
        <div style="font-size:15px;font-weight:800;margin-top:5px;color:${s.tin-s.tout>=0?'var(--green)':'var(--red)'}">${s.tin-s.tout<0?'−':''}${fmtK(Math.abs(s.tin-s.tout))} đ</div></div>`}).join('')}</div>`;
    // Cơ cấu chi
    const byCat={};(db.transactions||[]).forEach(t=>{if(t.flow!=='out')return;if((t.date||'').slice(0,7)!==repMonth)return;if(repGroup&&t.group!==repGroup)return;byCat[t.category||'Khác']=(byCat[t.category||'Khác']||0)+(+t.amount||0)});
    const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);const catTot=cats.reduce((s,c)=>s+c[1],0)||1;
    document.getElementById('rep-cats').innerHTML=cats.length?cats.map(([c,v],i)=>`
      <div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px"><span>${esc(c)}</span><b>${fmtK(v)} đ · ${Math.round(v/catTot*100)}%</b></div>
      <div style="height:10px;background:var(--light);border-radius:5px"><div style="height:10px;width:${Math.max(2,Math.round(v/cats[0][1]*100))}%;background:${CAT_COLORS[i%CAT_COLORS.length]};border-radius:4px"></div></div></div>`).join('')
      :'<div style="color:var(--muted);font-size:13px">Chưa có khoản chi trong tháng này</div>';
    // Top 10
    const top=(db.transactions||[]).filter(t=>t.flow==='out'&&(t.date||'').slice(0,7)===repMonth&&(!repGroup||t.group===repGroup)).sort((a,b)=>b.amount-a.amount).slice(0,10);
    document.getElementById('rep-top').innerHTML=top.length?top.map((t,i)=>`
      <div style="display:flex;gap:10px;align-items:baseline;padding:8px 0;border-bottom:1px dashed var(--bdr);font-size:14px">
        <span style="color:var(--muted);width:20px">${i+1}.</span><span style="flex:1;min-width:0">${esc(t.desc||t.note||t.category||"Không tên")}<span style="display:block;color:var(--muted);font-size:12px;margin-top:2px">${t.desc&&t.category?esc(t.category)+" · ":""}${dt(t.date)}</span></span>
        <b style="color:var(--red)">${fmtK(t.amount)} đ</b></div>`).join('')
      :'<div style="color:var(--muted);font-size:13px">Không có dữ liệu</div>';
  };
  window.repMonthSet=m=>{repMonth=m;renderReport()};

  // ══ CHẾ ĐỘ XEM BÁO CÁO ══
  let repMode='month',repYear=new Date().getFullYear();
  window.repView=v=>{repMode=v;renderReport()};
  window.repGoMonth=m=>{repMonth=m;repMode='month';renderReport()};
  window.repYearShift=n=>{repYear+=n;renderReport()};
  const _renderReportM=window.renderReport;
  window.renderReport=function(){
    ['month','year','forecast'].forEach(v=>{
      document.getElementById('rep-view-'+v).style.display=repMode===v?'':'none';
      const b=document.getElementById('rep-tab-'+v[0]);
      b.style.cssText=repMode===v?'background:var(--navy);color:#fff;border-color:var(--navy)':''});
    if(repMode==='month')_renderReportM();
    else if(repMode==='year')renderYearReport();
    else renderForecast()};

  // ══ BÁO CÁO NĂM ══
  function renderYearReport(){
    document.getElementById('rep-year-label').textContent='Năm '+repYear;
    const months=[];for(let i=1;i<=12;i++)months.push(repYear+'-'+String(i).padStart(2,'0'));
    const data=months.map(m=>({m,...sumMonth(m,repGroup)}));
    const tin=data.reduce((s,x)=>s+x.tin,0),tout=data.reduce((s,x)=>s+x.tout,0);
    const best=data.reduce((a,b)=>b.tout>a.tout?b:a,data[0]);
    const net=tin-tout;
    const prevY=months.map(m=>(repYear-1)+m.slice(4));
    const ptin=prevY.reduce((s,m)=>s+sumMonth(m,repGroup).tin,0),ptout=prevY.reduce((s,m)=>s+sumMonth(m,repGroup).tout,0);
    const dl=(a,b)=>b?Math.round((a-b)/b*100):null;
    const tile=(label,val,color,sub)=>`<div style="background:var(--light);border-radius:12px;padding:15px 17px"><div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">${label}</div><div style="font-size:24px;font-weight:800;color:${color};margin-top:5px">${val}</div>${sub?`<div style="font-size:12px;color:var(--muted);margin-top:3px">${sub}</div>`:''}</div>`;
    document.getElementById('rep-year-sum').innerHTML=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${tile('Tổng thu',fmtK(tin)+' đ','var(--green)',dl(tin,ptin)!=null?(dl(tin,ptin)>=0?'+':'')+dl(tin,ptin)+'% so với '+(repYear-1):'')}
      ${tile('Tổng chi',fmtK(tout)+' đ','var(--red)',dl(tout,ptout)!=null?(dl(tout,ptout)>=0?'+':'')+dl(tout,ptout)+'% so với '+(repYear-1):'')}
      ${tile('Tích luỹ ròng',(net<0?'−':'')+fmtK(Math.abs(net))+' đ',net>=0?'var(--green)':'var(--red)','TB '+fmtK(net/12)+' đ/tháng')}
      ${tile('Chi nhiều nhất',best&&best.tout?monthLabel(best.m):'—','var(--text)',best&&best.tout?fmtK(best.tout)+' đ':'')}
    </div>`;
    document.getElementById('rep-year-table').innerHTML=`<thead><tr><th>Tháng</th><th style="text-align:right">Thu</th><th style="text-align:right">Chi</th><th style="text-align:right">Chênh lệch</th></tr></thead><tbody>
      ${data.map(x=>{const n=x.tin-x.tout;return`<tr style="cursor:pointer" onclick="repGoMonth('${x.m}')"><td>${monthLabel(x.m)}</td><td style="text-align:right;color:var(--green)">${x.tin?'+'+fmtK(x.tin):'—'}</td><td style="text-align:right;color:var(--red)">${x.tout?'−'+fmtK(x.tout):'—'}</td><td style="text-align:right;font-weight:700;color:${n>=0?'var(--green)':'var(--red)'}">${x.tin||x.tout?(n<0?'−':'+')+fmtK(Math.abs(n)):'—'}</td></tr>`}).join('')}
      <tr style="background:var(--light);font-weight:800"><td>Cả năm</td><td style="text-align:right;color:var(--green)">+${fmtK(tin)}</td><td style="text-align:right;color:var(--red)">−${fmtK(tout)}</td><td style="text-align:right;color:${net>=0?'var(--green)':'var(--red)'}">${(net<0?'−':'+')+fmtK(Math.abs(net))}</td></tr></tbody>`;
    // Xu hướng danh mục: tổng chi theo danh mục cả năm + sparkline 12 tháng
    const byCat={};(db.transactions||[]).forEach(t=>{if(t.flow!=='out')return;const m=(t.date||'').slice(0,7);if(!m.startsWith(String(repYear)))return;if(repGroup&&t.group!==repGroup)return;
      const c=t.category||'Khác';byCat[c]=byCat[c]||{total:0,per:{}};byCat[c].total+=+t.amount||0;byCat[c].per[m]=(byCat[c].per[m]||0)+(+t.amount||0)});
    const cats=Object.entries(byCat).sort((a,b)=>b[1].total-a[1].total).slice(0,8);
    document.getElementById('rep-year-cats').innerHTML=cats.length?cats.map(([c,v],ci)=>{
      const vals=months.map(m=>v.per[m]||0);const mx=Math.max(1,...vals);
      return`<div style="display:flex;align-items:center;gap:14px;padding:7px 0;border-bottom:1px dashed var(--bdr)">
        <span style="width:150px;font-size:14px">${esc(c)}</span>
        <div style="flex:1;display:flex;align-items:flex-end;gap:3px;height:34px">${vals.map(x=>`<div style="flex:1;background:${CAT_COLORS[ci%CAT_COLORS.length]};opacity:${x?1:.15};border-radius:2px 2px 0 0;height:${Math.max(x?3:2,Math.round(x/mx*34))}px"></div>`).join('')}</div>
        <b style="width:100px;text-align:right;font-size:14px">${fmtK(v.total)} đ</b></div>`}).join('')
      :'<div style="color:var(--muted);font-size:13px">Chưa có dữ liệu chi trong năm '+repYear+'</div>'}

  // ══ DỰ BÁO DÒNG TIỀN ══
  function renderForecast(){
    const days=+document.getElementById('fc-days').value||60;
    const td=new Date();td.setHours(12,0,0,0);
    const fmtD=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    let bal=(db.accounts||[]).filter(a=>a.type!=='credit').reduce((s,a)=>s+acctBalance(a),0);
    // sự kiện tương lai
    const events=[];
    (db.recurring||[]).forEach(r=>{
      let last=r.lastDate||r.anchorDate||fmtD(td);
      for(let k=0;k<24;k++){const nx=nextOccurrence(last,r.freq||'monthly',r.day);if(r.endDate&&nx>r.endDate)break;
        const nd=new Date(nx+'T12:00:00');if((nd-td)/864e5>days)break;
        if(nd>td){const isIn=(r.flow||(r.type==='income'?'in':'out'))==='in';
          events.push({date:nx,label:r.desc||'Định kỳ',amt:(isIn?1:-1)*(+r.amount||0),kind:'Định kỳ'})}
        last=nx}});
    (db.accounts||[]).forEach(a=>{if(a.type!=='credit')return;const due=nextDueDate(a);if(!due)return;
      const pay=Math.max(0,-acctBalance(a))+cardInstDue(a);if(!pay)return;
      const nd=due;if((nd-td)/864e5<=days&&nd>td)events.push({date:fmtD(nd),label:'Thanh toán thẻ '+a.name,amt:-pay,kind:'Hạn thẻ'})});
    (db.services||[]).forEach(sv=>{if(sv.status==='done'||sv.status==='cancel'||!sv.deadline)return;
      const nd=new Date(sv.deadline+'T12:00:00');if(nd<=td||(nd-td)/864e5>days)return;
      const amt=(+sv.fee||+sv.amount||0);if(!amt)return;
      events.push({date:sv.deadline,label:sv.name||'Dịch vụ',amt:-amt,kind:'Dịch vụ'})});
    // chi tiêu trung bình/ngày (90 ngày qua, trừ các khoản đã là định kỳ)
    const from=new Date(td);from.setDate(from.getDate()-90);
    const recurKeys=new Set((db.recurring||[]).map(r=>((r.desc||'').trim().toLowerCase())));
    let spent=0;(db.transactions||[]).forEach(t=>{if(t.flow!=='out')return;const d=new Date((t.date||'')+'T12:00:00');
      if(d<from||d>td)return;if(recurKeys.has((t.desc||'').trim().toLowerCase()))return;spent+=+t.amount||0});
    const daily=spent/90;
    // build đường số dư
    const byDay={};events.forEach(e=>{(byDay[e.date]=byDay[e.date]||[]).push(e)});
    const pts=[];let b=bal,minB=bal,minD=null;
    for(let i=0;i<=days;i++){const d=new Date(td);d.setDate(d.getDate()+i);const ds=fmtD(d);
      if(i>0){b-=daily;(byDay[ds]||[]).forEach(e=>b+=e.amt)}
      pts.push({ds,d,b});if(b<minB){minB=b;minD=ds}}
    // SVG
    const W=980,H=240,P=42;
    const lo=Math.min(0,minB),hi=Math.max(...pts.map(p=>p.b),bal);
    const X=i=>P+i/(pts.length-1)*(W-P-14),Y=v=>H-30-(v-lo)/((hi-lo)||1)*(H-58);
    const line=pts.map((p,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(p.b).toFixed(1)).join(' ');
    const zeroY=Y(0);
    const marks=events.map(e=>{const i=pts.findIndex(p=>p.ds===e.date);return i<0?'':`<circle cx="${X(i).toFixed(1)}" cy="${Y(pts[i].b).toFixed(1)}" r="4" fill="${e.amt>=0?'var(--green)':'var(--red)'}" opacity=".85"><title>${esc(e.label)}: ${e.amt<0?'−':'+'}${fmtK(Math.abs(e.amt))} đ (${dt(e.date)})</title></circle>`}).join('');
    const gridLines=[0,.25,.5,.75,1].map(f=>{const v=lo+(hi-lo)*f;return`<line x1="${P}" y1="${Y(v)}" x2="${W-14}" y2="${Y(v)}" stroke="var(--bdr)" stroke-dasharray="3 4"/><text x="${P-6}" y="${Y(v)+4}" text-anchor="end" font-size="12" fill="var(--muted)">${fmtK(v)}</text>`}).join('');
    const dLabels=pts.filter((p,i)=>i%Math.ceil(days/8)===0).map(p=>{const i=pts.indexOf(p);return`<text x="${X(i)}" y="${H-10}" text-anchor="middle" font-size="12" fill="var(--muted)">${p.d.getDate()}/${p.d.getMonth()+1}</text>`}).join('');
    document.getElementById('fc-chart').innerHTML=`
      <div style="display:flex;gap:26px;flex-wrap:wrap;font-size:14px;margin-bottom:12px">
        <span>Hiện tại <b>${fmtK(bal)} đ</b></span>
        <span>Thấp nhất <b style="color:${minB<0?'var(--red)':'var(--amber,#e67e22)'}">${minB<0?'−':''}${fmtK(Math.abs(minB))} đ</b>${minD?` <span style="color:var(--muted)">(${dt(minD)})</span>`:''}</span>
        <span>Cuối kỳ <b style="color:${pts[pts.length-1].b>=0?'var(--green)':'var(--red)'}">${pts[pts.length-1].b<0?'−':''}${fmtK(Math.abs(pts[pts.length-1].b))} đ</b></span>
        <span style="color:var(--muted)">Chi TB ${fmtK(daily)} đ/ngày (90 ngày qua)</span>
      </div>
      ${minB<0?`<div style="background:var(--dbg,#fdecea);color:var(--red);border-radius:10px;padding:9px 13px;font-size:13px;font-weight:600;margin-bottom:10px">⚠ Dự kiến hụt tiền từ ${dt(minD)} — cân đối lại các khoản chi hoặc chuẩn bị nguồn thu.</div>`:''}
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
        ${gridLines}
        ${zeroY>20&&zeroY<H-20?`<line x1="${P}" y1="${zeroY}" x2="${W-14}" y2="${zeroY}" stroke="var(--red)" stroke-width="1.2"/>`:''}
        <path d="${line} L ${X(pts.length-1)} ${H-30} L ${P} ${H-30} Z" fill="var(--navy)" opacity=".07"/>
        <path d="${line}" fill="none" stroke="var(--navy)" stroke-width="2.4" stroke-linejoin="round"/>
        ${marks}${dLabels}
      </svg>`;
    const evs=events.sort((a,b)=>a.date.localeCompare(b.date));
    document.getElementById('fc-events').innerHTML=evs.length?evs.map(e=>`
      <div style="display:flex;gap:12px;align-items:baseline;padding:9px 0;border-bottom:1px dashed var(--bdr);font-size:14px">
        <span style="width:84px;color:var(--muted)">${dt(e.date)}</span>
        <span style="flex:1">${esc(e.label)} <span style="font-size:11px;background:var(--light);border-radius:6px;padding:1px 7px;color:var(--muted)">${e.kind}</span></span>
        <b style="color:${e.amt>=0?'var(--green)':'var(--red)'}">${e.amt<0?'−':'+'}${fmtK(Math.abs(e.amt))} đ</b></div>`).join('')
      :'<div style="color:var(--muted);font-size:13px;padding:6px 0">Không có khoản định kỳ / hạn thanh toán nào trong khoảng này — dự báo chỉ dựa trên mức chi trung bình.</div>'}

  // ══ LỊCH ══
  window.calShift=n=>{const p=calMonth.split('-');const x=new Date(+p[0],+p[1]-1+n,1);calMonth=x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0');calDay=null;renderCal()};
  window.renderCal=function(){
    const mi=document.getElementById('cal-month');
    if(!mi.dataset.wired){mi.dataset.wired=1;mi.onchange=()=>{calMonth=mi.value;calDay=null;renderCal()}}
    mi.value=calMonth;
    const [y,mo]=calMonth.split('-').map(Number);
    const first=new Date(y,mo-1,1);const dim=new Date(y,mo,0).getDate();
    const off=(first.getDay()+6)%7; // T2 đầu tuần
    const perDay={};(db.transactions||[]).forEach(t=>{if((t.date||'').slice(0,7)!==calMonth||t.flow==='xfer')return;
      const day=+t.date.slice(8,10);perDay[day]=perDay[day]||{tin:0,tout:0};
      if(t.flow==='in')perDay[day].tin+=+t.amount||0;else perDay[day].tout+=+t.amount||0});
    const dues={};(db.accounts||[]).forEach(a=>{if(a.type==='credit'&&a.dueDay&&a.dueDay<=dim){(dues[a.dueDay]=dues[a.dueDay]||[]).push(a.name)}});
    const tdY=new Date();const isCurM=tdY.getFullYear()===y&&tdY.getMonth()===mo-1;
    if(calDay===null&&isCurM)calDay=tdY.getDate();
    const cnt={};(db.transactions||[]).forEach(t=>{if((t.date||'').slice(0,7)===calMonth&&t.flow!=='xfer'){const d=+t.date.slice(8,10);cnt[d]=(cnt[d]||0)+1}});
    const maxOut=Math.max(1,...Object.values(perDay).map(v=>v.tout));
    let tin=0,tout=0;Object.values(perDay).forEach(v=>{tin+=v.tin;tout+=v.tout});
    let cells='<div class="cal-grid" style="padding-bottom:0">'+['T2','T3','T4','T5','T6','T7','CN'].map(w=>'<div class="cal-wk">'+w+'</div>').join('')+'</div><div class="cal-grid" style="padding-top:8px">';
    for(let i=0;i<off;i++)cells+='<div class="cal-empty"></div>';
    for(let day=1;day<=dim;day++){
      const s=perDay[day];const du=dues[day];const wd=(off+day-1)%7;
      const heat=s&&s.tout?Math.round(4+Math.min(1,s.tout/maxOut)*18):0;
      cells+=`<div class="cal-cell${calDay===day?' sel':''}${isCurM&&tdY.getDate()===day?' today':''}${wd>=5?' wkend':''}" onclick="calSel(${day})"${heat?` style="background:color-mix(in srgb,var(--red) ${heat}%,var(--card))"`:''}>
        <div class="cal-dn"><span>${day}</span>${cnt[day]?`<span class="cal-n">${cnt[day]} GD</span>`:''}</div>
        ${s&&s.tin?`<div class="cal-a" style="color:var(--green)">+${fmtK(s.tin)}</div>`:''}
        ${s&&s.tout?`<div class="cal-a" style="color:var(--red)">−${fmtK(s.tout)}</div>`:''}
        ${du?`<div class="cal-due" title="Hạn thanh toán: ${esc(du.join(', '))}">Hạn ${esc(du[0])}${du.length>1?' +'+(du.length-1):''}</div>`:''}
      </div>`}
    cells+='</div>';
    document.getElementById('cal-grid-wrap').innerHTML=cells;
    document.getElementById('cal-sum-title').textContent='Tổng tháng '+mo+'/'+y;
    const net=tin-tout;
    document.getElementById('cal-sum').innerHTML=`<div><span>Thu</span><b style="color:var(--green)">+${fmtK(tin)}</b></div><div><span>Chi</span><b style="color:var(--red)">−${fmtK(tout)}</b></div><div><span>Chênh lệch</span><b style="color:${net>=0?'var(--green)':'var(--red)'}">${net>=0?'+':'−'}${fmtK(Math.abs(net))}</b></div>`;
    const tt=document.getElementById('cal-day-title'),dl=document.getElementById('cal-day-list');
    if(calDay){
      const ds=calMonth+'-'+String(calDay).padStart(2,'0');
      const list=(db.transactions||[]).filter(t=>t.date===ds).sort((a,b)=>b.amount-a.amount);
      tt.textContent='Ngày '+dt(ds);
      const du=dues[calDay];
      dl.innerHTML=(du?`<div class="cal-due" style="display:inline-block;margin:0 0 8px;font-size:12px">Hạn thanh toán: ${esc(du.join(', '))}</div>`:'')+(list.length?list.map(t=>`
        <div class="cal-row" onclick="txDetOpen('${t.id}')">
          <span style="min-width:0"><span style="font-weight:600">${esc(t.desc||t.category)}</span><span style="display:block;color:var(--muted);font-size:12px;margin-top:2px">${t.desc?esc(t.category)+" · ":""}${GROUPS[t.group]||''}</span></span>
          <b style="color:${t.flow==='in'?'var(--green)':t.flow==='out'?'var(--red)':'var(--muted)'}">${t.flow==='in'?'+':t.flow==='out'?'−':''}${fmtK(t.amount)} đ</b></div>`).join('')
        :'<div style="color:var(--muted);font-size:13px;padding:10px 0;border-top:1px solid var(--bdr)">Không có giao dịch</div>');
    }else{tt.textContent='Chọn một ngày';dl.innerHTML='<div style="color:var(--muted);font-size:13px;padding:10px 0;border-top:1px solid var(--bdr)">Bấm vào ô ngày bên trái để xem giao dịch.</div>';}
  };
  window.calToday=()=>{const t=new Date();calMonth=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0');calDay=t.getDate();renderCal()};
  window.calSel=d=>{calDay=calDay===d?null:d;renderCal()};

  // ══ REFRESH KHI DỮ LIỆU ĐỔI ══
  const refreshCur=()=>{if(curTab==='table')renderTxTable();else if(curTab==='report')renderReport();else if(curTab==='cal')renderCal()};
  const _ra=window.renderAll;
  window.renderAll=function(){_ra.apply(this,arguments);refreshCur()};

  // Công tắc chuyển về bản điện thoại (thanh icon đầu trang + trong Cài đặt)
  const sw=document.createElement('button');
  sw.id='phone-btn';sw.title='Chuyển sang bản điện thoại';
  sw.style.cssText='background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:6px 10px;color:#fff;font-size:14px;cursor:pointer;line-height:0';
  sw.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>';
  sw.onclick=()=>{if(confirm('Chuyển sang bản điện thoại? Dữ liệu vẫn đồng bộ chung.'))location.href='moneynote.html'};
  const searchBtn=document.getElementById('search-btn');
  if(searchBtn)searchBtn.parentNode.insertBefore(sw,searchBtn);else nav.appendChild(sw);
  const dk=document.getElementById('dark-btn');
  if(dk){dk.title='Bật / tắt chế độ tối';dk.setAttribute('aria-label','Bật / tắt chế độ tối');dk.style.setProperty('display','inline-flex','important');dk.style.alignItems='center';dk.style.justifyContent='center';sw.after(dk);}
  const gearBtn=document.getElementById('gear-btn');if(gearBtn)gearBtn.style.display='none';

  // Gợi ý phím tắt ở cuối sidebar
  const hint=document.createElement('div');
  hint.style.cssText='margin-top:auto;padding:12px;font-size:11px;color:var(--muted);line-height:2';
  hint.innerHTML='<span class="dx-kbd">N</span> nhập nhanh &nbsp;<span class="dx-kbd">/</span> tìm kiếm<br><span class="dx-kbd">1</span>–<span class="dx-kbd">9</span> chuyển tab &nbsp;<span class="dx-kbd">Esc</span> đóng';
  nav.appendChild(hint);
})();

// ══ MÀN HÌNH LỚN: nội dung rộng, bố cục nhiều cột, thu gọn sidebar ══
(function(){
  const st=document.createElement('style');st.id='dx-wide';
  st.textContent=`
  @media (min-width:901px){
    [onclick]{cursor:pointer}
    html body:not(#_dx) .stat-tile>*{flex:0 0 auto!important;width:auto!important;height:auto!important;min-height:0!important}
    html body:not(#_dx) .stat-tile .stat-label{font-size:13px!important;line-height:1.35!important;color:var(--muted)}
    html body:not(#_dx) .stat-tile .stat-val{font-size:20px!important;line-height:1.3!important;margin:4px 0 0!important}
    html body:not(#_dx) .stat-tile .stat-val+.cmp-row{margin-top:auto!important;padding-top:8px;border-top:1px solid var(--line,var(--bdr))}
    html body:not(#_dx) #month-overview .stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;grid-auto-rows:1fr}
    html body:not(#_dx) #month-overview .stat-tile{padding:12px 14px!important;min-height:0!important}
    html body:not(#_dx) #month-overview>div>div[style*="line-height:1.7"]{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;background:none!important;padding:0!important;line-height:1.35!important}
    html body:not(#_dx) #month-overview>div>div[style*="line-height:1.7"]>div{flex-direction:row!important;justify-content:space-between!important;align-items:center!important;gap:10px;background:var(--light);border-radius:12px;padding:12px 14px;min-width:0}
    html body:not(#_dx) #month-overview>div>div[style*="line-height:1.7"]>div>span{font-size:13px}
    html body:not(#_dx) #month-overview>div>div[style*="line-height:1.7"]>div>b{font-size:20px;line-height:1.3;text-align:right;white-space:nowrap}
    html body:not(#_dx) #month-overview>div>div[style*="line-height:1.7"]>div{padding:12px 14px!important}
    html body:not(#_dx) #month-overview>div:has(>div[style*="line-height:1.7"]){padding-bottom:14px!important}
    .screen.dx-dash,.screen.dx-dash.active{column-count:auto!important;columns:auto!important}
    .screen.dx-dash.active{display:grid!important;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:0 14px;align-items:start;padding:4px 12px 0!important;box-sizing:border-box}
    .dx-dash>.dx-top{grid-column:1/-1}
    .dx-dash>.dx-colL,.dx-dash>.dx-colR{min-width:0}
    .dx-dash .tier-head{display:none!important}
    .dx-dash .card,.dx-dash #alert-section,.dx-dash #smart-alerts>div,.dx-dash #overdue-section>div,.dx-dash .kpi-strip{margin:0 0 14px!important}
    .dx-dash .kpi-strip{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))!important;gap:12px!important}
    .dx-dash #cardcal-list{max-height:560px;overflow:auto;overscroll-behavior:contain}
    html body:not(#_dx) .stat-grid,html body:not(#_dx) #home-annual-stats>div{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))!important;gap:10px!important}
    html body:not(#_dx) .stat-tile{position:relative;display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;align-items:stretch!important;justify-content:flex-start!important;background:var(--light)!important;border-radius:12px!important;padding:12px 14px!important;min-width:0}
    html body:not(#_dx) .stat-tile+.stat-tile::before{display:none!important}
    html body:not(#_dx) .stat-tile .stat-label{white-space:normal}
    html body:not(#_dx) .stat-tile .stat-val{margin-left:0!important;margin-top:4px;font-size:20px}
    html body:not(#_dx) .stat-tile .cmp-row{justify-content:space-between!important;align-items:baseline!important;flex-wrap:wrap!important;gap:2px 8px!important;font-size:12px!important;line-height:1.45!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;margin-top:5px!important}
    html body:not(#_dx) .stat-tile .cmp-row>*{white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important;height:auto!important;line-height:1.45!important;max-width:none!important}
    html body:not(#_dx) .stat-tile .cmp-lb{flex:1 1 auto;min-width:0}
    .dx-g{display:flow-root}
    html body.dx-mini:not(#_dx){padding-left:72px!important}
    html body.dx-mini:not(#_dx) .bottom-nav{width:72px!important;padding:18px 10px!important;overflow-x:hidden!important}
    html body.dx-mini:not(#_dx) .bottom-nav::before{content:'FT';text-align:center;padding:8px 0 18px}
    html body.dx-mini:not(#_dx) .nav-btn{position:relative!important;font-size:0!important;justify-content:center!important;padding:12px 0!important;gap:0!important}
    html body.dx-mini:not(#_dx) .nav-badge{position:absolute!important;top:4px;right:4px;font-size:11px!important;margin:0!important}
    body.dx-mini .modal-overlay{padding-left:72px}
    html body:not(#_dx) #dx-mini-btn{position:absolute!important;top:20px;right:12px;width:34px!important;height:34px!important;min-height:34px!important;padding:0!important;gap:0!important;justify-content:center!important;font-size:0!important;border-radius:9px!important;color:var(--muted);opacity:.85}
    html body:not(#_dx) #dx-mini-btn:hover{opacity:1;background:var(--light)!important;color:var(--text)}
    html body.dx-mini:not(#_dx) #dx-mini-btn{position:static!important;align-self:center!important;margin:-8px 0 8px!important;width:40px!important}
    #dx-mini-btn svg{transition:transform .2s}
    body.dx-mini #dx-mini-btn svg{transform:scaleX(-1)}
  }
  @media (min-width:1280px){
    html body:not(#_dx) .screen{max-width:1480px!important;margin-left:auto!important;margin-right:auto!important}
    html body:not(#_dx) .topbar{max-width:min(1456px,calc(100% - 24px))!important;margin-left:auto!important;margin-right:auto!important}
    .screen.dx-cols,.screen.dx-dash{padding:4px 12px 0!important;box-sizing:border-box}
    .dx-cols .card,.dx-dash .card,.dx-dash #alert-section,.dx-dash #smart-alerts>div,.dx-dash #overdue-section>div,.dx-dash .kpi-strip{margin:0 0 14px!important}
    .dx-cols .sec-head,.dx-dash .sec-head{padding-left:4px!important;padding-right:4px!important;margin-top:4px!important}
    .dx-cols{column-count:2;column-gap:16px}
    .dx-cols>.dx-g{break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid}
    .dx-cols>.dx-full{column-span:all;-webkit-column-span:all}
    .screen.dx-dash.active{display:grid!important;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:0 16px;align-items:start}
    .dx-dash>.dx-top{grid-column:1/-1}
    .dx-dash>.dx-colL,.dx-dash>.dx-colR{min-width:0}
    .dx-dash .tier-head{display:none!important}
    .dx-dash .kpi-strip{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important}
    .dx-dash #cardcal-list{max-height:560px;overflow:auto;overscroll-behavior:contain}
    .dx-dash .dx-colR .seg{flex-wrap:wrap}
  }
  @media (min-width:1760px){.dx-cols{column-count:3}.screen.dx-dash.active{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr)}}
  @media print{.dx-cols,.dx-pcols{column-count:1!important}}
  @media (min-width:1280px){
    .screen:not(#screen-home):not(#screen-settings){padding:4px 12px 0!important;box-sizing:border-box}
    .screen:not(#screen-home):not(#screen-settings) .card,.screen:not(#screen-home):not(#screen-settings)>*>.svc-search,.screen:not(#screen-home):not(#screen-settings)>*>.chip-row,.screen:not(#screen-home):not(#screen-settings)>*>.stat-grid,.screen:not(#screen-home):not(#screen-settings)>.tab-bar,.screen:not(#screen-home):not(#screen-settings)>*>div:not([class]){margin-left:0!important;margin-right:0!important}
    .dx-pcols{column-count:2;column-gap:16px}
    .dx-pcols>.dx-g{break-inside:avoid;-webkit-column-break-inside:avoid}
    .dx-pcols>.dx-full{column-span:all;-webkit-column-span:all}
    .dx-pcols .card{margin-bottom:14px!important}
    #daily-log-list,#svc-list-container,#job-list-container,#crypto-list,#asset-list{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:0 16px;align-items:start}
    #daily-log-list>*,#svc-list-container>*,#job-list-container>*,#crypto-list>*,#asset-list>*{margin-left:0!important;margin-right:0!important;min-width:0}
    #daily-log-list>:not(:has(*)),#svc-list-container>:not(:has(*)),#job-list-container>:not(:has(*)),#crypto-list>:not(:has(*)),#asset-list>:not(:has(*)){grid-column:1/-1}
    #acct-report{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:0 16px;align-items:start}
    #acct-report>*{min-width:0}
    #acct-report>:first-child,#acct-report>:not(:has(*)){grid-column:1/-1}
  }
  @media (min-width:1760px){.dx-pcols{column-count:3}}
  @media (min-width:1100px){
    #screen-settings.active{padding:4px 12px 0!important;box-sizing:border-box}
    #screen-settings>.tab-bar{margin:0 0 12px!important}
    #screen-settings .card{margin:0 0 14px!important}
    #screen-settings .sec-head{padding-left:2px!important;padding-right:2px!important}
    #screen-settings .dx-pcols{column-count:2;column-gap:16px}
  }
  @media (min-width:1760px){#screen-settings .dx-pcols{column-count:3}}
  @media (min-width:1100px){
    #screen-settings.dx-plan.active{display:grid!important;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr);gap:0 16px;align-items:start}
    #screen-settings.dx-plan>.tab-bar{grid-column:1/-1}
    #screen-settings.dx-plan>[id^="settings-"]{min-width:0}
    #screen-settings.dx-plan .dx-pcols{column-count:1!important}
    #screen-settings.dx-plan>[id^="settings-"]>.dx-g:first-child>.card:first-child,#screen-settings.dx-plan>[id^="settings-"]>.dx-g:first-child>.sec-head:first-child{margin-top:0!important}
  }
  @media (max-width:1099px){#screen-settings.dx-plan>[id^="settings-"]{margin-bottom:8px}}
  html body #screen-settings>.tab-bar>[onclick*="'goal'"],html body #screen-settings>.tab-bar>[onclick*="'recurring'"]{display:none!important}
`;
  document.head.appendChild(st);

  function mk(full){const w=document.createElement('div');w.className='dx-g'+(full?' dx-full':'');return w}
  function groupScreen(scr){
    if(!scr||scr.classList.contains('dx-cols'))return;
    const out=[];let g=null;
    [...scr.children].forEach(k=>{
      if(k.tagName==='SCRIPT'||k.tagName==='STYLE'){out.push(k);g=null;return}
      if(k.classList.contains('tier-head')){const w=mk(true);w.appendChild(k);out.push(w);g=null;return}
      if(k.classList.contains('sec-head')){g=mk(false);g.appendChild(k);out.push(g);return}
      if(g){g.appendChild(k);return}
      const w=mk(true);w.appendChild(k);out.push(w);
    });
    out.forEach(n=>scr.appendChild(n));
    scr.querySelectorAll(':scope>.dx-g').forEach(w=>{if(w.querySelector('.kpi-strip,table,.stat-grid'))w.classList.add('dx-full')});
    scr.classList.add('dx-cols');
    new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.nodeType!==1||n.classList.contains('dx-g')||n.tagName==='SCRIPT'||n.tagName==='STYLE')return;
      const w=mk(true);if(scr.classList.contains('dx-dash')){if(n.classList.contains('dx-top')||n.classList.contains('dx-colL')||n.classList.contains('dx-colR'))return;(scr.querySelector(':scope>.dx-colL')||scr).appendChild(w)}else scr.insertBefore(w,n);w.appendChild(n);
    }))).observe(scr,{childList:true});
  }
  try{['screen-home'].forEach(id=>groupScreen(document.getElementById(id)))}catch(e){console.warn('dx cols',e)}

  const RIGHT=['canhbao','budgetalert','budget','health','goals','finplan','cardcal'];
  function dashHome(scr){
    if(!scr||scr.classList.contains('dx-dash'))return;
    const top=document.createElement('div');top.className='dx-top';
    const L=document.createElement('div');L.className='dx-colL';
    const R=document.createElement('div');R.className='dx-colR';
    [...scr.querySelectorAll(':scope>.dx-g')].forEach(g=>{
      const h=g.querySelector('[data-clps-head]'),c=g.querySelector('[data-clps]');
      const key=(h&&h.getAttribute('data-clps-head'))||(c&&c.getAttribute('data-clps'))||'';
      if(g.querySelector('.tier-head')){L.appendChild(g);return}
      if(key==='kpi'||g.querySelector('#first-run-card')){top.appendChild(g);return}
      if(RIGHT.includes(key)||g.querySelector('#alert-section,#smart-alerts,#ai-review-home')){R.appendChild(g);return}
      L.appendChild(g);
    });
    scr.classList.remove('dx-cols');scr.classList.add('dx-dash');
    scr.append(top,L,R);
  }
  try{dashHome(document.getElementById('screen-home'))}catch(e){console.warn('dx dash',e)}

  // Cài đặt: gộp Ngân sách + Mục tiêu + Định kỳ thành tab "Kế hoạch" (3 cột)
  try{(function(){
    const scr=document.getElementById('screen-settings');if(!scr)return;
    const bar=scr.querySelector('.tab-bar');if(!bar)return;
    const PLAN=['budget','goal','recurring'];
    const btn=k=>[...bar.children].find(b=>(b.getAttribute('onclick')||'').includes("'"+k+"'"));
    const bB=btn('budget'),bG=btn('goal'),bR=btn('recurring');if(!bB||!bG||!bR)return;
    bB.textContent='Kế hoạch';bB.title='Ngân sách · Mục tiêu · Định kỳ';
    const orig=window.switchSettingsTab;
    window.switchSettingsTab=function(el,tab){
      const plan=PLAN.includes(tab);
      orig.call(this,plan?bB:el,plan?'budget':tab);
      scr.classList.toggle('dx-plan',plan);
      if(plan){PLAN.forEach(t=>{const p=document.getElementById('settings-'+t);if(p)p.style.display=''});planRender();}
    };
    const planRender=()=>{try{renderGoalSettings()}catch(e){}try{renderRecurring()}catch(e){}};
    const origRS=window.renderSettings;
    window.renderSettings=function(){const r=origRS.apply(this,arguments);if(scr.classList.contains('dx-plan'))planRender();return r};
    const cur=[...bar.children].find(b=>b.classList.contains('active'));
    const k=cur?((cur.getAttribute('onclick')||'').match(/'(\w+)'\)/)||[])[1]:'budget';
    window.switchSettingsTab(cur&&cur.style.display!=='none'?cur:bB,k||'budget');
  })()}catch(e){console.warn('dx plan',e)}

  function groupPanel(p){
    if(!p||p.classList.contains('dx-pcols'))return;
    const isHead=k=>k.classList.contains('sec-head')||k.classList.contains('card-h');
    const isBlock=k=>k.classList.contains('card')||k.id==='cc-debt-summary';
    const out=[];let g=null;
    [...p.children].forEach(k=>{
      if(k.tagName==='SCRIPT'||k.tagName==='STYLE'){out.push(k);g=null;return}
      if(isHead(k)){g=mk(false);g.appendChild(k);out.push(g);return}
      if(isBlock(k)){if(g&&!g.querySelector('.card,#cc-debt-summary')){g.appendChild(k);return}g=mk(false);g.appendChild(k);out.push(g);g=null;return}
      g=null;const w=mk(true);w.appendChild(k);out.push(w);
    });
    out.forEach(n=>p.appendChild(n));
    p.classList.add('dx-pcols');
    new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.nodeType!==1||n.classList.contains('dx-g')||n.tagName==='SCRIPT'||n.tagName==='STYLE')return;
      const w=mk(true);p.insertBefore(w,n);w.appendChild(n);
    }))).observe(p,{childList:true});
  }
  try{['personal-stats','personal-debt','service-stats-tab','cstats-tab','crypto-history','settings-budget','settings-goal','settings-account','settings-export'].forEach(id=>groupPanel(document.getElementById(id)))}catch(e){console.warn('dx panels',e)}

  // Thu gọn sidebar (nút cuối menu hoặc Ctrl/⌘+B); tự thu gọn khi cửa sổ hẹp
  const nav=document.querySelector('.bottom-nav');
  if(nav){
    nav.querySelectorAll('.nav-btn').forEach(b=>{if(!b.title)b.title=(b.textContent||'').trim()});
    const btn=document.createElement('button');btn.className='nav-btn';btn.id='dx-mini-btn';btn.title='Thu gọn / mở rộng menu (Ctrl+B)';
    btn.setAttribute('aria-label','Thu gọn / mở rộng menu');
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/><polyline points="15 10 13 12 15 14"/></svg>';
    nav.prepend(btn);
    const pref=()=>{try{return localStorage.getItem('ftDxMini')}catch(e){return null}};
    const apply=()=>{const p=pref();document.body.classList.toggle('dx-mini',p==='1'||(p===null&&innerWidth<1180));window.dispatchEvent(new Event('resize'))};
    const toggle=()=>{const on=!document.body.classList.contains('dx-mini');try{localStorage.setItem('ftDxMini',on?'1':'0')}catch(e){}apply()};
    btn.onclick=toggle;
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==='b'||e.key==='B')){e.preventDefault();toggle()}});
    let rt;addEventListener('resize',()=>{if(pref()!==null)return;clearTimeout(rt);rt=setTimeout(()=>document.body.classList.toggle('dx-mini',innerWidth<1180),120)});
    apply();
    new MutationObserver(()=>{nav.querySelectorAll('.nav-btn:not([title])').forEach(b=>b.title=(b.textContent||'').trim());if(nav.firstElementChild!==btn)nav.prepend(btn)}).observe(nav,{childList:true});
  }
})();
