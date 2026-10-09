/**
 * Compile model-authored IIFE → { setup, draw }.
 * Shared by scenes and character overlays.
 */

/** Strip markdown fences / BOM that models often wrap around js fields. */
export function sanitizeJsSource(jsSource) {
  let s = String(jsSource ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!s) return '';

  const fenced = s.match(/^```(?:javascript|js|ts)?\s*\r?\n([\s\S]*?)\r?\n?```$/i);
  if (fenced) return fenced[1].trim();

  // Opening fence only / trailing fence remnant
  s = s
    .replace(/^```(?:javascript|js|ts)?\s*\r?\n?/i, '')
    .replace(/\r?\n?```$/i, '')
    .trim();
  return s;
}

/** Cheap compile probe used only by local repair (no policy checks). */
function probeCompile(code) {
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${code});`)();
    let runtime = value;
    if (typeof value === 'function') runtime = value();
    if (!runtime || typeof runtime !== 'object') return false;
    if (typeof runtime.draw !== 'function') return false;
    if (runtime.setup != null && typeof runtime.setup !== 'function') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Deterministic shape/punctuation fixes for tiny model mistakes.
 * Host compiles as: Function('"use strict"; return (' + js + ');')()
 */
function applyShapeRepairs(jsSource) {
  let s = sanitizeJsSource(jsSource);
  if (!s) return s;

  // Fullwidth / Chinese punctuation
  s = s.replace(/；/g, ';').replace(/：/g, ':').replace(/，/g, ',');
  s = s.replace(/（/g, '(').replace(/）/g, ')').replace(/【/g, '[').replace(/】/g, ']');
  s = s.replace(/“|”/g, '"').replace(/‘|’/g, "'");

  // Trailing commas before } or ] (JSON-ish habits)
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Triple-close "} }});})()" (extra } before spurious )) → "} };})()"
  // $1 is the object } ; replacement must be "$1;})()" (not "$1};})()" — that adds a brace)
  s = s.replace(/(\})\s*\}\s*\)\s*;?\s*\}\s*\)\s*\(\s*\)\s*;?\s*$/, '$1;})()');

  // Classic "} });})()" — TWO braces then spurious ) → "} };})()"
  // Require a non-} before the pair so "} }});})()" is left to the triple rule
  s = s.replace(/([^}])(\}\s*\})\s*\)\s*;(\s*\}\s*\)\s*\(\s*\))\s*$/, '$1$2;$3');
  s = s.replace(/([^}])(\}\s*\})\s*\)(\s*\}\s*\)\s*\(\s*\))\s*$/, '$1$2;$3');

  // "} ); })()" — draw closed, spurious ), missing object } → "} }; })()"
  // Lookbehind: do not match when this } is already the second of }}
  // Replacement "$1};$3$4" with leading } → "} };})()" (the }; after $1 is } + ;)
  s = s.replace(/(?<!\})\}(\s*)\)(\s*);(\s*)(\}\s*\)\s*\(\s*\))\s*$/, '}$1};$3$4');

  // )(); → )()
  s = s.replace(/\)\s*\(\s*\)\s*;+\s*$/, ')()');
  // double ;; before close
  s = s.replace(/(\})\s*;\s*;+(\s*\}\s*\)\s*\(\s*\))\s*$/, '$1;$2');
  // "} })()" → "}; })()" (object terminator)
  s = s.replace(/\}(\s*)\}(\s*)\)(\s*)\((\s*)\)\s*$/, '};$1}$2)$3($4)');

  // Bare object → wrap IIFE
  if (/^\s*\{[\s\S]*\}\s*$/.test(s) && !/^\s*\(\s*function/.test(s)) {
    s = `(function(){ return ${s.trim()}; })()`;
  }

  // Missing outer call: (function(){...})  → (function(){...})()
  if (/^\s*\(\s*function[\s\S]*\}\s*\)\s*$/.test(s) && !/\)\s*\(\s*\)\s*$/.test(s)) {
    s = s.replace(/\)\s*$/, ')()');
  }

  // Missing closing )() for (function(){ return {...}; }
  if (/^\s*\(\s*function[\s\S]*\}\s*;\s*$/.test(s)) {
    s = s.replace(/;\s*$/, ';})()');
  } else if (/^\s*\(\s*function[\s\S]*\}\s*$/.test(s) && !/\)\s*\(\s*\)\s*$/.test(s)) {
    s = `${s}})()`;
  }

  s = ensureSeedHelper(s);
  s = neutralizeBadAppendChild(s);
  return s;
}

/**
 * Models often call seed(i) after being told to avoid Math.random, but forget to define it
 * — or bind seed to a number. Inject a real function seed() when needed.
 */
function ensureSeedHelper(jsSource) {
  let s = String(jsSource || '');
  if (!s || !/\bseed\s*\(/.test(s)) return s;

  // Remove non-function seed bindings that make "seed is not a function"
  s = s.replace(/(?:const|let|var)\s+seed\s*=\s*(?!function\b)(?!\([^)]*\)\s*=>)[^;]+;?/g, '');

  if (
    /function\s+seed\s*\(/.test(s) ||
    /(?:const|let|var)\s+seed\s*=\s*function\b/.test(s) ||
    /(?:const|let|var)\s+seed\s*=\s*\([^)]*\)\s*=>/.test(s)
  ) {
    return s;
  }

  const helper =
    'function seed(n){var x=Math.sin((Number(n)||0)*999)*10000;return x-Math.floor(x);}';

  if (/^\s*\(\s*function\b/.test(s)) {
    return s.replace(/(\(\s*function\b[^\{]*\{)/, `$1${helper}`);
  }
  return `${helper}${s}`;
}

/**
 * Common model mistake: root.appendChild(string | props.html).
 * Replace with a real Node so dry-run / preview don't hard-fail on TypeError.
 */
function neutralizeBadAppendChild(jsSource) {
  let s = String(jsSource || '');
  if (!s || !/\.appendChild\s*\(/.test(s)) return s;

  // appendChild("..." | '...' | `...`)
  s = s.replace(
    /\.appendChild\s*\(\s*(['"`])(?:\\.|(?!\1)[\s\S])*?\1\s*\)/g,
    '.appendChild(document.createElement("div"))',
  );
  // appendChild(props.html) / appendChild(api.props.html) / appendChild(html)
  s = s.replace(
    /\.appendChild\s*\(\s*(?:(?:api\.)?props\.(?:html|css|title|text)|html|css)\s*\)/g,
    '.appendChild(document.createElement("div"))',
  );
  return s;
}

