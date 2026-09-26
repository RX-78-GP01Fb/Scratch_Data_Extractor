const API_BASE="https://polished-king-9c0b.kabocha2110.workers.dev",PAGE_SIZE=40,MAX_PARALLEL=4;
let isFetching=false,cancelRequested=false,fetchedData={meta:{},projects:[],comments:[],managers:[],curators:[],activity:[]};
const $=id=>document.getElementById(id),$$=s=>document.querySelectorAll(s);
const parseStudioId=str=>{const m=str.trim().match(/studios\/(\d+)/)||str.trim().match(/^(\d+)$/);return m?m[1]:null};
const switchTab=name=>($$('.win-tab-btn').forEach(b=>b.classList.toggle('active',b.id===`tab-${name}`)),$$('.tab-view').forEach(v=>v.classList.toggle('hidden',v.id!==`view-${name}`)));
const setProgress=(pct,text)=>{const p=Math.min(100,Math.max(0,pct));$('retroProgressBar').style.width=`${p}%`;$('progressPercentText').innerText=`${Math.round(p)}%`;$('progressStatusText').innerText=`状態: ${text}`;$('statusBarText').innerText=text};
const cancelFetch=()=>(cancelRequested=true,setProgress(50,"中止要求を送信中..."));
const resetForm=()=>($('studioIdInput').value='',setProgress(0,"準備完了"));

