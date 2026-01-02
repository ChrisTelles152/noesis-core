import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import OpenAI from "openai";

// Response validation schemas for OpenAI responses
const orchestrationResponseSchema = z.object({
  suggestion: z.string(),
  explanation: z.string().optional(),
  resourceLinks: z.array(z.string()).optional().default([]),
});

const engagementResponseSchema = z.object({
  message: z.string(),
  type: z.string(),
});

// Learning event data schema with specific allowed fields
const learningEventDataSchema = z.object({
  context: z.string().optional(),
  attentionScore: z.number().optional(),
  recommendation: z.string().optional(),
  intervention: z.string().optional(),
  objectiveId: z.string().optional(),
  progress: z.number().optional(),
  result: z.number().optional(),
}).catchall(z.union([z.string(), z.number(), z.boolean()]).optional()); // Allow additional primitive fields

// Helper to get user ID from request (supports future auth integration)
function getUserIdFromRequest(req: Request): number {
  // When auth is implemented, extract from req.user or session
  // For now, check if userId is provided in the request body
  const bodyUserId = (req.body as { userId?: number })?.userId;
  return bodyUserId ?? 1; // Default to user 1 if not specified
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize OpenAI client - require proper configuration
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not configured. LLM features will use fallback responses.");
  }
  const openai = new OpenAI({
    apiKey: apiKey || "sk-placeholder" // OpenAI SDK requires a non-empty string
  });
  const isOpenAIConfigured = !!apiKey;

  // Orchestration API routes
  app.post('/api/orchestration/next-step', async (req, res) => {
    try {
      const requestSchema = z.object({
        learnerState: z.object({
          attention: z.object({
            score: z.number().min(0).max(1).optional(),
            focusStability: z.number().min(0).max(1).optional(),
            cognitiveLoad: z.number().min(0).max(1).optional(),
            status: z.string().optional()
          }).optional(),
          mastery: z.array(z.object({
            id: z.string(),
            name: z.string(),
            progress: z.number().min(0).max(1),
            status: z.string()
          })).optional(),
          timestamp: z.number()
        }),
        context: z.string().optional(),
        options: z.object({
          detail: z.enum(['low', 'medium', 'high']).optional(),
          format: z.enum(['text', 'json']).optional()
        }).optional()
      });

      // Validate request body
      const validatedData = requestSchema.parse(req.body);
      
      // Get attention and mastery data
      const attentionScore = validatedData.learnerState.attention?.score || 0.5;
      const masteryData = validatedData.learnerState.mastery || [];
      const context = validatedData.context || 'general learning';
      
      let response;

      // Call OpenAI for adaptive learning suggestions (only if configured)
      if (isOpenAIConfigured) {
        try {
          // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: "You are an adaptive learning assistant that provides personalized learning recommendations based on attention data and mastery progress. Respond with JSON in this format: { 'suggestion': string, 'explanation': string, 'resourceLinks': string[] }"
              },
              {
                role: "user",
                content: `
                  Learner attention score: ${attentionScore} (0-1 scale)
                  Context: ${context}
                  Mastery data: ${JSON.stringify(masteryData)}

                  Based on this data, provide a recommendation for what the learner should do next.
                  Keep suggestions concise, evidence-based, and personalized to attention level and context.
                `
              }
            ],
            response_format: { type: "json_object" }
          });

          const rawContent = completion.choices[0].message.content;
          if (!rawContent) {
            throw new Error("Empty response from OpenAI");
          }

          // Parse and validate the response
          const parsedResult = JSON.parse(rawContent);
          const validatedResult = orchestrationResponseSchema.parse(parsedResult);

          response = {
            suggestion: validatedResult.suggestion,
            explanation: validatedResult.explanation,
            resourceLinks: validatedResult.resourceLinks,
            type: 'llm-generated'
          };
        } catch (error) {
          console.error('Error calling OpenAI:', error);

          // Fallback response if OpenAI call fails
          response = {
            suggestion: "Based on your progress, I recommend continuing with the current concept.",
            explanation: "This recommendation is based on your current attention and mastery levels.",
            resourceLinks: [],
            type: 'fallback'
          };
        }
      } else {
        // No API key configured - use fallback
        response = {
          suggestion: "Based on your progress, I recommend continuing with the current concept.",
          explanation: "This recommendation is based on your current attention and mastery levels.",
          resourceLinks: [],
          type: 'fallback'
        };
      }

      // Store the recommendation in the learning history
      const userId = getUserIdFromRequest(req);
      await storage.createLearningEvent({
        userId,
        type: 'recommendation',
        data: {
          context,
          attentionScore,
          recommendation: response.suggestion
        },
        timestamp: new Date()
      });

      res.json(response);
    } catch (error) {
      console.error('Error in next-step endpoint:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Invalid request' 
      });
    }
  });

  app.post('/api/orchestration/engagement', async (req, res) => {
    try {
      const requestSchema = z.object({
        attentionScore: z.number().min(0).max(1).optional(),
        context: z.string().optional(),
        previousInterventions: z.array(z.string()).optional()
      });

      // Validate request body
      const validatedData = requestSchema.parse(req.body);
      
      const attentionScore = validatedData.attentionScore || 0.3; // Default to low attention
      const context = validatedData.context || 'general learning';
      const previousInterventions = validatedData.previousInterventions || [];
      
      let response;

      // Helper function to get fallback engagement response
      const getFallbackEngagement = () => {
        const suggestions = [
          "Would you like to take a quick 30-second break to refresh?",
          "Let's try a different approach to this concept. How about a visual example?",
          "Would it help to see a real-world application of this concept?",
          "Let's make this more interactive. Can you try solving a simple version of this problem?",
          "Sometimes a change of pace helps. Would you like to switch to a related topic and come back to this later?"
        ];

        // Avoid repeating the same suggestion if possible
        let availableSuggestions = suggestions.filter(s => !previousInterventions.includes(s));
        if (availableSuggestions.length === 0) {
          availableSuggestions = suggestions;
        }

        const randomIndex = Math.floor(Math.random() * availableSuggestions.length);

        return {
          message: availableSuggestions[randomIndex],
          type: 'attention-prompt',
          source: 'fallback'
        };
      };

      // Call OpenAI for engagement suggestions (only if configured)
      if (isOpenAIConfigured) {
        try {
          // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: "You are an adaptive learning assistant focused on maintaining learner engagement. Respond with JSON in this format: { 'message': string, 'type': string }"
              },
              {
                role: "user",
                content: `
                  Learner attention score: ${attentionScore} (0-1 scale, lower means less attentive)
                  Context: ${context}
                  Previous interventions: ${JSON.stringify(previousInterventions)}

                  The learner's attention appears to be dropping. Suggest a brief intervention to re-engage them.
                  Keep your suggestion concise, friendly, and immediately actionable. The type should be one of:
                  attention-prompt, interactive-element, modality-change, micro-break, social-engagement
                `
              }
            ],
            response_format: { type: "json_object" }
          });

          const rawContent = completion.choices[0].message.content;
          if (!rawContent) {
            throw new Error("Empty response from OpenAI");
          }

          // Parse and validate the response
          const parsedResult = JSON.parse(rawContent);
          const validatedResult = engagementResponseSchema.parse(parsedResult);

          response = {
            message: validatedResult.message,
            type: validatedResult.type,
            source: 'llm-generated'
          };
        } catch (error) {
          console.error('Error calling OpenAI:', error);
          response = getFallbackEngagement();
        }
      } else {
        // No API key configured - use fallback
        response = getFallbackEngagement();
      }

      // Store the engagement intervention in learning history
      const userId = getUserIdFromRequest(req);
      await storage.createLearningEvent({
        userId,
        type: 'engagement',
        data: {
          context,
          attentionScore,
          intervention: response.message
        },
        timestamp: new Date()
      });

      res.json(response);
    } catch (error) {
      console.error('Error in engagement endpoint:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Invalid request' 
      });
    }
  });

  // Learning analytics endpoints
  app.get('/api/analytics/attention', async (req, res) => {
    try {
      const events = await storage.getLearningEventsByType('attention');
      res.json(events);
    } catch (error) {
      console.error('Error fetching attention analytics:', error);
      res.status(500).json({ error: 'Failed to fetch attention data' });
    }
  });

  app.get('/api/analytics/mastery', async (req, res) => {
    try {
      const events = await storage.getLearningEventsByType('mastery');
      res.json(events);
    } catch (error) {
      console.error('Error fetching mastery analytics:', error);
      res.status(500).json({ error: 'Failed to fetch mastery data' });
    }
  });

  app.post('/api/learning/events', async (req, res) => {
    try {
      const eventSchema = z.object({
        userId: z.number().optional(),
        type: z.string(),
        data: learningEventDataSchema,
        timestamp: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined)
      });

      const validatedData = eventSchema.parse(req.body);
      const userId = validatedData.userId ?? getUserIdFromRequest(req);

      const event = await storage.createLearningEvent({
        userId,
        type: validatedData.type,
        data: validatedData.data,
        timestamp: validatedData.timestamp || new Date()
      });
      res.json(event);
    } catch (error) {
      console.error('Error creating learning event:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