/** Skip strings/comments; returns next index after skip, or i unchanged. */
function skipJsTrivia(s, i) {
  const ch = s[i];
  const next = s[i + 1];
  if (ch === '/' && next === '/') {
    i += 2;
    while (i < s.length && s[i] !== '\n') i += 1;
    return i;
  }
  if (ch === '/' && next === '*') {
    i += 2;
    while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i += 1;
    return Math.min(s.length, i + 2);
  }
  if (ch === '"' || ch === "'" || ch === '`') {
    const q = ch;
    i += 1;
    while (i < s.length) {
      if (s[i] === '\\') {
        i += 2;
        continue;
      }
      if (s[i] === q) return i + 1;
      i += 1;
    }
    return i;
  }
  return i;
}

/** Stack walk: openers push expected closers. */
function scanCloserStack(s) {
  const stack = []; // expected closers
  const openOf = { '(': ')', '{': '}', '[': ']' };
  let i = 0;
  while (i < s.length) {
    const j = skipJsTrivia(s, i);
    if (j !== i) {
      i = j;
      continue;
    }
    const ch = s[i];
    if (ch === '(' || ch === '{' || ch === '[') stack.push(openOf[ch]);
    else if (ch === ')' || ch === '}' || ch === ']') {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
      // mismatch: leave stack as-is (extra close ignored for EOF append)
    }
    i += 1;
  }
  return stack;
}

