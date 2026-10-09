#!/usr/bin/env node
/**
 * MotionCraft MCP Server — bridges Cursor / 豆包 / other MCP clients
 * to the running AI Motion Studio HTTP bridge.
 * AI tools poll /ai-progress for live stream text while the command runs.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const BRIDGE = (process.env.MOTIONCRAFT_BRIDGE || 'http://127.0.0.1:17865').replace(/\/$/, '');

const AI_TOOLS = new Set([
  'run_director',
  'run_scene_director',
  'run_character_director',
  'run_chart_director',
  'run_effect_director',
  'run_comic_director',
  'run_comic_shot_director',
]);

async function bridge(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BRIDGE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

async function command(action, extra = {}) {
  return bridge('/command', { method: 'POST', body: { action, ...extra } });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run a long AI command while polling live stream from the MotionCraft UI.
 * Sends MCP progress notifications when progressToken is present.
 */
async function commandWithStream(action, args, { progressToken, sendNotification } = {}) {
  let lastLen = 0;
  let lastStatus = '';
  let latestStream = null;

  const cmdPromise = command(action, args).then(
    (r) => ({ ok: true, result: r }),
    (e) => ({ ok: false, error: e }),
  );

  while (true) {
    try {
      const prog = await bridge('/ai-progress');
      latestStream = prog;
      const text = String(prog?.text || '');
      const status = String(prog?.status || '');
      const active = !!prog?.active;

      if (status && status !== lastStatus) {
        lastStatus = status;
        if (progressToken != null && sendNotification) {
          await sendNotification({
            method: 'notifications/progress',
            params: {
              progressToken,
              progress: active ? Math.min(0.95, 0.1 + text.length / 8000) : 1,
              total: 1,
              message: `${prog?.title || action}: ${status} (${text.length} chars)`,
            },
          }).catch(() => {});
        }
      } else if (text.length > lastLen + 80 && progressToken != null && sendNotification) {
        lastLen = text.length;
        const tail = text.slice(-160).replace(/\s+/g, ' ');
        await sendNotification({
          method: 'notifications/progress',
          params: {
            progressToken,
            progress: Math.min(0.95, 0.15 + text.length / 8000),
            total: 1,
            message: `streaming… ${text.length} chars · …${tail}`,
          },
        }).catch(() => {});
      }
    } catch {
      /* bridge busy / not ready */
    }

    const raced = await Promise.race([
      cmdPromise.then((v) => ({ done: true, v })),
      sleep(280).then(() => ({ done: false })),
    ]);
    if (raced.done) {
      if (!raced.v.ok) throw raced.v.error;
      return { result: raced.v.result, stream: latestStream };
    }
  }
}

function formatAiToolResult(action, result, stream) {
  const parts = [];
  parts.push(`## ${action} 完成`);
  parts.push('```json');
  parts.push(JSON.stringify(result, null, 2));
  parts.push('```');
  if (stream?.text) {
    parts.push('');
    parts.push('## 模型流式输出（节选）');
    parts.push('```');
    const t = String(stream.text);
    parts.push(t.length > 6000 ? t.slice(0, 6000) + '\n…(截断)' : t);
    parts.push('```');
    if (stream.status) parts.push(`状态: ${stream.status}`);
  }
  return parts.join('\n');
}