async function fetchPage(type,studioId,offset,dateLimit="",retries=3,delay=1000){
  if(cancelRequested)return null;
  let url=`${API_BASE}/studios/${studioId}/${type}?limit=${PAGE_SIZE}`;
  if(type==='activity' && dateLimit) url+=`&dateLimit=${dateLimit}`;
  else url+=`&offset=${offset}`;
  for(let i=0;i<=retries;i++){
    try{const res=await fetch(url);if(!res.ok)throw Error(`HTTP ${res.status}`);return await res.json()}
    catch(err){if(cancelRequested)return null;if(i===retries)return null;await new Promise(r=>setTimeout(r,delay*Math.pow(2,i)))}
  }
}
function appendItems(type,items){
  if(!items || !items.length)return;
  if(type==='projects')items.forEach(p=>!fetchedData.projects.some(e=>e.id===p.id)&&fetchedData.projects.push({id:p.id,title:p.title||"",url:`https://scratch.mit.edu/projects/${p.id}/`,actor:p.username||""}));
  else if(type==='comments')items.forEach(c=>{const dt=c.datetime_created?new Date(c.datetime_created).toLocaleString():"",auth=(c.author?c.author.username:"匿名"),ct=c.content||"";!fetchedData.comments.some(e=>e.username===auth&&e.content===ct&&e.datetime===dt)&&fetchedData.comments.push({username:auth,content:ct,datetime:dt})});
  else if(type==='managers'||type==='curators')items.forEach(m=>m.username&&!fetchedData[type].includes(m.username)&&fetchedData[type].push(m.username));
  else if(type==='activity')items.forEach(a=>{
    const act=a.actor_username||(a.actor?a.actor.username:""),
          rec=a.recipient_username||(a.recipient?a.recipient.username:""),
          proj=a.project_title||a.title||"",ty=a.type||"";
    let t=proj;if(!t&&rec)t=`対象: ${rec}`;
    if(!t){
      if(ty==='updatestudio')t="スタジオ設定（タイトル/説明/画像など）";
      else if(ty==='becomecurator')t=`キュレーター参加: ${act}`;
      else if(ty==='becomeownerstudio')t=`マネージャー昇格: ${act}`;
      else t="その他スタジオ操作";
    }
    const dt=a.datetime_created?new Date(a.datetime_created).toLocaleString():"";
    if(!fetchedData.activity.some(e=>e.type===ty&&e.actor===act&&e.title===t&&e.datetime===dt)) {
      fetchedData.activity.push({type:ty,actor:act,title:t,datetime:dt});
    }
  });
}
async function fetchAllPages(type,studioId){
  let finished=false;
  if(type==='activity'){
    let dateLimit="";
    while(!finished&&!cancelRequested){
      const prevCount=fetchedData.activity.length;const items=await fetchPage('activity',studioId,0,dateLimit);
      if(cancelRequested||items===null)break;if(!items.length){finished=true;break}
      appendItems('activity',items);if(items.length<PAGE_SIZE){finished=true;break}
      const lastItem=items[items.length-1];dateLimit=lastItem.datetime_created||lastItem.datetime||"";
      const currCount=fetchedData.activity.length;if(currCount===prevCount){finished=true;break}
    }
  }else{
    let nextOffset=0;
    while(!finished&&!cancelRequested){
      const offsets=Array.from({length:MAX_PARALLEL},(_,i)=>nextOffset+i*PAGE_SIZE),prevCount=(fetchedData[type]?fetchedData[type].length:0);
      const results=await Promise.all(offsets.map(o=>fetchPage(type,studioId,o)));if(cancelRequested)break;
      let receivedAny=false,hasFailed=false;
      for(const items of results){if(items===null){hasFailed=true;continue};if(!items.length){finished=true;continue};receivedAny=true;appendItems(type,items);if(items.length<PAGE_SIZE)finished=true}
      const currCount=(fetchedData[type]?fetchedData[type].length:0);
      if(!receivedAny||(!hasFailed&&type!=='managers'&&type!=='curators'&&currCount===prevCount)){finished=true;break}
      nextOffset+=MAX_PARALLEL*PAGE_SIZE;
    }
  }
}
async function startExtraction(){
  if(isFetching)return;const sId=parseStudioId($('studioIdInput').value);if(!sId)return alert('エラー: スタジオIDを入力してください。');
  const opts=['Projects','Comments','Members','Activity'].reduce((a,k)=>({...a,[k.toLowerCase()]:$(`chk${k}`).checked}),{});
  if(!Object.values(opts).some(Boolean))return alert('エラー: 取得項目を選択してください。');
  isFetching=true;cancelRequested=false;$('fetchBtn').disabled=true;$('cancelBtn').classList.remove('hidden');
  fetchedData={meta:{id:sId,fetchedAt:new Date().toISOString()},projects:[],comments:[],managers:[],curators:[],activity:[]};
  try{
    setProgress(5,"メタデータ取得中...");const metaRes=await fetch(`${API_BASE}/studios/${sId}`);if(!metaRes.ok)throw Error(`HTTP ${metaRes.status}`);
    const meta=await metaRes.json();fetchedData.meta={...fetchedData.meta,title:meta.title||"無題",owner:meta.owner||"不明",description:meta.description||""};
    const tasks=[];if(opts.projects)tasks.push('projects');if(opts.comments)tasks.push('comments');if(opts.members)tasks.push('managers','curators');if(opts.activity)tasks.push('activity');
    setProgress(10,"データ並列取得を開始...");await Promise.all(tasks.map(type=>fetchAllPages(type,sId)));
    setProgress(100,cancelRequested?"中断されました。":"データ取得完了！");renderUI();
  }catch(e){console.error(e);alert(`エラー: ${e.message}`);setProgress(0,"エラー発生")}
  finally{isFetching=false;$('fetchBtn').disabled=false;$('cancelBtn').classList.add('hidden')}
}
function renderUI(){
  ['btnExportJson','btnExportCsv','btnCopyClipboard'].forEach(id=>$(id).disabled=false);
  $('studioBadge').innerText=`ID: ${fetchedData.meta.id}`;$('studioBadge').classList.remove('hidden');
  document.querySelector('.win-titlebar span').innerText=`Scratch Data Extractor - [${fetchedData.meta.title}]`;
  $('tab-projects').innerText=`プロジェクト (${fetchedData.projects.length})`;$('tab-comments').innerText=`コメント (${fetchedData.comments.length})`;
  $('tab-members').innerText=`メンバー (${fetchedData.managers.length+fetchedData.curators.length})`;$('tab-activity').innerText=`活動内容 (${fetchedData.activity.length})`;
  $('statusBarCount').innerText=`Items: ${fetchedData.projects.length+fetchedData.comments.length+fetchedData.managers.length+fetchedData.curators.length+fetchedData.activity.length}`;
  ['Projects','Comments','Activity'].forEach(k=>($(`stat${k}`).innerText=fetchedData[k.toLowerCase()].length));
  $('statMembers').innerText=`${fetchedData.managers.length} / ${fetchedData.curators.length}`;
  ['Title','Owner','Id'].forEach(k=>($(`meta${k}`).innerText=fetchedData.meta[k.toLowerCase()]));
  $('metaTime').innerText=new Date(fetchedData.meta.fetchedAt).toLocaleString();$('metaDesc').innerText=fetchedData.meta.description||"(説明なし)";
  $('tableProjectsBody').innerHTML=fetchedData.projects.length?fetchedData.projects.map(p=>`<tr><td>${p.id}</td><td class="font-semibold">${esc(p.title)}</td><td>${esc(p.actor)}</td><td class="text-center"><a href="${p.url}" target="_blank" class="text-blue-800 underline">開く</a></td></tr>`).join(''):`<tr><td colspan="4" class="text-center text-gray-500 py-4">データなし</td></tr>`;
  $('tableCommentsBody').innerHTML=fetchedData.comments.length?fetchedData.comments.map(c=>`<tr><td class="font-bold comment-author">${esc(c.username)}</td><td class="whitespace-pre-wrap">${esc(c.content)}</td><td class="text-gray-500">${c.datetime}</td></tr>`).join(''):`<tr><td colspan="3" class="text-center text-gray-500 py-4">データなし</td></tr>`;
  $('cntManagers').innerText=`${fetchedData.managers.length}名`;$('cntCurators').innerText=`${fetchedData.curators.length}名`;
  $('listManagers').innerHTML=fetchedData.managers.length?fetchedData.managers.map(m=>`<div>• ${esc(m)}</div>`).join(''):`<div class="text-gray-400">なし</div>`;
  $('listCurators').innerHTML=fetchedData.curators.length?fetchedData.curators.map(c=>`<div>• ${esc(c)}</div>`).join(''):`<div class="text-gray-400">なし</div>`;
  $('tableActivityBody').innerHTML=fetchedData.activity.length?fetchedData.activity.map(a=>`<tr><td class="font-mono bg-gray-100">${esc(a.type)}</td><td class="font-semibold">${esc(a.actor)}</td><td>${esc(a.title)}</td><td class="text-gray-500">${a.datetime}</td></tr>`).join(''):`<tr><td colspan="4" class="text-center text-gray-500 py-4">データなし</td></tr>`;
}
const esc=s=>s?String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):``;
const escCsv=v=>v==null?'""':`"${String(v).replace(/"/g,'""')}"`;
const dl=(b,f)=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=f;a.click()};
const downloadJson=()=>dl(new Blob([JSON.stringify(fetchedData,null,2)],{type:'application/json'}),`studio_${fetchedData.meta.id}_data.json`);
const copyJsonToClipboard=()=>navigator.clipboard.writeText(JSON.stringify(fetchedData,null,2)).then(()=>alert('JSONをコピーしました！'));
function downloadCombinedCsv(){
  let c=[`\uFEFF--- スタジオ情報 ---`,`ID,${escCsv(fetchedData.meta.id)}`,`タイトル,${escCsv(fetchedData.meta.title)}`,`オーナー,${escCsv(fetchedData.meta.owner)}`,`取得日時,${escCsv(fetchedData.meta.fetchedAt)}\n`,`--- プロジェクト一覧 ---`,`ID,タイトル,URL,追加者`];
  fetchedData.projects.forEach(p=>c.push(`${escCsv(p.id)},${escCsv(p.title)},${escCsv(p.url)},${escCsv(p.actor)}`));
  c.push(`\n--- コメント一覧 ---`,`投稿者,内容,日時`);fetchedData.comments.forEach(co=>c.push(`${escCsv(co.username)},${escCsv(co.content)},${escCsv(co.datetime)}`));
  c.push(`\n--- マネージャー ---`,fetchedData.managers.map(escCsv).join(`,`),`--- キュレーター ---`,fetchedData.curators.map(escCsv).join(`,`),`\n--- 活動履歴 ---`,`操作種別,実行者,対象タイトル,日時`);
  fetchedData.activity.forEach(a=>c.push(`${escCsv(a.type)},${escCsv(a.actor)},${escCsv(a.title)},${escCsv(a.datetime)}`));
  dl(new Blob([c.join("\n")],{type:'text/csv;charset=utf-8;'}),`studio_${fetchedData.meta.id}_combined.csv`);
}
function downloadSectionCsv(sec){
  let c=["\uFEFF"];
  if(sec==='projects'){c.push("ID,タイトル,URL,追加者");fetchedData.projects.forEach(p=>c.push(`${escCsv(p.id)},${escCsv(p.title)},${escCsv(p.url)},${escCsv(p.actor)}`))}
  else if(sec==='comments'){c.push("投稿者,内容,日時");fetchedData.comments.forEach(co=>c.push(`${escCsv(co.username)},${escCsv(co.content)},${escCsv(co.datetime)}`))}
  else if(sec==='activity'){c.push("操作種別,実行者,タイトル,日時");fetchedData.activity.forEach(a=>c.push(`${escCsv(a.type)},${escCsv(a.actor)},${escCsv(a.title)},${escCsv(a.datetime)}`))}
  dl(new Blob([c.join("\n")],{type:'text/csv;charset=utf-8;'}),`studio_${fetchedData.meta.id}_${sec}.csv`);
}
const downloadSectionTxt=()=>dl(new Blob([`=== マネージャー ===\n${fetchedData.managers.join("\n")}\n\n=== キュレーター ===\n${fetchedData.curators.join("\n")}`],{type:'text/plain;charset=utf-8;'}),`studio_${fetchedData.meta.id}_members.txt`);

