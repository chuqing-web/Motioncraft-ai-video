/**
 * Multi-vendor LLM router (browser-side).
 * Keys come from host settings injected into the page.
 * Supports streaming via onDelta(textChunk).
 */

export async function chatCompletion({
  provider,
  settings,
  messages,
  temperature = 0.7,
  onDelta,
}) {
  const id = provider === 'auto' ? settings.activeProvider : provider;
  const cfg = settings.providers?.[id];
  if (!cfg?.apiKey) {
    const err = new Error('NO_KEY');
    err.code = 'NO_KEY';
    throw err;
  }

  if (id === 'anthropic') {
    return anthropicChat(cfg, messages, temperature, onDelta);
  }
  return openaiChat(cfg, messages, temperature, onDelta);
}

async function openaiChat(cfg, messages, temperature, onDelta) {
  const base = (cfg.baseUrl || '').replace(/\/$/, '');
  const url = `${base}/chat/completions`;
  const body = {
    model: cfg.model,
    temperature,
    messages,
    response_format: { type: 'json_object' },
  };

  if (typeof onDelta === 'function') {
    try {
      return await openaiStream(url, cfg.apiKey, body, onDelta);
    } catch (e) {
      // Some compatible gateways reject stream / json_object combo — fall back.
      if (e?.code === 'NO_STREAM') {
        const text = await openaiOnce(url, cfg.apiKey, body);
        await fakeStream(text, onDelta);
        return text;
      }
      throw e;
    }
  }
  return openaiOnce(url, cfg.apiKey, body);
}

async function openaiOnce(url, apiKey, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...body, stream: false }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function openaiStream(url, apiKey, body, onDelta) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const err = new Error(`LLM ${res.status}: ${await res.text()}`);
    err.code = 'NO_STREAM';
    throw err;
  }
  if (!res.body) {
    const err = new Error('no stream body');
    err.code = 'NO_STREAM';
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\n/);
    buffer = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const piece =
          json.choices?.[0]?.delta?.content ||
          json.choices?.[0]?.message?.content ||
          '';
        if (piece) {
          full += piece;
          onDelta(piece);
        }
      } catch {
        /* skip bad chunk */
      }
    }
  }

  if (!full) {
    const err = new Error('empty stream');
    err.code = 'NO_STREAM';
    throw err;
  }
  return full;
}

async function anthropicChat(cfg, messages, temperature, onDelta) {
  const system = messages.find((m) => m.role === 'system')?.content || '';
  const userMsgs = messages.filter((m) => m.role !== 'system');
  const base = (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  const url = `${base}/v1/messages`;
  const body = {
    model: cfg.model,
    max_tokens: 8192,
    temperature,
    system,
    messages: userMsgs.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  };

  if (typeof onDelta === 'function') {
    try {
      return await anthropicStream(url, cfg.apiKey, body, onDelta);
    } catch (e) {
      if (e?.code === 'NO_STREAM') {
        const text = await anthropicOnce(url, cfg.apiKey, body);
        await fakeStream(text, onDelta);
        return text;
      }
      throw e;
    }
  }
  return anthropicOnce(url, cfg.apiKey, body);
}

async function anthropicOnce(url, apiKey, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ ...body, stream: false }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.map((c) => c.text).join('\n') || '';
}

async function anthropicStream(url, apiKey, body, onDelta) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const err = new Error(`Anthropic ${res.status}: ${await res.text()}`);
    err.code = 'NO_STREAM';
    throw err;
  }
  if (!res.body) {
    const err = new Error('no stream body');
    err.code = 'NO_STREAM';
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\n/);
    buffer = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        const json = JSON.parse(data);
        if (json.type === 'content_block_delta' && json.delta?.text) {
          full += json.delta.text;
          onDelta(json.delta.text);
        } else if (json.type === 'content_block_start' && json.content_block?.text) {
          full += json.content_block.text;
          onDelta(json.content_block.text);
        }
      } catch {
        /* skip */
      }
    }
  }

  if (!full) {
    const err = new Error('empty anthropic stream');
    err.code = 'NO_STREAM';
    throw err;
  }
  return full;
}

async function fakeStream(text, onDelta) {
  const s = String(text || '');
  const step = 32;
  for (let i = 0; i < s.length; i += step) {
    onDelta(s.slice(i, i + step));
    await new Promise((r) => setTimeout(r, 0));
  }
}
