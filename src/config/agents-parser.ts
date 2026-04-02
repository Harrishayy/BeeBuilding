import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../util/logger.js';
import type { AgentConfig, AgentName, GateConfig, SessionConfig } from '../shared/types.js';
import { defaultAgentConfigs, defaultGateConfig, defaultSessionConfig } from './defaults.js';

const TAG = 'ConfigParser';

function parseYamlValue(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') return num;
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');
  let currentKey: string | null = null;
  let currentObject: Record<string, unknown> | null = null;

  for (const line of lines) {
    const trimmedFull = line.trimEnd();
    if (!trimmedFull || trimmedFull.trimStart().startsWith('#')) continue;

    const indentMatch = trimmedFull.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    const kvMatch = trimmedFull.trim().match(/^([\w.]+):\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    const value = kvMatch[2].trim();

    if (indent === 0) {
      if (value === '' || value === '|' || value === '>') {
        currentKey = key;
        currentObject = {};
        result[key] = currentObject;
      } else {
        currentKey = null;
        currentObject = null;
        result[key] = parseYamlValue(value);
      }
    } else if (indent > 0 && currentObject !== null && currentKey !== null) {
      currentObject[key] = parseYamlValue(value);
    }
  }

  return result;
}

function extractYamlBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /```ya?ml\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    blocks.push(match[1]);
  }

  return blocks;
}

function applyAgentOverrides(
  base: Record<AgentName, AgentConfig>,
  parsed: Record<string, unknown>,
): Record<AgentName, AgentConfig> {
  const agents = { ...base };
  const agentNames: AgentName[] = ['scout_bee', 'worker_bee', 'tester_bee', 'guard_bee', 'queen_bee'];

  for (const name of agentNames) {
    const overrides = parsed[name] as Record<string, unknown> | undefined;
    if (!overrides || typeof overrides !== 'object') continue;

    log.debug(TAG, `Applying overrides for agent: ${name}`, overrides);
    agents[name] = {
      ...agents[name],
      ...(overrides.model !== undefined && { model: String(overrides.model) }),
      ...(overrides.approvalRequired !== undefined && {
        approvalRequired: Boolean(overrides.approvalRequired),
      }),
      ...(overrides.approvalAfterLines !== undefined && {
        approvalAfterLines: Number(overrides.approvalAfterLines),
      }),
      ...(overrides.timeoutMinutes !== undefined && {
        timeoutMinutes: Number(overrides.timeoutMinutes),
      }),
    };
  }

  return agents;
}

function applyGateOverrides(
  base: GateConfig,
  parsed: Record<string, unknown>,
): GateConfig {
  const gates = { ...base };
  const gateObj = parsed.gates as Record<string, unknown> | undefined;

  if (!gateObj || typeof gateObj !== 'object') return gates;

  const validValues = new Set(['required', 'optional', 'skip']);

  if (gateObj.afterPlanning && validValues.has(String(gateObj.afterPlanning))) {
    gates.afterPlanning = String(gateObj.afterPlanning) as GateConfig['afterPlanning'];
  }
  if (gateObj.afterCoding && validValues.has(String(gateObj.afterCoding))) {
    gates.afterCoding = String(gateObj.afterCoding) as GateConfig['afterCoding'];
  }
  if (gateObj.afterTesting && validValues.has(String(gateObj.afterTesting))) {
    gates.afterTesting = String(gateObj.afterTesting) as GateConfig['afterTesting'];
  }
  if (gateObj.afterReview && validValues.has(String(gateObj.afterReview))) {
    gates.afterReview = String(gateObj.afterReview) as GateConfig['afterReview'];
  }

  log.debug(TAG, 'Gate overrides applied', gates);
  return gates;
}

export function parseAgentsConfig(projectRoot: string): SessionConfig {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  const config = defaultSessionConfig(projectRoot);

  if (!fs.existsSync(agentsPath)) {
    log.info(TAG, `No AGENTS.md found at ${agentsPath}, using defaults`);
    return config;
  }

  log.info(TAG, `Parsing AGENTS.md: ${agentsPath}`);

  try {
    const markdown = fs.readFileSync(agentsPath, 'utf-8');
    const yamlBlocks = extractYamlBlocks(markdown);
    log.debug(TAG, `Found ${yamlBlocks.length} YAML blocks in AGENTS.md`);

    const merged: Record<string, unknown> = {};

    for (const block of yamlBlocks) {
      try {
        const parsed = parseSimpleYaml(block);
        Object.assign(merged, parsed);
      } catch (blockErr) {
        log.warn(TAG, 'Failed to parse a YAML block in AGENTS.md', blockErr);
      }
    }

    config.agents = applyAgentOverrides(defaultAgentConfigs, merged);
    config.gates = applyGateOverrides(defaultGateConfig, merged);

    const settings = merged.settings as Record<string, unknown> | undefined;
    if (settings && typeof settings === 'object') {
      const strategy = settings.gitMergeStrategy;
      if (strategy === 'squash' || strategy === 'rebase' || strategy === 'merge') {
        config.gitMergeStrategy = strategy;
      }
    } else if (merged.gitMergeStrategy) {
      const strategy = merged.gitMergeStrategy;
      if (strategy === 'squash' || strategy === 'rebase' || strategy === 'merge') {
        config.gitMergeStrategy = strategy;
      }
    }

    log.info(TAG, 'AGENTS.md parsed successfully', {
      gitMergeStrategy: config.gitMergeStrategy,
      gates: config.gates,
    });
  } catch (err) {
    log.error(TAG, 'Failed to parse AGENTS.md, using defaults', err);
  }

  return config;
}