// ==========================================
// Find Explorer 検索機能
// ==========================================

function openSearchModal() {
  if (fetchedData.projects.length === 0 && fetchedData.comments.length === 0 && fetchedData.activity.length === 0) {
    alert('検索対象のデータがありません。先に「一括取得」を行ってください。');
    return;
  }
  $('searchModal').classList.remove('hidden');$('searchInput').focus();
}

function closeSearchModal() {
  $('searchModal').classList.add('hidden');$('searchResults').innerHTML = '';
  $('searchInput').value = '';$('searchStatus').innerText = '';
}

async function executeSearch() {
  const query = $('searchInput').value.trim().toLowerCase();
  if (!query) return;
  
  const resEl = $('searchResults');
  const statEl = $('searchStatus');
  resEl.innerHTML = '';
  
  // Searching... のグリッチ演出
  statEl.innerText = 'SEARCHING...';
  let glitchInterval = setInterval(() => {
    statEl.innerText = 'SEARCHING' + '.'.repeat(Math.floor(Math.random() * 4)) + ' ' + Math.random().toString(36).substring(2, 10).toUpperCase();
  }, 50);

  // 演出のためのウェイト（1.2秒）
  await new Promise(r => setTimeout(r, 1200)); 
  clearInterval(glitchInterval);
  
  // 取得済み全データから検索
  const results = [];
  fetchedData.projects.forEach(p => {
    if (p.title.toLowerCase().includes(query) || p.actor.toLowerCase().includes(query)) results.push(`[PROJECT] ID:${p.id} | ${p.title} (by ${p.actor})`);
  });
  fetchedData.comments.forEach(c => {
    if (c.content.toLowerCase().includes(query) || c.username.toLowerCase().includes(query)) results.push(`[COMMENT] ${c.datetime} | ${c.username}: ${c.content}`);
  });
  fetchedData.managers.forEach(m => {
    if (m.toLowerCase().includes(query)) results.push(`[MANAGER] ${m}`);
  });
  fetchedData.curators.forEach(c => {
    if (c.toLowerCase().includes(query)) results.push(`[CURATOR] ${c}`);
  });
  fetchedData.activity.forEach(a => {
    if (a.title.toLowerCase().includes(query) || a.actor.toLowerCase().includes(query)) results.push(`[ACTIVITY] ${a.datetime} | ${a.type} by ${a.actor} -> ${a.title}`);
  });

  if (results.length === 0) {
    statEl.innerText = '0 MATCHES FOUND.';
    statEl.style.color = 'red';
    resEl.innerHTML = '<div style="color:red;">NO DATA FOUND.</div>';
    setTimeout(() => statEl.style.color = '', 2000);
    return;
  }

  statEl.innerText = `MATCH FOUND: ${results.length} RECORDS.`;

  // 1件ずつ文字をデコード（シャッフル）しながら表示するアニメーション
  const displayLimit = 50; // 描画負荷軽減のため最大50件
  for (let i = 0; i < Math.min(results.length, displayLimit); i++) {
    const div = document.createElement('div');
    resEl.appendChild(div);
    await typeDecodeText(div, results[i]);
    // 画面下部へ自動スクロール
    resEl.scrollTop = resEl.scrollHeight;
  }
  
  if (results.length > displayLimit) {
    const div = document.createElement('div');
    div.innerText = `...AND ${results.length - displayLimit} MORE RECORDS HIDDEN.`;
    div.style.color = '#ffff00';
    resEl.appendChild(div);
  }
}

// 映画風：文字がランダムに切り替わりながら表示される関数
async function typeDecodeText(element, text) {
  let currentText = '';
  // ダミーとして表示する文字群
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+<>?';
  
  for (let i = 0; i < text.length; i++) {
    // 1文字確定する前に2回ランダムな文字を表示
    for (let j = 0; j < 2; j++) {
      element.innerText = currentText + chars[Math.floor(Math.random() * chars.length)];
      // 処理を少し待つ（ここで速度調整）
      await new Promise(r => setTimeout(r, 8));
    }
    currentText += text[i];
    element.innerText = currentText;
  }
}
