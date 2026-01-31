/**
 * OpenAPI Documentation
 * Generates OpenAPI 3.0 specification for the API
 */

import type { Express } from 'express';

const OPENAPI_VERSION = '3.0.3';
const API_VERSION = '1.0.0';

export const openApiSpec = {
  openapi: OPENAPI_VERSION,
  info: {
    title: 'Noesis SDK API',
    version: API_VERSION,
    description:
      'Adaptive learning API with attention tracking, mastery learning, and LLM-powered orchestration.',
    contact: {
      name: 'Noesis SDK Support',
      url: 'https://github.com/noesis-sdk',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'API Base URL',
    },
  ],
  tags: [
    { name: 'Authentication', description: 'User authentication endpoints' },
    { name: 'Orchestration', description: 'LLM-powered learning orchestration' },
    { name: 'Analytics', description: 'Learning analytics and metrics' },
    { name: 'Learning Events', description: 'Learning event tracking' },
    { name: 'System', description: 'System status and health' },
  ],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login with username and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', minLength: 3 },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Successfully logged in',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', minLength: 3 },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          400: { description: 'Username already taken or invalid input' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout current user',
        responses: {
          200: { description: 'Successfully logged out' },
        },
      },
    },
    '/auth/user': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current authenticated user',
        responses: {
          200: {
            description: 'Current user information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      oneOf: [{ $ref: '#/components/schemas/User' }, { type: 'null' }],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/orchestration/next-step': {
      post: {
        tags: ['Orchestration'],
        summary: 'Get personalized learning recommendation',
        description:
          'Uses LLM to generate a learning recommendation based on attention and mastery data.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OrchestrationRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Learning recommendation',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OrchestrationResponse' },
              },
            },
          },
          400: { description: 'Invalid request body' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/orchestration/engagement': {
      post: {
        tags: ['Orchestration'],
        summary: 'Get engagement suggestion for low attention',
        description: 'Suggests interventions when learner attention is dropping.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EngagementRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Engagement suggestion',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EngagementResponse' },
              },
            },
          },
          400: { description: 'Invalid request body' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/analytics/summary': {
      get: {
        tags: ['Analytics'],
        summary: 'Get analytics summary for current user',
        responses: {
          200: {
            description: 'Analytics summary',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AnalyticsSummary' },
              },
            },
          },
        },
      },
    },
    '/analytics/attention': {
      get: {
        tags: ['Analytics'],
        summary: 'Get attention tracking events',
        responses: {
          200: {
            description: 'List of attention events',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LearningEvent' },
                },
              },
            },
          },
        },
      },
    },
    '/analytics/mastery': {
      get: {
        tags: ['Analytics'],
        summary: 'Get mastery tracking events',
        responses: {
          200: {
            description: 'List of mastery events',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LearningEvent' },
                },
              },
            },
          },
        },
      },
    },
    '/learning/events': {
      post: {
        tags: ['Learning Events'],
        summary: 'Create a learning event',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateLearningEventRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Event created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LearningEvent' },
              },
            },
          },
          400: { description: 'Invalid request body' },
        },
      },
    },
    '/llm/status': {
      get: {
        tags: ['System'],
        summary: 'Get LLM provider status',
        responses: {
          200: {
            description: 'LLM status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LLMStatus' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
        },
      },
      AttentionData: {
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 1 },
          focusStability: { type: 'number', minimum: 0, maximum: 1 },
          cognitiveLoad: { type: 'number', minimum: 0, maximum: 1 },
          status: { type: 'string', enum: ['inactive', 'tracking', 'error'] },
        },
      },
      MasteryItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          progress: { type: 'number', minimum: 0, maximum: 1 },
          status: { type: 'string' },
        },
      },
      LearnerState: {
        type: 'object',
        required: ['timestamp'],
        properties: {
          attention: { $ref: '#/components/schemas/AttentionData' },
          mastery: {
            type: 'array',
            items: { $ref: '#/components/schemas/MasteryItem' },
          },
          timestamp: { type: 'integer' },
        },
      },
      OrchestrationRequest: {
        type: 'object',
        required: ['learnerState'],
        properties: {
          learnerState: { $ref: '#/components/schemas/LearnerState' },
          context: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              detail: { type: 'string', enum: ['low', 'medium', 'high'] },
              format: { type: 'string', enum: ['text', 'json'] },
            },
          },
        },
      },
      OrchestrationResponse: {
        type: 'object',
        properties: {
          suggestion: { type: 'string' },
          explanation: { type: 'string' },
          resourceLinks: { type: 'array', items: { type: 'string' } },
          type: { type: 'string' },
          provider: { type: 'string' },
          model: { type: 'string' },
        },
      },
      EngagementRequest: {
        type: 'object',
        properties: {
          attentionScore: { type: 'number', minimum: 0, maximum: 1 },
          context: { type: 'string' },
          previousInterventions: { type: 'array', items: { type: 'string' } },
        },
      },
      EngagementResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          type: { type: 'string' },
          source: { type: 'string' },
          provider: { type: 'string' },
          model: { type: 'string' },
        },
      },
      LearningEvent: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          userId: { type: 'integer' },
          type: { type: 'string' },
          data: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      CreateLearningEventRequest: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string' },
          data: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      AnalyticsSummary: {
        type: 'object',
        properties: {
          userId: { type: 'integer' },
          totalEvents: { type: 'integer' },
          eventCounts: {
            type: 'object',
            properties: {
              attention: { type: 'integer' },
              mastery: { type: 'integer' },
              recommendations: { type: 'integer' },
              engagements: { type: 'integer' },
            },
          },
          averageAttention: { type: 'number' },
          recentEvents: {
            type: 'array',
            items: { $ref: '#/components/schemas/LearningEvent' },
          },
          llmProvider: { type: 'string' },
        },
      },
      LLMStatus: {
        type: 'object',
        properties: {
          activeProvider: { type: 'string' },
          configuredProviders: { type: 'array', items: { type: 'string' } },
          hasLLMProvider: { type: 'boolean' },
        },
      },
    },
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'connect.sid',
      },
    },
  },
  security: [{ cookieAuth: [] }],
};

/**
 * Setup OpenAPI documentation routes
 */
export function setupOpenApiRoutes(app: Express): void {
  // Serve OpenAPI JSON spec
  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  // Serve simple HTML documentation viewer
  app.get('/api/docs', (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Noesis SDK API Documentation</title>
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" >
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
        <script>
          window.onload = function() {
            SwaggerUIBundle({
              url: "/api/docs/openapi.json",
              dom_id: '#swagger-ui',
              presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIBundle.SwaggerUIStandalonePreset
              ],
              layout: "BaseLayout"
            });
          };
        </script>
      </body>
      </html>
    `);
  });
}

export default openApiSpec;
