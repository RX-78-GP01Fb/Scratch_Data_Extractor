const API_BASE = "https://polished-king-9c0b.kabocha2110.workers.dev";
let isFetching = false, cancelRequested = false;
let fetchedData = { meta: {}, projects: [], comments: [], managers: [], curators: [], activity: [] };

const parseStudioId = str => {
    const m = str.trim().match(/studios\/(\d+)/) || str.trim().match(/^(\d+)$/);
    return m ? m[1] : null;
};
const switchTab = name => {
    document.querySelectorAll('.win-tab-btn').forEach(b => b.classList.toggle('active', b.id === `tab-${name}`));
    document.querySelectorAll('.tab-view').forEach(v => v.classList.toggle('hidden', v.id !== `view-${name}`));
};
const setProgress = (pct, text) => {
    const p = Math.min(100, Math.max(0, pct));
    document.getElementById('retroProgressBar').style.width = `${p}%`;
    document.getElementById('progressPercentText').innerText = `${Math.round(p)}%`;
    document.getElementById('progressStatusText').innerText = `状態: ${text}`;
    document.getElementById('statusBarText').innerText = text;
};
const cancelFetch = () => { cancelRequested = true; setProgress(50, "中止要求を送信中..."); };
const resetForm = () => { document.getElementById('studioIdInput').value = ''; setProgress(0, "準備完了"); };

async function startExtraction() {
    if (isFetching) return;
    const sId = parseStudioId(document.getElementById('studioIdInput').value);
    if (!sId) return alert('エラー: スタジオIDを入力してください。');
    const opts = ['Projects', 'Comments', 'Members', 'Activity'].reduce((a, k) => ({ ...a, [k.toLowerCase()]: document.getElementById(`chk${k}`).checked }), {});
    if (!Object.values(opts).some(Boolean)) return alert('エラー: 取得項目を選択してください。');

    isFetching = true; cancelRequested = false;
    document.getElementById('fetchBtn').disabled = true; document.getElementById('cancelBtn').classList.remove('hidden');
    fetchedData = { meta: { id: sId, fetchedAt: new Date().toISOString() }, projects: [], comments: [], managers: [], curators: [], activity: [] };

    try {
        setProgress(5, "メタデータ取得中...");
        const meta = await fetch(`${API_BASE}/studios/${sId}`).then(r => r.json());
        fetchedData.meta = { ...fetchedData.meta, title: meta.title || "無題", owner: meta.owner || "不明", description: meta.description || "" };

        let tasks = [];
        if (opts.projects) tasks.push('projects');
        if (opts.comments) tasks.push('comments');
        if (opts.members) { tasks.push('managers'); tasks.push('curators'); }
        if (opts.activity) tasks.push('activity');

        setProgress(10, "データ並列取得を開始...");
        await Promise.all(tasks.map(async (t) => {
            let offset = 0, hasMore = true;
            while (hasMore && !cancelRequested) {
                const items = await fetch(`${API_BASE}/studios/${sId}/${t}?limit=40&offset=${offset}`).then(r => r.ok ? r.json() : []);
                if (!items.length || cancelRequested) { hasMore = false; break; }
                if (t === 'projects') items.forEach(p => fetchedData.projects.push({ id: p.id, title: p.title || "", url: `https://scratch.mit.edu/projects/${p.id}/`, actor: p.actor?.username || "" }));
                else if (t === 'comments') items.forEach(c => fetchedData.comments.push({ username: c.author?.username || "匿名", content: c.content || "", datetime: c.datetime_created ? new Date(c.datetime_created).toLocaleString() : "" }));
                else if (t === 'managers' || t === 'curators') items.forEach(m => fetchedData[t].push(m.username));
                else if (t === 'activity') items.forEach(a => fetchedData.activity.push({ type: a.type || "", actor: a.actor_username || a.actor?.username || "", title: a.project_title || a.title || "", datetime: a.datetime_created ? new Date(a.datetime_created).toLocaleString() : "" }));
                offset += 40;
            }
        }));
        setProgress(100, cancelRequested ? "中断されました。" : "データ取得完了！");
        renderUI();
    } catch (e) {
        alert(`エラー: ${e.message}`); setProgress(0, "エラー発生");
    } finally {
        isFetching = false; document.getElementById('fetchBtn').disabled = false; document.getElementById('cancelBtn').classList.add('hidden');
    }
}

