const express = require('express');
const axios = require('axios');

const router = express.Router();

// Respond to preflight directly so the browser doesn't send OPTIONS to the upstream service
router.options('/', (req, res) => {
  // CORS middleware on app will set necessary headers; just respond 204
  return res.sendStatus(204);
});

// Proxy POST / -> forwards to configured semantic search service to avoid CORS from the browser
router.post('/', async (req, res) => {
  try {
    const target = process.env.SEMANTIC_SEARCH_URL || 'https://web-production-1aa96.up.railway.app/api/semantic-search';

    // Basic request logging for debugging in prod
    console.log(`[SEMANTIC-PROXY] Forwarding request to ${target}`);
    const start = Date.now();

    // Forward the request body and authorization header
    const response = await axios.post(target, req.body, {
      headers: {
        Authorization: req.headers.authorization || '',
        'Content-Type': req.headers['content-type'] || 'application/json'
      },
      timeout: parseInt(process.env.SEMANTIC_SEARCH_TIMEOUT_MS || '60000', 10) // default 60s
    });

    console.log(`[SEMANTIC-PROXY] Upstream responded in ${Date.now() - start}ms with status ${response.status}`);

    return res.status(response.status).json(response.data);
  } catch (err) {
    console.error('Error proxying semantic-search:', err.message || err, err.response ? err.response.data : '');
    if (err.response) {
      return res.status(err.response.status).json({ message: 'Upstream error', error: err.response.data });
    }
    return res.status(502).json({ message: 'Bad gateway', error: err.message });
  }
});

module.exports = router;
