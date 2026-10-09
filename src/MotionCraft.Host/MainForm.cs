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
    string? _currentProjectPath;
    readonly TaskCompletionSource _webReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
    CancellationTokenSource? _autosaveCts;
    bool _autosaveSuspended;
    bool _autosaveDirty;
    DateTime _lastAutosaveUtc;

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
        FormClosing += (_, e) =>
        {
            try { FlushAutosave(); }
            catch { /* best-effort */ }
        };
        FormClosed += (_, _) =>
        {
            _autosaveCts?.Cancel();
            _bridge?.Dispose();
        };
    }

    void BuildMenu()
    {
        var file = new ToolStripMenuItem("文件");
        file.DropDownItems.Add("新建工程…", null, async (_, _) => await NewProject());
        file.DropDownItems.Add("打开…", null, async (_, _) => await OpenProject());
        file.DropDownItems.Add("保存", null, async (_, _) => await SaveProject(saveAs: false));
        file.DropDownItems.Add("另存为…", null, async (_, _) => await SaveProject(saveAs: true));
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
                "Ctrl+N 新建工程\nCtrl+O 打开\nCtrl+S 保存\nDelete 删除节点/连线\nEsc 关闭预览\n空格 预览/暂停\nSpace+拖拽 平移画布",
                "快捷键",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information));
        help.DropDownItems.Add("关于", null, (_, _) =>
            MessageBox.Show(
                "MotionCraft — AI Motion Studio\n工程文件 .vd（加密单文件）· DPAPI 加密 API Key · MCP 桥接",
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
            _web.CoreWebView2.DownloadStarting += OnDownloadStarting;

            _bridge = new BridgeServer(this);
            _bridge.Start(_settings.BridgePort);
            _settings.BridgePort = _bridge.Port;
            _settings.Save();

            ProjectVault.ProjectDir();

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
            {
                // Ignore stale posts while opening/creating a session (prevents wiping .vd)
                if (!_autosaveSuspended)
                {
                    _cachedProjectJson = data.GetRawText();
                    _autosaveDirty = true;
                    ScheduleAutosave();
                }
            }
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
                BeginInvoke(async () => await SaveProject(saveAs: false));
            else if (type == "saveProjectAs")
                BeginInvoke(async () => await SaveProject(saveAs: true));
            else if (type == "newProject")
                BeginInvoke(async () => await NewProject());
            else if (type == "exportVideo")
                BeginInvoke(() => SaveExportVideo(root));
        }
        catch { /* ignore malformed */ }
    }

    /// <summary>
    /// Redirect browser downloads of exported video next to the open .vd file.
    /// </summary>
    void OnDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs e)
    {
        try
        {
            var suggested = e.ResultFilePath ?? "";
            var ext = Path.GetExtension(suggested).ToLowerInvariant();
            if (ext is not (".mp4" or ".webm" or ".mkv"))
                return;

            var dest = ResolveExportPath(ext);
            if (string.IsNullOrEmpty(dest))
            {
                e.Cancel = true;
                return;
            }

            e.ResultFilePath = dest;
            e.Handled = true;

            var op = e.DownloadOperation;
            void OnStateChanged(object? s, object? args)
            {
                if (op.State != CoreWebView2DownloadState.Completed) return;
                op.StateChanged -= OnStateChanged;
                BeginInvoke(() => NotifyExportSaved(dest));
            }
            op.StateChanged += OnStateChanged;
        }
        catch
        {
            // fall through to default download behavior
        }
    }

    /// <summary>Same directory as .vd; basename matches the project file.</summary>
    string? ResolveExportPath(string ext)
    {
        if (string.IsNullOrEmpty(ext)) ext = ".mp4";
        if (!ext.StartsWith('.')) ext = "." + ext;

        if (!string.IsNullOrEmpty(_currentProjectPath))
        {
            var dir = Path.GetDirectoryName(_currentProjectPath);
            if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
            {
                var baseName = Path.GetFileNameWithoutExtension(_currentProjectPath);
                return Path.Combine(dir, baseName + ext);
            }
        }

        using var dlg = new SaveFileDialog
        {
            Title = "导出视频",
            Filter = ext.Equals(".mp4", StringComparison.OrdinalIgnoreCase)
                ? "MP4 视频 (*.mp4)|*.mp4|所有文件 (*.*)|*.*"
                : "视频 (*.mp4;*.webm)|*.mp4;*.webm|所有文件 (*.*)|*.*",
            DefaultExt = ext.TrimStart('.'),
            AddExtension = true,
            FileName = (Path.GetFileNameWithoutExtension(_currentProjectPath) ?? "motioncraft") + ext,
            InitialDirectory = ProjectVault.ProjectDir(),
            OverwritePrompt = true,
        };
        return dlg.ShowDialog(this) == DialogResult.OK ? dlg.FileName : null;
    }

    void SaveExportVideo(JsonElement root)
    {
        try
        {
            var fileName = root.TryGetProperty("fileName", out var fn) ? fn.GetString() : null;
            var b64 = root.TryGetProperty("base64", out var b) ? b.GetString() : null;
            if (string.IsNullOrWhiteSpace(b64))
            {
                MessageBox.Show("导出数据为空。", "MotionCraft", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
            if (ext is not (".mp4" or ".webm" or ".mkv"))
                ext = ".mp4";

            var dest = ResolveExportPath(ext);
            if (string.IsNullOrEmpty(dest)) return;

            var bytes = Convert.FromBase64String(b64);
            File.WriteAllBytes(dest, bytes);
            NotifyExportSaved(dest);
        }
        catch (Exception ex)
        {
            MessageBox.Show("导出视频失败: " + ex.Message, "MotionCraft", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void NotifyExportSaved(string path)
    {
        try
        {
            var envelope = JsonSerializer.Serialize(new { type = "exportSaved", path });
            _web.CoreWebView2?.PostWebMessageAsJson(envelope);
        }
        catch { /* ignore */ }
        UpdateTitle();
    }

    void ScheduleAutosave()
    {
        if (_autosaveSuspended || string.IsNullOrEmpty(_currentProjectPath) || !_autosaveDirty)
            return;

        _autosaveCts?.Cancel();
        _autosaveCts = new CancellationTokenSource();
        var token = _autosaveCts.Token;
        var path = _currentProjectPath;
        var json = _cachedProjectJson;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(500, token);
                if (token.IsCancellationRequested) return;
                if (_autosaveSuspended || string.IsNullOrEmpty(path)) return;
                if (string.IsNullOrWhiteSpace(json) || json == "{}") return;

                // Re-read latest cache on UI thread snapshot
                string? latestPath = null;
                string? latestJson = null;
                var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                BeginInvoke(() =>
                {
                    latestPath = _currentProjectPath;
                    latestJson = _cachedProjectJson;
                    ready.TrySetResult();
                });
                await ready.Task;
                if (token.IsCancellationRequested) return;
                if (_autosaveSuspended || string.IsNullOrEmpty(latestPath)) return;
                if (string.IsNullOrWhiteSpace(latestJson) || latestJson == "{}") return;

                ProjectVault.Save(latestPath, latestJson);
                _lastAutosaveUtc = DateTime.UtcNow;
                _autosaveDirty = false;
                BeginInvoke(() =>
                {
                    UpdateTitle(autosaved: true);
                    _ = NotifyFrontendAutosaveAsync(latestPath);
                });
            }
            catch (TaskCanceledException) { /* coalesced */ }
            catch (Exception ex)
            {
                BeginInvoke(() =>
                {
                    // Soft fail — don't block editing
                    System.Diagnostics.Debug.WriteLine("autosave failed: " + ex.Message);
                });
            }
        }, token);
    }

    void FlushAutosave()
    {
        if (_autosaveSuspended || string.IsNullOrEmpty(_currentProjectPath) || !_autosaveDirty)
            return;
        var json = _cachedProjectJson;
        if (string.IsNullOrWhiteSpace(json) || json == "{}") return;
        try
        {
            ProjectVault.Save(_currentProjectPath, json);
            _autosaveDirty = false;
            _lastAutosaveUtc = DateTime.UtcNow;
        }
        catch { /* closing */ }
    }

    Task NotifyFrontendAutosaveAsync(string path)
    {
        if (_web.CoreWebView2 == null) return Task.CompletedTask;
        try
        {
            var payload = JsonSerializer.Serialize(new { type = "projectAutosaved", path });
            _web.CoreWebView2.PostWebMessageAsJson(payload);
        }
        catch { /* ignore */ }
        return Task.CompletedTask;
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

    async Task OpenProjectSessionAsync(string json, string path)
    {
        await _webReady.Task;
        _autosaveSuspended = true;
        _autosaveCts?.Cancel();
        try
        {
            var normalized = ProjectVault.NormalizeAndValidate(json);
            _cachedProjectJson = normalized;
            _currentProjectPath = path;
            _autosaveDirty = false;
            UpdateTitle();

            using var projectDoc = JsonDocument.Parse(normalized);
            var envelope = JsonSerializer.Serialize(new
            {
                type = "openProjectSession",
                path,
                project = projectDoc.RootElement,
            });

            // PostWebMessageAsJson — avoids ExecuteScript size limits on large graphs.
            // Retry until frontend acks (ES module may still be booting).
            var pathJson = JsonSerializer.Serialize(path);
            var applied = false;
            for (var i = 0; i < 40; i++)
            {
                _web.CoreWebView2.PostWebMessageAsJson(envelope);
                try
                {
                    await _web.CoreWebView2.ExecuteScriptAsync(
                        "window.MotionCraftAPI && window.MotionCraftAPI.flushPendingHostMsg && window.MotionCraftAPI.flushPendingHostMsg()");
                }
                catch { /* page may not be ready */ }

                var check = await _web.CoreWebView2.ExecuteScriptAsync(
                    $"(window.__mcSessionPath === {pathJson} && window.__mcSessionOpen === true)");
                if (check == "true")
                {
                    applied = true;
                    break;
                }
                await Task.Delay(50);
            }

            if (!applied)
                throw new InvalidOperationException("界面未能加载工程（可重试打开）。");

            // Brief settle so first syncHost isn't treated as foreign dirty
            await Task.Delay(200);
            _cachedProjectJson = normalized;
            _autosaveDirty = false;
        }
        finally
        {
            _autosaveSuspended = false;
        }
    }

    void UpdateTitle(bool autosaved = false)
    {
        var name = Path.GetFileName(_currentProjectPath);
        var baseTitle = string.IsNullOrEmpty(name) ? "MotionCraft" : $"MotionCraft — {name}";
        Text = autosaved ? baseTitle + " · 已自动保存" : baseTitle;
    }

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

    async Task NewProject()
    {
        var projectDir = ProjectVault.ProjectDir();
        using var dlg = new SaveFileDialog
        {
            Filter = ProjectVault.FileFilter,
            DefaultExt = "vd",
            AddExtension = true,
            InitialDirectory = projectDir,
            FileName = ProjectVault.SuggestFileName("未命名项目"),
            Title = "新建工程",
            OverwritePrompt = true,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        var fileName = dlg.FileName;
        if (!fileName.EndsWith(ProjectVault.Extension, StringComparison.OrdinalIgnoreCase))
            fileName += ProjectVault.Extension;

        var name = Path.GetFileNameWithoutExtension(fileName);
        var json = ProjectVault.EmptyProjectJson(name);
        try
        {
            FlushAutosave();
            ProjectVault.Save(fileName, json);
            await OpenProjectSessionAsync(json, fileName);
        }
        catch (Exception ex)
        {
            MessageBox.Show("新建工程失败: " + ex.Message, "MotionCraft", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    async Task OpenProject()
    {
        using var dlg = new OpenFileDialog
        {
            Filter = ProjectVault.FileFilter,
            DefaultExt = "vd",
            InitialDirectory = string.IsNullOrEmpty(_currentProjectPath)
                ? ProjectVault.ProjectDir()
                : (Path.GetDirectoryName(_currentProjectPath) is { } cur && Directory.Exists(cur)
                    ? cur
                    : ProjectVault.ProjectDir()),
            Title = "打开工程",
            CheckFileExists = true,
            Multiselect = false,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            FlushAutosave();
            var json = ProjectVault.Load(dlg.FileName);
            await OpenProjectSessionAsync(json, dlg.FileName);
        }
        catch (Exception ex)
        {
            MessageBox.Show("打开工程失败: " + ex.Message, "MotionCraft", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    async Task SaveProject(bool saveAs)
    {
        _autosaveCts?.Cancel();
        var json = await GetProjectJsonAsync();
        if (string.IsNullOrWhiteSpace(json) || json == "{}")
        {
            MessageBox.Show("当前没有可保存的工程内容。", "MotionCraft", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        string? path = _currentProjectPath;
        if (saveAs || string.IsNullOrEmpty(path))
        {
            string? projectName = null;
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("name", out var n))
                    projectName = n.GetString();
            }
            catch { /* ignore */ }

            using var dlg = new SaveFileDialog
            {
                Filter = ProjectVault.FileFilter,
                DefaultExt = "vd",
                AddExtension = true,
                InitialDirectory = Path.GetDirectoryName(path) is { } d && Directory.Exists(d)
                    ? d
                    : ProjectVault.ProjectDir(),
                FileName = Path.GetFileName(path) ?? ProjectVault.SuggestFileName(projectName),
                Title = saveAs ? "另存为" : "保存工程",
                OverwritePrompt = true,
            };
            if (dlg.ShowDialog(this) != DialogResult.OK) return;
            path = dlg.FileName;
            if (!path.EndsWith(ProjectVault.Extension, StringComparison.OrdinalIgnoreCase))
                path += ProjectVault.Extension;
        }

        try
        {
            ProjectVault.Save(path, json);
            _currentProjectPath = path;
            _cachedProjectJson = json;
            _autosaveDirty = false;
            UpdateTitle();
            var envelope = JsonSerializer.Serialize(new { type = "sessionPath", path });
            _web.CoreWebView2?.PostWebMessageAsJson(envelope);
        }
        catch (Exception ex)
        {
            MessageBox.Show("保存工程失败: " + ex.Message, "MotionCraft", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
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
