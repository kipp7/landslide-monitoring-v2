## Windows 桌面端（WPF + WebView2）

此目录是 `apps/desk` 的 Windows 原生壳程序：使用 WPF + WebView2 加载前端页面。

### 开发模式（推荐）

1. 启动前端：
   - `npm -w apps/desk run dev`
2. 启动桌面端（指向 dev server）：
   - PowerShell:
     - `$env:DESK_DEV_SERVER_URL="http://localhost:5174/"; dotnet run --project apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj`

### 生产构建

1. 构建前端（生成 `apps/desk/dist`）：
   - `npm -w apps/desk run build`
2. 发布桌面端（会把 `apps/desk/dist` 复制到输出目录的 `web/`）：
   - `dotnet publish apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj -c Release -r win-x64`

### 说明

- 桌面端优先加载 `DESK_DEV_SERVER_URL`；未设置时加载随应用输出的 `web/` 静态资源。
- 需要系统已安装 WebView2 Runtime（Win11 通常默认具备）。

