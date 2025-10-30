const express = require('express');
const app = express();
const PORT = 3000;

// Middleware to parse JSON request bodies
app.use(express.json());

// GET /hello endpoint - returns a greeting
app.get('/hello', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

// POST /echo endpoint - returns back the request body
app.post('/echo', (req, res) => {
  res.json(req.body);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
