import { listProviders, registerProvider } from '../provider';
import { OpenAIProvider } from './openai';
import { OllamaProvider } from './ollama';
import { AnthropicProvider, isAnthropicConfigured } from './anthropic';
import { GeminiProvider, createGeminiProvider } from './gemini';
import { GroqProvider, isGroqConfigured } from './groq';
import { logEvent } from '@/lib/server/logging';

let registered = false;

/** Registers all supported providers once for every server entry point. */
export function ensureAIProviders(): void {
  if (registered) return;
  registerProvider(OpenAIProvider);
  // Ollama stays registered for LOCAL/explicit use only: failoverCandidates()
  // already excludes it from automatic failover unless AI_PROVIDER=ollama.
  registerProvider(OllamaProvider);
  // Only register Anthropic when its key is real — a placeholder credential
  // ("your-anthropic-key") must never occupy a slot in the failover chain.
  if (isAnthropicConfigured()) registerProvider(AnthropicProvider);
  // Groq is the PRIMARY provider: fast (~0.7s) free tier that no longer trips
  // Vercel's gateway timeout the way slow Gemini calls did. Registered only
  // when its key is real so a missing credential never occupies a slot.
  if (isGroqConfigured()) registerProvider(GroqProvider);
  registerProvider(GeminiProvider);
  // Real fallback: a second Gemini key. A dead/rate-limited primary key now
  // fails over to another Gemini credential (set GEMINI_API_KEY_FALLBACK).
  if (process.env.GEMINI_API_KEY_FALLBACK) {
    registerProvider(createGeminiProvider('gemini-fallback', 'GEMINI_API_KEY_FALLBACK'));
  }

  const configuredId = process.env.AI_PROVIDER?.trim() || 'openai';
  const configuredProvider = listProviders().find((provider) => provider.id === configuredId);
  const keyNameByProvider: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    groq: 'GROQ_API_KEY',
    gemini: 'GEMINI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    ollama: 'OLLAMA_MODEL',
  };
  const keyName = keyNameByProvider[configuredId];
  if (!configuredProvider || (keyName && !process.env[keyName])) {
    logEvent('ai_provider_configuration_warning', {
      configured_provider: configuredId,
      reason: !configuredProvider ? 'provider_not_registered_or_missing_key' : 'provider_key_missing',
      required_env: keyName,
    }, 'warn');
  } else {
    logEvent('ai_provider_configured', {
      provider: configuredId,
      streaming: Boolean(configuredProvider.stream),
    });
  }
  registered = true;
}

