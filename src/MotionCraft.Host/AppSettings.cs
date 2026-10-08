using System.Text.Json;
using System.Text.Json.Serialization;

namespace MotionCraft.Host;

public sealed class AppSettings
{
    public int BridgePort { get; set; } = 17865;
    public string ActiveProvider { get; set; } = "openai";

    /// <summary>In-memory plaintext keys. Never serialize this dictionary as-is to disk.</summary>
    [JsonIgnore]
    public Dictionary<string, ProviderConfig> Providers { get; set; } = DefaultProviders();

    static Dictionary<string, ProviderConfig> DefaultProviders() => new()
    {
        ["openai"] = new ProviderConfig { Label = "OpenAI", BaseUrl = "https://api.openai.com/v1", Model = "gpt-4o-mini" },
        ["anthropic"] = new ProviderConfig { Label = "Anthropic", BaseUrl = "https://api.anthropic.com", Model = "claude-3-5-haiku-latest" },
        ["doubao"] = new ProviderConfig { Label = "豆包 / 火山方舟", BaseUrl = "https://ark.cn-beijing.volces.com/api/v3", Model = "ep-xxxx" },
        ["deepseek"] = new ProviderConfig { Label = "DeepSeek", BaseUrl = "https://api.deepseek.com/v1", Model = "deepseek-chat" },
        ["custom"] = new ProviderConfig { Label = "自定义 OpenAI 兼容", BaseUrl = "http://127.0.0.1:11434/v1", Model = "llama3" },
    };

    static string FilePath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MotionCraft",
            "settings.json");

    public static AppSettings Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return new AppSettings();
            var dto = JsonSerializer.Deserialize<SettingsFileDto>(File.ReadAllText(FilePath));
            if (dto == null) return new AppSettings();

            var settings = new AppSettings
            {
                BridgePort = dto.BridgePort,
                ActiveProvider = string.IsNullOrWhiteSpace(dto.ActiveProvider) ? "openai" : dto.ActiveProvider,
                Providers = DefaultProviders(),
            };

            if (dto.Providers != null)
            {
                foreach (var (id, p) in dto.Providers)
                {
                    if (!settings.Providers.TryGetValue(id, out var cfg))
                    {
                        cfg = new ProviderConfig { Label = id };
                        settings.Providers[id] = cfg;
                    }
                    if (!string.IsNullOrWhiteSpace(p.Label)) cfg.Label = p.Label;
                    if (!string.IsNullOrWhiteSpace(p.BaseUrl)) cfg.BaseUrl = p.BaseUrl;
                    if (!string.IsNullOrWhiteSpace(p.Model)) cfg.Model = p.Model;

                    // Prefer encrypted field; migrate legacy plaintext ApiKey once.
                    if (!string.IsNullOrEmpty(p.ApiKeyProtected))
                        cfg.ApiKey = SecretProtector.Unprotect(p.ApiKeyProtected);
                    else if (!string.IsNullOrEmpty(p.ApiKey))
                        cfg.ApiKey = SecretProtector.IsProtected(p.ApiKey)
                            ? SecretProtector.Unprotect(p.ApiKey)
                            : p.ApiKey;
                }
            }

            // Re-save to migrate any plaintext keys to DPAPI immediately
            if (dto.Providers?.Values.Any(p =>
                    !string.IsNullOrEmpty(p.ApiKey) &&
                    string.IsNullOrEmpty(p.ApiKeyProtected) &&
                    !SecretProtector.IsProtected(p.ApiKey)) == true)
            {
                settings.Save();
            }

            return settings;
        }
        catch
        {
            return new AppSettings();
        }
    }

    public void Save()
    {
        var dir = Path.GetDirectoryName(FilePath)!;
        Directory.CreateDirectory(dir);

        var dto = new SettingsFileDto
        {
            BridgePort = BridgePort,
            ActiveProvider = ActiveProvider,
            Providers = Providers.ToDictionary(
                kv => kv.Key,
                kv => new ProviderFileDto
                {
                    Label = kv.Value.Label,
                    BaseUrl = kv.Value.BaseUrl,
                    Model = kv.Value.Model,
                    // Disk: only encrypted blob — never plaintext
                    ApiKeyProtected = string.IsNullOrEmpty(kv.Value.ApiKey)
                        ? ""
                        : SecretProtector.Protect(kv.Value.ApiKey),
                    ApiKey = null,
                }),
        };

        var json = JsonSerializer.Serialize(dto, new JsonSerializerOptions
        {
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        });
        File.WriteAllText(FilePath, json);
    }

    public static string SettingsPath => FilePath;
}

public sealed class ProviderConfig
{
    public string Label { get; set; } = "";
    public string BaseUrl { get; set; } = "";
    public string Model { get; set; } = "";
    /// <summary>Plaintext in memory only.</summary>
    public string ApiKey { get; set; } = "";
    public bool HasKey => !string.IsNullOrWhiteSpace(ApiKey);
}

sealed class SettingsFileDto
{
    public int BridgePort { get; set; } = 17865;
    public string ActiveProvider { get; set; } = "openai";
    public Dictionary<string, ProviderFileDto>? Providers { get; set; }
}

sealed class ProviderFileDto
{
    public string? Label { get; set; }
    public string? BaseUrl { get; set; }
    public string? Model { get; set; }
    /// <summary>DPAPI ciphertext (preferred).</summary>
    public string? ApiKeyProtected { get; set; }
    /// <summary>Legacy plaintext — migrated away on load.</summary>
    public string? ApiKey { get; set; }
}
