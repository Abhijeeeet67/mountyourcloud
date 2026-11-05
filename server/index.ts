import http from 'node:http';
import { handleOAuthRequest } from './oauthHandler.ts';

const PORT = Number(process.env.PORT) || 3001;

const server = http.createServer(async (req, res) => {
  const url = req.url || '';
  if (url.startsWith('/api/oauth')) {
    try {
      const handled = await handleOAuthRequest(req, res, url);
      if (handled) return;
    } catch (err) {
      console.error('Server error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error.' }));
      return;
    }
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found.' }));
});

server.listen(PORT, () => {
  console.log(`MountYourClouds OAuth & Security Server running on port ${PORT}`);
});