/**
 * If locator finds one extra close paren/brace (or classic bad IIFE end), delete that char.
 */
function repairByDeletingExtraClose(jsSource) {
  const loc = locateJsBracketIssue(jsSource);
  if (!loc) return null;
  if (loc.kind !== 'extra-close' && loc.kind !== 'bad-iife-end') return null;
  if (loc.char !== ')' && loc.char !== '}' && loc.char !== ']') return null;
  return jsSource.slice(0, loc.index) + jsSource.slice(loc.index + 1);
}

/**
 * Engine often says Unexpected token ')' when a '}' is missing before that ')'.
 * Insert the expected closer once at the first mismatch close.
 */
function repairByInsertingMissingBeforeMismatch(jsSource) {
  const s = jsSource;
  const stack = []; // { expected, openIndex }
  const openOf = { '(': ')', '{': '}', '[': ']' };
  let i = 0;
  while (i < s.length) {
    const j = skipJsTrivia(s, i);
    if (j !== i) {
      i = j;
      continue;
    }
    const ch = s[i];
    if (ch === '(' || ch === '{' || ch === '[') {
      stack.push({ expected: openOf[ch], openIndex: i });
    } else if (ch === ')' || ch === '}' || ch === ']') {
      const top = stack[stack.length - 1];
      if (!top) {
        // leading extra close — delete instead (handled elsewhere)
        return null;
      }
      if (top.expected === ch) {
        stack.pop();
      } else {
        // Insert what we expected before this unexpected closer
        // e.g. expect '}' but see ')' → insert '}'
        return s.slice(0, i) + top.expected + s.slice(i);
      }
    }
    i += 1;
  }
  return null;
}

/**
 * If locator finds unclosed opener near end, try appending the expected closer(s) + IIFE call.
 */
function repairByAppendingClosers(jsSource) {
  const loc = locateJsBracketIssue(jsSource);
  // Also run when kind is null but stack non-empty, or unclosed
  const stack = scanCloserStack(jsSource);
  if (!stack.length) {
    if (!loc || loc.kind !== 'unclosed') return null;
  }
  if (stack.length > 8) return null;

  let s = jsSource;
  const need = stack.length ? [...stack].reverse() : loc?.expected ? [loc.expected] : [];
  if (!need.length) return null;

  let suffix = need.join('');
  const trimEnd = s.replace(/\s+$/, '');
  // If still inside expressions and first closer is }, add ; so `return { ... }; }`
  if (need[0] === '}' && /[)\w"'`]$/.test(trimEnd) && !/[;}]$/.test(trimEnd)) {
    suffix = ';' + suffix;
  }

  s = s + suffix;

  // Ensure IIFE invocation
  if (/^\s*\(\s*function/.test(s) && !/\)\s*\(\s*\)\s*$/.test(s)) {
    if (/\)\s*$/.test(s)) s = s.replace(/\)\s*$/, ')()');
    else s += ')()';
  }
  return s;
}

/** Insert `;` before `})()` / `} )()` when model forgot object terminator. */
function repairMissingSemicolonBeforeClose(jsSource) {
  let s = jsSource;
  const before = s;
  // `} }` before `)()` → `}; }`
  s = s.replace(/\}(\s*)\}(\s*)\)(\s*)\((\s*)\)\s*$/, '};$1}$2)$3($4)');
  // lone `})()` after non-semicolon → `;})()`
  s = s.replace(/([^;\s])\s*(\}\s*\)\s*\(\s*\))\s*$/, '$1;$2');
  return s !== before ? s : null;
}

/**
 * Build ordered repair candidates (original first). First compiling candidate wins upstream.
 */
