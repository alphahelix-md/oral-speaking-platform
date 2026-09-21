export type AppRegion = 'china' | 'global';
export type RegionalTextProvider = 'openai' | 'deepseek' | 'glm';

const allTextProviders: RegionalTextProvider[] = ['openai', 'deepseek', 'glm'];

export function getAppRegion(): AppRegion {
  return process.env.APP_REGION?.trim().toLowerCase() === 'china' ? 'china' : 'global';
}

function isTextProvider(value: string): value is RegionalTextProvider {
  return allTextProviders.includes(value as RegionalTextProvider);
}

export function getAllowedTextProviders(): RegionalTextProvider[] {
  const configured = process.env.TEXT_PROVIDER_ALLOWLIST
    ?.split(',')
    .map(value => value.trim().toLowerCase())
    .filter(isTextProvider);
  const regionalDefault: RegionalTextProvider[] = getAppRegion() === 'china'
    ? ['deepseek', 'glm']
    : allTextProviders;
  const candidates = configured?.length ? configured : regionalDefault;
  return getAppRegion() === 'china'
    ? candidates.filter(provider => provider !== 'openai')
    : candidates;
}

export function resolveTextProvider(requested?: string): RegionalTextProvider {
  const allowed = getAllowedTextProviders();
  const configuredDefault = process.env.TEXT_PROVIDER?.trim().toLowerCase();
  if (requested && isTextProvider(requested) && allowed.includes(requested)) return requested;
  if (configuredDefault && isTextProvider(configuredDefault) && allowed.includes(configuredDefault)) return configuredDefault;
  return allowed[0] || (getAppRegion() === 'china' ? 'deepseek' : 'openai');
}

export function resolveSpeechProvider(): 'basic' | 'glm' {
  const requested = process.env.SPEECH_PROVIDER?.trim().toLowerCase() || 'glm';
  if (getAppRegion() === 'china') return 'glm';
  if (requested === 'basic' || requested === 'glm') return requested;
  throw new Error(`Unsupported speech provider: ${requested}`);
}
