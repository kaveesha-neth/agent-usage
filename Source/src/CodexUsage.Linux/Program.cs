using System.Diagnostics;
using System.Runtime.Versioning;
using System.Text.Json;
using CodexUsage.Core;

[assembly: SupportedOSPlatform("linux")]

if (args.Length != 0 && (args.Length != 2 || args[0] != "--codex"))
{
    Console.Error.WriteLine("Usage: codex-usage-helper [--codex /absolute/path/to/codex]");
    return 2;
}

var codexPath = args.Length == 2 ? args[1] : null;
var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
var xdgCache = Environment.GetEnvironmentVariable("XDG_CACHE_HOME");
var cacheRoot = Path.IsPathFullyQualified(xdgCache ?? "") ? xdgCache! : Path.Combine(home, ".cache");
var cache = Path.Combine(cacheRoot, "codex-usage-widget");
var monitor = new UsageMonitor(StartCodex, Path.Combine(cache, "usage-cache.json"));
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var outputLock = new object();
Task accountAction = Task.CompletedTask;
var accountBusy = 0;

using var input = new StreamReader(Console.OpenStandardInput());
monitor.Changed += SendView;
try
{
    SendView(monitor.View);
    monitor.Start();
    while (await input.ReadLineAsync() is { } command && command != "quit")
    {
        if (command == "refresh")
        {
            monitor.Refresh();
            continue;
        }
        if (command is not ("sign-in" or "cancel-sign-in" or "sign-out"))
        {
            Send(new { type = "error", message = "Unknown helper command." });
            continue;
        }
        if (Interlocked.CompareExchange(ref accountBusy, 1, 0) == 0)
            accountAction = HandleAccountAction(command);
    }
}
catch (IOException) { }
finally
{
    monitor.Changed -= SendView;
    await monitor.DisposeAsync();
    await accountAction;
}
return 0;

ProcessStartInfo StartCodex()
{
    var executable = FindCodex();
    Directory.CreateDirectory(cache, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
    var start = new ProcessStartInfo(executable) { WorkingDirectory = cache };
    start.ArgumentList.Add("app-server");
    return start;
}

string FindCodex()
{
    if (codexPath is not null)
    {
        if (Path.IsPathFullyQualified(codexPath) && IsExecutable(codexPath))
            return codexPath;
        throw new FileNotFoundException("Select an absolute path to an executable Codex CLI.");
    }

    var candidates = (Environment.GetEnvironmentVariable("PATH") ?? "")
        .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
        .Concat([Path.Combine(home, ".local", "bin"), Path.Combine(home, ".cargo", "bin")]);
    foreach (var directory in candidates.Where(Path.IsPathFullyQualified))
    {
        var candidate = Path.Combine(directory, "codex");
        if (IsExecutable(candidate))
            return candidate;
    }
    throw new FileNotFoundException("Install the Codex CLI or set its path in extension preferences.");
}

static bool IsExecutable(string path)
{
    if (!File.Exists(path))
        return false;
    const UnixFileMode execute = UnixFileMode.UserExecute | UnixFileMode.GroupExecute | UnixFileMode.OtherExecute;
    return (File.GetUnixFileMode(path) & execute) != 0;
}

async Task HandleAccountAction(string command)
{
    try
    {
        switch (command)
        {
            case "sign-in":
                var url = await monitor.SignInAsync();
                if (url is not null)
                {
                    if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || !IsTrustedAuthUrl(uri))
                    {
                        await monitor.CancelLoginAsync();
                        Send(new { type = "error", message = "Codex returned an unexpected authentication URL." });
                        break;
                    }
                    Send(new { type = "auth-url", url = uri.AbsoluteUri });
                }
                break;
            case "cancel-sign-in":
                await monitor.CancelLoginAsync();
                break;
            case "sign-out":
                await monitor.SignOutAsync();
                break;
        }
    }
    catch (OperationCanceledException) { }
    catch (Exception e) when (e is IOException or InvalidOperationException or TimeoutException
                               or System.ComponentModel.Win32Exception or UnauthorizedAccessException)
    {
        Send(new { type = "error", message = "Account action failed. Check the Codex CLI path and connection." });
    }
    finally
    {
        Interlocked.Exchange(ref accountBusy, 0);
        Send(new { type = "action-done", command });
    }
}

static bool IsTrustedAuthUrl(Uri uri) => uri.Scheme == Uri.UriSchemeHttps &&
    uri.UserInfo.Length == 0 && uri.IsDefaultPort &&
    new[] { "chatgpt.com", "openai.com" }.Any(domain =>
        uri.IdnHost.Equals(domain, StringComparison.OrdinalIgnoreCase) ||
        uri.IdnHost.EndsWith("." + domain, StringComparison.OrdinalIgnoreCase));

void SendView(MonitorView view) => Send(new
{
    type = "view",
    view = new
    {
        view.Connection, view.Stale, view.Detail, view.Plan,
        snapshot = view.Snapshot is { } snapshot ? new
        {
            snapshot.FetchedAt,
            buckets = snapshot.Buckets.Select(bucket => new
            {
                bucket.Name,
                windows = bucket.Windows.Select(window => new
                {
                    window.DurationLabel, window.WindowDurationMins, window.RemainingPercent,
                    resetsAt = window.ResetUtc?.ToUnixTimeSeconds(),
                }),
            }),
        } : null,
    },
});

void Send(object value)
{
    lock (outputLock)
    {
        try { Console.WriteLine(JsonSerializer.Serialize(value, json)); }
        catch (IOException) { }
    }
}
