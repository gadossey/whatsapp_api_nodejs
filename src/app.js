require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const chatRoutes = require('./routes/ChatRoutes');
const webhookRoutes = require('./routes/WebhookRoutes');

const app = express();

// Parse JSON bodies
app.use(bodyParser.json());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '../public')));

// Define API routes
app.use('/api/chats', chatRoutes);
app.use('/api/webhook', webhookRoutes);

// Serve the index.html file for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