export function collectJsRepairCandidates(jsSource) {
  const raw = sanitizeJsSource(jsSource);
  if (!raw) return [];

  const out = [];
  const seen = new Set();
  const push = (s) => {
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  // Prefer shaped first so seed inject / appendChild soften persist even when
  // dry-run is skipped (no document) — raw must not win with broken helpers.
  const shaped = applyShapeRepairs(raw);
  push(shaped);
  push(raw);

  const bases = [shaped, raw];

  for (const base of bases) {
    const ins = repairByInsertingMissingBeforeMismatch(base);
    if (ins) {
      push(ins);
      push(applyShapeRepairs(ins));
    }
  }

  for (const base of bases) {
    const del = repairByDeletingExtraClose(base);
    if (del) {
      push(del);
      push(applyShapeRepairs(del));
    }
  }

  for (const base of bases) {
    const add = repairByAppendingClosers(base);
    if (add) {
      push(add);
      push(applyShapeRepairs(add));
    }
  }

  for (const base of bases) {
    const semi = repairMissingSemicolonBeforeClose(base);
    if (semi) {
      push(semi);
      push(applyShapeRepairs(semi));
    }
  }

  // Combine: insert missing + append remaining + shape
  for (const base of bases) {
    let s = repairByInsertingMissingBeforeMismatch(base) || base;
    s = repairByAppendingClosers(s) || s;
    s = repairMissingSemicolonBeforeClose(s) || s;
    push(applyShapeRepairs(s));
  }

  // Cap candidates
  return out.slice(0, 20);
}

/**
 * Pick first candidate that compiles (shape-level). Returns input if none work.
 */
export function tryRepairSceneJs(jsSource) {
  const cands = collectJsRepairCandidates(jsSource);
  if (!cands.length) return sanitizeJsSource(jsSource);
  for (const c of cands) {
    if (probeCompile(c)) return c;
  }
  // Prefer shaped even if still broken (better bounce context)
  return cands[1] || cands[0];
}

/**
 * Scan js for first brace/paren/bracket mismatch (ignores strings & comments).
 * @returns {{ index: number, line: number, col: number, char: string, depth: object, context: string } | null}
 */
export function locateJsBracketIssue(jsSource) {
  const src = String(jsSource || '');
  let line = 1;
  let col = 1;
  let i = 0;
  const stack = []; // { ch, index, line, col }

  const openOf = { ')': '(', '}': '{', ']': '[' };
  const isOpen = (c) => c === '(' || c === '{' || c === '[';
  const isClose = (c) => c === ')' || c === '}' || c === ']';

  const mark = (index, ch) => {
    let l = 1;
    let c = 1;
    for (let k = 0; k < index; k++) {
      if (src[k] === '\n') {
        l += 1;
        c = 1;
      } else c += 1;
    }
    const from = Math.max(0, index - 36);
    const to = Math.min(src.length, index + 36);
    const caretPad = ' '.repeat(Math.min(36, index - from));
    return {
      index,
      line: l,
      col: c,
      char: ch,
      context: `${src.slice(from, to)}\n${caretPad}^`,
    };
  };

  // Classic }});})() only (two braces before spurious )) — not "} ); })()"
  {
    const m = src.match(/(\}\s*\}\s*)(\)\s*;?\s*\}\s*\)\s*\(\s*\)\s*;?\s*)$/);
    if (m) {
      const idx = src.length - m[0].length + m[1].length;
      return {
        ...mark(idx, ')'),
        kind: 'bad-iife-end',
        expected: '};})()',
        stackDepth: 0,
      };
    }
  }

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    // line comment
    if (ch === '/' && next === '/') {
      i += 2;
      col += 2;
      while (i < src.length && src[i] !== '\n') {
        i += 1;
        col += 1;
      }
      continue;
    }
    // block comment
    if (ch === '/' && next === '*') {
      i += 2;
      col += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') {
          line += 1;
          col = 1;
        } else col += 1;
        i += 1;
      }
      i += 2;
      col += 2;
      continue;
    }
    // strings
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      col += 1;
      while (i < src.length) {
        if (src[i] === '\\') {
          i += 2;
          col += 2;
          continue;
        }
        if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
          // skip template expression roughly by brace depth
          i += 2;
          col += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth += 1;
            else if (src[i] === '}') depth -= 1;
            if (src[i] === '\n') {
              line += 1;
              col = 1;
            } else col += 1;
            i += 1;
          }
          continue;
        }
        if (src[i] === quote) {
          i += 1;
          col += 1;
          break;
        }
        if (src[i] === '\n') {
          line += 1;
          col = 1;
          i += 1;
          continue;
        }
        i += 1;
        col += 1;
      }
      continue;
    }

    if (isOpen(ch)) {
      stack.push({ ch, index: i, line, col });
    } else if (isClose(ch)) {
      const top = stack[stack.length - 1];
      if (!top || top.ch !== openOf[ch]) {
        return { ...mark(i, ch), kind: 'extra-close', expected: openOf[ch], stackDepth: stack.length };
      }
      stack.pop();
    }

    if (ch === '\n') {
      line += 1;
      col = 1;
    } else col += 1;
    i += 1;
  }

  if (stack.length) {
    const top = stack[stack.length - 1];
    return {
      ...mark(top.index, top.ch),
      kind: 'unclosed',
      expected: top.ch === '(' ? ')' : top.ch === '{' ? '}' : ']',
      stackDepth: stack.length,
    };
  }

  return null;
}

