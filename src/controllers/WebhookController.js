const ChatSession = require('../models/ChatSession');

class WebhookController {
    // Verify webhook (required for setting up WhatsApp API webhook)
    static verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('Webhook verification request received');
        console.log(`Mode: ${mode}, Token: ${token}`);

        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            console.log('Webhook verified successfully.');
            res.status(200).send(challenge); // Respond with the challenge
        } else {
            console.error('Webhook verification failed.');
            res.status(403).send('Verification failed');
        }
    }

    // Handle incoming messages
    static async handleWebhook(req, res) {
        const body = req.body;

        console.log('Received webhook payload:');
        console.log(JSON.stringify(body, null, 2));

        // Check if this is a WhatsApp event
        if (body.object !== 'whatsapp_business_account') {
            console.error('Not a WhatsApp event');
            return res.sendStatus(404); // Not a WhatsApp event
        }

        try {
            const updatePromises = [];

            // Process each entry in the webhook body
            for (const entry of body.entry || []) {
                console.log('Processing entry:', entry);
                for (const change of entry.changes || []) {
                    console.log('Processing change:', change);
                    if (change.field === 'messages' && change.value.messages) {
                        const messages = change.value.messages;
                        console.log(`Received ${messages.length} messages`);

                        // Process each message
                        messages.forEach((message) => {
                            const phoneNumber = message.from;
                            const text = message.text?.body || null;
                            const mediaUrl = message.image?.link || null;

                            console.log(`Processing message from ${phoneNumber}`);
                            console.log(`Text: ${text}`);
                            console.log(`Media URL: ${mediaUrl}`);

                            // Save received message to database
                            const updatePromise = ChatSession.findOneAndUpdate(
                                { phoneNumber },
                                {
                                    $push: {
                                        messages: {
                                            text, // Use `text` instead of `message`
                                            mediaUrl,
                                            sentBy: 'system',
                                            timestamp: new Date(),
                                        },
                                    },
                                },
                                { upsert: true, new: true }
                            );
                            updatePromises.push(updatePromise);

                            console.log(`Message processed for ${phoneNumber}`);
                        });
                    }
                }
            }

            // Wait for all updates to complete
            await Promise.all(updatePromises);

            console.log('All messages processed successfully');
            res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            console.error('Error processing webhook:', error);
            res.status(500).send('Internal Server Error');
        }
    }
}

module.exports = WebhookController;
