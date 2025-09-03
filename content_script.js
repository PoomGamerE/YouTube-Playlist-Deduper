/* YouTube Playlist Deduper - content script (MV3)
 * v1.3.0: "Recommended section" anchored autoload + Published-date sort.
 */
(function() {
  const STATE = {
    items: [],
    dupGroups: [],
    scanning: false,
    removing: false,
    panel: null,
    previousSortLabel: null,
    changedSort: false,
  };

  const I18N_REMOVE_PATTERNS = [
    /remove/i, /ลบ/i, /retirer/i, /eliminar/i, /entfernen/i, /rimuovi/i, /删除|移除/, /削除/
  ];

  const I18N_RECOMMENDED_TITLE = [
    /วิดีโอที่แนะนำ/i, /Recommended videos?/i, /おすすめの動画/i, /Рекомендованные/i, /Recomendados/i, /推荐视频|推薦影片/
  ];

  function log(...args) { console.log("[YT Deduper]", ...args); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  const qs  = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function ensurePanel() {
    if (STATE.panel) return STATE.panel;
    const panel = document.createElement("div");
    panel.id = "yt-deduper-panel";
    panel.innerHTML = `
      <style>
        #yt-deduper-panel {
          position: fixed; z-index: 999999; right: 16px; bottom: 16px;
          background: rgba(255,255,255,0.95); border: 1px solid #ddd; border-radius: 12px;
          box-shadow: 0 6px 20px rgba(0,0,0,.15); padding: 12px; max-width: 400px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        }
        #yt-deduper-panel h3 { margin: 0 0 6px; font-size: 14px; }
        #yt-deduper-panel .stat { font-size: 12px; color: #333; margin: 4px 0; }
        #yt-deduper-panel .log { font-size: 11px; max-height: 240px; overflow: auto; background: #f7f7f7; border: 1px solid #eee; border-radius: 8px; padding: 6px; }
        .yt-deduper-dup { outline: 3px solid #ffcc00 !important; position: relative; }
        .yt-deduper-dup::after {
          content: "DUPLICATE"; position:absolute; top:6px; left:6px; font-size:11px; font-weight:700;
          background:#ffcc00; color:#333; padding:2px 6px; border-radius:4px;
        }
        .yt-deduper-keep { outline: 3px dashed #66cdaa !important; position: relative; }
        .yt-deduper-keep::after { content: "KEEP"; position:absolute; top:6px; left:6px; font-size:11px; font-weight:700;
          background:#66cdaa; color:#033; padding:2px 6px; border-radius:4px;
        }
      </style>
      <h3>YT Deduper</h3>
      <div class="stat" id="stat"></div>
      <div class="log" id="log"></div>
    `;
    document.body.appendChild(panel);
    STATE.panel = panel;
    return panel;
  }
  function appendLog(msg, cls="") {
    const panel = ensurePanel();
    const logBox = panel.querySelector("#log");
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = msg;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  }
  function setStat(html) {
    const panel = ensurePanel();
    panel.querySelector("#stat").innerHTML = html;
  }

  function lastItem() {
    const nodes = qsa("ytd-playlist-video-renderer");
    return nodes[nodes.length - 1] || null;
  }

  function findRecommendedHeader() {
    const headers = qsa("ytd-item-section-header-renderer #title");
    for (const h of headers) {
      const txt = (h.textContent || "").trim();
      if (I18N_RECOMMENDED_TITLE.some(rx => rx.test(txt))) {
        return h.closest("ytd-item-section-header-renderer");
      }
    }
    return null;
  }

  async function autoloadAllItems({maxMillis = 12*60*1000} = {}) {
    const start = Date.now();
    let prevCount = 0, stable = 0;
    appendLog("Loading all items using Recommended-anchor…");

    while (Date.now() - start < maxMillis) {
      const anchor = findRecommendedHeader();
      if (anchor) {
        anchor.scrollIntoView({ behavior: "instant", block: "center" });
        await sleep(250);
        window.scrollBy({ top: -200, behavior: "instant" });
        await sleep(80);
        window.scrollBy({ top: 320, behavior: "instant" });
        await sleep(180);
      } else {
        const li = lastItem();
        if (li) li.scrollIntoView({ behavior: "instant", block: "center" });
        else window.scrollTo({ top: document.documentElement.scrollHeight * 0.8, behavior: "instant" });
        await sleep(220);
      }

      if (stable >= 4) {
        window.scrollTo({ top: document.documentElement.scrollHeight - 50, behavior: "instant" });
        await sleep(220);
        const anchor2 = findRecommendedHeader();
        if (anchor2) {
          anchor2.scrollIntoView({ behavior: "instant", block: "center" });
          await sleep(200);
        }
      }

      const count = qsa("ytd-playlist-video-renderer").length;
      if (count > prevCount) {
        appendLog(`Loaded ${count} items…`);
        prevCount = count;
        stable = 0;
      } else {
        stable += 1;
      }
      if (stable >= 10) break;
    }
    appendLog("Finished scrolling.");
  }

  function parseItemFromRenderer(el, idx) {
    const link = el.querySelector("a#video-title") || el.querySelector("a[href*='watch']");
    if (!link) return null;
    try {
      const url = new URL(link.href, location.origin);
      const vid = url.searchParams.get("v");
      if (!vid) return null;
      const title = (link.textContent || "").trim();
      return { el, videoId: vid, title, idx };
    } catch { return null; }
  }

  function readAllItems() {
    const nodes = qsa("ytd-playlist-video-renderer");
    const items = [];
    nodes.forEach((el, i) => {
      const it = parseItemFromRenderer(el, i);
      if (it) items.push(it);
    });
    return items;
  }

  function groupDuplicates(items, strategy="first") {
    const byVid = new Map();
    for (const it of items) {
      const arr = byVid.get(it.videoId) || [];
      arr.push(it);
      byVid.set(it.videoId, arr);
    }
    const groups = [];
    for (const [vid, arr] of byVid.entries()) {
      if (arr.length <= 1) continue;
      arr.sort((a,b) => a.idx - b.idx);
      let keep, remove;
      if (strategy === "first") { keep = arr[0]; remove = arr.slice(1); }
      else { keep = arr[arr.length-1]; remove = arr.slice(0, -1); }
      groups.push({ videoId: vid, keep, remove });
    }
    return groups;
  }

  function clearMarks() {
    qsa(".yt-deduper-dup, .yt-deduper-keep").forEach(n => n.classList.remove("yt-deduper-dup","yt-deduper-keep"));
  }
  function markGroups(groups) {
    clearMarks();
    for (const g of groups) {
      g.keep.el.classList.add("yt-deduper-keep");
      g.remove.forEach(r => r.el.classList.add("yt-deduper-dup"));
    }
  }
  function human(n){ return n.toLocaleString(); }
  function updateStats(total, groups) {
    const dupCount = groups.reduce((a, g) => a + g.remove.length, 0);
    setStat(`Found <b>${human(total)}</b> items • <b>${groups.length}</b> duplicate groups • <b>${dupCount}</b> to remove`);
  }

  async function clickMenuAndRemove(el) {
    const btn = el.querySelector("ytd-menu-renderer #button, ytd-menu-renderer yt-icon-button#button, ytd-menu-renderer tp-yt-paper-icon-button#button, ytd-menu-renderer button#button");
    if (!btn) throw new Error("Menu button not found");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(350);
    btn.click();
    await sleep(350);
    const items = qsa("ytd-menu-service-item-renderer");
    const target = items.find(node => /remove|ลบ|retirer|eliminar|entfernen|rimuovi|删除|移除|削除/i.test((node.textContent||"").trim()));
    if (!target) throw new Error("Remove menu item not found");
    target.click();
    const removed = await waitForRemoval(el, 9000);
    if (!removed) throw new Error("Element not removed (slow network/UI change?)");
  }
  function waitForRemoval(el, timeout=9000) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; obs.disconnect(); resolve(false);} }, timeout);
      const obs = new MutationObserver(() => {
        if (!document.body.contains(el)) {
          if (!done) { done = true; clearTimeout(timer); obs.disconnect(); resolve(true); }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  async function tryOpenHeaderSortMenu() {
    const header = qs("ytd-playlist-header-renderer") || document;
    const candidateButtons = qsa("button, yt-icon-button, tp-yt-paper-icon-button", header);
    for (const b of candidateButtons) {
      b.click();
      await sleep(250);
      const items = qsa("ytd-menu-service-item-renderer");
      if (items.length) {
        const joined = items.map(n => (n.textContent||"").trim()).join("|");
        const looksLikeSort = /Date added|วันที่เพิ่ม|Custom|กำหนดเอง|最近|古い|最新|排序|並べ替え|정렬|ยอดนิยม|เผยแพร่|Published/i.test(joined);
        if (looksLikeSort) return items;
      }
      document.body.click();
      await sleep(80);
    }
    return null;
  }

  async function tryOpenChipSortMenu() {
    const chipBar = qs("ytd-feed-filter-chip-bar-renderer");
    if (!chipBar) return null;
    const menuButton = qs("yt-sort-filter-header-renderer yt-dropdown-menu tp-yt-paper-menu-button #label", chipBar) ||
                       qs("#filter yt-dropdown-menu tp-yt-paper-menu-button #label", chipBar) ||
                       qs("yt-dropdown-menu[icon-label]", chipBar) ||
                       qs("yt-dropdown-menu", chipBar);
    if (!menuButton) return null;
    menuButton.click();
    await sleep(250);
    const list = qs("tp-yt-iron-dropdown[aria-hidden='false'] tp-yt-paper-listbox#menu") ||
                 qs("tp-yt-paper-listbox#menu");
    if (!list) return null;
    const items = qsa("tp-yt-paper-item", list);
    return items;
  }

  async function openAnySortMenu() {
    let items = await tryOpenHeaderSortMenu();
    if (items && items.length) return { items, type: "header" };
    items = await tryOpenChipSortMenu();
    if (items && items.length) return { items, type: "chip" };
    throw new Error("Sort menu not found");
  }

  function detectSelectedInMenu(items) {
    const aria = items.find(n => n.getAttribute("aria-checked") === "true" || n.getAttribute("aria-selected") === "true");
    if (aria) return (aria.textContent||"").trim();
    const selectedAnchor = (items.map(n => n.closest("a")).find(a => a && a.classList.contains("iron-selected")));
    if (selectedAnchor) return (selectedAnchor.textContent||"").trim();
    return null;
  }

  function matchMenuItem(items, target) {
    const patternsMap = {
      newest:      [/Date added.*newest/i, /วันที่เพิ่ม.*ล่าสุด/i, /最新の追加/, /最近追加/],
      oldest:      [/Date added.*oldest/i, /วันที่เพิ่ม.*เก่าสุด/i, /最も古い|古い順/],
      pub_newest:  [/Published.*newest/i, /วันที่เผยแพร่.*ล่าสุด/i, /公開日.*新しい順|公開日（新しい順）/],
      pub_oldest:  [/Published.*oldest/i, /วันที่เผยแพร่.*เก่าสุด/i, /公開日.*古い順|公開日（古い順）/],
      custom:      [/Custom.*order/i, /กำหนดเอง/i, /カスタム/],
      popular:     [/ยอดนิยม/i, /Popular/i, /人気/]
    };
    const pats = patternsMap[target] || [];
    for (const node of items) {
      const t = (node.textContent||"").trim();
      if (pats.some(rx => rx.test(t))) return node;
    }
    return null;
  }

  async function setSort(target) {
    appendLog(`Opening sort menu…`);
    const open = await openAnySortMenu();
    const items = open.items;
    const current = detectSelectedInMenu(items);
    if (current) { STATE.previousSortLabel = current; appendLog(`Current sort: ${current}`); }
    const node = matchMenuItem(items, target);
    if (!node) { appendLog(`Target sort "${target}" not found in menu; keeping current.`, "warn"); return false; }
    node.click();
    STATE.changedSort = true;
    appendLog(`Changed sort to: ${(node.textContent||"").trim()} (${open.type})`);
    await sleep(1200);
    return true;
  }

  async function restoreSort() {
    if (!STATE.changedSort) return;
    appendLog("Restoring previous sort…");
    const open = await openAnySortMenu().catch(() => null);
    if (!open) { appendLog("Could not reopen sort menu", "warn"); return; }
    const { items } = open;
    let node = null;
    if (STATE.previousSortLabel) {
      node = items.find(n => ((n.textContent||"").trim()) === STATE.previousSortLabel);
    }
    if (!node) node = matchMenuItem(items, "custom");
    if (node) {
      node.click();
      appendLog(`Restored sort to: ${(node.textContent||"").trim()}`);
      await sleep(800);
    } else {
      appendLog("Could not restore previous sort (labels changed?)", "warn");
    }
    STATE.changedSort = false;
    STATE.previousSortLabel = null;
  }

  async function handleScan(strategy="first", opts={}) {
    if (STATE.scanning) return;
    STATE.scanning = true;
    ensurePanel();
    appendLog("Starting scan…");
    try {
      const maxMillis = (opts.scrollMinutes ? opts.scrollMinutes*60*1000 : 10*60*1000);
      await autoloadAllItems({maxMillis});
      const list = qsa("ytd-playlist-video-renderer");
      STATE.items = list.map((el, i) => parseItemFromRenderer(el, i)).filter(Boolean);
      appendLog(`Total items loaded: ${STATE.items.length}`);
      STATE.dupGroups = groupDuplicates(STATE.items, strategy);
      updateStats(STATE.items.length, STATE.dupGroups);
      markGroups(STATE.dupGroups);
      if (STATE.dupGroups.length === 0) appendLog("No duplicates found. 🎉", "ok");
      else appendLog(`Found ${STATE.dupGroups.length} groups; ${STATE.dupGroups.reduce((a,g)=>a+g.remove.length,0)} to remove.`, "warn");
    } catch (e) {
      console.error(e);
      appendLog("Scan failed: " + e.message, "err");
    } finally {
      STATE.scanning = false;
    }
  }

  async function handleRemove() {
    if (STATE.removing) return;
    if (!STATE.dupGroups?.length) { appendLog("Nothing to remove. Run Scan first.", "warn"); return; }
    STATE.removing = true;
    ensurePanel();
    const total = STATE.dupGroups.reduce((a, g) => a + g.remove.length, 0);
    appendLog(`Starting removal of ${total} items…`);
    let ok = 0, fail = 0;
    for (const g of STATE.dupGroups) {
      for (const r of g.remove) {
        try {
          appendLog(`Removing: ${r.title} (${r.videoId})…`);
          await clickMenuAndRemove(r.el);
          ok++;
          await sleep(300);
        } catch (e) {
          console.error(e);
          appendLog("Failed: " + (r.title || r.videoId) + " — " + e.message, "err");
          fail++;
        }
        setStat(`Removing… done ${ok}/${total}, failed ${fail}`);
      }
    }
    appendLog(`Removal complete. OK=${ok} FAIL=${fail}`);
    STATE.removing = false;
  }

  async function handleAuto({strategy="first", tempsort="pub_newest", scrollMinutes=12} = {}) {
    ensurePanel();
    appendLog("AUTO start");
    try {
      if (tempsort && tempsort !== "none") {
        try { await setSort(tempsort); } catch (e) { appendLog("Sorting step failed: " + e.message, "warn"); }
      }
      await handleScan(strategy, { scrollMinutes });
      if (STATE.dupGroups?.length) { await handleRemove(); }
      else { appendLog("No duplicates to remove.", "ok"); }
    } finally {
      try { await restoreSort(); } catch (e) { appendLog("Restore sort failed: " + e.message, "warn"); }
      appendLog("AUTO done.");
    }
  }

  function handleExport() {
    if (!STATE.dupGroups?.length) { appendLog("No duplicates to export. Run Scan first.", "warn"); return; }
    const rows = [["videoId", "keep_idx", "keep_title", "dup_idx", "dup_title"]];
    for (const g of STATE.dupGroups) {
      for (const r of g.remove) {
        rows.push([g.videoId, String(g.keep.idx+1), g.keep.title, String(r.idx+1), r.title]);
      }
    }
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type: "text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "yt-playlist-duplicates.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    appendLog("Exported CSV of duplicates.");
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === "YTDEDUP_SCAN")   { handleScan(msg.strategy || "first", {}); sendResponse({ ok: true }); return; }
    if (msg.type === "YTDEDUP_REMOVE") { handleRemove(); sendResponse({ ok: true }); return; }
    if (msg.type === "YTDEDUP_EXPORT"){ handleExport(); sendResponse({ ok: true }); return; }
    if (msg.type === "YTDEDUP_AUTO")  {
      handleAuto({ strategy: msg.strategy || "first", tempsort: msg.tempsort || "pub_newest", scrollMinutes: msg.scrollMinutes || 12 });
      sendResponse({ ok: true }); return;
    }
  });

  (function addMiniBadge(){
    const el = document.createElement("div");
    el.textContent = "YT Deduper v1.3 ready";
    el.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:999999;background:rgba(0,0,0,.6);color:#fff;padding:6px 8px;border-radius:8px;font:12px/1 system-ui,Segoe UI,Roboto,sans-serif;";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  })();
})();
