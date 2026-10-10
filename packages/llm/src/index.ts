import { GoogleGenAI } from '@google/genai';

/** The default documented in .env.example; callers can select another supported model. */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export type GeminiGenerationInput = {
  prompt: string;
};

export type GeminiGenerationResult = {
  model: string;
  text: string;
};

type GeminiClient = {
  models: {
    generateContent(input: { model: string; contents: string }): Promise<{ text?: string }>;
  };
};

type GeminiClientFactory = (apiKey: string) => GeminiClient;

export class GeminiCredentialsError extends Error {
  constructor() {
    super('GEMINI_API_KEY is required to make a Gemini request.');
    this.name = 'GeminiCredentialsError';
  }
}

export class GeminiProviderError extends Error {
  constructor() {
    super('Gemini request failed. Check the provider configuration and try again.');
    this.name = 'GeminiProviderError';
  }
}

export class GeminiProvider {
  private readonly model: string;
  private readonly clientFactory: GeminiClientFactory;
  private client: GeminiClient | undefined;

  constructor(
    private readonly options: {
      apiKey?: string;
      model?: string;
      clientFactory?: GeminiClientFactory;
    },
  ) {
    this.model = options.model ?? DEFAULT_GEMINI_MODEL;
    this.clientFactory = options.clientFactory ?? ((apiKey) => new GoogleGenAI({ apiKey }));
  }

  async generate(input: GeminiGenerationInput): Promise<GeminiGenerationResult> {
    if (input.prompt.trim() === '') {
      throw new Error('Gemini prompt must not be empty.');
    }
    if (!this.options.apiKey) {
      throw new GeminiCredentialsError();
    }

    try {
      const response = await this.getClient().models.generateContent({
        model: this.model,
        contents: input.prompt,
      });
      return { model: this.model, text: response.text ?? '' };
    } catch {
      throw new GeminiProviderError();
    }
  }

  private getClient(): GeminiClient {
    this.client ??= this.clientFactory(this.options.apiKey as string);
    return this.client;
  }
}

export function createGeminiProvider(options: { apiKey?: string; model?: string }): GeminiProvider {
  return new GeminiProvider(options);
}