function renderUI() {
    ['btnExportJson', 'btnExportCsv', 'btnCopyClipboard'].forEach(id => document.getElementById(id).disabled = false);
    const badge = document.getElementById('studioBadge');
    badge.innerText = `ID: ${fetchedData.meta.id}`; badge.classList.remove('hidden');
    document.querySelector('.win-titlebar span').innerText = `Scratch Data Extractor - [${fetchedData.meta.title}]`;
    document.getElementById('tab-projects').innerText = `プロジェクト (${fetchedData.projects.length})`;
    document.getElementById('tab-comments').innerText = `コメント (${fetchedData.comments.length})`;
    document.getElementById('tab-members').innerText = `メンバー (${fetchedData.managers.length + fetchedData.curators.length})`;
    document.getElementById('tab-activity').innerText = `活動内容 (${fetchedData.activity.length})`;
    document.getElementById('statusBarCount').innerText = `Items: ${fetchedData.projects.length + fetchedData.comments.length + fetchedData.managers.length + fetchedData.curators.length + fetchedData.activity.length}`;
    ['Projects', 'Comments', 'Activity'].forEach(k => document.getElementById(`stat${k}`).innerText = fetchedData[k.toLowerCase()].length);
    document.getElementById('statMembers').innerText = `${fetchedData.managers.length} / ${fetchedData.curators.length}`;
    ['Title', 'Owner', 'Id'].forEach(k => document.getElementById(`meta${k}`).innerText = fetchedData.meta[k.toLowerCase()]);
    document.getElementById('metaTime').innerText = new Date(fetchedData.meta.fetchedAt).toLocaleString();
    document.getElementById('metaDesc').innerText = fetchedData.meta.description || "(説明なし)";

    document.getElementById('tableProjectsBody').innerHTML = fetchedData.projects.length ? fetchedData.projects.map(p => `<tr><td>${p.id}</td><td class="font-semibold">${esc(p.title)}</td><td>${esc(p.actor)}</td><td class="text-center"><a href="${p.url}" target="_blank" class="text-blue-800 underline">開く</a></td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-gray-500 py-4">データなし</td></tr>';
    document.getElementById('tableCommentsBody').innerHTML = fetchedData.comments.length ? fetchedData.comments.map(c => `<tr><td class="font-bold comment-author">${esc(c.username)}</td><td class="whitespace-pre-wrap">${esc(c.content)}</td><td class="text-gray-500">${c.datetime}</td></tr>`).join('') : '<tr><td colspan="3" class="text-center text-gray-500 py-4">データなし</td></tr>';
    document.getElementById('cntManagers').innerText = `${fetchedData.managers.length}名`;
    document.getElementById('cntCurators').innerText = `${fetchedData.curators.length}名`;
    document.getElementById('listManagers').innerHTML = fetchedData.managers.length ? fetchedData.managers.map(m => `<div>• ${esc(m)}</div>`).join('') : '<div class="text-gray-400">なし</div>';
    document.getElementById('listCurators').innerHTML = fetchedData.curators.length ? fetchedData.curators.map(c => `<div>• ${esc(c)}</div>`).join('') : '<div class="text-gray-400">なし</div>';
    document.getElementById('tableActivityBody').innerHTML = fetchedData.activity.length ? fetchedData.activity.map(a => `<tr><td class="font-mono bg-gray-100">${esc(a.type)}</td><td class="font-semibold">${esc(a.actor)}</td><td>${esc(a.title)}</td><td class="text-gray-500">${a.datetime}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-gray-500 py-4">データなし</td></tr>';
}

const esc = str => str ? String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : '';
const dl = (b, fn) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fn; a.click(); };
const downloadJson = () => dl(new Blob([JSON.stringify(fetchedData, null, 2)], { type: 'application/json' }), `studio_${fetchedData.meta.id}_data.json`);
const copyJsonToClipboard = () => navigator.clipboard.writeText(JSON.stringify(fetchedData, null, 2)).then(() => alert('JSONをコピーしました！'));

function downloadCombinedCsv() {
    let c = ["\uFEFF--- スタジオ情報 ---", `ID,${fetchedData.meta.id}`, `タイトル,"${(fetchedData.meta.title||'').replace(/"/g, '""')}"`, `オーナー,${fetchedData.meta.owner}`, `取得日時,${fetchedData.meta.fetchedAt}\n`, "--- プロジェクト一覧 ---", "ID,タイトル,URL,追加者"];
    fetchedData.projects.forEach(p => c.push(`${p.id},"${p.title.replace(/"/g, '""')}",${p.url},${p.actor}`));
    c.push("\n--- コメント一覧 ---", "投稿者,内容,日時");
    fetchedData.comments.forEach(co => c.push(`${co.username},"${co.content.replace(/"/g, '""')}",${co.datetime}`));
    c.push("\n--- マネージャー ---", fetchedData.managers.join(","), "--- キュレーター ---", fetchedData.curators.join(","), "\n--- 活動履歴 ---", "操作種別,実行者,対象タイトル,日時");
    fetchedData.activity.forEach(a => c.push(`${a.type},${a.actor},"${a.title.replace(/"/g, '""')}",${a.datetime}`));
    dl(new Blob([c.join("\n")], { type: 'text/csv;charset=utf-8;' }), `studio_${fetchedData.meta.id}_combined.csv`);
}

function downloadSectionCsv(sec) {
    let c = ["\uFEFF"];
    if (sec === 'projects') { c.push("ID,タイトル,URL,追加者"); fetchedData.projects.forEach(p => c.push(`${p.id},"${p.title.replace(/"/g, '""')}",${p.url},${p.actor}`)); }
    else if (sec === 'comments') { c.push("投稿者,内容,日時"); fetchedData.comments.forEach(co => c.push(`${co.username},"${co.content.replace(/"/g, '""')}",${co.datetime}`)); }
    else if (sec === 'activity') { c.push("操作種別,実行者,タイトル,日時"); fetchedData.activity.forEach(a => c.push(`${a.type},${a.actor},"${a.title.replace(/"/g, '""')}",${a.datetime}`)); }
    dl(new Blob([c.join("\n")], { type: 'text/csv;charset=utf-8;' }), `studio_${fetchedData.meta.id}_${sec}.csv`);
}

function downloadSectionTxt() {
    let t = `=== マネージャー ===\n${fetchedData.managers.join("\n")}\n\n=== キュレーター ===\n${fetchedData.curators.join("\n")}`;
    dl(new Blob([t], { type: 'text/plain;charset=utf-8;' }), `studio_${fetchedData.meta.id}_members.txt`);
}
