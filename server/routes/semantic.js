const express = require('express');
const axios = require('axios');

const router = express.Router();

// Proxy POST / -> forwards to configured semantic search service to avoid CORS from the browser
router.post('/', async (req, res) => {
  try {
    const target = process.env.SEMANTIC_SEARCH_URL || 'https://web-production-1aa96.up.railway.app/api/semantic-search';

    // Forward the request body and authorization header
    const response = await axios.post(target, req.body, {
      headers: {
        Authorization: req.headers.authorization || '',
        'Content-Type': req.headers['content-type'] || 'application/json'
      },
      timeout: 20000
    });

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
