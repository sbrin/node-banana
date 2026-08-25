import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("video generation recovery", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    vi.resetModules();
    storage = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key];
      }),
      clear: vi.fn(() => {
        storage = {};
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reattaches a completed broker run to its saved workflow node", async () => {
    const { GENERATION_RUNS_STORAGE_KEY } = await import("../utils/generationRuns");
    storage[GENERATION_RUNS_STORAGE_KEY] = JSON.stringify([
      {
        version: 1,
        runId: "recovery-run-1",
        workflowId: "workflow-recovery",
        nodeId: "video-1",
        nodeType: "generateVideo",
        provider: "fal",
        modelId: "fal-ai/video",
        modelName: "Fal Video",
        mediaType: "video",
        prompt: "Recovered prompt",
        status: "running",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith("/api/generate/run?")) {
          return Response.json({
            state: "completed",
            responseStatus: 200,
            result: { success: true, videoUrl: "https://cdn.example/recovered.mp4" },
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const { useWorkflowStore } = await import("../workflowStore");
    await useWorkflowStore.getState().loadWorkflow({
      version: 1,
      id: "workflow-recovery",
      name: "Recovery",
      edgeStyle: "angular",
      edges: [],
      nodes: [
        {
          id: "video-1",
          type: "generateVideo",
          position: { x: 0, y: 0 },
          data: {
            inputImages: [],
            inputPrompt: "Recovered prompt",
            outputVideo: null,
            selectedModel: {
              provider: "fal",
              modelId: "fal-ai/video",
              displayName: "Fal Video",
            },
            status: "loading",
            error: null,
            videoHistory: [],
            selectedVideoHistoryIndex: 0,
          },
        },
      ],
    });

    await vi.waitFor(() => {
      const node = useWorkflowStore.getState().nodes[0];
      expect(node.data).toMatchObject({
        status: "complete",
        outputVideo: "https://cdn.example/recovered.mp4",
        activeRunId: null,
      });
      expect((node.data as { videoHistory: Array<{ runId?: string }> }).videoHistory[0].runId)
        .toBe("recovery-run-1");
    });
  });
});