const server = new Server(
  { name: 'motioncraft', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'health',
      description: 'Check MotionCraft bridge connectivity',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'ai_progress',
      description: 'Get live AI stream snapshot from MotionCraft UI (title/status/text)',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_project',
      description: 'Get the current MotionCraft project JSON',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'set_project',
      description: 'Replace the entire project JSON',
      inputSchema: {
        type: 'object',
        properties: { project: { type: 'object' } },
        required: ['project'],
      },
    },
    {
      name: 'list_nodes',
      description: 'List nodes on the storyboard canvas',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'add_node',
      description:
        'Add a node (scene|text|image|video|character|chart|effect|audio|narration|camera|ai|comic_page|comic_panel|comic_shot)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          props: { type: 'object' },
        },
        required: ['type'],
      },
    },
    {
      name: 'connect',
      description: 'Connect two nodes (sequence|attach|contain|compose)',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          kind: { type: 'string', enum: ['sequence', 'attach', 'contain', 'compose'] },
        },
        required: ['from', 'to'],
      },
    },
    {
      name: 'update_props',
      description: 'Update properties of a node by id',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          props: { type: 'object' },
        },
        required: ['id', 'props'],
      },
    },
    {
      name: 'run_director',
      description:
        'Run AI director (streaming in MotionCraft UI + progress). Builds/replaces node graph from a prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          duration: { type: 'number' },
          provider: { type: 'string' },
          replace: { type: 'boolean' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'run_scene_director',
      description: 'AI-generate a single scene (streaming). Injects prev/next continuity.',
      inputSchema: {
        type: 'object',
        properties: {
          sceneId: { type: 'string' },
          prompt: { type: 'string' },
          provider: { type: 'string' },
        },
        required: ['sceneId'],
      },
    },
    {
      name: 'run_character_director',
      description: 'AI-generate character HTML/CSS/JS (streaming)',
      inputSchema: {
        type: 'object',
        properties: {
          characterId: { type: 'string' },
          prompt: { type: 'string' },
          provider: { type: 'string' },
        },
        required: ['characterId'],
      },
    },
    {
      name: 'run_chart_director',
      description: 'AI-generate chart HTML/CSS/JS (streaming)',
      inputSchema: {
        type: 'object',
        properties: {
          chartId: { type: 'string' },
          prompt: { type: 'string' },
          provider: { type: 'string' },
        },
        required: ['chartId'],
      },
    },
    {
      name: 'run_effect_director',
      description: 'AI-generate effect HTML/CSS/JS (streaming)',
      inputSchema: {
        type: 'object',
        properties: {
          effectId: { type: 'string' },
          prompt: { type: 'string' },
          provider: { type: 'string' },
        },
        required: ['effectId'],
      },
    },
    {
      name: 'run_comic_director',
      description:
        'Run comic director: outline pages/panels then stream HTML/CSS/JS panel-by-panel (page order).',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          provider: { type: 'string' },
          replace: { type: 'boolean' },
          continueFromPending: { type: 'boolean' },
          pageHint: { type: 'string' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'run_comic_shot_director',
      description: 'AI-regenerate a single comic_shot with neighbor panel/page continuity.',
      inputSchema: {
        type: 'object',
        properties: {
          shotId: { type: 'string' },
          prompt: { type: 'string' },
          provider: { type: 'string' },
        },
        required: ['shotId'],
      },
    },
    {
      name: 'preview',
      description: 'Start preview playback of the HTML-composed film',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'export_video',
      description: 'Export the composed animation via MediaRecorder (MP4 if supported else WebM)',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'export_comic',
      description: 'Export comic pages as PNG sequence or PDF',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['png', 'pdf'] },
          pageId: { type: 'string' },
        },
      },
    },
  ],
}));

async function notifyProgress(progressToken, progress, message) {
  if (progressToken == null) return;
  try {
    await server.notification({
      method: 'notifications/progress',
      params: { progressToken, progress, total: 1, message },
    });
  } catch {
    /* client may not support progress */
  }
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments || {};
  const progressToken = req.params._meta?.progressToken;
  try {
    if (name === 'ai_progress') {
      const prog = await bridge('/ai-progress');
      return {
        content: [{ type: 'text', text: JSON.stringify(prog, null, 2) }],
      };
    }

    if (AI_TOOLS.has(name)) {
      const { result, stream } = await commandWithStream(name, args, {
        progressToken,
        sendNotification: async (n) => {
          if (n?.method === 'notifications/progress') {
            await notifyProgress(
              n.params.progressToken,
              n.params.progress,
              n.params.message,
            );
          }
        },
      });
      return {
        content: [{ type: 'text', text: formatAiToolResult(name, result, stream || result?.stream) }],
      };
    }

    let result;
    switch (name) {
      case 'health':
        result = await bridge('/health');
        break;
      case 'get_project':
        result = await bridge('/project');
        break;
      case 'set_project':
        result = await bridge('/project', { method: 'POST', body: args.project });
        break;
      case 'list_nodes':
        result = await command('list_nodes');
        break;
      case 'add_node':
        result = await command('add_node', args);
        break;
      case 'connect':
        result = await command('connect', args);
        break;
      case 'update_props':
        result = await command('update_props', args);
        break;
      case 'preview':
        result = await command('preview');
        break;
      case 'export_video':
        result = await command('export_video');
        break;
      case 'export_comic':
        result = await command('export_comic', args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `MotionCraft MCP error: ${e.message}\nIs the MotionCraft.exe running? Bridge=${BRIDGE}`,
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
