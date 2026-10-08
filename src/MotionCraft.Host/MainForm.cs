using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MotionCraft.Host;

public sealed class MainForm : Form
{
    readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    readonly MenuStrip _menu = new();
    BridgeServer? _bridge;
    AppSettings _settings = AppSettings.Load();
    string _cachedProjectJson = "{}";
    readonly TaskCompletionSource _webReady = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public MainForm()
    {
        Text = "MotionCraft";
        Width = 1440;
        Height = 900;
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1100, 700);
        try
        {
            var exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            if (exeIcon != null) Icon = exeIcon;
        }
        catch { /* keep default */ }

        BuildMenu();
        Controls.Add(_web);
        Controls.Add(_menu);
        MainMenuStrip = _menu;

        Load += async (_, _) => await InitAsync();
        FormClosed += (_, _) => _bridge?.Dispose();
    }

    void BuildMenu()
    {
        var file = new ToolStripMenuItem("文件");
        file.DropDownItems.Add("新建项目", null, async (_, _) => await ExecJs("MotionCraftAPI.newProject()"));
        file.DropDownItems.Add("打开…", null, async (_, _) => await OpenProject());
        file.DropDownItems.Add("保存…", null, async (_, _) => await SaveProject());
        file.DropDownItems.Add(new ToolStripSeparator());
        file.DropDownItems.Add("退出", null, (_, _) => Close());

        var studio = new ToolStripMenuItem("工作室");
        studio.DropDownItems.Add("预览", null, async (_, _) => await ExecJs("MotionCraftAPI.runCommand({action:'preview'})"));
        studio.DropDownItems.Add("导出视频", null, async (_, _) => await ExecJs("MotionCraftAPI.runCommand({action:'export_video'})"));
        studio.DropDownItems.Add("AI 导演…", null, async (_, _) => await ExecJs("document.getElementById('btnDirector')?.click()"));

        var tools = new ToolStripMenuItem("工具");
        tools.DropDownItems.Add("API / 模型设置…", null, (_, _) => ShowSettingsDialog());
        tools.DropDownItems.Add("复制 MCP 配置", null, (_, _) => CopyMcpConfig());
        tools.DropDownItems.Add("打开 www 目录", null, (_, _) =>
        {
            var dir = WwwDir();
            if (Directory.Exists(dir))
                System.Diagnostics.Process.Start("explorer.exe", dir);
        });

        var help = new ToolStripMenuItem("帮助");
        help.DropDownItems.Add("快捷键", null, (_, _) =>
            MessageBox.Show(
                "Ctrl+N 新建\nCtrl+O 打开\nCtrl+S 保存\nDelete 删除节点/连线\nEsc 关闭预览\n空格 预览/暂停\nSpace+拖拽 平移画布",
                "快捷键",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information));
        help.DropDownItems.Add("关于", null, (_, _) =>
            MessageBox.Show(
                "MotionCraft — AI Motion Studio\n大模型输出 HTML/CSS/JS 绘制帧 · DPAPI 加密密钥 · MCP 桥接",
                "关于",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information));

        _menu.Items.Add(file);
        _menu.Items.Add(studio);
        _menu.Items.Add(tools);
        _menu.Items.Add(help);
    }

    async Task InitAsync()
    {
        try
        {
            await _web.EnsureCoreWebView2Async();
            _web.CoreWebView2.Settings.AreDevToolsEnabled = true;
            _web.CoreWebView2.WebMessageReceived += OnWebMessage;

            _bridge = new BridgeServer(this);
            _bridge.Start(_settings.BridgePort);
            _settings.BridgePort = _bridge.Port;
            _settings.Save();

            var www = WwwDir();
            var index = Path.Combine(www, "index.html");
            if (!File.Exists(index))
            {
                MessageBox.Show($"找不到界面文件:\n{index}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // Virtual host so ES modules work (file:// blocks module imports).
            _web.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "motioncraft.local",
                www,
                CoreWebView2HostResourceAccessKind.Allow);
            _web.CoreWebView2.Navigate($"https://motioncraft.local/index.html?bridge={_bridge.Port}");

            _web.CoreWebView2.NavigationCompleted += async (_, args) =>
            {
                if (!args.IsSuccess) return;
                await InjectHostBootstrap();
                _webReady.TrySetResult();
            };
        }
        catch (Exception ex)
        {
            MessageBox.Show("初始化失败: " + ex.Message, "MotionCraft", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    async Task InjectHostBootstrap()
    {
        // Include secrets only inside trusted WebView (needed for in-page LLM calls).
        var settingsJson = JsonSerializer.Serialize(GetPublicSettings(includeSecrets: true));
        var script = $$"""
            window.__MOTIONCRAFT_HOST__ = {
              bridgePort: {{_bridge!.Port}},
              settings: {{settingsJson}}
            };
            if (window.MotionCraftAPI && window.MotionCraftAPI.onHostReady) {
              window.MotionCraftAPI.onHostReady(window.__MOTIONCRAFT_HOST__);
            }
            """;
        await _web.CoreWebView2.ExecuteScriptAsync(script);
    }

    string _aiProgressJson = """{"active":false,"title":"","status":"","text":"","length":0}""";

    public object GetAiProgress()
    {
        try
        {
            using var doc = JsonDocument.Parse(_aiProgressJson);
            return JsonSerializer.Deserialize<object>(doc.RootElement.GetRawText())
                   ?? new { active = false };
        }
        catch
        {
            return new { active = false, text = "", status = "" };
        }
    }

    void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var msg = e.TryGetWebMessageAsString();
            if (string.IsNullOrEmpty(msg)) return;
            using var doc = JsonDocument.Parse(msg);
            var root = doc.RootElement;
            var type = root.GetProperty("type").GetString();
            if (type == "project" && root.TryGetProperty("data", out var data))
                _cachedProjectJson = data.GetRawText();
            else if (type == "aiStream" && root.TryGetProperty("data", out var stream))
                _aiProgressJson = stream.GetRawText();
            else if (type == "saveSettings" && root.TryGetProperty("data", out var s))
            {
                ApplySettingsJson(s.GetRawText());
                _ = InjectHostBootstrap();
            }
            else if (type == "openSettings")
                BeginInvoke(ShowSettingsDialog);
            else if (type == "openProject")
                BeginInvoke(async () => await OpenProject());
            else if (type == "saveProject")
                BeginInvoke(async () => await SaveProject());
            else if (type == "newProject")
                BeginInvoke(async () => await ExecJs("MotionCraftAPI.newProject()"));
        }
        catch { /* ignore malformed */ }
    }

    static string WwwDir()
    {
        var baseDir = AppContext.BaseDirectory;
        var a = Path.Combine(baseDir, "www");
        if (Directory.Exists(a)) return a;
        // Dev: repo www next to solution
        var b = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "..", "www"));
        if (Directory.Exists(b)) return b;
        return a;
    }

    /// <summary>For HTTP/MCP: never expose plaintext keys.</summary>
    public object GetPublicSettings(bool includeSecrets = false) => new
    {
        bridgePort = _bridge?.Port ?? _settings.BridgePort,
        activeProvider = _settings.ActiveProvider,
        encryptedAtRest = true,
        settingsPath = AppSettings.SettingsPath,
        providers = _settings.Providers.ToDictionary(
            kv => kv.Key,
            kv => new
            {
                label = kv.Value.Label,
                baseUrl = kv.Value.BaseUrl,
                model = kv.Value.Model,
                hasKey = kv.Value.HasKey,
                keyMask = kv.Value.HasKey ? SecretProtector.Mask(kv.Value.ApiKey) : "",
                // Secrets only for trusted WebView bootstrap — not for /settings HTTP
                apiKey = includeSecrets ? kv.Value.ApiKey : "",
            })
    };

    public void ApplySettingsJson(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("activeProvider", out var ap))
                _settings.ActiveProvider = ap.GetString() ?? _settings.ActiveProvider;
            if (root.TryGetProperty("providers", out var providers))
            {
                foreach (var prop in providers.EnumerateObject())
                {
                    if (!_settings.Providers.TryGetValue(prop.Name, out var cfg))
                    {
                        cfg = new ProviderConfig { Label = prop.Name };
                        _settings.Providers[prop.Name] = cfg;
                    }
                    if (prop.Value.TryGetProperty("baseUrl", out var bu) || prop.Value.TryGetProperty("BaseUrl", out bu))
                        cfg.BaseUrl = bu.GetString() ?? cfg.BaseUrl;
                    if (prop.Value.TryGetProperty("model", out var m) || prop.Value.TryGetProperty("Model", out m))
                        cfg.Model = m.GetString() ?? cfg.Model;
                    if (prop.Value.TryGetProperty("label", out var l) || prop.Value.TryGetProperty("Label", out l))
                        cfg.Label = l.GetString() ?? cfg.Label;

                    // apiKey: non-empty => replace; "__CLEAR__" => delete; empty/missing => keep
                    if (prop.Value.TryGetProperty("apiKey", out var k) || prop.Value.TryGetProperty("ApiKey", out k))
                    {
                        var key = k.GetString() ?? "";
                        if (key == "__CLEAR__")
                            cfg.ApiKey = "";
                        else if (!string.IsNullOrWhiteSpace(key))
                            cfg.ApiKey = key.Trim();
                    }
                    if (prop.Value.TryGetProperty("clearKey", out var ck) && ck.ValueKind == JsonValueKind.True)
                        cfg.ApiKey = "";
                }
            }
            _settings.Save();
        }
        catch (Exception ex)
        {
            MessageBox.Show("设置保存失败: " + ex.Message);
        }
    }

    Task<T> OnUiAsync<T>(Func<Task<T>> fn)
    {
        if (!InvokeRequired) return fn();
        var tcs = new TaskCompletionSource<T>();
        BeginInvoke(async () =>
        {
            try { tcs.SetResult(await fn()); }
            catch (Exception ex) { tcs.SetException(ex); }
        });
        return tcs.Task;
    }

    Task OnUiAsync(Func<Task> fn) => OnUiAsync(async () => { await fn(); return true; });

    public Task<string> GetProjectJsonAsync() => OnUiAsync(async () =>
    {
        await _webReady.Task;
        try
        {
            var raw = await _web.CoreWebView2.ExecuteScriptAsync(
                "JSON.stringify(window.MotionCraftAPI ? window.MotionCraftAPI.getProject() : {})");
            _cachedProjectJson = JsonSerializer.Deserialize<string>(raw) ?? _cachedProjectJson;
        }
        catch { /* keep cache */ }
        return _cachedProjectJson;
    });

    public Task SetProjectJsonAsync(string json) => OnUiAsync(async () =>
    {
        await _webReady.Task;
        _cachedProjectJson = json;
        var b64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(json));
        await _web.CoreWebView2.ExecuteScriptAsync(
            $"window.MotionCraftAPI && window.MotionCraftAPI.setProjectFromBase64('{b64}')");
    });

    public Task<string> RunCommandAsync(string commandJson) => OnUiAsync(async () =>
    {
        await _webReady.Task;
        var b64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(commandJson));
        await _web.CoreWebView2.ExecuteScriptAsync($$"""
            (function(){
              window.__mcCmdDone = false;
              window.__mcCmdResult = null;
              Promise.resolve(window.MotionCraftAPI.runCommandFromBase64('{{b64}}'))
                .then(function(r){ window.__mcCmdResult = r; window.__mcCmdDone = true; })
                .catch(function(e){ window.__mcCmdResult = { ok:false, error: String(e) }; window.__mcCmdDone = true; });
            })()
            """);

        for (var i = 0; i < 600; i++)
        {
            // Keep MCP /ai-progress fresh while long AI jobs stream
            try
            {
                var streamRaw = await _web.CoreWebView2.ExecuteScriptAsync(
                    "JSON.stringify(window.__mcAiStream || (window.MotionCraftAPI && window.MotionCraftAPI.getAiStream && window.MotionCraftAPI.getAiStream()) || {})");
                var streamJson = JsonSerializer.Deserialize<string>(streamRaw);
                if (!string.IsNullOrWhiteSpace(streamJson) && streamJson != "{}")
                    _aiProgressJson = streamJson;
            }
            catch { /* ignore */ }

            var doneRaw = await _web.CoreWebView2.ExecuteScriptAsync("window.__mcCmdDone === true");
            if (doneRaw == "true")
            {
                var resultRaw = await _web.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.__mcCmdResult)");
                return JsonSerializer.Deserialize<string>(resultRaw) ?? "{\"ok\":false}";
            }
            await Task.Delay(100);
        }
        return "{\"ok\":false,\"error\":\"timeout\"}";
    });

    async Task ExecJs(string expr)
    {
        if (_web.CoreWebView2 == null) return;
        await _web.CoreWebView2.ExecuteScriptAsync(expr);
    }

    async Task OpenProject()
    {
        using var dlg = new OpenFileDialog
        {
            Filter = "MotionCraft 项目 (*.motioncraft.json)|*.motioncraft.json|JSON (*.json)|*.json",
            Title = "打开项目"
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        var json = await File.ReadAllTextAsync(dlg.FileName);
        await SetProjectJsonAsync(json);
    }

    async Task SaveProject()
    {
        using var dlg = new SaveFileDialog
        {
            Filter = "MotionCraft 项目 (*.motioncraft.json)|*.motioncraft.json",
            FileName = "project.motioncraft.json",
            Title = "保存项目"
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        var json = await GetProjectJsonAsync();
        await File.WriteAllTextAsync(dlg.FileName, json);
    }

    async void ShowSettingsDialog()
    {
        using var f = new SettingsForm(_settings);
        if (f.ShowDialog(this) != DialogResult.OK) return;
        await InjectHostBootstrap();
    }

    void CopyMcpConfig()
    {
        var mcpPath = Path.GetFullPath(Path.Combine(WwwDir(), "..", "mcp", "server.js"));
        var port = _bridge?.Port ?? _settings.BridgePort;
        var config = $$"""
            {
              "mcpServers": {
                "motioncraft": {
                  "command": "node",
                  "args": ["{{mcpPath.Replace("\\", "\\\\")}}"],
                  "env": {
                    "MOTIONCRAFT_BRIDGE": "http://127.0.0.1:{{port}}"
                  }
                }
              }
            }
            """;
        Clipboard.SetText(config);
        MessageBox.Show("已复制 MCP 配置到剪贴板。\n请先 npm install（mcp 目录），并保持本应用运行。", "MCP");
    }
}
