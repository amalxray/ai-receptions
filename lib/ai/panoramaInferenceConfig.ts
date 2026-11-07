export type PanoramaInferenceConfig = {
  endpoint: URL;
  apiKey: string;
};

export function getPanoramaInferenceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PanoramaInferenceConfig | null {
  const inferenceUrl = environment.AI_INFERENCE_URL_V2;
  const apiKey = environment.AI_INFERENCE_API_KEY_V2;

  if (!inferenceUrl || !apiKey) return null;

  let endpoint: URL;
  try {
    endpoint = new URL('/analyze', inferenceUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(endpoint.protocol)) return null;
  if (environment.NODE_ENV === 'production' && endpoint.protocol !== 'https:') {
    return null;
  }

  return { endpoint, apiKey };
}