function formatLocate(loc) {
  if (!loc) return '';
  const kindZh =
    loc.kind === 'extra-close'
      ? `多余的闭合符 ${loc.char}`
      : loc.kind === 'unclosed'
        ? `未闭合的 ${loc.char}（缺 ${loc.expected}）`
        : loc.kind === 'bad-iife-end'
          ? 'IIFE 收尾多写了 )（常见 }});})()）'
          : '括号问题';
  return `第 ${loc.line} 行第 ${loc.col} 列 · 字符偏移 ${loc.index} · ${kindZh}\n上下文：\n${loc.context}`;
}

/**
 * Classify compile / contract failures for bounce prompts.
 * @returns {{ type: string, where: string, hint: string, snippet: string, error: string, locate?: object }}
 */
export function diagnoseJsFailure(jsSource, compileError = '') {
  const src = sanitizeJsSource(jsSource);
  const err = String(compileError || '');
  const tail = src.slice(-160);
  const head = src.slice(0, 120);
  const locate = src ? locateJsBracketIssue(src) : null;
  const locateText = formatLocate(locate);

  let type = '语法错误';
  let where = locateText || 'js 字段整体';
  let hint = '请重写为单表达式 IIFE，并以 }; })() 正确收尾。';

  if (!src) {
    return {
      type: '空代码',
      where: 'js 字段为空',
      hint: '必须提供 (function(){ return { setup:function(){}, draw:function(){} }; })()',
      snippet: '',
      error: 'empty js',
    };
  }

  if (/requestAnimationFrame\s*\(/.test(src)) {
    type = '禁止自启 rAF';
    const raf = src.search(/requestAnimationFrame\s*\(/);
    where = `约字符偏移 ${raf}：…${src.slice(Math.max(0, raf - 20), raf + 40)}…`;
    hint = '删除 requestAnimationFrame；动画只由宿主传入的 t（秒）驱动。';
  } else if (/Math\.random\s*\(/.test(src)) {
    type = '禁止 Math.random';
    const rnd = src.search(/Math\.random\s*\(/);
    where = `约字符偏移 ${rnd}：…${src.slice(Math.max(0, rnd - 20), rnd + 40)}…`;
    hint =
      '删除全部 Math.random()。在 IIFE 内定义 function seed(n){ var x=Math.sin(n*999)*10000; return x-Math.floor(x); }，' +
      '用 seed(i)、seed(x*12.9+y*78.2) 等替换；粒子/雨/grain/手持禁止真随机。';
  } else if (/is not defined/i.test(err)) {
    const m = err.match(/([A-Za-z_$][\w$]*) is not defined/i);
    const name = m?.[1] || '变量';
    type = `未定义标识符 ${name}`;
    where = `draw/setup 试运行报错：${err}`;
    hint =
      name === 'seed'
        ? '在 IIFE 顶部定义 function seed(n){ var x=Math.sin(n*999)*10000; return x-Math.floor(x); }，禁止把 seed 写成数字变量。'
        : `在 IIFE 内用 var/function 定义「${name}」，或修正拼写。宿主只传入 ctx,canvas,t,duration,root（人物另有 rect,motion,props）。请整段重写并保证 setup/draw 可跑通。`;
  } else if (/is not a function/i.test(err)) {
    const m = err.match(/([A-Za-z_$][\w$]*) is not a function/i);
    const name = m?.[1] || '某符号';
    type = `${name} 不是函数`;
    where = `draw/setup 试运行报错：${err}`;
    hint =
      name === 'seed'
        ? 'seed 必须是函数：function seed(n){ var x=Math.sin(n*999)*10000; return x-Math.floor(x); }。删除 var seed=数字 这类绑定。'
        : `「${name}」被当成函数调用但不是函数；改为 function ${name}(...){...} 定义，或删掉错误调用。ease/lerp/seed 均须在 IIFE 内自建。`;
  } else if (/appendChild|parameter 1 is not of type 'Node'/i.test(err)) {
    type = 'DOM appendChild 非法参数';
    where = `setup/draw 试运行报错：${err}`;
    hint =
      '禁止 root.appendChild(字符串/普通对象)。只用 document.createElement(...) 得到的节点，' +
      '或完全不要操作 DOM——画面只在 canvas ctx 上绘制。setup 可留空。请整段重写 js。';
  } else if (/^(setup|draw)\(\)/i.test(err) || /Failed to execute/i.test(err)) {
    type = 'setup/draw 运行时错误';
    where = `试运行报错：${err}`;
    hint =
      '这不是括号语法问题。setup/draw 执行失败：优先只在 canvas 的 ctx 上绘制；' +
      'seed/ease/lerp 必须是 function；禁止 appendChild 非 Node。请整段重写可跑通的 js。';
  } else if (/\b(import|export)\b/.test(src)) {
    type = '禁止 import/export';
    where = 'js 顶层模块语法';
    hint = '删掉 import/export，全部逻辑放进 IIFE 内。';
  } else if (/^\s*(const|let|var|class)\b/.test(src)) {
    type = '非表达式（顶层声明）';
    where = 'js 以 const/let/var/class 开头';
    hint = '必须是单个表达式 IIFE，声明只能写在 function 体内部。';
  } else if (
    (locate && locate.kind === 'bad-iife-end') ||
    /\}\s*\}\s*\)\s*;?\s*\}\s*\)\s*\(\s*\)\s*$/.test(src)
  ) {
    type = 'IIFE 收尾括号错误';
    where = locateText || 'js 末尾（多了一个 ) ，常见写成 }});})()）';
    hint =
      '正确收尾必须是：}; })()\n即：} 结束 draw → } 结束 return 对象 → )() 结束并调用 IIFE。\n不要写成 }});})()（对象 } 后多了一个 )）。';
  } else if (locate && locate.kind === 'unclosed') {
    type = `缺少闭合符 ${locate.expected}`;
    where = locateText;
    hint = `在标记 ^ 附近或末尾补上 ${locate.expected}；若引擎报 Unexpected token ')'，通常是 ) 前面缺 }。完整收尾：}; })()`;
  } else if (/Unexpected token ';'|Unexpected token ";"/.test(err) || /Unexpected token\s*;/.test(err)) {
    type = '多余或错位的分号 ;';
    where = /\)\s*\(\s*\)\s*;\s*$/.test(src)
      ? `js 末尾：IIFE 写成了 )();${locateText ? '\n' + locateText : ''}`
      : locateText || 'js 内某处 Unexpected token \';\'';
    hint =
      '正确收尾只能是 }; })()  不要 );  不要 )();  不要 }});})()。整段必须是单个表达式，请整段重写 js。';
  } else if (/Unexpected token\s*'\)'/.test(err) || /Unexpected token \)/.test(err)) {
    // Engine message is often misleading when a } is missing before )
    type = locate?.kind === 'unclosed' ? `缺少闭合符 ${locate.expected}` : '多余右括号 )';
    where =
      locateText ||
      (/\}\s*\)\s*;?\s*\}\s*\)\s*\(\s*\)/.test(src)
        ? 'js 末尾：写成了 }});})() —— 对象闭合 } 后多了一个 )'
        : 'js 内某处多余 ) 或 ) 前缺少 }');
    hint =
      locate?.kind === 'unclosed'
        ? `优先在 ^ 处或该 ) 前补上 ${locate.expected}，而不是只删 )。标准收尾：}; })()`
        : '删掉多出来的 )。标准形状：\n(function(){ return { setup:function(){}, draw:function(){} }; })()\n若末尾是 }});})() 改成 };})()';
  } else if (/Unexpected token\s*'\{'/.test(err)) {
    type = '对象/块歧义';
    where = locateText || '裸 { 被当成语句块';
    hint = '外层必须是 (function(){ ... })()，不要只输出 { setup, draw }。';
  } else if (/missing draw/i.test(err)) {
    type = '缺少 draw 函数';
    where = 'IIFE 返回对象';
    hint = '返回值必须含 draw:function(api){ ... }';
  } else if (/IIFE must return/i.test(err)) {
    type = '返回值不是对象';
    where = 'IIFE 执行结果';
    hint = 'IIFE 必须 return { setup, draw }';
  } else if (locate && (locate.kind === 'extra-close' || locate.kind === 'unclosed')) {
    type = locate.kind === 'extra-close' ? `多余闭合符 ${locate.char}` : `未闭合 ${locate.char}`;
    where = locateText;
    hint =
      locate.kind === 'extra-close'
        ? `在标记 ^ 处删掉多余的 ${locate.char}；IIFE 收尾只能是 }; })()`
        : `在标记 ^ 处补上配对的 ${locate.expected}；并保证末尾是 }; })()`;
  } else if (/Unexpected (end of input|EOF)/i.test(err) || /Unexpected token/.test(err)) {
    type = '语法截断或括号不配';
    where = locateText || 'js 中后部或末尾';
    hint =
      '检查字符串/括号是否配对；末尾必须完整 }; })()；禁止 )(); 收尾。请整段重写 js，勿只改半截。';
  }

  return {
    type,
    where,
    hint,
    snippet:
      (locateText ? `【定位】\n${locateText}\n\n` : '') + `【开头】${head}\n【结尾】${tail}`,
    error: err || type,
    locate: locate || undefined,
  };
}

