using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;

namespace LandslideDesk.Win;

public partial class App : Application
{
    private Mutex? _singleInstanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _singleInstanceMutex = new Mutex(true, "LandslideDesk.Win.SingleInstance", out var createdNew);
        if (!createdNew)
        {
            TryActivateExistingInstance();
            Shutdown();
            return;
        }

        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

        var mainWindow = new MainWindow();
        MainWindow = mainWindow;
        mainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        DispatcherUnhandledException -= OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException -= OnUnhandledException;
        TaskScheduler.UnobservedTaskException -= OnUnobservedTaskException;

        if (_singleInstanceMutex is not null)
        {
            try
            {
                _singleInstanceMutex.ReleaseMutex();
            }
            catch
            {
            }

            _singleInstanceMutex.Dispose();
            _singleInstanceMutex = null;
        }

        base.OnExit(e);
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        e.Handled = true;

        var path = SafeWriteCrash(e.Exception);
        if (!string.IsNullOrWhiteSpace(path))
        {
            MessageBox.Show(
                $"程序发生未处理异常，已写入崩溃日志：\n{path}\n\n即将退出。",
                "程序异常",
                MessageBoxButton.OK,
                MessageBoxImage.Error
            );
        }
        else
        {
            MessageBox.Show(
                "程序发生未处理异常，即将退出。",
                "程序异常",
                MessageBoxButton.OK,
                MessageBoxImage.Error
            );
        }

        Shutdown(-1);
    }

    private void OnUnhandledException(object? sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            SafeWriteCrash(ex);
        }
        else
        {
            SafeWriteCrash(new Exception($"UnhandledException: {e.ExceptionObject}"));
        }
    }

    private void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        SafeWriteCrash(e.Exception);
        e.SetObserved();
    }

    private static string? SafeWriteCrash(Exception exception)
    {
        try
        {
            return CrashReporter.Write(exception);
        }
        catch
        {
            return null;
        }
    }

    private static void TryActivateExistingInstance()
    {
        try
        {
            var current = Process.GetCurrentProcess();
            foreach (var process in Process.GetProcessesByName(current.ProcessName))
            {
                if (process.Id == current.Id)
                {
                    continue;
                }

                var hwnd = process.MainWindowHandle;
                if (hwnd == IntPtr.Zero)
                {
                    continue;
                }

                ShowWindow(hwnd, SwRestore);
                SetForegroundWindow(hwnd);
                break;
            }
        }
        catch
        {
        }
    }

    private const int SwRestore = 9;

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(nint hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(nint hWnd);
}
