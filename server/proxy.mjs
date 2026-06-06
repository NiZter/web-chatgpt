import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
loadEnv(envPath);

const port = Number(process.env.PORT || 3001);
const apiUrl = cleanEnv(process.env.OPENAI_API_URL || 'https://api.openai.com/v1/responses');
const imageApiUrl = cleanEnv(process.env.OPENAI_IMAGE_API_URL || deriveImageApiUrl(apiUrl));
const imageModel = cleanEnv(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
const apiKey = cleanEnv(process.env.OPENAI_API_KEY || '');
const codexHome = resolve(
  cleanEnv(process.env.CODEX_HOME || process.env.USERPROFILE || process.env.HOME || '.'),
  process.env.CODEX_HOME ? '' : '.codex',
);
const bundledSkillsRoot = resolve(process.cwd(), 'server', 'skills');
const skillsRoot = resolve(
  cleanEnv(process.env.CODEX_SKILLS_DIR || (existsSync(bundledSkillsRoot) ? bundledSkillsRoot : resolve(codexHome, 'skills'))),
);
const maxSkillChars = Number(process.env.MAX_SKILL_CHARS || 50000);
const maxRequestBodyBytes = Number(process.env.MAX_REQUEST_BODY_BYTES || 25_000_000);
const host = cleanEnv(process.env.HOST || '0.0.0.0');

const skillAliases = new Map([
  ['prompt-api', ['prompt-api']],
  ['content-research-writer', ['content-research-writer']],
  ['writing-assistance-apis', ['writing-assistance-apis']],
  ['email-draft-polish', ['email-draft-polish']],
  ['translator-api-proofreader-api', ['translator-api', 'proofreader-api']],
  ['meeting-notes-and-actions', ['meeting-notes-and-actions']],
  ['presentation-skill', ['presentation-skill']],
  ['spreadsheet-formula-helper', ['spreadsheet-formula-helper']],
  ['tailored-resume-generator', ['tailored-resume-generator']],
]);

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

  if (req.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname.startsWith('/api/skills/')) {
    const skillId = decodeURIComponent(requestUrl.pathname.slice('/api/skills/'.length));
    sendSkill(req, res, skillId);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/openai/images') {
    await sendGeneratedImage(req, res);
    return;
  }

  if (req.method !== 'POST' || requestUrl.pathname !== '/api/openai/responses') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  if (!apiKey || apiKey === 'PASTE_YOUR_API_KEY_HERE') {
    sendJson(res, 500, { error: 'OPENAI_API_KEY is missing in .env' });
    return;
  }

  try {
    const body = await readRequestBody(req);
    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(text);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unknown proxy error',
    });
  }
});

server.listen(port, host, () => {
  console.log(`OpenAI proxy running at http://${host}:${port}/api/openai/responses`);
  console.log(`OpenAI image proxy running at http://${host}:${port}/api/openai/images`);
});

function loadEnv(path) {
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) continue;

      const key = trimmed.slice(0, equalsIndex).trim();
      const value = cleanEnv(trimmed.slice(equalsIndex + 1));
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Missing .env is handled by the API key check.
  }
}

function cleanEnv(value) {
  return String(value)
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

function deriveImageApiUrl(url) {
  return cleanEnv(url).replace(/\/responses\/?$/, '/images/generations') || 'https://api.openai.com/v1/images/generations';
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > maxRequestBodyBytes) {
        req.destroy();
        reject(new Error('Request body is too large'));
      }
    });
    req.on('end', () => resolveBody(body));
    req.on('error', reject);
  });
}

async function sendGeneratedImage(req, res) {
  if (!apiKey || apiKey === 'PASTE_YOUR_API_KEY_HERE') {
    sendJson(res, 500, { error: 'OPENAI_API_KEY is missing in .env' });
    return;
  }

  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || '{}');
    const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';

    if (!prompt) {
      sendJson(res, 400, { error: 'Prompt is required to generate an image' });
      return;
    }

    const upstream = await fetch(imageApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: imageModel,
        prompt,
        size: typeof payload.size === 'string' ? payload.size : '1024x1024',
        n: 1,
      }),
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(text);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unknown image proxy error',
    });
  }
}

function sendSkill(req, res, skillId) {
  try {
    const skillNames = skillAliases.get(skillId);
    if (!skillNames) {
      sendJson(res, 404, { error: `Skill is not allowed: ${skillId}` });
      return;
    }

    const skills = skillNames.map((name) => readSkill(name));
    const content = skills
      .map((skill) => [`# ${skill.name}`, skill.description, skill.content].filter(Boolean).join('\n\n'))
      .join('\n\n---\n\n');

    const truncated = content.length > maxSkillChars;
    sendJson(res, 200, {
      id: skillId,
      source: 'local-skill-md',
      root: skillsRoot,
      skills,
      content: truncated ? content.slice(0, maxSkillChars) : content,
      truncated,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unable to read skill',
    });
  }
}

function readSkill(name) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    throw new Error(`Invalid skill name: ${name}`);
  }

  const skillPath = resolve(skillsRoot, name, 'SKILL.md');
  const relativePath = relative(skillsRoot, skillPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Skill path escaped root: ${name}`);
  }

  if (!existsSync(skillPath)) {
    throw new Error(`SKILL.md not found for ${name}`);
  }

  const content = readFileSync(skillPath, 'utf8');
  return {
    name,
    path: skillPath,
    description: readFrontMatterValue(content, 'description'),
    content,
  };
}

function readFrontMatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*['"]?(.+?)['"]?\\s*$`, 'm'));
  return match?.[1]?.trim() || '';
}
