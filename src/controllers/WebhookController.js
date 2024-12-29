const ChatSession = require('../models/ChatSession');

class WebhookController {
    // Verify webhook (required for setting up WhatsApp API webhook)
    static verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('Received mode:', mode);
        console.log('Received token:', token);
        console.log('Expected token:', process.env.VERIFY_TOKEN);

        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            console.log('Webhook verified successfully');
            res.status(200).send(challenge); // Respond with the challenge
        } else {
            console.error('Webhook verification failed. Check token or mode.');
            res.status(403).send('Verification failed');
        }
    }



    // Handle incoming messages
    static async handleWebhook(req, res) {
        const body = req.body;

        console.log('Webhook payload:', JSON.stringify(body, null, 2));

        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    if (change.field === 'messages' && change.value.statuses) {
                        const statuses = change.value.statuses;

                        if (Array.isArray(statuses)) {
                            for (const status of statuses) {
                                console.log(`Status update: Message ID ${status.id} is ${status.status}`);
                                // You can log or process status updates here.
                            }
                        } else {
                            console.error('Invalid statuses format:', statuses);
                        }
                    } else if (change.field === 'messages' && change.value.messages) {
                        const messages = change.value.messages;

                        if (Array.isArray(messages)) {
                            for (const message of messages) {
                                const phoneNumber = message.from;
                                const text = message.text?.body || null;

                                // Save received message to database
                                await ChatSession.findOneAndUpdate(
                                    { phoneNumber },
                                    {
                                        $push: {
                                            messages: {
                                                phoneNumber,
                                                message: text,
                                                sentBy: 'system',
                                            },
                                        },
                                    },
                                    { upsert: true }
                                );

                                console.log(`Message received from ${phoneNumber}: ${text}`);
                            }
                        } else {
                            console.error('Invalid messages format:', messages);
                        }
                    }
                }
            }

            res.status(200).send('EVENT_RECEIVED');
        } else {
            res.sendStatus(404);
        }
    }


}

module.exports = WebhookController;
