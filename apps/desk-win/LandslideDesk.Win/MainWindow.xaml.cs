using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
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

    private bool _isFullscreen;
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

        RegisterHotKey(_windowHandle, HotkeyToggleFullscreen, 0, VkF11);
    }

    private void OnClosed(object? sender, System.EventArgs e)
    {
        Closed -= OnClosed;

        if (_hwndSource is not null)
        {
            _hwndSource.RemoveHook(WndProc);
            _hwndSource = null;
        }

        if (_windowHandle != nint.Zero)
        {
            UnregisterHotKey(_windowHandle, HotkeyToggleFullscreen);
            UnregisterHotKey(_windowHandle, HotkeyExitFullscreen);
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
        var userDataFolder = Path.Combine(
            System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData),
            "LandslideDesk.Win",
            "WebView2"
        );

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
        await DeskWebView.EnsureCoreWebView2Async(env);

        var core = DeskWebView.CoreWebView2;
        core.Settings.AreDevToolsEnabled = Debugger.IsAttached;

        var devUrl = System.Environment.GetEnvironmentVariable(DevServerEnv);
        if (!string.IsNullOrWhiteSpace(devUrl))
        {
            core.Navigate(devUrl.Trim());
            return;
        }

        var webRoot = Path.Combine(System.AppContext.BaseDirectory, "web");
        var indexFile = Path.Combine(webRoot, "index.html");
        if (File.Exists(indexFile))
        {
            core.SetVirtualHostNameToFolderMapping(
                VirtualHostName,
                webRoot,
                CoreWebView2HostResourceAccessKind.Allow
            );
            core.Navigate($"https://{VirtualHostName}/index.html");
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

        DeskWebView.NavigateToString(html);
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

        if (_windowHandle != nint.Zero)
        {
            RegisterHotKey(_windowHandle, HotkeyExitFullscreen, 0, VkEscape);
        }
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

        if (_windowHandle != nint.Zero)
        {
            UnregisterHotKey(_windowHandle, HotkeyExitFullscreen);
        }

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

    [DllImport("user32.dll")]
    private static extern bool RegisterHotKey(nint hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(nint hWnd, int id);
}