/**
 * Exercise setup/draw on a real (or skipped) canvas so ReferenceError etc. bounce at validate time.
 * Previously only compiled the IIFE — `yh is not defined` slipped through to preview.
 */
function dryRunSceneRuntime(runtime, duration = 4) {
  if (typeof document === 'undefined') return { ok: true };
  let canvas;
  let ctx;
  try {
    canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    ctx = canvas.getContext('2d');
  } catch {
    return { ok: true };
  }
  if (!ctx) return { ok: true };

  // Mirror overlay host root so DOM mistakes surface at validate (not only at preview)
  const root = document.createElement('div');
  root.className = 'mc-dry-root';
  const rect = { x: 120, y: 100, w: 280, h: 520 };
  const props = { html: '<div class="layer"></div>', css: '' };
  const motion = 'idle';
  const base = { ctx, canvas, duration, root, rect, motion, props };

  try {
    if (typeof runtime.setup === 'function') {
      runtime.setup({ ...base, t: 0 });
    }
  } catch (err) {
    return { ok: false, error: `setup() ${err?.message || err}` };
  }

  const times = [0, Math.min(0.3, duration * 0.12), duration * 0.5, Math.max(0, duration - 0.05)];
  for (const t of times) {
    try {
      runtime.draw({ ...base, t });
    } catch (err) {
      return { ok: false, error: `draw() ${err?.message || err}` };
    }
  }
  return { ok: true };
}

