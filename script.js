const API_BASE = "https://polished-king-9c0b.kabocha2110.workers.dev";
let isFetching = false, cancelRequested = false;
const PAGE_SIZE = 40, MAX_PARALLEL = 4, ACT_PARALLEL = 2;
let fetchedData = { meta: {}, projects: [], comments: [], managers: [], curators: [], activity: [] };

const parseStudioId = str => {
  const m = str.trim().match(/studios\/(\d+)/) || str.trim().match(/^(\d+)$/);
  return m ? m[1] : null;
};

// 指数バックオフ付き自動リトライ機能（エラーによる取得漏れを防止）
async function fetchPage(type, studioId, offset, retries = 3, delay = 1000) {
  if (cancelRequested) return null;
  const url = `${API_BASE}/studios/${studioId}/${type}?limit=${PAGE_SIZE}&offset=${offset}`;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (cancelRequested) return null;
      if (i === retries) {
        console.error(`Err [${type}/${offset}]:`, err);
        return null; // 最終失敗時はnullを返し、呼び出し元で検知
      }
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i))); // 指数バックオフ
    }
  }
}

function appendItems(type, items) {
  if (!items?.length) return;
  if (type === 'projects') {
    items.forEach(p => !fetchedData.projects.some(e => e.id === p.id) && fetchedData.projects.push({ id: p.id, title: p.title || "", url: `https://scratch.mit.edu/projects/${p.id}/`, actor: p.actor?.username || "" }));
  } else if (type === 'comments') {
    items.forEach(c => {
      const dt = c.datetime_created ? new Date(c.datetime_created).toLocaleString() : "";
      const auth = c.author?.username || "匿名", ct = c.content || "";
      !fetchedData.comments.some(e => e.username === auth && e.content === ct && e.datetime === dt) && fetchedData.comments.push({ username: auth, content: ct, datetime: dt });
    });
  } else if (type === 'managers' || type === 'curators') {
    items.forEach(m => m.username && !fetchedData[type].includes(m.username) && fetchedData[type].push(m.username));
  } else if (type === 'activity') {
    items.forEach(a => {
      const act = a.actor_username || a.actor?.username || "", t = a.project_title || a.title || "";
      const dt = a.datetime_created ? new Date(a.datetime_created).toLocaleString() : "", ty = a.type || "";
      !fetchedData.activity.some(e => e.type === ty && e.actor === act && e.title === t && e.datetime === dt) && fetchedData.activity.push({ type: ty, actor: act, title: t, datetime: dt });
    });
  }
}

async function fetchAllPages(type, studioId) {
  let nextOffset = 0, finished = false;
  const limit = (type === 'activity') ? ACT_PARALLEL : MAX_PARALLEL;
  while (!finished && !cancelRequested) {
    const offsets = Array.from({ length: limit }, (_, i) => nextOffset + i * PAGE_SIZE);
    const prevCount = fetchedData[type]?.length || 0;
    const results = await Promise.all(offsets.map(o => fetchPage(type, studioId, o)));
    if (cancelRequested) break;
    let receivedAny = false, hasFailed = false;

    for (const items of results) {
      if (items === null) { hasFailed = true; continue; } // エラー時はスキップし、早期終了トリガーを防止
      if (!items.length) { finished = true; continue; }
      receivedAny = true;
      appendItems(type, items);
      if (items.length < PAGE_SIZE) finished = true;
    }
    const currCount = fetchedData[type]?.length || 0;
    // エラーが起きていない安全な状態のみ、重複検知による早期終了を行う
    if (!receivedAny || (!hasFailed && type !== 'managers' && type !== 'curators' && currCount === prevCount)) {
      finished = true;
      break;
    }
    nextOffset += limit * PAGE_SIZE;
  }
}
