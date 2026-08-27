import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitFalTask, clearFalInputMappingCache } from "../fal";
import type { GenerationInput } from "@/lib/providers/types";

/**
 * Models such as fal-ai/kling-video/v1/tts require "text" and have no "prompt"
 * property at all. The node still sends its prompt as input.prompt, so the
 * schema mapping has to land it on the model's real text field — and it must
 * not fuzzy-match an unrelated knob like "prompt_influence" on the way there.
 */

let capturedQueueBody: Record<string, unknown> | null = null;

function makeInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    model: {
      id: "fal-ai/text-model",
      name: "Text Model",
      description: null,
      provider: "fal",
      capabilities: ["text-to-image"],
    },
    prompt: "hello there",
    images: [],
    parameters: {},
    ...overrides,
  };
}

function createMockFetch(properties: Record<string, unknown>, required: string[]) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr.includes("api.fal.ai/v1/models")) {
      return new Response(
        JSON.stringify({
          models: [{
            endpoint_id: "fal-ai/text-model",
            openapi: {
              paths: {
                "/": {
                  post: {
                    requestBody: {
                      content: {
                        "application/json": {
                          schema: { properties, required },
                        },
                      },
                    },
                  },
                },
              },
            },
          }],
        }),
        { status: 200 }
      );
    }

    if (urlStr.includes("queue.fal.run/fal-ai/text-model") && init?.method === "POST") {
      capturedQueueBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ request_id: "text-1" }), { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  });
}

describe("fal.ai text field mapping", () => {
  beforeEach(() => {
    capturedQueueBody = null;
    clearFalInputMappingCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes the prompt into a model whose text field is named 'text'", async () => {
    vi.stubGlobal("fetch", createMockFetch({
      text: { type: "string", description: "The text to be converted to speech" },
      voice_id: { type: "string", description: "The voice ID" },
    }, ["text"]));

    await submitFalTask("test-req", "test-api-key", makeInput());

    expect(capturedQueueBody).not.toBeNull();
    expect(capturedQueueBody!.text).toBe("hello there");
    expect(capturedQueueBody!.prompt).toBeUndefined();
  });

  it("prefers the exact text field over a fuzzy 'prompt'-like knob", async () => {
    vi.stubGlobal("fetch", createMockFetch({
      text: { type: "string", description: "Text to speak" },
      prompt_influence: { type: "number", description: "How closely to follow the prompt" },
    }, ["text"]));

    await submitFalTask("test-req", "test-api-key", makeInput());

    expect(capturedQueueBody).not.toBeNull();
    expect(capturedQueueBody!.text).toBe("hello there");
    expect(capturedQueueBody!.prompt_influence).toBeUndefined();
  });

  it("still prefers a real 'prompt' property when the model has one", async () => {
    vi.stubGlobal("fetch", createMockFetch({
      prompt: { type: "string", description: "Prompt" },
      text: { type: "string", description: "Overlay caption" },
    }, ["prompt"]));

    await submitFalTask("test-req", "test-api-key", makeInput());

    expect(capturedQueueBody).not.toBeNull();
    expect(capturedQueueBody!.prompt).toBe("hello there");
  });
});
