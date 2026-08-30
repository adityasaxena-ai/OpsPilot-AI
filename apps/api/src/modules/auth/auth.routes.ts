import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import { db } from '../../lib/db.js';
import { signJwt } from './jwt.service.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Rate limit login attempts tightly: 10 attempts/min per IP to prevent brute-force attacks
  const LOGIN_RATE_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } } as const;

  // POST /api/v1/auth/login — Authenticate user and issue JWT
  app.post<{
    Body: { username?: string; password?: string };
  }>('/login', {
    ...LOGIN_RATE_LIMIT,
    schema: {
      tags: ['auth'],
      summary: 'Authenticate user and issue Bearer JWT',
      security: [],
      body: {

        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', description: 'Username for demo or production user' },
          password: { type: 'string', description: 'User password' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    username: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body ?? {};


    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      });
    }

    const user = await db.user.findUnique({
      where: { username: username.trim().toLowerCase() },
    });

    if (!user || !user.passwordHash) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      });
    }

    const isMatch = await argon2.verify(user.passwordHash, password);
    if (!isMatch) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      });
    }

    const token = signJwt({
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      name: user.name,
    });

    return reply.send({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name || user.username,
          email: user.email,
          role: user.role,
        },
      },
    });
  });
};
