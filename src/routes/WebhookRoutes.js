const express = require('express');
const WebhookController = require('../controllers/WebhookController');
const router = express.Router();

// Webhook verification (GET)
router.get('/', WebhookController.verifyWebhook);

// Handle incoming webhook messages (POST)
router.post('/', WebhookController.handleWebhook);

module.exports = router;
