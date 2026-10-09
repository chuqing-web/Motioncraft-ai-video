using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace MotionCraft.Host;

/// <summary>
/// Encrypted single-file project format (.vd). Built-in key — obscurity only, not strong DRM.
/// Layout: MCVD(4) | ver(1) | nonce(12) | tag(16) | ciphertext
/// </summary>
public static class ProjectVault
{
    public const string Extension = ".vd";
    public const string FileFilter = "MotionCraft 工程 (*.vd)|*.vd|所有文件 (*.*)|*.*";
    const byte Version = 1;
    static readonly byte[] Magic = "MCVD"u8.ToArray();
    static readonly byte[] Key = SHA256.HashData(Encoding.UTF8.GetBytes("MotionCraft.ProjectVault.v1.BuiltInKey"));

    public static string ProjectDir()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "project");
        Directory.CreateDirectory(dir);
        return dir;
    }

    static readonly JsonSerializerOptions JsonOpts = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        WriteIndented = false,
    };

    public static string EmptyProjectJson(string name = "未命名项目")
    {
        var now = DateTime.UtcNow.ToString("o");
        return JsonSerializer.Serialize(new
        {
            version = 1,
            name,
            createdAt = now,
            updatedAt = now,
            settings = new { width = 1280, height = 720, fps = 30, duration = 12, durationCap = 600 },
            assets = Array.Empty<object>(),
            nodes = Array.Empty<object>(),
            edges = Array.Empty<object>(),
            timeline = new { tracks = Array.Empty<object>() },
        }, JsonOpts);
    }

    /// <summary>Validate decrypted UTF-8 JSON looks like a MotionCraft project.</summary>
    public static string NormalizeAndValidate(string projectJson)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(projectJson);
        using var doc = JsonDocument.Parse(projectJson);
        if (doc.RootElement.ValueKind != JsonValueKind.Object)
            throw new InvalidDataException("工程内容不是 JSON 对象。");

        // Re-serialize to compact canonical UTF-8 (strips BOM / weird whitespace)
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
            doc.RootElement.WriteTo(writer);
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    public static void Save(string path, string projectJson)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var normalized = NormalizeAndValidate(projectJson);

        var plain = Encoding.UTF8.GetBytes(normalized);
        var nonce = new byte[12];
        RandomNumberGenerator.Fill(nonce);
        var cipher = new byte[plain.Length];
        var tag = new byte[16];

        using (var aes = new AesGcm(Key, tag.Length))
            aes.Encrypt(nonce, plain, cipher, tag);

        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        // Atomic write: temp beside target, then replace (avoids truncated .vd on crash)
        var tmp = path + ".tmp";
        var bak = path + ".bak";
        try
        {
            using (var fs = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                fs.Write(Magic);
                fs.WriteByte(Version);
                fs.Write(nonce);
                fs.Write(tag);
                fs.Write(cipher);
                fs.Flush(true);
            }

            if (File.Exists(path))
                File.Replace(tmp, path, bak, ignoreMetadataErrors: true);
            else
                File.Move(tmp, path);

            try { if (File.Exists(bak)) File.Delete(bak); } catch { /* keep bak if locked */ }
        }
        finally
        {
            try { if (File.Exists(tmp)) File.Delete(tmp); } catch { /* ignore */ }
        }
    }

    public static string Load(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException("工程文件不存在。", path);

        var bytes = File.ReadAllBytes(path);
        if (bytes.Length < 4 + 1 + 12 + 16)
            throw new InvalidDataException("不是有效的 .vd 工程文件（过短）。");
        if (!bytes.AsSpan(0, 4).SequenceEqual(Magic))
            throw new InvalidDataException("文件头不是 MCVD（可能不是 .vd 或已损坏）。");
        if (bytes[4] != Version)
            throw new InvalidDataException($"不支持的 .vd 版本: {bytes[4]}");

        var nonce = bytes.AsSpan(5, 12);
        var tag = bytes.AsSpan(17, 16);
        var cipher = bytes.AsSpan(33);
        if (cipher.Length == 0)
            throw new InvalidDataException("工程密文为空。");

        var plain = new byte[cipher.Length];
        try
        {
            using var aes = new AesGcm(Key, 16);
            aes.Decrypt(nonce, cipher, tag, plain);
        }
        catch (CryptographicException ex)
        {
            // Try .bak if present (autosave race / partial write recovery)
            var bak = path + ".bak";
            if (File.Exists(bak) && !string.Equals(path, bak, StringComparison.OrdinalIgnoreCase))
            {
                try { return Load(bak); }
                catch { /* fall through */ }
            }
            throw new InvalidDataException("工程文件解密失败（可能已损坏或非本应用生成）。", ex);
        }

        var text = Encoding.UTF8.GetString(plain).TrimStart('\uFEFF');
        try
        {
            return NormalizeAndValidate(text);
        }
        catch (Exception ex) when (ex is JsonException or InvalidDataException)
        {
            throw new InvalidDataException("解密成功但工程 JSON 无效。", ex);
        }
    }

    public static string SuggestFileName(string? projectName)
    {
        var raw = string.IsNullOrWhiteSpace(projectName) ? "未命名项目" : projectName.Trim();
        foreach (var c in Path.GetInvalidFileNameChars())
            raw = raw.Replace(c, '_');
        if (string.IsNullOrWhiteSpace(raw)) raw = "未命名项目";
        return raw + Extension;
    }
}
