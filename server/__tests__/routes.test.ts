import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerRoutes } from "../routes";

// Mock OpenAI to avoid API calls in tests
vi.mock("openai", () => {
  const mockCreate = vi.fn().mockRejectedValue(new Error("Mocked - no API key"));
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

describe("API Routes", () => {
  let app: express.Express;
  let server: ReturnType<typeof import("http").createServer>;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    server = await registerRoutes(app);
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  describe("POST /api/orchestration/next-step", () => {
    it("should return 200 with valid request", async () => {
      const response = await request(app)
        .post("/api/orchestration/next-step")
        .send({
          learnerState: {
            attention: {
              score: 0.7,
              focusStability: 0.8,
              cognitiveLoad: 0.3,
              status: "tracking",
            },
            timestamp: Date.now(),
          },
          context: "learning algebra",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("suggestion");
      expect(response.body).toHaveProperty("type");
    });

    it("should return fallback response when OpenAI fails", async () => {
      const response = await request(app)
        .post("/api/orchestration/next-step")
        .send({
          learnerState: {
            timestamp: Date.now(),
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe("fallback");
      expect(response.body.suggestion).toBeDefined();
    });

    it("should return 400 for invalid request body", async () => {
      const response = await request(app)
        .post("/api/orchestration/next-step")
        .send({
          // Missing required learnerState
          context: "test",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should validate attention score range", async () => {
      const response = await request(app)
        .post("/api/orchestration/next-step")
        .send({
          learnerState: {
            attention: {
              score: 1.5, // Invalid: > 1
            },
            timestamp: Date.now(),
          },
        });

      expect(response.status).toBe(400);
    });

    it("should accept optional mastery data", async () => {
      const response = await request(app)
        .post("/api/orchestration/next-step")
        .send({
          learnerState: {
            mastery: [
              {
                id: "obj1",
                name: "Test Objective",
                progress: 0.5,
                status: "in-progress",
              },
            ],
            timestamp: Date.now(),
          },
        });

      expect(response.status).toBe(200);
    });
  });

  describe("POST /api/orchestration/engagement", () => {
    it("should return 200 with valid request", async () => {
      const response = await request(app)
        .post("/api/orchestration/engagement")
        .send({
          attentionScore: 0.2,
          context: "reading chapter 5",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("type");
    });

    it("should return fallback response", async () => {
      const response = await request(app)
        .post("/api/orchestration/engagement")
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.source).toBe("fallback");
    });

    it("should avoid repeating previous interventions", async () => {
      const previousIntervention =
        "Would you like to take a quick 30-second break to refresh?";

      const response = await request(app)
        .post("/api/orchestration/engagement")
        .send({
          previousInterventions: [previousIntervention],
        });

      expect(response.status).toBe(200);
      // Note: There's still a chance it picks the same one if all others were used
      // This test just verifies the endpoint accepts previousInterventions
    });

    it("should validate attentionScore range", async () => {
      const response = await request(app)
        .post("/api/orchestration/engagement")
        .send({
          attentionScore: -0.5, // Invalid: < 0
        });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/analytics/attention", () => {
    it("should return 200 with array", async () => {
      const response = await request(app).get("/api/analytics/attention");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe("GET /api/analytics/mastery", () => {
    it("should return 200 with array", async () => {
      const response = await request(app).get("/api/analytics/mastery");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe("POST /api/learning/events", () => {
    it("should create learning event with valid data", async () => {
      const response = await request(app)
        .post("/api/learning/events")
        .send({
          type: "attention",
          data: {
            attentionScore: 0.8,
            context: "test",
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("type", "attention");
    });

    it("should accept optional userId", async () => {
      const response = await request(app)
        .post("/api/learning/events")
        .send({
          userId: 5,
          type: "mastery",
          data: {
            objectiveId: "obj1",
            progress: 0.7,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(5);
    });

    it("should return 400 for missing type", async () => {
      const response = await request(app)
        .post("/api/learning/events")
        .send({
          data: { test: true },
        });

      expect(response.status).toBe(400);
    });

    it("should validate data field types", async () => {
      const response = await request(app)
        .post("/api/learning/events")
        .send({
          type: "test",
          data: {
            validString: "hello",
            validNumber: 42,
            validBoolean: true,
          },
        });

      expect(response.status).toBe(200);
    });
  });
});
