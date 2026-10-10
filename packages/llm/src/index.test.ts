import { describe, expect, it, vi } from 'vitest';
import {
  createGeminiProvider,
  DEFAULT_GEMINI_MODEL,
  GeminiCredentialsError,
  GeminiProvider,
  GeminiProviderError,
} from './index.js';

describe('GeminiProvider', () => {
  it('does not require credentials until a Gemini request is made', async () => {
    const provider = createGeminiProvider({});

    await expect(provider.generate({ prompt: 'Plan a test.' })).rejects.toBeInstanceOf(
      GeminiCredentialsError,
    );
  });

  it('returns a typed response from a mocked Gemini SDK client', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'Explore the login flow.' });
    const clientFactory = vi.fn(() => ({ models: { generateContent } }));
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      clientFactory,
    });

    await expect(provider.generate({ prompt: 'Plan a test.' })).resolves.toEqual({
      model: DEFAULT_GEMINI_MODEL,
      text: 'Explore the login flow.',
    });
    expect(generateContent).toHaveBeenCalledWith({
      model: DEFAULT_GEMINI_MODEL,
      contents: 'Plan a test.',
    });
  });

  it('does not leak credentials when the SDK fails', async () => {
    const provider = new GeminiProvider({
      apiKey: 'secret-gemini-key',
      clientFactory: () => ({
        models: { generateContent: vi.fn().mockRejectedValue(new Error('secret-gemini-key')) },
      }),
    });

    await expect(provider.generate({ prompt: 'Plan a test.' })).rejects.toEqual(
      expect.objectContaining({
        name: GeminiProviderError.name,
        message: 'Gemini request failed. Check the provider configuration and try again.',
      }),
    );
  });
});
