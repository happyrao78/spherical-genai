const express = require('express');
const axios = require('axios');
const { protect, adminOnly } = require('../middleware/auth'); // Assuming auth middleware is needed
require('dotenv').config(); // Ensure dotenv is configured if not done globally

const router = express.Router();

// Define the Python service URL (use environment variable, fallback to local)
// Ensure SEMANTIC_SEARCH_URL is set in your .env or environment variables
const pythonServiceUrl = process.env.PYTHON_API_URL || 'http://localhost:8000/api'; // Use '/api' prefix

// Route to proxy semantic search requests to the Python service
router.post('/', protect, adminOnly, async (req, res) => {
    try {
        const query = req.body.query;

        if (!query) {
            return res.status(400).json({ message: 'Search query is required' });
        }

        // --- START DEBUG LOGGING ---
        const headersToForward = {
            'Authorization': req.headers.authorization, // Forward the original Authorization header
            'Content-Type': 'application/json'
        };
        // --- END DEBUG LOGGING ---

        // Forward the request to the Python service
        const response = await axios.post(
            `${pythonServiceUrl}/semantic-search`, // Ensure this endpoint matches your Python API
            { query }, // Send the query in the request body
            {
                headers: headersToForward // Send the captured headers
            }
        );

        // Send the Python service's response back to the client
        res.json(response.data);

    } catch (error) {
        console.error('[SERVER-ERROR] Semantic Search Proxy Error:', error.response?.data || error.message);

        // Forward the status code and message from the Python service if possible
        if (error.response) {
            res.status(error.response.status || 500).json({
                message: error.response.data?.detail || error.response.data?.message || 'Error during semantic search via proxy',
                proxyError: true
            });
        } else {
            // General server error if no response from Python service
            res.status(500).json({ message: 'Internal server error in proxy', error: error.message });
        }
    }
});

module.exports = router;