const API = "https://polished-king-9c0b.kabocha2110.workers.dev";
async function start() {
    const id = document.getElementById("studioId").value.trim();
    if (!id) return alert("IDを入力してください");
    const log = document.getElementById("log");
    log.innerHTML = "<tr><td colspan='3'>取得中...</td></tr>";
    try {
        const res = await fetch(`${API}/studios/${id}/activity?limit=40`);
        const items = await res.json();
        log.innerHTML = items.map(a => `
            <tr>
                <td class="bg-gray-100 p-1">${a.type || ""}</td>
                <td class="font-bold p-1">${a.actor_username || ""}</td>
                <td class="p-1">${a.project_title || ""}</td>
            </tr>
        `).join('');
    } catch (e) {
        log.innerHTML = "<tr><td colspan='3'>エラーが発生しました</td></tr>";
    }
}
