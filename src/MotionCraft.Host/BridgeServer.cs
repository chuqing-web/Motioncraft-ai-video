using System.Net;
using System.Text;
using System.Text.Json;

namespace MotionCraft.Host;

/// <summary>
/// Local HTTP bridge so MCP / external tools can drive the studio.
/// </summary>
public sealed class BridgeServer : IDisposable
{
    readonly HttpListener _listener = new();
    readonly MainForm _form;
    CancellationTokenSource? _cts;
    Task? _loop;

    public int Port { get; private set; }
    public bool IsRunning => _listener.IsListening;

    public BridgeServer(MainForm form) => _form = form;

    public void Start(int preferredPort)
    {
        Exception? last = null;
        for (var p = preferredPort; p < preferredPort + 20; p++)
        {
            try
            {
                _listener.Prefixes.Clear();
                _listener.Prefixes.Add($"http://127.0.0.1:{p}/");
                _listener.Start();
                Port = p;
                last = null;
                break;
            }
            catch (Exception ex)
            {
                last = ex;
            }
        }
        if (last != null && !_listener.IsListening)
            throw last;

        _cts = new CancellationTokenSource();
        _loop = Task.Run(() => AcceptLoop(_cts.Token));
    }

    async Task AcceptLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _listener.IsListening)
        {
            HttpListenerContext ctx;
            try
            {
                ctx = await _listener.GetContextAsync().WaitAsync(ct);
            }
            catch (OperationCanceledException) { break; }
            catch { continue; }

            _ = Task.Run(() => Handle(ctx));
        }
    }

    async Task Handle(HttpListenerContext ctx)
    {
        try
        {
            AddCors(ctx.Response);
            if (ctx.Request.HttpMethod == "OPTIONS")
            {
                ctx.Response.StatusCode = 204;
                ctx.Response.Close();
                return;
            }

            var path = ctx.Request.Url?.AbsolutePath.TrimEnd('/') ?? "";
            var method = ctx.Request.HttpMethod.ToUpperInvariant();

            if (method == "GET" && path is "/health" or "")
            {
                await WriteJson(ctx, new { ok = true, app = "MotionCraft", port = Port });
                return;
            }

            if (method == "GET" && path == "/settings")
            {
                await WriteJson(ctx, _form.GetPublicSettings());
                return;
            }

            if (method == "GET" && path is "/ai-progress" or "/ai-stream")
            {
                await WriteJson(ctx, _form.GetAiProgress());
                return;
            }

            if (method == "POST" && path == "/settings")
            {
                var body = await ReadBody(ctx.Request);
                _form.ApplySettingsJson(body);
                await WriteJson(ctx, new { ok = true });
                return;
            }

            if (method == "GET" && path == "/project")
            {
                var project = await _form.GetProjectJsonAsync();
                await WriteText(ctx, project, "application/json");
                return;
            }

            if (method == "POST" && path == "/project")
            {
                var body = await ReadBody(ctx.Request);
                await _form.SetProjectJsonAsync(body);
                await WriteJson(ctx, new { ok = true });
                return;
            }

            if (method == "POST" && path == "/command")
            {
                var body = await ReadBody(ctx.Request);
                var result = await _form.RunCommandAsync(body);
                await WriteText(ctx, result, "application/json");
                return;
            }

            ctx.Response.StatusCode = 404;
            await WriteJson(ctx, new { error = "not found", path });
        }
        catch (Exception ex)
        {
            try
            {
                ctx.Response.StatusCode = 500;
                await WriteJson(ctx, new { error = ex.Message });
            }
            catch { /* ignore */ }
        }
    }

    static void AddCors(HttpListenerResponse res)
    {
        res.Headers["Access-Control-Allow-Origin"] = "*";
        res.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        res.Headers["Access-Control-Allow-Headers"] = "Content-Type";
    }

    static async Task<string> ReadBody(HttpListenerRequest req)
    {
        using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
        return await reader.ReadToEndAsync();
    }

    static async Task WriteJson(HttpListenerContext ctx, object obj)
    {
        var json = JsonSerializer.Serialize(obj);
        await WriteText(ctx, json, "application/json");
    }

    static async Task WriteText(HttpListenerContext ctx, string text, string contentType)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        ctx.Response.ContentType = contentType + "; charset=utf-8";
        ctx.Response.ContentLength64 = bytes.Length;
        await ctx.Response.OutputStream.WriteAsync(bytes);
        ctx.Response.Close();
    }

    public void Dispose()
    {
        try { _cts?.Cancel(); } catch { /* ignore */ }
        try { _listener.Stop(); } catch { /* ignore */ }
        try { _listener.Close(); } catch { /* ignore */ }
    }
}
