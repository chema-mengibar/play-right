




## 2. Start Server

Open PowerShell:

```powershell
cd C:\Users\mengi\pros\_yo\play-right\server
& "C:\Users\mengi\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe" -S 127.0.0.1:8000 dev-router.php
```

In another PowerShell window, start the app:

```powershell
cd C:\Users\mengi\pros\_yo\play-right\app
npm run dev
```

The editor saves through `/api/games`, proxied by Vite to the PHP server.
