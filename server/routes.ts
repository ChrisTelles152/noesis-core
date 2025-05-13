import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import OpenAI from "openai";

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize OpenAI client
  const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY || "default_key" 
  });

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

      // Call OpenAI for adaptive learning suggestions
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

        const result = JSON.parse(completion.choices[0].message.content);
        
        response = {
          suggestion: result.suggestion,
          explanation: result.explanation,
          resourceLinks: result.resourceLinks || [],
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

      // Store the recommendation in the learning history
      await storage.createLearningEvent({
        userId: 1, // Default user for demo
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

      // Call OpenAI for engagement suggestions
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

        const result = JSON.parse(completion.choices[0].message.content);
        
        response = {
          message: result.message,
          type: result.type,
          source: 'llm-generated'
        };
      } catch (error) {
        console.error('Error calling OpenAI:', error);
        
        // Fallback engagement suggestions
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
        
        response = {
          message: availableSuggestions[randomIndex],
          type: 'attention-prompt',
          source: 'fallback'
        };
      }

      // Store the engagement intervention in learning history
      await storage.createLearningEvent({
        userId: 1, // Default user for demo
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
        data: z.record(z.any()),
        timestamp: z.date().optional()
      });

      const validatedData = eventSchema.parse(req.body);
      
      // Set defaults
      validatedData.userId = validatedData.userId || 1;
      validatedData.timestamp = validatedData.timestamp || new Date();
      
      const event = await storage.createLearningEvent(validatedData);
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