/**
 * Dry-run compile without painting error placeholders.
 * Tries local symbol/shape repairs first; only fails (for model bounce) if all candidates fail.
 * Also runs setup/draw once so undefined vars (e.g. yh) fail validation, not only at preview.
 * @returns {{ ok: true, runtime, js, repaired?: boolean } | { ok: false, error: string, diagnosis: object, js: string }}
 */
export function validateSceneJs(jsSource) {
  const src = sanitizeJsSource(jsSource);
  if (!src) {
    return {
      ok: false,
      error: 'empty js',
      js: '',
      diagnosis: diagnoseJsFailure('', 'empty js'),
    };
  }

  const attempt = (code) => {
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${code});`)();
      let runtime = value;
      if (typeof value === 'function') {
        runtime = value();
      }
      if (!runtime || typeof runtime !== 'object') {
        return { ok: false, error: 'IIFE must return { setup, draw } object' };
      }
      if (typeof runtime.draw !== 'function') {
        return { ok: false, error: 'missing draw function on returned object' };
      }
      if (runtime.setup != null && typeof runtime.setup !== 'function') {
        return { ok: false, error: 'setup must be a function when present' };
      }
      // Soft policy flags (compile ok but contract violation → still fail for bounce)
      if (/Math\.random\s*\(/.test(code)) {
        return { ok: false, error: 'Math.random() is forbidden' };
      }
      if (/requestAnimationFrame\s*\(/.test(code)) {
        return { ok: false, error: 'requestAnimationFrame is forbidden' };
      }
      const dry = dryRunSceneRuntime(runtime, 4);
      if (!dry.ok) {
        return { ok: false, error: dry.error };
      }
      return { ok: true, runtime };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  };

  const cands = collectJsRepairCandidates(src);
  let lastError = 'invalid js';
  let lastJs = src;

  for (const cand of cands) {
    const result = attempt(cand);
    if (result.ok) {
      return {
        ok: true,
        runtime: result.runtime,
        js: cand,
        repaired: cand !== src,
      };
    }
    lastError = result.error;
    lastJs = cand;
  }

  const diagnosis = diagnoseJsFailure(lastJs, lastError);
  return {
    ok: false,
    error: lastError,
    js: lastJs,
    diagnosis,
  };
}

/**
 * @param {string} jsSource
 * @param {{ persistProps?: { js?: string } }} [opts] — if local repair succeeds, write fixed js back
 */
export function compileSceneRuntime(jsSource, opts = {}) {
  const src = sanitizeJsSource(jsSource);
  if (!src) {
    return {
      setup() {},
      draw({ ctx, canvas, t, duration }) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#888';
        ctx.font = '24px sans-serif';
        ctx.fillText('（此镜无模型 JS 代码）', 48, 80);
        ctx.fillRect(0, canvas.height - 4, canvas.width * (t / Math.max(0.01, duration)), 4);
      },
    };
  }

  const result = validateSceneJs(src);
  if (result.ok) {
    if (result.repaired && result.js && opts.persistProps) {
      opts.persistProps.js = result.js;
    }
    const rt = result.runtime;
    return {
      setup: typeof rt.setup === 'function' ? rt.setup.bind(rt) : () => {},
      draw: rt.draw.bind(rt),
    };
  }

  console.warn('compile scene js failed', result.error, result.diagnosis);
  const msg = result.diagnosis
    ? `${result.diagnosis.type}: ${result.error}`
    : result.error || 'unknown';
  return {
    setup() {},
    draw({ ctx, canvas }) {
      ctx.fillStyle = '#300';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '18px monospace';
      const line = 'JS 编译失败: ' + msg;
      ctx.fillText(line.slice(0, 80), 24, 48);
      if (line.length > 80) ctx.fillText(line.slice(80, 160), 24, 72);
    },
  };
}
