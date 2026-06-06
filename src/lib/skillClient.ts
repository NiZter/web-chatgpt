import { getTaskSkillInstruction } from '../data/taskSkills';

export type LoadedTaskSkill = {
  id: string;
  label: string;
  instruction: string;
  source: 'local-skill-md' | 'fallback';
  truncated?: boolean;
};

type SkillResponse = {
  id?: string;
  content?: unknown;
  source?: unknown;
  truncated?: unknown;
};

const skillCache = new Map<string, Promise<LoadedTaskSkill>>();

const proxyUrl =
  import.meta.env.VITE_SKILL_PROXY_URL ||
  import.meta.env.VITE_OPENAI_PROXY_URL?.replace(/\/api\/openai\/responses\/?$/, '/api/skills') ||
  'http://127.0.0.1:3001/api/skills';

export function loadTaskSkill(skillId: string, label: string): Promise<LoadedTaskSkill> {
  const cached = skillCache.get(skillId);
  if (cached) return cached;

  const promise = fetchLocalSkill(skillId, label).catch(() => {
    const fallback = getTaskSkillInstruction(skillId);
    return {
      id: skillId,
      label,
      instruction: fallback.instruction,
      source: 'fallback' as const,
    };
  });

  skillCache.set(skillId, promise);
  return promise;
}

async function fetchLocalSkill(skillId: string, label: string): Promise<LoadedTaskSkill> {
  const response = await fetch(`${proxyUrl}/${encodeURIComponent(skillId)}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as SkillResponse;
  if (typeof data.content !== 'string' || !data.content.trim()) {
    throw new Error(`Skill ${skillId} returned no content`);
  }

  return {
    id: data.id || skillId,
    label,
    instruction: data.content,
    source: data.source === 'local-skill-md' ? 'local-skill-md' : 'fallback',
    truncated: data.truncated === true,
  };
}
