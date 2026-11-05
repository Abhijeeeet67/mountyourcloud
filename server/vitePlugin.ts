import type { Plugin } from 'vite';
import { handleOAuthRequest } from './oauthHandler.ts';

export function oauthServerPlugin(): Plugin {
  return {
    name: 'mountyourclouds-oauth-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (url.startsWith('/api/oauth')) {
          try {
            const handled = await handleOAuthRequest(req, res, url);
            if (handled) return;
          } catch (err) {
            console.error('OAuth middleware error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal OAuth server error.' }));
            return;
          }
        }
        next();
      });
    },
  };
}
