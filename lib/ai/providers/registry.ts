import { registerProvider } from '../provider';
import { OpenAIProvider } from './openai';
import { OllamaProvider } from './ollama';
import { AnthropicProvider, isAnthropicConfigured } from './anthropic';
import { GeminiProvider, createGeminiProvider } from './gemini';
import { GroqProvider, isGroqConfigured } from './groq';

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
  registered = true;
}

