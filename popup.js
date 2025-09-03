/* global chrome */
async function withActiveTab(fn) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) { alert("No active tab."); return; }
  const tab = tabs[0];
  if (!/^https:\/\/www\.youtube\.com\/playlist\?list=/.test(tab.url || "")) {
    alert("Please open a YouTube playlist page first.");
    return;
  }
  await fn(tab);
}

async function send(tab, msg) {
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    await new Promise(r => setTimeout(r, 450));
    return await chrome.tabs.sendMessage(tab.id, msg);
  }
}

document.getElementById("scan").addEventListener("click", () => withActiveTab(async (tab) => {
  const strategy = document.getElementById("strategy").value;
  await send(tab, { type: "YTDEDUP_SCAN", strategy });
}));

document.getElementById("remove").addEventListener("click", () => withActiveTab(async (tab) => {
  const strategy = document.getElementById("strategy").value;
  if (!confirm("Remove duplicate videos from this playlist? (They'll be removed via the YouTube UI)")) return;
  await send(tab, { type: "YTDEDUP_REMOVE", strategy });
}));

document.getElementById("export").addEventListener("click", () => withActiveTab(async (tab) => {
  await send(tab, { type: "YTDEDUP_EXPORT" });
}));

document.getElementById("auto").addEventListener("click", () => withActiveTab(async (tab) => {
  const strategy = document.getElementById("strategy").value;
  const tempsort = document.getElementById("tempsort").value;
  const min = Math.max(1, Math.min(60, parseInt(document.getElementById("scrollMinutes").value || "12", 10)));
  if (!confirm("Run Auto: Sort → Load → Scan → Remove → Restore ?")) return;
  await send(tab, { type: "YTDEDUP_AUTO", strategy, tempsort, scrollMinutes: min });
}));
