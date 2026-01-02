using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using Drawing = System.Drawing;
using Forms = System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace LandslideDesk.Win;

public partial class MainWindow : Window
{
    private const string VirtualHostName = "appassets.local";
    private const string DevServerEnv = "DESK_DEV_SERVER_URL";
    private const string WebView2ArgsEnv = "DESK_WEBVIEW2_ARGS";
    private const string WebView2DisableGpuEnv = "DESK_WEBVIEW2_DISABLE_GPU";
    private static readonly string AppDataRoot = Path.Combine(
        System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData),
        "LandslideDesk.Win"
    );
    private static readonly string WindowStateFile = Path.Combine(AppDataRoot, "window-state.json");

    private const int WmHotkey = 0x0312;
    private const int HotkeyToggleFullscreen = 1;
    private const int HotkeyExitFullscreen = 2;
    private const int VkF11 = 0x7A;
    private const int VkEscape = 0x1B;

    private const int DwmwaUseImmersiveDarkMode19 = 19;
    private const int DwmwaUseImmersiveDarkMode20 = 20;
    private const int DwmwaWindowCornerPreference = 33;
    private const int DwmwaSystemBackdropType = 38;

    private string? _devServerUrl;
    private string? _localWebRoot;
    private bool _hasLocalWebAssets;
    private string? _lastNavigationUrl;
    private string? _webViewUserDataFolder;
    private string _webViewAdditionalArgs = string.Empty;

    private bool _isFullscreen;
    private bool _isHotkeyScopeActive;
    private bool _isHotkeyF11Registered;
    private bool _isHotkeyEscRegistered;
    private WindowState _restoreWindowState;
    private WindowStyle _restoreWindowStyle;
    private ResizeMode _restoreResizeMode;
    private bool _restoreTopmost;
    private Rect _restoreBounds;
    private HwndSource? _hwndSource;
    private nint _windowHandle;

    private Forms.NotifyIcon? _trayIcon;
    private Forms.ContextMenuStrip? _trayMenu;
    private bool _trayHintShown;
    private string? _pendingTrayNotificationRoute;
    private bool _minimizeToTray = true;
    private bool _closeToTray = true;

    public MainWindow()
    {
        InitializeComponent();
        RestoreWindowPlacement();
        SourceInitialized += OnSourceInitialized;
        Loaded += OnLoaded;
        Activated += OnActivated;
        Deactivated += OnDeactivated;
        StateChanged += OnStateChanged;
        Closing += OnClosing;
        Closed += OnClosed;

        InitializeTrayIcon();
    }

    private void OnSourceInitialized(object? sender, System.EventArgs e)
    {
        SourceInitialized -= OnSourceInitialized;
        _windowHandle = new WindowInteropHelper(this).Handle;
        if (_windowHandle == nint.Zero)
        {
            return;
        }

        _hwndSource = HwndSource.FromHwnd(_windowHandle);
        _hwndSource?.AddHook(WndProc);
        ApplyWin11WindowStyles();
    }

    private void OnActivated(object? sender, System.EventArgs e)
    {
        if (_windowHandle == nint.Zero || _isHotkeyScopeActive)
        {
            return;
        }

        _isHotkeyScopeActive = true;
        EnsureFullscreenHotkeys();
    }

    private void OnDeactivated(object? sender, System.EventArgs e)
    {
        if (!_isHotkeyScopeActive)
        {
            return;
        }

        _isHotkeyScopeActive = false;
        RemoveFullscreenHotkeys();
    }

    private void OnStateChanged(object? sender, EventArgs e)
    {
        if (WindowState == WindowState.Minimized && _trayIcon is not null && _minimizeToTray)
        {
            HideToTray(showHint: true);
        }
    }

    private void InitializeTrayIcon()
    {
        if (_trayIcon is not null)
        {
            return;
        }

        try
        {
            _trayMenu = new Forms.ContextMenuStrip();

            var version = typeof(MainWindow).Assembly.GetName().Version?.ToString() ?? "unknown";
            var versionItem = new Forms.ToolStripMenuItem($"版本 {version}") { Enabled = false };

            var openItem = new Forms.ToolStripMenuItem("打开主窗口");
            openItem.Click += (_, _) => Dispatcher.Invoke(ShowFromTray);

            var settingsItem = new Forms.ToolStripMenuItem("系统设置");
            settingsItem.Click += (_, _) => Dispatcher.Invoke(() =>
            {
                ShowFromTray();
                NavigateToAppRoute("/app/settings");
            });

            var logsItem = new Forms.ToolStripMenuItem("打开日志目录");
            logsItem.Click += (_, _) => Dispatcher.Invoke(OpenLogsDirectory);

            var fullscreenItem = new Forms.ToolStripMenuItem("切换全屏 (F11)");
            fullscreenItem.Click += (_, _) => Dispatcher.Invoke(ToggleFullscreen);

            var exitItem = new Forms.ToolStripMenuItem("退出");
            exitItem.Click += (_, _) => Dispatcher.Invoke(() => App.RequestAppShutdown());

            _trayMenu.Items.Add(versionItem);
            _trayMenu.Items.Add(new Forms.ToolStripSeparator());
            _trayMenu.Items.Add(openItem);
            _trayMenu.Items.Add(settingsItem);
            _trayMenu.Items.Add(logsItem);
            _trayMenu.Items.Add(fullscreenItem);
            _trayMenu.Items.Add(new Forms.ToolStripSeparator());
            _trayMenu.Items.Add(exitItem);

            _trayIcon = new Forms.NotifyIcon
            {
                Text = "滑坡监测预警平台",
                Visible = true,
                ContextMenuStrip = _trayMenu
            };

            var exePath = Process.GetCurrentProcess().MainModule?.FileName;
            if (!string.IsNullOrWhiteSpace(exePath) && File.Exists(exePath))
            {
                try
                {
                    _trayIcon.Icon = Drawing.Icon.ExtractAssociatedIcon(exePath);
                }
                catch
                {
                }
            }

            _trayIcon.Icon ??= Drawing.SystemIcons.Application;
            _trayIcon.DoubleClick += (_, _) => Dispatcher.Invoke(ShowFromTray);
            _trayIcon.BalloonTipClicked += (_, _) => Dispatcher.Invoke(() =>
            {
                var route = _pendingTrayNotificationRoute;
                _pendingTrayNotificationRoute = null;
                ShowFromTray();

                if (!string.IsNullOrWhiteSpace(route))
                {
                    NavigateToAppRoute(route);
                }
            });
        }
        catch
        {
            DisposeTrayIcon();
        }
    }

    private void DisposeTrayIcon()
    {
        try
        {
            if (_trayIcon is not null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }

            if (_trayMenu is not null)
            {
                _trayMenu.Dispose();
                _trayMenu = null;
            }
        }
        catch
        {
        }
    }

    private void ShowFromTray()
    {
        try
        {
            ShowInTaskbar = true;
            Show();
            if (WindowState == WindowState.Minimized)
            {
                WindowState = WindowState.Normal;
            }

            Activate();
        }
        catch
        {
        }
    }

    private void HideToTray(bool showHint)
    {
        try
        {
            if (_trayIcon is null)
            {
                WindowState = WindowState.Minimized;
                return;
            }

            ShowInTaskbar = false;
            Hide();

            if (showHint && _trayIcon is not null && !_trayHintShown)
            {
                _trayHintShown = true;
                _trayIcon.BalloonTipTitle = "已最小化到托盘";
                _trayIcon.BalloonTipText = "应用仍在后台运行，可从系统托盘打开。";
                _trayIcon.ShowBalloonTip(2500);
            }
        }
        catch
        {
        }
    }

    private void OpenLogsDirectory()
    {
        try
        {
            Directory.CreateDirectory(AppDataRoot);
            TryOpenExternal(AppDataRoot);
        }
        catch
        {
        }
    }

    private void ShowTrayNotification(
        string title,
        string message,
        Forms.ToolTipIcon icon = Forms.ToolTipIcon.Info,
        int timeoutMs = 2500,
        string? route = null
    )
    {
        try
        {
            if (_trayIcon is null)
            {
                return;
            }

            _pendingTrayNotificationRoute = route;
            _trayIcon.BalloonTipTitle = title;
            _trayIcon.BalloonTipText = message;
            _trayIcon.BalloonTipIcon = icon;
            _trayIcon.ShowBalloonTip(timeoutMs);
        }
        catch
        {
        }
    }

    private void SetTrayEnabled(bool enabled)
    {
        if (enabled)
        {
            InitializeTrayIcon();
            System.Windows.Application.Current.ShutdownMode = ShutdownMode.OnExplicitShutdown;
            return;
        }

        DisposeTrayIcon();
        System.Windows.Application.Current.ShutdownMode = ShutdownMode.OnMainWindowClose;
        Dispatcher.Invoke(ShowFromTray);
    }

    private void OnClosed(object? sender, System.EventArgs e)
    {
        Closed -= OnClosed;
        Activated -= OnActivated;
        Deactivated -= OnDeactivated;
        StateChanged -= OnStateChanged;
        Closing -= OnClosing;
        RemoveFullscreenHotkeys();
        DisposeTrayIcon();

        if (_hwndSource is not null)
        {
            _hwndSource.RemoveHook(WndProc);
            _hwndSource = null;
        }

        if (_windowHandle != nint.Zero)
        {
            if (_isHotkeyF11Registered)
            {
                UnregisterHotKey(_windowHandle, HotkeyToggleFullscreen);
            }

            if (_isHotkeyEscRegistered)
            {
                UnregisterHotKey(_windowHandle, HotkeyExitFullscreen);
            }
        }
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;
        try
        {
            await InitializeWebViewAsync();
        }
        catch (System.Exception ex)
        {
            System.Windows.MessageBox.Show(this, ex.Message, "启动失败", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task InitializeWebViewAsync()
    {
        _devServerUrl = System.Environment.GetEnvironmentVariable(DevServerEnv)?.Trim();
        if (string.IsNullOrWhiteSpace(_devServerUrl))
        {
            _devServerUrl = null;
        }

        _localWebRoot = Path.Combine(System.AppContext.BaseDirectory, "web");
        _hasLocalWebAssets = File.Exists(Path.Combine(_localWebRoot, "index.html"));

        var userDataFolder = Path.Combine(
            System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData),
            "LandslideDesk.Win",
            "WebView2"
        );
        _webViewUserDataFolder = userDataFolder;

        var additionalArgs = System.Environment.GetEnvironmentVariable(WebView2ArgsEnv)?.Trim() ?? string.Empty;
        if (IsTruthy(System.Environment.GetEnvironmentVariable(WebView2DisableGpuEnv)))
        {
            additionalArgs = $"{additionalArgs} --disable-gpu --disable-gpu-compositing".Trim();
        }
        _webViewAdditionalArgs = additionalArgs;

        CoreWebView2EnvironmentOptions? options = null;
        if (!string.IsNullOrWhiteSpace(additionalArgs))
        {
            options = new CoreWebView2EnvironmentOptions { AdditionalBrowserArguments = additionalArgs };
        }

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder, options: options);
        await DeskWebView.EnsureCoreWebView2Async(env);

        var core = DeskWebView.CoreWebView2;
        await InjectHostInfoAsync(core, userDataFolder, additionalArgs);
        ConfigureWebView(core);
        HookWebViewEvents(core);

        if (_devServerUrl is not null)
        {
            NavigateToUrl(core, _devServerUrl);
            return;
        }

        if (_hasLocalWebAssets && _localWebRoot is not null)
        {
            core.SetVirtualHostNameToFolderMapping(
                VirtualHostName,
                _localWebRoot,
                CoreWebView2HostResourceAccessKind.Allow
            );
            NavigateToUrl(core, $"https://{VirtualHostName}/index.html");
            return;
        }

        var html = $$"""
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>桌面端启动提示</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, "PingFang SC", "Microsoft YaHei",
          sans-serif;
        background: #0b1220;
        color: rgba(226, 232, 240, 0.92);
      }

      .wrap {
        max-width: 860px;
        margin: 48px auto;
        padding: 0 20px;
      }

      .card {
        border: 1px solid rgba(34, 211, 238, 0.16);
        background: rgba(15, 23, 42, 0.55);
        border-radius: 14px;
        padding: 16px;
        box-shadow: 0 0 28px rgba(0, 255, 255, 0.08);
      }

      h1 {
        margin: 0 0 10px 0;
        font-size: 18px;
      }

      pre {
        margin: 12px 0 0 0;
        padding: 12px;
        border-radius: 12px;
        background: rgba(2, 6, 23, 0.55);
        border: 1px solid rgba(148, 163, 184, 0.12);
        overflow: auto;
        font-size: 12px;
        line-height: 1.6;
      }

      .muted {
        color: rgba(148, 163, 184, 0.92);
        line-height: 1.6;
        font-size: 13px;
      }

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>未找到前端资源</h1>
        <div class="muted">
          当前桌面端会优先加载：<br />
          1) 环境变量 <code>{{DevServerEnv}}</code> 指定的开发服务器
          <br />
          2) 打包后的前端文件（随桌面端输出复制到 <code>web/</code>）
          <br /><br />
          请先启动或构建 <code>apps/desk</code> 前端后再运行桌面端。
        </div>
        <pre>
开发模式：
npm -w apps/desk run dev
PowerShell（仓库根目录）：
$env:{{DevServerEnv}}="http://localhost:5174/"; dotnet run --project .\apps\desk-win\LandslideDesk.Win\LandslideDesk.Win.csproj
PowerShell（当前目录为 apps/desk-win）：
$env:{{DevServerEnv}}="http://localhost:5174/"; dotnet run --project .\LandslideDesk.Win\LandslideDesk.Win.csproj

生产构建：
npm -w apps/desk run build
dotnet publish .\apps\desk-win\LandslideDesk.Win\LandslideDesk.Win.csproj -c Release -r win-x64
dotnet publish .\LandslideDesk.Win\LandslideDesk.Win.csproj -c Release -r win-x64
        </pre>
      </div>
    </div>
  </body>
</html>
""";

        HideOverlays();
        DeskWebView.NavigateToString(html);
    }

    private void ConfigureWebView(CoreWebView2 core)
    {
        core.Settings.AreDevToolsEnabled = Debugger.IsAttached;
        core.Settings.AreDefaultContextMenusEnabled = Debugger.IsAttached;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = Debugger.IsAttached;
    }

    private void HookWebViewEvents(CoreWebView2 core)
    {
        core.NavigationStarting += (_, e) =>
        {
            _lastNavigationUrl = e.Uri;
            Dispatcher.Invoke(() => ShowLoading("正在加载页面..."));
        };

        core.NavigationCompleted += (_, e) =>
        {
            Dispatcher.Invoke(() =>
            {
                if (e.IsSuccess)
                {
                    HideOverlays();
                    return;
                }

                ShowError(
                    "无法加载页面",
                    BuildNavigationErrorText(_lastNavigationUrl, e.WebErrorStatus),
                    canSwitchToLocal: _devServerUrl is not null && _hasLocalWebAssets
                );
            });
        };

        core.ProcessFailed += (_, e) =>
        {
            Dispatcher.Invoke(() =>
            {
                ShowError(
                    "浏览器进程异常",
                    $"WebView2 进程异常：{e.ProcessFailedKind}\n可以尝试重新加载。",
                    canSwitchToLocal: _devServerUrl is not null && _hasLocalWebAssets
                );
            });
        };

        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            if (string.IsNullOrWhiteSpace(e.Uri))
            {
                return;
            }

            TryOpenExternal(e.Uri);
        };

        core.WebMessageReceived += (_, e) =>
        {
            var msg = e.TryGetWebMessageAsString();
            if (string.IsNullOrWhiteSpace(msg))
            {
                return;
            }

            Dispatcher.Invoke(() => HandleWebMessage(core, msg));
        };

        core.WindowCloseRequested += (_, _) =>
        {
            Dispatcher.Invoke(Close);
        };
    }

    private static bool IsTruthy(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return value.Trim().ToLowerInvariant() is "1" or "true" or "yes" or "y" or "on";
    }

    private static Task InjectHostInfoAsync(CoreWebView2 core, string userDataFolder, string additionalArgs)
    {
        var info = new
        {
            app = new
            {
                name = "LandslideDesk.Win",
                version = typeof(MainWindow).Assembly.GetName().Version?.ToString() ?? "unknown"
            },
            webview2 = new
            {
                browserVersion = core.Environment.BrowserVersionString,
                userDataFolder,
                additionalArgs
            },
            os = new
            {
                version = System.Environment.OSVersion.VersionString
            }
        };

        var json = JsonSerializer.Serialize(info);
        return core.AddScriptToExecuteOnDocumentCreatedAsync($"window.__DESK_HOST_INFO = {json};");
    }

    private static void TryOpenExternal(string uri)
    {
        try
        {
            Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
        }
        catch
        {
        }
    }

    private static string BuildNavigationErrorText(string? uri, CoreWebView2WebErrorStatus status)
    {
        var target = string.IsNullOrWhiteSpace(uri) ? "(unknown)" : uri;
        return $"目标：{target}\n错误：{status}\n\n如果你在开发模式，请先确认前端服务是否启动。";
    }

    private void NavigateToAppRoute(string path)
    {
        var core = DeskWebView.CoreWebView2;
        if (core is null)
        {
            return;
        }

        var route = path.StartsWith("/") ? path : $"/{path}";
        var hash = $"#{route}";
        var escaped = hash.Replace("\\", "\\\\").Replace("'", "\\'");
        _ = core.ExecuteScriptAsync($"location.hash='{escaped}';");
    }

    private void HandleWebMessage(CoreWebView2 core, string message)
    {
        if (message.StartsWith("app:", System.StringComparison.OrdinalIgnoreCase))
        {
            HandleAppAction(core, message["app:".Length..], payload: null, requestId: null);
            return;
        }

        if (!message.TrimStart().StartsWith("{", System.StringComparison.Ordinal))
        {
            return;
        }

        try
        {
            using var doc = JsonDocument.Parse(message);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeEl))
            {
                return;
            }

            var type = typeEl.GetString();
            if (!string.Equals(type, "app", System.StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            if (!root.TryGetProperty("action", out var actionEl))
            {
                return;
            }

            var action = actionEl.GetString();
            if (string.IsNullOrWhiteSpace(action))
            {
                return;
            }

            string? requestId = null;
            if (root.TryGetProperty("requestId", out var requestIdEl) && requestIdEl.ValueKind == JsonValueKind.String)
            {
                requestId = requestIdEl.GetString();
            }

            HandleAppAction(core, action!, root, requestId);
        }
        catch
        {
        }
    }

    private void HandleAppAction(CoreWebView2 core, string action, JsonElement? payload, string? requestId)
    {
        try
        {
        switch (action.Trim().ToLowerInvariant())
        {
            case "quit":
                App.RequestAppShutdown();
                break;
            case "show":
                ShowFromTray();
                break;
            case "hide":
                HideToTray(showHint: false);
                break;
            case "focus":
                ShowFromTray();
                break;
            case "toggletray":
            {
                var data = ExtractPayload(payload);
                if (data is not null && data.Value.TryGetProperty("enabled", out var enabledEl) && enabledEl.ValueKind == JsonValueKind.True)
                {
                    SetTrayEnabled(true);
                    break;
                }

                if (data is not null && data.Value.TryGetProperty("enabled", out enabledEl) && enabledEl.ValueKind == JsonValueKind.False)
                {
                    SetTrayEnabled(false);
                    break;
                }

                SetTrayEnabled(_trayIcon is null);
                break;
            }
            case "settraybehavior":
            {
                var data = ExtractPayload(payload);
                var minimizeToTray = TryGetBool(data, "minimizeToTray");
                if (minimizeToTray is not null)
                {
                    _minimizeToTray = minimizeToTray.Value;
                }

                var closeToTray = TryGetBool(data, "closeToTray");
                if (closeToTray is not null)
                {
                    _closeToTray = closeToTray.Value;
                }
                break;
            }
            case "togglefullscreen":
                ToggleFullscreen();
                break;
            case "enterfullscreen":
                EnterFullscreen();
                break;
            case "exitfullscreen":
                ExitFullscreen();
                break;
            case "reload":
                ShowLoading("正在重新加载...");
                core.Reload();
                break;
            case "minimize":
                WindowState = WindowState.Minimized;
                break;
            case "maximize":
                if (!_isFullscreen)
                {
                    WindowState = WindowState.Maximized;
                }
                break;
            case "restore":
                if (!_isFullscreen)
                {
                    WindowState = WindowState.Normal;
                }
                break;
            case "openexternal":
            {
                var data = ExtractPayload(payload);
                if (data is not null && data.Value.TryGetProperty("url", out var urlEl))
                {
                    var url = urlEl.GetString();
                    if (!string.IsNullOrWhiteSpace(url))
                    {
                        TryOpenExternal(url);
                    }
                }
                break;
            }
            case "openlogsdir":
                OpenLogsDirectory();
                break;
            case "getappinfo":
            {
                if (string.IsNullOrWhiteSpace(requestId))
                {
                    break;
                }

                PostAppResult(core, requestId, ok: true, payload: BuildAppInfo(core));
                return;
            }
            case "importfile":
            {
                if (string.IsNullOrWhiteSpace(requestId))
                {
                    break;
                }

                var data = ExtractPayload(payload);
                var dialog = new Microsoft.Win32.OpenFileDialog
                {
                    Title = TryGetString(data, "title") ?? "导入文件",
                    Multiselect = TryGetBool(data, "multiple") ?? false,
                    CheckFileExists = true,
                    Filter = BuildFileDialogFilter(data)
                };

                var ok = dialog.ShowDialog(this) == true;
                var result = new
                {
                    canceled = !ok,
                    files = ok ? dialog.FileNames : Array.Empty<string>()
                };
                PostAppResult(core, requestId, ok: true, payload: result);
                return;
            }
            case "exportfile":
            {
                if (string.IsNullOrWhiteSpace(requestId))
                {
                    break;
                }

                var data = ExtractPayload(payload);
                var dialog = new Microsoft.Win32.SaveFileDialog
                {
                    Title = TryGetString(data, "title") ?? "导出文件",
                    FileName = TryGetString(data, "suggestedFileName") ?? string.Empty,
                    DefaultExt = TryGetString(data, "defaultExt") ?? string.Empty,
                    Filter = BuildFileDialogFilter(data)
                };

                var ok = dialog.ShowDialog(this) == true;
                var result = new
                {
                    canceled = !ok,
                    filePath = ok ? dialog.FileName : null
                };
                PostAppResult(core, requestId, ok: true, payload: result);
                return;
            }
            case "clearwebviewdata":
            {
                if (string.IsNullOrWhiteSpace(requestId))
                {
                    break;
                }

                var confirm = System.Windows.MessageBox.Show(
                    this,
                    "将清理 WebView2 缓存与站点数据（可能需要重新登录）。\n是否继续？",
                    "清理缓存",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning
                );
                if (confirm != System.Windows.MessageBoxResult.Yes)
                {
                    PostAppResult(core, requestId, ok: true, payload: new { canceled = true });
                    return;
                }

                _ = ClearWebViewDataAsync(core, requestId);
                return;
            }
            case "exportdiagnosticsbundle":
            {
                if (string.IsNullOrWhiteSpace(requestId))
                {
                    break;
                }

                var data = ExtractPayload(payload);
                var filePath = TryGetString(data, "filePath") ?? TryGetString(data, "path");
                if (string.IsNullOrWhiteSpace(filePath))
                {
                    PostAppResult(core, requestId, ok: false, payload: new { message = "缺少 filePath" });
                    return;
                }

                var frontEndJson = TryGetString(data, "frontEndJson") ?? TryGetString(data, "frontendJson");
                _ = ExportDiagnosticsBundleAsync(core, requestId, filePath!, frontEndJson);
                return;
            }
            case "writetextfile":
            {
                if (string.IsNullOrWhiteSpace(requestId))
                {
                    break;
                }

                var data = ExtractPayload(payload);
                var path = TryGetString(data, "filePath") ?? TryGetString(data, "path");
                var content = TryGetString(data, "content");
                if (string.IsNullOrWhiteSpace(path) || content is null)
                {
                    PostAppResult(core, requestId, ok: false, payload: new { message = "缺少 filePath/content" });
                    return;
                }

                File.WriteAllText(path, content);
                PostAppResult(core, requestId, ok: true, payload: new { ok = true });
                return;
            }
            case "notify":
            {
                var data = ExtractPayload(payload);
                if (data is null)
                {
                    break;
                }

                var title = "通知";
                if (data.Value.TryGetProperty("title", out var titleEl))
                {
                    var value = titleEl.GetString();
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        title = value;
                    }
                }

                var text = string.Empty;
                if (data.Value.TryGetProperty("message", out var msgEl))
                {
                    text = msgEl.GetString() ?? string.Empty;
                }
                else if (data.Value.TryGetProperty("text", out var textEl))
                {
                    text = textEl.GetString() ?? string.Empty;
                }

                if (string.IsNullOrWhiteSpace(text))
                {
                    break;
                }

                string? route = null;
                if (data.Value.TryGetProperty("route", out var routeEl))
                {
                    route = routeEl.GetString();
                }

                var icon = Forms.ToolTipIcon.Info;
                if (data.Value.TryGetProperty("level", out var levelEl))
                {
                    var level = levelEl.GetString()?.Trim().ToLowerInvariant();
                    icon = level switch
                    {
                        "error" => Forms.ToolTipIcon.Error,
                        "warning" => Forms.ToolTipIcon.Warning,
                        _ => Forms.ToolTipIcon.Info
                    };
                }

                var timeoutMs = 2500;
                if (data.Value.TryGetProperty("timeoutMs", out var timeoutEl) && timeoutEl.TryGetInt32(out var timeoutValue))
                {
                    timeoutMs = Math.Clamp(timeoutValue, 800, 10000);
                }

                ShowTrayNotification(title, text.Trim(), icon, timeoutMs, route);
                break;
            }
        }

        if (!string.IsNullOrWhiteSpace(requestId))
        {
            PostAppResult(core, requestId, ok: true, payload: null);
        }
        }
        catch (Exception ex)
        {
            if (!string.IsNullOrWhiteSpace(requestId))
            {
                PostAppResult(core, requestId, ok: false, payload: new { message = ex.Message });
            }
        }
    }

    private object BuildAppInfo(CoreWebView2 core)
    {
        return new
        {
            app = new
            {
                name = "LandslideDesk.Win",
                version = typeof(MainWindow).Assembly.GetName().Version?.ToString() ?? "unknown"
            },
            webview2 = new
            {
                browserVersion = core.Environment.BrowserVersionString,
                userDataFolder = _webViewUserDataFolder,
                additionalArgs = _webViewAdditionalArgs
            },
            os = new
            {
                version = System.Environment.OSVersion.VersionString
            }
        };
    }

    private async Task ClearWebViewDataAsync(CoreWebView2 core, string requestId)
    {
        try
        {
            await core.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.AllProfile);
            PostAppResult(core, requestId, ok: true, payload: new { ok = true });
            core.Reload();
        }
        catch (Exception ex)
        {
            PostAppResult(core, requestId, ok: false, payload: new { message = ex.Message });
        }
    }

    private async Task ExportDiagnosticsBundleAsync(CoreWebView2 core, string requestId, string zipPath, string? frontEndJson)
    {
        var tmpDir = Path.Combine(AppDataRoot, $"diag-{DateTime.Now:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(tmpDir);

            var hostInfoPath = Path.Combine(tmpDir, "host-info.json");
            await File.WriteAllTextAsync(hostInfoPath, JsonSerializer.Serialize(BuildAppInfo(core), new JsonSerializerOptions { WriteIndented = true }));

            if (!string.IsNullOrWhiteSpace(frontEndJson))
            {
                await File.WriteAllTextAsync(Path.Combine(tmpDir, "frontend-diag.json"), frontEndJson!);
            }

            var windowStatePath = WindowStateFile;
            if (File.Exists(windowStatePath))
            {
                File.Copy(windowStatePath, Path.Combine(tmpDir, "window-state.json"), overwrite: true);
            }

            var crashLogs = Directory.Exists(AppDataRoot)
                ? Directory.GetFiles(AppDataRoot, "crash-*.log", SearchOption.TopDirectoryOnly)
                : Array.Empty<string>();
            if (crashLogs.Length > 0)
            {
                var logsDir = Path.Combine(tmpDir, "logs");
                Directory.CreateDirectory(logsDir);
                foreach (var file in crashLogs)
                {
                    var dest = Path.Combine(logsDir, Path.GetFileName(file));
                    File.Copy(file, dest, overwrite: true);
                }
            }

            if (File.Exists(zipPath))
            {
                File.Delete(zipPath);
            }

            ZipFile.CreateFromDirectory(tmpDir, zipPath, CompressionLevel.Optimal, includeBaseDirectory: false);
            PostAppResult(core, requestId, ok: true, payload: new { ok = true, filePath = zipPath });
        }
        catch (Exception ex)
        {
            PostAppResult(core, requestId, ok: false, payload: new { message = ex.Message });
        }
        finally
        {
            try
            {
                if (Directory.Exists(tmpDir))
                {
                    Directory.Delete(tmpDir, recursive: true);
                }
            }
            catch
            {
            }
        }
    }

    private static string? TryGetString(JsonElement? root, string propertyName)
    {
        if (root is null)
        {
            return null;
        }

        if (!root.Value.TryGetProperty(propertyName, out var el) || el.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var value = el.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static bool? TryGetBool(JsonElement? root, string propertyName)
    {
        if (root is null)
        {
            return null;
        }

        if (!root.Value.TryGetProperty(propertyName, out var el))
        {
            return null;
        }

        return el.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null
        };
    }

    private static string BuildFileDialogFilter(JsonElement? data)
    {
        var overrideFilter = TryGetString(data, "filter");
        if (!string.IsNullOrWhiteSpace(overrideFilter))
        {
            return overrideFilter!;
        }

        return "CSV (*.csv)|*.csv|Excel (*.xlsx)|*.xlsx|JSON (*.json)|*.json|图片 (*.png)|*.png|全部文件 (*.*)|*.*";
    }

    private static void PostAppResult(CoreWebView2 core, string requestId, bool ok, object? payload)
    {
        try
        {
            object body = ok
                ? new { type = "appResult", requestId, ok = true, payload }
                : new { type = "appResult", requestId, ok = false, error = payload };

            core.PostWebMessageAsString(JsonSerializer.Serialize(body));
        }
        catch
        {
        }
    }

    private static JsonElement? ExtractPayload(JsonElement? root)
    {
        if (root is null)
        {
            return null;
        }

        if (root.Value.TryGetProperty("payload", out var payloadEl) && payloadEl.ValueKind == JsonValueKind.Object)
        {
            return payloadEl;
        }

        return root;
    }

    private void NavigateToUrl(CoreWebView2 core, string url)
    {
        _lastNavigationUrl = url;
        ShowLoading("正在加载页面...");
        core.Navigate(url);
    }

    private void ShowLoading(string subtitle)
    {
        LoadingSubtitle.Text = subtitle;
        LoadingOverlay.Visibility = Visibility.Visible;
        ErrorOverlay.Visibility = Visibility.Collapsed;
        SwitchToLocalButton.Visibility = Visibility.Collapsed;
    }

    private void HideOverlays()
    {
        LoadingOverlay.Visibility = Visibility.Collapsed;
        ErrorOverlay.Visibility = Visibility.Collapsed;
        SwitchToLocalButton.Visibility = Visibility.Collapsed;
    }

    private void ShowError(string title, string detail, bool canSwitchToLocal)
    {
        ErrorTitle.Text = title;
        ErrorDetail.Text = detail;
        ErrorOverlay.Visibility = Visibility.Visible;
        LoadingOverlay.Visibility = Visibility.Collapsed;
        SwitchToLocalButton.Visibility = canSwitchToLocal ? Visibility.Visible : Visibility.Collapsed;
    }

    private void OnRetryClick(object sender, RoutedEventArgs e)
    {
        if (DeskWebView.CoreWebView2 is null)
        {
            return;
        }

        ShowLoading("正在重新加载...");

        if (!string.IsNullOrWhiteSpace(_lastNavigationUrl))
        {
            DeskWebView.CoreWebView2.Navigate(_lastNavigationUrl);
            return;
        }

        DeskWebView.Reload();
    }

    private void OnSwitchToLocalClick(object sender, RoutedEventArgs e)
    {
        if (DeskWebView.CoreWebView2 is null || !_hasLocalWebAssets || _localWebRoot is null)
        {
            return;
        }

        ShowLoading("正在切换到本地资源...");
        DeskWebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            VirtualHostName,
            _localWebRoot,
            CoreWebView2HostResourceAccessKind.Allow
        );
        NavigateToUrl(DeskWebView.CoreWebView2, $"https://{VirtualHostName}/index.html");
    }

    private void OnExitClick(object sender, RoutedEventArgs e)
    {
        App.RequestAppShutdown();
    }

    private void OnClosing(object? sender, CancelEventArgs e)
    {
        SaveWindowPlacement();

        if (_trayIcon is null)
        {
            return;
        }

        if (System.Windows.Application.Current is App app && app.IsShuttingDown)
        {
            return;
        }

        if (_closeToTray)
        {
            e.Cancel = true;
            HideToTray(showHint: true);
            return;
        }

        App.RequestAppShutdown();
    }

    private sealed class WindowSnapshot
    {
        public double Left { get; set; }
        public double Top { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
        public bool IsMaximized { get; set; }
    }

    private void RestoreWindowPlacement()
    {
        var snapshot = LoadWindowPlacement();
        if (snapshot is null)
        {
            return;
        }

        if (!IsFinite(snapshot.Left) || !IsFinite(snapshot.Top) || !IsFinite(snapshot.Width) || !IsFinite(snapshot.Height))
        {
            return;
        }

        if (snapshot.Width < 300 || snapshot.Height < 300)
        {
            return;
        }

        var virtualLeft = SystemParameters.VirtualScreenLeft;
        var virtualTop = SystemParameters.VirtualScreenTop;
        var virtualRight = virtualLeft + SystemParameters.VirtualScreenWidth;
        var virtualBottom = virtualTop + SystemParameters.VirtualScreenHeight;

        var safeLeft = Clamp(snapshot.Left, virtualLeft, virtualRight - 80);
        var safeTop = Clamp(snapshot.Top, virtualTop, virtualBottom - 80);

        WindowStartupLocation = WindowStartupLocation.Manual;
        Left = safeLeft;
        Top = safeTop;
        Width = Math.Max(MinWidth, snapshot.Width);
        Height = Math.Max(MinHeight, snapshot.Height);

        if (snapshot.IsMaximized)
        {
            WindowState = WindowState.Maximized;
        }
    }

    private void SaveWindowPlacement()
    {
        try
        {
            Rect bounds;
            var isMaximized = false;

            if (_isFullscreen)
            {
                bounds = _restoreBounds;
                isMaximized = _restoreWindowState == WindowState.Maximized;
            }
            else if (WindowState == WindowState.Maximized)
            {
                bounds = RestoreBounds;
                isMaximized = true;
            }
            else if (WindowState == WindowState.Minimized)
            {
                bounds = RestoreBounds;
            }
            else
            {
                bounds = new Rect(Left, Top, Width, Height);
            }

            Directory.CreateDirectory(AppDataRoot);
            var snapshot = new WindowSnapshot
            {
                Left = bounds.Left,
                Top = bounds.Top,
                Width = bounds.Width,
                Height = bounds.Height,
                IsMaximized = isMaximized
            };

            var json = JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(WindowStateFile, json);
        }
        catch
        {
        }
    }

    private static WindowSnapshot? LoadWindowPlacement()
    {
        try
        {
            if (!File.Exists(WindowStateFile))
            {
                return null;
            }

            var json = File.ReadAllText(WindowStateFile);
            return JsonSerializer.Deserialize<WindowSnapshot>(json);
        }
        catch
        {
            return null;
        }
    }

    private static bool IsFinite(double value)
    {
        return !double.IsNaN(value) && !double.IsInfinity(value);
    }

    private static double Clamp(double value, double min, double max)
    {
        if (min > max)
        {
            return min;
        }

        return Math.Max(min, Math.Min(max, value));
    }

    private void ToggleFullscreen()
    {
        if (_isFullscreen)
        {
            ExitFullscreen();
            return;
        }

        EnterFullscreen();
    }

    private void EnterFullscreen()
    {
        if (_isFullscreen)
        {
            return;
        }

        _isFullscreen = true;
        _restoreWindowState = WindowState;
        _restoreWindowStyle = WindowStyle;
        _restoreResizeMode = ResizeMode;
        _restoreTopmost = Topmost;
        _restoreBounds = new Rect(Left, Top, Width, Height);

        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        Topmost = true;
        WindowState = WindowState.Normal;

        var bounds = GetMonitorBoundsInDips();
        Left = bounds.Left;
        Top = bounds.Top;
        Width = bounds.Width;
        Height = bounds.Height;

        EnsureFullscreenHotkeys();
    }

    private void ExitFullscreen()
    {
        if (!_isFullscreen)
        {
            return;
        }

        _isFullscreen = false;
        Topmost = _restoreTopmost;
        WindowStyle = _restoreWindowStyle;
        ResizeMode = _restoreResizeMode;
        WindowState = _restoreWindowState;

        EnsureFullscreenHotkeys();

        if (WindowState == WindowState.Normal)
        {
            Left = _restoreBounds.Left;
            Top = _restoreBounds.Top;
            Width = _restoreBounds.Width;
            Height = _restoreBounds.Height;
        }
    }

    private Rect GetMonitorBoundsInDips()
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        if (hwnd == nint.Zero)
        {
            return new Rect(
                SystemParameters.VirtualScreenLeft,
                SystemParameters.VirtualScreenTop,
                SystemParameters.VirtualScreenWidth,
                SystemParameters.VirtualScreenHeight
            );
        }

        var monitor = MonitorFromWindow(hwnd, MonitorDefaultToNearest);
        if (monitor == nint.Zero)
        {
            return new Rect(
                SystemParameters.VirtualScreenLeft,
                SystemParameters.VirtualScreenTop,
                SystemParameters.VirtualScreenWidth,
                SystemParameters.VirtualScreenHeight
            );
        }

        var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        if (!GetMonitorInfo(monitor, ref info))
        {
            return new Rect(
                SystemParameters.VirtualScreenLeft,
                SystemParameters.VirtualScreenTop,
                SystemParameters.VirtualScreenWidth,
                SystemParameters.VirtualScreenHeight
            );
        }

        var transform = PresentationSource.FromVisual(this)?.CompositionTarget?.TransformFromDevice ?? Matrix.Identity;

        var topLeft = transform.Transform(new System.Windows.Point(info.rcMonitor.Left, info.rcMonitor.Top));
        var bottomRight = transform.Transform(new System.Windows.Point(info.rcMonitor.Right, info.rcMonitor.Bottom));

        return new Rect(
            topLeft.X,
            topLeft.Y,
            Math.Max(1, bottomRight.X - topLeft.X),
            Math.Max(1, bottomRight.Y - topLeft.Y)
        );
    }

    private const int MonitorDefaultToNearest = 2;

    [DllImport("user32.dll")]
    private static extern nint MonitorFromWindow(nint hwnd, int dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(nint hMonitor, ref MONITORINFO lpmi);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public int dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private nint WndProc(nint hwnd, int msg, nint wParam, nint lParam, ref bool handled)
    {
        if (msg != WmHotkey)
        {
            return nint.Zero;
        }

        var id = wParam.ToInt32();
        if (id == HotkeyToggleFullscreen)
        {
            ToggleFullscreen();
            handled = true;
            return nint.Zero;
        }

        if (id == HotkeyExitFullscreen && _isFullscreen)
        {
            ExitFullscreen();
            handled = true;
        }

        return nint.Zero;
    }

    private void EnsureFullscreenHotkeys()
    {
        if (!_isHotkeyScopeActive || _windowHandle == nint.Zero)
        {
            return;
        }

        if (!_isHotkeyF11Registered)
        {
            _isHotkeyF11Registered = RegisterHotKey(_windowHandle, HotkeyToggleFullscreen, 0, VkF11);
        }

        if (_isFullscreen)
        {
            if (!_isHotkeyEscRegistered)
            {
                _isHotkeyEscRegistered = RegisterHotKey(_windowHandle, HotkeyExitFullscreen, 0, VkEscape);
            }
        }
        else if (_isHotkeyEscRegistered)
        {
            UnregisterHotKey(_windowHandle, HotkeyExitFullscreen);
            _isHotkeyEscRegistered = false;
        }
    }

    private void RemoveFullscreenHotkeys()
    {
        if (_windowHandle == nint.Zero)
        {
            return;
        }

        if (_isHotkeyF11Registered)
        {
            UnregisterHotKey(_windowHandle, HotkeyToggleFullscreen);
            _isHotkeyF11Registered = false;
        }

        if (_isHotkeyEscRegistered)
        {
            UnregisterHotKey(_windowHandle, HotkeyExitFullscreen);
            _isHotkeyEscRegistered = false;
        }
    }

    private void ApplyWin11WindowStyles()
    {
        if (_windowHandle == nint.Zero)
        {
            return;
        }

        var enabled = 1;
        DwmSetWindowAttribute(_windowHandle, DwmwaUseImmersiveDarkMode19, ref enabled, Marshal.SizeOf<int>());
        DwmSetWindowAttribute(_windowHandle, DwmwaUseImmersiveDarkMode20, ref enabled, Marshal.SizeOf<int>());

        var cornerPreference = 2;
        DwmSetWindowAttribute(
            _windowHandle,
            DwmwaWindowCornerPreference,
            ref cornerPreference,
            Marshal.SizeOf<int>()
        );

        if (System.OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000))
        {
            var backdropType = 2;
            DwmSetWindowAttribute(
                _windowHandle,
                DwmwaSystemBackdropType,
                ref backdropType,
                Marshal.SizeOf<int>()
            );
        }
    }

    [DllImport("user32.dll")]
    private static extern bool RegisterHotKey(nint hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(nint hWnd, int id);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(nint hwnd, int dwAttribute, ref int pvAttribute, int cbAttribute);
}
