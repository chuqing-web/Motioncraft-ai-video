using System.Text.Json;

namespace MotionCraft.Host;

public sealed class SettingsForm : Form
{
    readonly AppSettings _settings;
    readonly ListBox _list = new() { Dock = DockStyle.Fill };
    readonly TextBox _label = new();
    readonly TextBox _baseUrl = new();
    readonly TextBox _model = new();
    readonly TextBox _apiKey = new() { UseSystemPasswordChar = true };
    readonly CheckBox _showKey = new() { Text = "显示密钥", AutoSize = true };
    readonly Label _status = new() { AutoSize = true, ForeColor = Color.DimGray };
    readonly Label _keyHint = new() { AutoSize = true, ForeColor = Color.Gray };
    readonly ComboBox _active = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    string? _selectedId;
    bool _keyDirty;
    bool _clearKey;
    bool _suspendList;

    public SettingsForm(AppSettings settings)
    {
        _settings = settings;
        Text = "API / 模型设置";
        Width = 740;
        Height = 540;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Segoe UI", 9.5f);

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 2,
            Padding = new Padding(12),
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 168));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));

        var left = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 0, 10, 0) };
        var leftTitle = new Label
        {
            Text = "厂商",
            Dock = DockStyle.Top,
            Height = 26,
            Font = new Font(Font, FontStyle.Bold),
        };
        left.Controls.Add(_list);
        left.Controls.Add(leftTitle);

        root.Controls.Add(left, 0, 0);
        root.Controls.Add(BuildEditor(), 1, 0);
        var bottom = BuildBottom();
        root.SetColumnSpan(bottom, 2);
        root.Controls.Add(bottom, 0, 1);
        Controls.Add(root);

        foreach (var id in _settings.Providers.Keys)
            _list.Items.Add(FormatItem(id));
        _active.Items.AddRange(_settings.Providers.Keys.Cast<object>().ToArray());
        _active.SelectedItem = _settings.ActiveProvider;
        if (_active.SelectedIndex < 0 && _active.Items.Count > 0) _active.SelectedIndex = 0;

        _list.SelectedIndexChanged += (_, _) => LoadSelected();
        if (_list.Items.Count > 0) _list.SelectedIndex = 0;

        _showKey.CheckedChanged += (_, _) => _apiKey.UseSystemPasswordChar = !_showKey.Checked;
        _apiKey.TextChanged += (_, _) =>
        {
            _keyDirty = true;
            _clearKey = false;
        };
    }

    string IdAt(int index)
    {
        var keys = _settings.Providers.Keys.ToList();
        return keys[Math.Clamp(index, 0, keys.Count - 1)];
    }

    string FormatItem(string id)
    {
        var has = _settings.Providers[id].HasKey;
        if (id == _selectedId && _clearKey) has = false;
        if (id == _selectedId && _keyDirty && _apiKey.Text.Length > 0) has = true;
        return has ? $"●  {id}" : $"○  {id}";
    }

    void RefreshList()
    {
        var sel = _list.SelectedIndex;
        _suspendList = true;
        _list.BeginUpdate();
        _list.Items.Clear();
        foreach (var id in _settings.Providers.Keys)
            _list.Items.Add(FormatItem(id));
        if (sel >= 0 && sel < _list.Items.Count) _list.SelectedIndex = sel;
        _list.EndUpdate();
        _suspendList = false;
    }

    Panel BuildEditor()
    {
        var p = new Panel { Dock = DockStyle.Fill };
        var tip = new Label
        {
            Dock = DockStyle.Top,
            Height = 56,
            Text = "API Key 使用 Windows DPAPI（当前用户）加密后写入本机配置文件。\n保存时：留空 = 保持原密钥；「清除密钥」= 删除已存密钥。",
        };

        var grid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 8,
            Padding = new Padding(0, 4, 0, 0),
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (var i = 0; i < 8; i++)
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, i is 3 or 4 ? 40 : 34));

        void AddRow(int r, string name, Control c)
        {
            grid.Controls.Add(new Label
            {
                Text = name,
                Anchor = AnchorStyles.Left,
                AutoSize = true,
                Margin = new Padding(0, 8, 0, 0),
            }, 0, r);
            c.Dock = DockStyle.Fill;
            grid.Controls.Add(c, 1, r);
        }

        AddRow(0, "显示名", _label);
        AddRow(1, "Base URL", _baseUrl);
        AddRow(2, "Model", _model);
        AddRow(3, "API Key", _apiKey);
        _keyHint.Margin = new Padding(0, 2, 0, 0);
        grid.Controls.Add(new Label(), 0, 4);
        grid.Controls.Add(_keyHint, 1, 4);

        var keyRow = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, AutoSize = true };
        var btnClear = new Button { Text = "清除密钥", AutoSize = true };
        btnClear.Click += (_, _) =>
        {
            _apiKey.Text = "";
            _keyDirty = true;
            _clearKey = true;
            _keyHint.Text = "将在保存后删除已加密密钥";
            _status.Text = "已标记清除";
            RefreshList();
        };
        var btnTest = new Button { Text = "测试连接", AutoSize = true };
        btnTest.Click += async (_, _) => await TestSelectedAsync();
        keyRow.Controls.Add(_showKey);
        keyRow.Controls.Add(btnClear);
        keyRow.Controls.Add(btnTest);
        grid.Controls.Add(new Label(), 0, 5);
        grid.Controls.Add(keyRow, 1, 5);

        AddRow(6, "默认厂商", _active);
        grid.Controls.Add(new Label { Text = "状态", Anchor = AnchorStyles.Left, AutoSize = true, Margin = new Padding(0, 8, 0, 0) }, 0, 7);
        _status.Dock = DockStyle.Fill;
        _status.Margin = new Padding(0, 8, 0, 0);
        grid.Controls.Add(_status, 1, 7);

        p.Controls.Add(grid);
        p.Controls.Add(tip);
        return p;
    }

    Panel BuildBottom()
    {
        var p = new Panel { Dock = DockStyle.Fill };
        var path = new Label
        {
            Text = AppSettings.SettingsPath,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.Gray,
            AutoEllipsis = true,
        };
        var save = new Button { Text = "保存", Width = 100, Height = 32 };
        var cancel = new Button { Text = "取消", Width = 100, Height = 32, DialogResult = DialogResult.Cancel };
        save.Click += (_, _) =>
        {
            CommitSelected();
            if (_active.SelectedItem is string ap) _settings.ActiveProvider = ap;
            _settings.Save();
            DialogResult = DialogResult.OK;
            Close();
        };
        var flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Right,
            Width = 230,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(0, 6, 0, 0),
        };
        flow.Controls.Add(save);
        flow.Controls.Add(cancel);
        p.Controls.Add(flow);
        p.Controls.Add(path);
        AcceptButton = save;
        CancelButton = cancel;
        return p;
    }

    void LoadSelected()
    {
        if (_suspendList) return;
        if (_selectedId != null) CommitSelected();
        if (_list.SelectedIndex < 0) return;
        var id = IdAt(_list.SelectedIndex);
        _selectedId = id;
        var cfg = _settings.Providers[id];
        _label.Text = cfg.Label;
        _baseUrl.Text = cfg.BaseUrl;
        _model.Text = cfg.Model;
        _keyDirty = false;
        _clearKey = false;
        _apiKey.Text = "";
        _keyHint.Text = cfg.HasKey
            ? $"已加密保存（{SecretProtector.Mask(cfg.ApiKey)}），留空则保持不变"
            : "尚未设置密钥";
        _status.Text = cfg.HasKey ? "密钥：DPAPI 加密存储" : "密钥：未设置";
        _status.ForeColor = Color.DimGray;
        RefreshList();
    }

    void CommitSelected()
    {
        if (_selectedId == null || !_settings.Providers.TryGetValue(_selectedId, out var cfg)) return;
        cfg.Label = _label.Text.Trim();
        cfg.BaseUrl = _baseUrl.Text.Trim();
        cfg.Model = _model.Text.Trim();
        if (!_keyDirty) return;
        if (_clearKey)
            cfg.ApiKey = "";
        else if (_apiKey.Text.Trim().Length > 0)
            cfg.ApiKey = _apiKey.Text.Trim();
    }

    async Task TestSelectedAsync()
    {
        CommitSelected();
        if (_selectedId == null) return;
        var cfg = _settings.Providers[_selectedId];
        var key = _keyDirty && !_clearKey && _apiKey.Text.Trim().Length > 0
            ? _apiKey.Text.Trim()
            : cfg.ApiKey;
        if (string.IsNullOrWhiteSpace(key))
        {
            _status.Text = "请先填写或保存 API Key";
            _status.ForeColor = Color.DarkOrange;
            return;
        }

        _status.Text = "测试中…";
        _status.ForeColor = Color.DimGray;
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            HttpResponseMessage res;
            if (_selectedId == "anthropic")
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, cfg.BaseUrl.TrimEnd('/') + "/v1/messages");
                req.Headers.Add("x-api-key", key);
                req.Headers.Add("anthropic-version", "2023-06-01");
                req.Content = new StringContent(
                    JsonSerializer.Serialize(new
                    {
                        model = cfg.Model,
                        max_tokens = 16,
                        messages = new[] { new { role = "user", content = "ping" } },
                    }),
                    System.Text.Encoding.UTF8,
                    "application/json");
                res = await http.SendAsync(req);
            }
            else
            {
                var baseUrl = cfg.BaseUrl.TrimEnd('/');
                var url = baseUrl.EndsWith("/v1", StringComparison.OrdinalIgnoreCase)
                    ? baseUrl + "/models"
                    : baseUrl + "/models";
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + key);
                res = await http.SendAsync(req);
            }

            var code = (int)res.StatusCode;
            if (res.IsSuccessStatusCode)
            {
                _status.Text = $"连接成功（{code}）";
                _status.ForeColor = Color.SeaGreen;
            }
            else if (code is 401 or 403)
            {
                _status.Text = $"密钥或权限无效（{code}）";
                _status.ForeColor = Color.Firebrick;
            }
            else
            {
                var body = await res.Content.ReadAsStringAsync();
                _status.Text = $"HTTP {code}: {(body.Length > 80 ? body[..80] + "…" : body)}";
                _status.ForeColor = Color.DarkOrange;
            }
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            _status.Text = "失败: " + (msg.Length > 100 ? msg[..100] + "…" : msg);
            _status.ForeColor = Color.Firebrick;
        }
    }
}
