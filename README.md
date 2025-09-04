# YouTube Playlist Deduper

A lightweight browser extension that helps you **find and remove duplicate videos** from YouTube playlists.  
Works on **Firefox** and **Chromium-based browsers**.

---

## 🚀 Features
- Detect duplicate videos in playlists by video ID  
- Choose strategy: **Keep First** or **Keep Last**  
- **Auto mode**: automatically loads the full playlist, detects, and removes duplicates  
- **Manual mode**: scan & mark duplicates, then remove them with one click  
- **Export duplicates to CSV** for offline review  
- Handles **very long playlists** efficiently  

---

## 📥 Installation

### Firefox  
👉 [Get it on Firefox Add-ons (AMO)](https://addons.mozilla.org/en-US/firefox/addon/youtube-playlist-deduper/)
### Microsoft Edge Addons  
👉 [Get it on Microsoft Edge Addons](https://microsoftedge.microsoft.com/addons/detail/youtube-playlist-deduper/igiibekbdipfoekaknmlalhdngdebmmm)

### Chromium (Chrome, etc.)
1. Download the latest `.zip` from [Releases](https://github.com/PoomGamerE/YouTube-Playlist-Deduper/releases).  
2. Open `chrome://extensions/`.  
3. Enable **Developer mode**.  
4. Click **Load unpacked** and select the unzipped folder.  

---

## 🔒 Permissions & Privacy
- **Permissions used**:
  - `tabs` / `activeTab` → interact with the current playlist page  
  - `storage` → save extension settings  
  - `host_permissions` for `https://www.youtube.com/*` → run scripts only on YouTube playlists  

- **Privacy**:
  - No account data collected  
  - No telemetry, tracking, or external requests  
  - All operations run locally inside your browser  

---

## 🛠 Development
Clone and load as unpacked extension:

```bash
git clone https://github.com/PoomGamerE/YouTube-Playlist-Deduper.git
cd YouTube-Playlist-Deduper
````

Then load it via `about:debugging#/runtime/this-firefox` (Firefox) or `chrome://extensions/` (Chromium).

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

## 👤 Author

Developed by **[PoomGamerE](https://github.com/PoomGamerE)**

---

## 🙌 Contributing

Pull requests are welcome.
Please open an issue first to discuss new features or fixes.
