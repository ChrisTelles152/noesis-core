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
    { name: 'Core Engine', description: 'Core learning engine event storage and state persistence' },
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
        security: [],
        responses: {
          200: {
            description: 'Successfully logged in',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
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
        security: [],
        responses: {
          201: {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          400: { description: 'Invalid input (username format, password complexity)' },
          409: { description: 'Username already exists' },
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
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current authenticated user',
        responses: {
          200: {
            description: 'Current user information',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          401: { description: 'Not authenticated' },
        },
      },
    },
    '/auth/providers': {
      get: {
        tags: ['Authentication'],
        summary: 'Check available authentication providers',
        security: [],
        responses: {
          200: {
            description: 'Available auth providers',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    local: { type: 'boolean' },
                    google: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/check-username/{username}': {
      get: {
        tags: ['Authentication'],
        summary: 'Check if a username is available',
        security: [],
        parameters: [
          {
            name: 'username',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Username availability',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    available: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/google': {
      get: {
        tags: ['Authentication'],
        summary: 'Initiate Google OAuth flow',
        description: 'Redirects to Google for authentication. Only available when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.',
        security: [],
        responses: {
          302: { description: 'Redirect to Google OAuth consent screen' },
        },
      },
    },
    '/auth/google/callback': {
      get: {
        tags: ['Authentication'],
        summary: 'Google OAuth callback',
        description: 'Handles the OAuth callback from Google. Redirects to / on success or /login?error=google_auth_failed on failure.',
        security: [],
        parameters: [
          { name: 'code', in: 'query', schema: { type: 'string' } },
          { name: 'state', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          302: { description: 'Redirect to / (success) or /login (failure)' },
        },
      },
    },
    '/csrf-token': {
      get: {
        tags: ['System'],
        summary: 'Get a fresh CSRF token',
        security: [],
        responses: {
          200: {
            description: 'CSRF token',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
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
        security: [],
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
    '/core/events': {
      post: {
        tags: ['Core Engine'],
        summary: 'Store a single typed NoesisEvent',
        description: 'Validates and stores a canonical core engine event. The full NoesisEvent is preserved in data._coreEvent for lossless replay.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NoesisEvent' },
            },
          },
        },
        responses: {
          201: {
            description: 'Event stored',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    coreEventId: { type: 'string' },
                    type: { type: 'string' },
                  },
                },
              },
            },
          },
          400: { description: 'Validation error (missing fields, unknown event type)' },
          401: { description: 'Authentication required' },
        },
      },
      get: {
        tags: ['Core Engine'],
        summary: 'Retrieve all core events for current user',
        description: 'Extracts stored NoesisEvents from learning_events, sorted by timestamp.',
        responses: {
          200: {
            description: 'Core events',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: { type: 'integer' },
                    events: { type: 'array', items: { $ref: '#/components/schemas/NoesisEvent' } },
                  },
                },
              },
            },
          },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/core/events/batch': {
      post: {
        tags: ['Core Engine'],
        summary: 'Store up to 100 NoesisEvents',
        description: 'Each event is validated individually. Valid events are stored; invalid ones are reported in the response.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/NoesisEvent' },
                minItems: 1,
                maxItems: 100,
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Batch result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    stored: { type: 'integer' },
                    results: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          coreEventId: { type: 'string' },
                          stored: { type: 'boolean' },
                          error: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid request' },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/engine/state': {
      put: {
        tags: ['Core Engine'],
        summary: 'Save full engine state snapshot',
        description: 'Upserts the JSON string from engine.exportState(). Contains BKT probabilities, FSRS schedules, transfer results, and event log.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['state'],
                properties: {
                  state: { type: 'string', minLength: 1 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'State saved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    saved: { type: 'boolean' },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid request' },
          401: { description: 'Authentication required' },
        },
      },
      get: {
        tags: ['Core Engine'],
        summary: 'Load saved engine state',
        description: 'Returns the previously saved engine state snapshot for engine.importState().',
        responses: {
          200: {
            description: 'Engine state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    state: { type: 'string' },
                  },
                },
              },
            },
          },
          401: { description: 'Authentication required' },
          404: { description: 'No engine state found for this user' },
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
      NoesisEvent: {
        type: 'object',
        description: 'A canonical core engine event (practice, diagnostic, transfer_test, session_start, session_end)',
        required: ['id', 'type', 'learnerId', 'timestamp', 'sessionId'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['practice', 'diagnostic', 'transfer_test', 'session_start', 'session_end'] },
          learnerId: { type: 'string' },
          timestamp: { type: 'number' },
          sessionId: { type: 'string' },
          skillId: { type: 'string' },
          itemId: { type: 'string' },
          correct: { type: 'boolean' },
          responseTimeMs: { type: 'number' },
          confidence: { type: 'number' },
          errorCategory: { type: 'string' },
          testId: { type: 'string' },
          transferType: { type: 'string', enum: ['near', 'far'] },
          score: { type: 'number' },
          passed: { type: 'boolean' },
          skillsAssessed: { type: 'array', items: { type: 'string' } },
          results: { type: 'array', items: { type: 'object' } },
          config: { type: 'object' },
          summary: { type: 'object' },
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
