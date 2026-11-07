import { describe, expect, it } from 'vitest';
import { getPanoramaInferenceConfig } from '@/lib/ai/panoramaInferenceConfig';

describe('getPanoramaInferenceConfig', () => {
  it('disables panorama analysis when either advanced-model setting is missing', () => {
    expect(getPanoramaInferenceConfig({ NODE_ENV: 'production' })).toBeNull();
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        AI_INFERENCE_URL: 'https://inference.example.com',
        AI_INFERENCE_API_KEY: 'legacy-secret',
      })
    ).toBeNull();
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        AI_INFERENCE_API_KEY: 'secret',
      })
    ).toBeNull();
  });

  it('enables the feature on Vercel Production when configured with HTTPS', () => {
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        AI_INFERENCE_URL_V2: 'https://ai-inference-v2.onrender.com',
        AI_INFERENCE_API_KEY_V2: 'advanced-secret',
      })
    ).toEqual({
      endpoint: new URL('https://ai-inference-v2.onrender.com/analyze'),
      apiKey: 'advanced-secret',
    });
  });

  it('builds the advanced-model endpoint from its local inference URL', () => {
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'development',
        AI_INFERENCE_URL_V2: 'http://127.0.0.1:8000',
        AI_INFERENCE_API_KEY_V2: 'local-advanced-secret',
      })
    ).toEqual({
      endpoint: new URL('http://127.0.0.1:8000/analyze'),
      apiKey: 'local-advanced-secret',
    });
  });

  it('fails closed for invalid URLs and insecure production URLs', () => {
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        AI_INFERENCE_URL_V2: 'not a URL',
        AI_INFERENCE_API_KEY_V2: 'secret',
      })
    ).toBeNull();
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        AI_INFERENCE_URL_V2: 'http://inference.example.com',
        AI_INFERENCE_API_KEY_V2: 'secret',
      })
    ).toBeNull();
  });
});
