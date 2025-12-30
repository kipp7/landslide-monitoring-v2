using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;

namespace LandslideDesk.Win;

public partial class MainWindow : Window
{
    private const string VirtualHostName = "appassets.local";
    private const string DevServerEnv = "DESK_DEV_SERVER_URL";

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

    public MainWindow()
    {
        InitializeComponent();
        SourceInitialized += OnSourceInitialized;
        Loaded += OnLoaded;
        Activated += OnActivated;
        Deactivated += OnDeactivated;
        Closed += OnClosed;
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

    private void OnClosed(object? sender, System.EventArgs e)
    {
        Closed -= OnClosed;
        Activated -= OnActivated;
        Deactivated -= OnDeactivated;
        RemoveFullscreenHotkeys();

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
            MessageBox.Show(this, ex.Message, "启动失败", MessageBoxButton.OK, MessageBoxImage.Error);
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

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
        await DeskWebView.EnsureCoreWebView2Async(env);

        var core = DeskWebView.CoreWebView2;
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
set {{DevServerEnv}}=http://localhost:5174/
dotnet run --project apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj

生产构建：
npm -w apps/desk run build
dotnet publish apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj -c Release -r win-x64
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

    private void HandleWebMessage(CoreWebView2 core, string message)
    {
        if (message.StartsWith("app:", System.StringComparison.OrdinalIgnoreCase))
        {
            HandleAppAction(core, message["app:".Length..], payload: null);
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

            HandleAppAction(core, action!, root);
        }
        catch
        {
        }
    }

    private void HandleAppAction(CoreWebView2 core, string action, JsonElement? payload)
    {
        switch (action.Trim().ToLowerInvariant())
        {
            case "quit":
                Application.Current.Shutdown();
                break;
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
                if (payload is not null && payload.Value.TryGetProperty("url", out var urlEl))
                {
                    var url = urlEl.GetString();
                    if (!string.IsNullOrWhiteSpace(url))
                    {
                        TryOpenExternal(url);
                    }
                }
                break;
        }
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
        Application.Current.Shutdown();
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

        var topLeft = transform.Transform(new Point(info.rcMonitor.Left, info.rcMonitor.Top));
        var bottomRight = transform.Transform(new Point(info.rcMonitor.Right, info.rcMonitor.Bottom));

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
