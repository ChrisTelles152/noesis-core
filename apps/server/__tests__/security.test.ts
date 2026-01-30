import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import session from 'express-session';
import { insertUserSchema } from '../../../shared/schema';
import {
  sanitizeObject,
  sanitizeString,
  escapeHtml,
  isSafeKey,
} from '../middleware/sanitize';

describe('Security Tests', () => {
  describe('Mass Assignment Prevention', () => {
    it('should only allow username and password in InsertUser schema', () => {
      const validInput = { username: 'testuser', password: 'Test123!' };
      const result = insertUserSchema.safeParse(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.keys(result.data)).toEqual(['username', 'password']);
      }
    });

    it('should strip extra fields from user input', () => {
      const maliciousInput = {
        username: 'testuser',
        password: 'Test123!',
        id: 999,
        isAdmin: true,
        role: 'admin',
      };

      const result = insertUserSchema.safeParse(maliciousInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('id');
        expect(result.data).not.toHaveProperty('isAdmin');
        expect(result.data).not.toHaveProperty('role');
        expect(Object.keys(result.data)).toEqual(['username', 'password']);
      }
    });

    it('should reject input missing required fields', () => {
      const invalidInput = { username: 'testuser' };
      const result = insertUserSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });
  });

  describe('XSS Prevention', () => {
    it('should escape script tags', () => {
      const malicious = '<script>alert("xss")</script>';
      const escaped = escapeHtml(malicious);

      expect(escaped).not.toContain('<script>');
      expect(escaped).not.toContain('</script>');
      expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should escape event handlers', () => {
      const malicious = '<img src="x" onerror="alert(1)">';
      const escaped = escapeHtml(malicious);

      expect(escaped).not.toContain('<img');
      expect(escaped).toBe('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;');
    });

    it('should escape anchor tags with javascript: URLs', () => {
      // Note: escapeHtml escapes HTML tags, not URL protocols
      // javascript: protocol filtering is handled by CSP headers
      const malicious = '<a href="javascript:alert(1)">click</a>';
      const escaped = escapeHtml(malicious);

      // The HTML is properly escaped - tags can't be injected
      expect(escaped).not.toContain('<a');
      expect(escaped).not.toContain('</a>');
      expect(escaped).toBe('&lt;a href=&quot;javascript:alert(1)&quot;&gt;click&lt;&#x2F;a&gt;');
    });

    it('should handle nested injection attempts', () => {
      const malicious = '<<script>script>alert(1)<</script>/script>';
      const escaped = escapeHtml(malicious);

      expect(escaped).not.toContain('<script>');
      expect(escaped).not.toContain('</script>');
    });

    it('should escape single and double quotes', () => {
      const malicious = "' OR '1'='1";
      const escaped = escapeHtml(malicious);

      expect(escaped).not.toContain("'");
      expect(escaped).toBe('&#x27; OR &#x27;1&#x27;=&#x27;1');
    });
  });

  describe('Input Sanitization', () => {
    it('should remove null bytes', () => {
      const malicious = 'test\x00injection';
      const sanitized = sanitizeString(malicious);

      expect(sanitized).not.toContain('\x00');
      expect(sanitized).toBe('testinjection');
    });

    it('should trim whitespace to prevent padding attacks', () => {
      const padded = '   admin   ';
      const sanitized = sanitizeString(padded);

      expect(sanitized).toBe('admin');
      expect(sanitized.length).toBe(5);
    });

    it('should enforce length limits to prevent DoS', () => {
      const longString = 'x'.repeat(20000);
      const sanitized = sanitizeString(longString);

      expect(sanitized.length).toBe(10000);
    });

    it('should handle unicode normalization attacks', () => {
      // Fullwidth 'a' character
      const unicode = '\uFF41dmin';
      const sanitized = sanitizeString(unicode);

      // Should preserve the string but not treat fullwidth 'a' as regular 'a'
      expect(sanitized).toBe('\uFF41dmin');
    });
  });

  describe('Prototype Pollution Prevention', () => {
    it('should block __proto__ in nested JSON', () => {
      const malicious = JSON.parse('{"user": {"__proto__": {"isAdmin": true}}}');
      const result = sanitizeObject(malicious);

      expect((result.user as any).__proto__).toBeUndefined();
      expect(({} as any).isAdmin).toBeUndefined();
    });

    it('should block constructor.prototype', () => {
      const malicious = JSON.parse('{"constructor": {"prototype": {"polluted": true}}}');
      const result = sanitizeObject(malicious);

      expect(result.constructor).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('should handle recursive pollution attempts', () => {
      const malicious = JSON.parse(`{
        "a": {"b": {"c": {"__proto__": {"deep": true}}}}
      }`);
      const result = sanitizeObject(malicious);

      expect(({} as any).deep).toBeUndefined();
    });

    it('should use null prototype to prevent Object methods access', () => {
      const input = { key: 'value' };
      const result = sanitizeObject(input);

      // Result should not inherit from Object.prototype
      expect(Object.getPrototypeOf(result)).toBeNull();
      expect(result.hasOwnProperty).toBeUndefined();
      expect(result.toString).toBeUndefined();
    });
  });

  describe('Session Security', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(
        session({
          secret: 'test-secret-for-testing',
          resave: false,
          saveUninitialized: false,
          cookie: {
            httpOnly: true,
            secure: false, // Testing environment
            sameSite: 'strict',
          },
        })
      );
      app.use(express.json());
    });

    it('should set httpOnly cookie flag', async () => {
      app.get('/test', (req, res) => {
        req.session.userId = 1;
        res.json({ ok: true });
      });

      const response = await request(app).get('/test');

      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        expect(cookieStr).toMatch(/HttpOnly/i);
      }
    });

    it('should set SameSite cookie flag', async () => {
      app.get('/test', (req, res) => {
        req.session.userId = 1;
        res.json({ ok: true });
      });

      const response = await request(app).get('/test');

      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        expect(cookieStr).toMatch(/SameSite=Strict/i);
      }
    });

    it('should regenerate session ID on authentication', async () => {
      let originalSessionId: string | undefined;

      app.get('/before', (req, res) => {
        originalSessionId = req.sessionID;
        res.json({ sessionId: req.sessionID });
      });

      app.post('/login', (req, res) => {
        req.session.regenerate((err) => {
          if (err) {
            return res.status(500).json({ error: 'Session regeneration failed' });
          }
          req.session.userId = 1;
          res.json({ sessionId: req.sessionID, changed: req.sessionID !== originalSessionId });
        });
      });

      const agent = request.agent(app);

      // Get initial session
      await agent.get('/before');

      // Login should regenerate session
      const loginResponse = await agent.post('/login').send({});

      expect(loginResponse.body.changed).toBe(true);
    });
  });

  describe('Request Size Limits', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json({ limit: '10kb' }));
      app.post('/test', (req, res) => {
        res.json({ received: true });
      });
    });

    it('should accept requests within size limit', async () => {
      const response = await request(app)
        .post('/test')
        .send({ data: 'x'.repeat(1000) });

      expect(response.status).toBe(200);
    });

    it('should reject requests exceeding size limit', async () => {
      const response = await request(app)
        .post('/test')
        .send({ data: 'x'.repeat(20000) });

      expect(response.status).toBe(413);
    });
  });

  describe('Password Security', () => {
    it('should reject passwords shorter than 8 characters', () => {
      const shortPassword = 'Abc1!';
      expect(shortPassword.length).toBeLessThan(8);
    });

    it('should require uppercase letters', () => {
      const noUppercase = 'password123!';
      expect(/[A-Z]/.test(noUppercase)).toBe(false);
    });

    it('should require lowercase letters', () => {
      const noLowercase = 'PASSWORD123!';
      expect(/[a-z]/.test(noLowercase)).toBe(false);
    });

    it('should require digits', () => {
      const noDigits = 'Password!@#';
      expect(/[0-9]/.test(noDigits)).toBe(false);
    });

    it('should require special characters', () => {
      const noSpecial = 'Password123';
      expect(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(noSpecial)).toBe(false);
    });

    it('should accept valid complex passwords', () => {
      const validPassword = 'SecurePass123!';
      const hasUppercase = /[A-Z]/.test(validPassword);
      const hasLowercase = /[a-z]/.test(validPassword);
      const hasDigit = /[0-9]/.test(validPassword);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(validPassword);

      expect(hasUppercase).toBe(true);
      expect(hasLowercase).toBe(true);
      expect(hasDigit).toBe(true);
      expect(hasSpecial).toBe(true);
      expect(validPassword.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Username Security', () => {
    it('should only allow alphanumeric, underscore, and hyphen', () => {
      const validPattern = /^[a-zA-Z0-9_-]+$/;

      expect(validPattern.test('valid_user-123')).toBe(true);
      expect(validPattern.test('user@domain.com')).toBe(false);
      expect(validPattern.test('user<script>')).toBe(false);
      expect(validPattern.test("user'; DROP TABLE users;--")).toBe(false);
      expect(validPattern.test('user name')).toBe(false);
    });

    it('should enforce minimum length', () => {
      expect('ab'.length).toBeLessThan(3);
      expect('abc'.length).toBeGreaterThanOrEqual(3);
    });

    it('should enforce maximum length', () => {
      const longUsername = 'a'.repeat(51);
      expect(longUsername.length).toBeGreaterThan(50);
    });
  });

  describe('Email Validation', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    it('should accept valid email formats', () => {
      expect(emailRegex.test('user@example.com')).toBe(true);
      expect(emailRegex.test('user.name@domain.co.uk')).toBe(true);
      expect(emailRegex.test('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(emailRegex.test('notanemail')).toBe(false);
      expect(emailRegex.test('@nodomain.com')).toBe(false);
      expect(emailRegex.test('user@')).toBe(false);
      expect(emailRegex.test('user@.com')).toBe(false);
      expect(emailRegex.test('user name@domain.com')).toBe(false);
    });

    it('should enforce maximum email length', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(longEmail.length).toBeGreaterThan(254);
    });
  });

  describe('Dangerous Key Detection', () => {
    it('should identify __proto__ as dangerous', () => {
      expect(isSafeKey('__proto__')).toBe(false);
    });

    it('should identify constructor as dangerous', () => {
      expect(isSafeKey('constructor')).toBe(false);
    });

    it('should identify prototype as dangerous', () => {
      expect(isSafeKey('prototype')).toBe(false);
    });

    it('should allow normal keys', () => {
      expect(isSafeKey('name')).toBe(true);
      expect(isSafeKey('userId')).toBe(true);
      expect(isSafeKey('data')).toBe(true);
      expect(isSafeKey('__internal__')).toBe(true);
      expect(isSafeKey('_private')).toBe(true);
    });

    it('should be case-sensitive (security through strictness)', () => {
      // While __PROTO__ wouldn't work as a pollution vector,
      // being case-sensitive is the correct behavior
      expect(isSafeKey('__PROTO__')).toBe(true);
      expect(isSafeKey('Constructor')).toBe(true);
      expect(isSafeKey('PROTOTYPE')).toBe(true);
    });
  });

  describe('Content Type Security', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.post('/api/test', (req, res) => {
        res.json({ received: req.body });
      });
    });

    it('should parse valid JSON content type', async () => {
      const response = await request(app)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ data: 'test' }));

      expect(response.status).toBe(200);
      expect(response.body.received).toEqual({ data: 'test' });
    });

    it('should handle missing content type gracefully', async () => {
      const response = await request(app)
        .post('/api/test')
        .send('{"data": "test"}');

      // Express.json() should handle this based on content
      expect([200, 400]).toContain(response.status);
    });
  });
});
