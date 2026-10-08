using System.Security.Cryptography;
using System.Text;

namespace MotionCraft.Host;

/// <summary>
/// Windows DPAPI (CurrentUser) — API keys encrypted at rest for the logged-in user only.
/// </summary>
public static class SecretProtector
{
    const string Prefix = "dpapi:";

    public static string Protect(string? plain)
    {
        if (string.IsNullOrEmpty(plain)) return "";
        if (plain.StartsWith(Prefix, StringComparison.Ordinal)) return plain;
        var bytes = Encoding.UTF8.GetBytes(plain);
        var protectedBytes = ProtectedData.Protect(bytes, OptionalEntropy(), DataProtectionScope.CurrentUser);
        return Prefix + Convert.ToBase64String(protectedBytes);
    }

    public static string Unprotect(string? stored)
    {
        if (string.IsNullOrEmpty(stored)) return "";
        if (!stored.StartsWith(Prefix, StringComparison.Ordinal))
        {
            // Legacy plaintext migration
            return stored;
        }
        try
        {
            var b64 = stored[Prefix.Length..];
            var protectedBytes = Convert.FromBase64String(b64);
            var bytes = ProtectedData.Unprotect(protectedBytes, OptionalEntropy(), DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return "";
        }
    }

    public static bool IsProtected(string? stored) =>
        !string.IsNullOrEmpty(stored) && stored.StartsWith(Prefix, StringComparison.Ordinal);

    public static string Mask(string? plain)
    {
        if (string.IsNullOrEmpty(plain)) return "";
        if (plain.Length <= 4) return "••••";
        return "••••••••" + plain[^4..];
    }

    static byte[] OptionalEntropy() => Encoding.UTF8.GetBytes("MotionCraft.ApiKey.v1");
}
