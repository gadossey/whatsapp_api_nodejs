const express = require('express');
const WebhookController = require('../controllers/WebhookController');
const router = express.Router();

router.get('/', (req, res) => {
    console.log('GET /webhook triggered');
    WebhookController.verifyWebhook(req, res);
});

router.post('/', (req, res) => {
    console.log('POST /webhook triggered');
    WebhookController.handleWebhook(req, res);
});


module.exports = router;
