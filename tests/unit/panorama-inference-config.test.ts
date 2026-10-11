import { describe, expect, it } from 'vitest';
import { getPanoramaInferenceConfig } from '@/lib/ai/panoramaInferenceConfig';

describe('getPanoramaInferenceConfig', () => {
  it('disables panorama analysis when either production setting is missing', () => {
    expect(getPanoramaInferenceConfig({ NODE_ENV: 'production' })).toBeNull();
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        AI_INFERENCE_URL: 'https://inference.example.com',
      })
    ).toBeNull();
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        AI_INFERENCE_API_KEY: 'secret',
      })
    ).toBeNull();
  });

  it('keeps the feature disabled on Vercel Production even when configured', () => {
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        AI_INFERENCE_URL: 'https://inference.example.com',
        AI_INFERENCE_API_KEY: 'secret',
      })
    ).toBeNull();
  });

  it('builds the analysis endpoint from the local inference URL', () => {
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'development',
        AI_INFERENCE_URL: 'http://127.0.0.1:8000',
        AI_INFERENCE_API_KEY: 'local-secret',
      })
    ).toEqual({
      endpoint: new URL('http://127.0.0.1:8000/analyze'),
      apiKey: 'local-secret',
    });
  });

  it('fails closed for invalid URLs and insecure production URLs', () => {
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        AI_INFERENCE_URL: 'not a URL',
        AI_INFERENCE_API_KEY: 'secret',
      })
    ).toBeNull();
    expect(
      getPanoramaInferenceConfig({
        NODE_ENV: 'production',
        AI_INFERENCE_URL: 'http://inference.example.com',
        AI_INFERENCE_API_KEY: 'secret',
      })
    ).toBeNull();
  });
});
