(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.ReimbursementEnhancerCore);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ReimbursementInvoiceAssociations=api;
})(typeof window==='object'?window:{},function(money){
  'use strict';
  const text=v=>typeof v==='string'||typeof v==='number'?String(v).trim():'';
  const cents=v=>{try{return money.cents(v)}catch{throw Error('票据或分摊金额无效')}};
  function sum(values){let n=0;for(const v of values){n+=v;if(!Number.isSafeInteger(n))throw Error('金额超出可处理范围')}return n}
  function proportional(total,weights){
    if(!Number.isSafeInteger(total)||total<0||weights.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('分摊金额无效');
    const denominator=sum(weights);if(!denominator){if(total)throw Error('分摊金额无效');return weights.map(()=>0)}
    const parts=weights.map((weight,index)=>{const n=BigInt(total)*BigInt(weight),d=BigInt(denominator);return {index,value:Number(n/d),remainder:n%d}});
    const remainder=total-sum(parts.map(p=>p.value));
    for(const p of parts.slice().sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1).slice(0,remainder))p.value++;
    return parts.map(p=>p.value);
  }
  function people(value){const list=Array.isArray(value)?value:String(value||'').split(/[，,、;；\n]+/);const names=list.map(text);if(!names.length||names.length>60||names.some(n=>!n||n.length>80||/[\u0000-\u001f]/.test(n)))throw Error('请填写费用归属人员');if(new Set(names).size!==names.length)throw Error('分摊人员不能重复');return names}
  function evenSplit(total,names){const list=people(names),amounts=proportional(total,list.map(()=>1));if(amounts.some(n=>n<=0))throw Error('分摊金额须大于零');return list.map((person,i)=>({person,amountCents:amounts[i]}))}
  function nativeMetadata(form,bill){
    const id=text(bill?.dataId||bill?.id||bill?.realityId),barcode=text(bill?.barcode),metadata={...(bill?.nativeAssociationMetadata||{})};
    for(const a of form?.activitys||[])for(const b of a.behaviors||[])for(const row of b.behaviorDetail||[])for(const l of row.BSX0709||[]){
      if(text(l.BSX070802)!==id||text(l.BSX070807)!==barcode)continue;
      for(const [key,field] of [['model','BSX070808'],['taxCode','BSX070810']]){
        const value=text(l[field]);if(!value)continue;
        if(metadata[key]&&metadata[key]!==value)throw Error('同一票据的原生关联元数据不一致，请核对原明细');
        metadata[key]=value;
      }
    }
    return metadata;
  }
  function source(bill,support=false){
    const id=text(bill?.dataId||bill?.id||bill?.realityId),barcode=text(bill?.barcode),ticketCode=text(bill?.ticketCode);
    if(!id||!barcode||!ticketCode||[id,barcode,ticketCode].some(v=>['0','null','undefined'].includes(v)))throw Error('票据关联标识未就绪，请刷新票据识别详情');
    if([id,barcode,ticketCode].some(v=>v.length>160||/[\u0000-\u001f]/.test(v)))throw Error('票据关联标识无效');
    const metadata=bill?.nativeAssociationMetadata||{},taxCode=text(metadata.taxCode);
    if(taxCode&&!/^[A-Za-z0-9]{8,40}$/.test(taxCode))throw Error('原票据税收分类标识无效');
    if(support)return {id,barcode,ticketCode,taxCode,total:0,lines:[{index:'0',gross:0,tax:0}],support:true};
    const data=bill.billData||{},total=cents(bill.totalAmount??data.totalAmount);
    // Native saved relations use the actual billData array name to resolve the
    // invoice line. A barcode and useAmount alone do not resolve invoice content.
    const models=['air','hotel'].filter(key=>Array.isArray(data[key])&&data[key].length);
    if(models.length>1)throw Error('票据明细来源不明确，请核对识别结果');
    // An ordinary VAT service invoice can also contain zero-valued passenger
    // records under air. Those are itinerary context, not its priced line.
    const ordinaryDetails=ticketCode==='1-024'&&!data.hotel?.length&&Array.isArray(data.details)&&data.details.length;
    const model=text(metadata.model)||(ordinaryDetails?'details':models[0])||(Array.isArray(data.details)&&data.details.length?'details':'');
    if(model&&(!['details','air','hotel','train'].includes(model)||!Array.isArray(data[model])||!data[model].length))throw Error('原票据明细来源已变化，请刷新票据');
    if(total<=0)throw Error('没有可关联的有效发票金额');
    if(data.totalAmount!=null&&text(data.totalAmount)!==''&&cents(data.totalAmount)!==total)throw Error('票面金额与识别详情不一致，请刷新票据');
    const currency=data.currency||data.currencyCode;
    if(currency&&!['CNY','RMB','人民币','元','156'].includes(String(currency)))throw Error('外币票据不能自动关联本币费用');
    if(['是','1','true'].includes(String(data.cancel))||String(bill.delStatus)==='1')throw Error('已作废或删除的发票不能生成费用');
    const details=Array.isArray(data.details)?data.details:[];
    const hasMoney=d=>d.amount!=null&&text(d.amount)!=='';
    let lines;
    if(details.length&&details.every(hasMoney)){
      lines=details.map((d,i)=>{const net=cents(d.amount),tax=cents(d.taxAmount??0),index=text(d.inx??(details.length===1?'0':''));if(!index||net<0||tax<0)throw Error('票据明细含折扣或未识别项目，请核对后关联');return {index,gross:sum([net,tax]),tax}});
      if(new Set(lines.map(l=>l.index)).size!==lines.length||sum(lines.map(l=>l.gross))!==total)throw Error('票据明细金额或明细标识不一致，请核对识别结果');
      if(data.totalTax!=null&&text(data.totalTax)!==''&&sum(lines.map(l=>l.tax))!==cents(data.totalTax))throw Error('票据明细税额不一致，请核对识别结果');
    }else{
      if(details.length>1)throw Error('票据明细尚未完整识别，不能自动关联');
      const tax=data.totalTax==null||text(data.totalTax)===''?null:cents(data.totalTax);
      if(tax!=null&&(tax<0||tax>total))throw Error('票据税额无效');
      lines=[{index:text(details[0]?.inx??'0'),gross:total,tax}];
    }
    if(model){const indexes=new Set(data[model].map((line,index)=>text(line.inx??(data[model].length===1?'0':''))));if(lines.some(line=>!indexes.has(line.index)))throw Error('票据明细编号与关联来源不一致，请核对识别结果');}
    return {id,barcode,ticketCode,model,taxCode,total,lines,support:false};
  }
  function allocations(row){
    const list=row.allocations||[{person:text(row.bill?.billData?.name),amountCents:row.amountCents}];
    if(!Array.isArray(list)||!list.length||list.length>60)throw Error('请点击按人均分，或填写有效的分摊金额');
    const seen=new Set();
    for(const a of list){const person=text(a.person);if(['交通意外险','住宿'].includes(row.category)&&!person)throw Error('请填写'+row.category+'费用归属人员');if(person.length>80||/[\u0000-\u001f]/.test(person))throw Error('费用归属人员无效');if(seen.has(person))throw Error('同一发票分摊人员不能重复');seen.add(person);if(!Number.isSafeInteger(a.amountCents)||a.amountCents<=0)throw Error('分摊金额须大于零，且精确到分')}
    if(sum(list.map(a=>a.amountCents))!==row.amountCents)throw Error('分摊合计必须等于所选发票金额');
    return list.map(a=>({person:text(a.person),amountCents:a.amountCents}));
  }
  function supporting(row){return /酒店住宿流水单|住宿清单/.test([row?.bill?.ticketName,row?.bill?.billTitle,row?.title].join(' '))&&!/截图/.test([row?.title,row?.bill?.ticketName].join(' '))}
  function link(s,line,used,sequence){
    // Fields observed in native saved rows and pageReimbInvoice: record, barcode,
    // invoice line, used gross amount, ticket code, sequence and amount-count flag.
    // Model names come from real source arrays; tax codes are copied only from
    // explicitly supplied native relation metadata, never guessed by category.
    return {BSX070802:s.id,BSX070807:s.barcode,...(s.support?{}:{BSX070803:line.index}),BSX070804:used/100,
            ...(s.model?{BSX070808:s.model}:{}),...(s.taxCode?{BSX070810:s.taxCode}:{}),
            BSX070809:s.ticketCode,BSX070801:sequence,BSX070811:s.support?'0':'1'};
  }
  function compile(rows){
    const groups=new Map(),sources=new Set(),supportIndex=new Map(rows.filter(supporting).map(r=>[r.identity,r]));
    for(const row of rows){
      if(!row.selected||row.blocked||!row.category||row.kind==='allowance')continue;
      const s=source(row.bill);if(s.total!==row.amountCents)throw Error('票据金额已变化，请刷新预览');
      if(sources.has(s.id)||sources.has(s.barcode))throw Error('同一发票不能重复分摊');sources.add(s.id);sources.add(s.barcode);
      const parts=allocations(row),matrix=parts.map(()=>[]),remaining=s.lines.map(l=>l.gross);
      for(let i=0;i<parts.length;i++){
        const gross=i===parts.length-1?remaining.slice():proportional(parts[i].amountCents,remaining);
        for(let j=0;j<s.lines.length;j++){if(gross[j]>remaining[j])throw Error('分摊超过票据明细金额');remaining[j]-=gross[j];matrix[i].push({gross:gross[j],tax:null})}
      }
      for(let j=0;j<s.lines.length;j++)if(s.lines[j].tax!=null){const tax=proportional(s.lines[j].tax,matrix.map(v=>v[j].gross));for(let i=0;i<parts.length;i++)matrix[i][j].tax=tax[i]}
      for(let i=0;i<parts.length;i++){
        const part=parts[i],grouped=row.category==='交通意外险';
        const key=JSON.stringify([row.category,part.person,grouped?'person':row.identity]);
        let expense=groups.get(key);
        if(!expense){expense={kind:'invoice',identity:key,category:row.category,person:part.person,title:row.title,bill:row.bill,amountCents:0,taxCents:0,links:[],sources:[],selected:true,blocked:false};groups.set(key,expense)}
        expense.amountCents=sum([expense.amountCents,part.amountCents]);
        if(expense.taxCents!=null){const taxes=matrix[i].filter(p=>p.gross>0).map(p=>p.tax);expense.taxCents=taxes.some(t=>t==null)?null:sum([expense.taxCents,...taxes])}
        expense.sources.push({identity:row.identity,bill:row.bill,record:s.id,barcode:s.barcode,total:s.total,used:part.amountCents});
        for(let j=0;j<s.lines.length;j++)if(matrix[i][j].gross>0)expense.links.push(link(s,s.lines[j],matrix[i][j].gross,expense.links.length));
        if(row.supportIdentities?.length&&row.category!=='住宿')throw Error('住宿凭证只能关联住宿费用');
        for(const identity of new Set(row.supportIdentities||[])){
          const evidence=supportIndex.get(identity);if(!evidence)throw Error('住宿凭证已变化，请重新选择');
          const support=source(evidence.bill,true);
          if(!expense.links.some(l=>l.BSX070802===support.id&&l.BSX070811==='0')){expense.links.push(link(support,support.lines[0],0,expense.links.length));(expense.supportBills||=[]).push(evidence.bill)}
        }
      }
    }
    return [...groups.values()];
  }
  function reclassifications(form,activityId,mode,categories,expenses){
    if(mode!=='replace')return [];
    const sources=new Map();
    for(const expense of expenses)for(const s of expense.sources){
      const old=sources.get(s.record);
      if(old&&(old.barcode!==s.barcode||old.category!==expense.category))throw Error('票据关联标识或目标分类不一致');
      sources.set(s.record,{barcode:s.barcode,category:expense.category});
    }
    const barcodes=new Map([...sources].map(([id,s])=>[s.barcode,id])),moves=[];
    for(const activity of form.activitys||[]){
      if(activity.activityMetaId!==activityId)continue;
      for(const behavior of activity.behaviors||[]){
        if(behavior.behaviorKey==='summary'||behavior.behaviorMetaName==='总览'||categories.includes(behavior.behaviorMetaName))continue;
        for(const record of behavior.behaviorDetail||[]){
          const links=record.BSX0709||[],paid=links.filter(l=>String(l.BSX070811)!=='0');
          const matches=l=>sources.has(text(l.BSX070802))||barcodes.has(text(l.BSX070807));
          if(!paid.some(matches))continue;
          // Move only complete, unambiguous invoice-backed rows in this activity.
          // Mixed manual amounts, unrelated invoices and supporting links stay untouched.
          if(links.length!==paid.length||paid.some(l=>!matches(l)))throw Error('跨分类原费用行含其他票据或凭证，请先手动拆分原明细');
          const targets=new Set();let used=0;
          for(const l of paid){
            const source=sources.get(text(l.BSX070802)),amount=cents(l.BSX070804??0);
            if(!source||source.barcode!==text(l.BSX070807)||amount<=0)throw Error('跨分类原票据关联不完整，请核对原明细');
            targets.add(source.category);used=sum([used,amount]);
          }
          if(cents(record.BSX070306)!==used)throw Error('跨分类原费用金额与票据不一致，请先核对原明细');
          moves.push({behavior,record,amountCents:used,fromCategory:behavior.behaviorMetaName,toCategories:[...targets]});
        }
      }
    }
    return moves;
  }
  function assertRetained(form,activityId,mode,categories,expenses){
    const moves=reclassifications(form,activityId,mode,categories,expenses),removed=new Set(moves.map(m=>m.record));
    const budget=new Map();for(const r of expenses)for(const s of r.sources){let b=budget.get(s.record);if(!b){b={barcode:s.barcode,total:s.total,used:0};budget.set(s.record,b)}if(b.barcode!==s.barcode||b.total!==s.total)throw Error('票据关联标识不一致');b.used=sum([b.used,s.used])}
    const barcodeToId=new Map([...budget].map(([id,b])=>[b.barcode,id]));
    for(const a of form.activitys||[])for(const b of a.behaviors||[]){
      if(mode==='replace'&&a.activityMetaId===activityId&&categories.includes(b.behaviorMetaName)&&b.behaviorKey!=='summary')continue;
      for(const d of b.behaviorDetail||[]){if(removed.has(d))continue;for(const l of d.BSX0709||[]){
        if(String(l.BSX070811)==='0')continue;
        const id=text(l.BSX070802),known=budget.get(id)||budget.get(barcodeToId.get(text(l.BSX070807)));
        if(!known)continue;
        const used=cents(l.BSX070804??0);if(used<0||(!used&&cents(d.BSX070306??0)>0))throw Error('原费用行票据使用金额不完整，请更新对应分类');known.used=sum([known.used,used]);
      }}
    }
    for(const b of budget.values())if(b.used>b.total)throw Error('发票已关联其他明细，重复使用金额超出票面金额');
    return moves;
  }
  function signature(links,withIds=false){return JSON.stringify(links.map(l=>[withIds?text(l.id):null,text(l.BSX070802),text(l.BSX070807),text(l.BSX070803),cents(l.BSX070804),text(l.BSX070808),text(l.BSX070809),text(l.BSX070810),text(l.BSX070811)]))}
  function assertRecord(record,expected){
    const withIds=expected.links.every(l=>!!l.id);
    if(expected.recordId&&record.id!==expected.recordId)throw Error('原费用行关联标识发生变化，已取消生成');
    if(!Array.isArray(record.BSX0709)||!record.BSX0709.length||signature(record.BSX0709,withIds)!==signature(expected.links,withIds)||cents(record.BSX070306)!==expected.amountCents)throw Error('原费用行票据关联或使用金额发生变化，已取消生成');
    if(sum(record.BSX0709.filter(l=>String(l.BSX070811)!=='0').map(l=>cents(l.BSX070804)))!==expected.amountCents)throw Error('费用金额与关联票据使用金额不一致');
  }
  function newId(random){
    if(!random?.getRandomValues)throw Error('票据关联编号初始化失败');
    const bytes=random.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  return {compile,assertRetained,assertRecord,evenSplit,people,newId,source,supporting,nativeMetadata};
});
