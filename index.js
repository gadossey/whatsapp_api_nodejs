require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const helmet = require('helmet');
const morgan = require('morgan');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

// Validate required environment variables
const requiredEnvVars = ['MONGO_URI', 'PHONE_NUMBER_ID', 'WHATSAPP_TOKEN', 'VERIFY_TOKEN', 'PORT'];
for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
}

// Initialize express app
const app = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(morgan('dev'));

// Connect to MongoDB
mongoose
    .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Chat session schema
const chatSessionSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true },
    messages: [
        {
            sender: { type: String, enum: ['you', 'system', 'user'], required: true },
            text: { type: String },
            mediaUrl: { type: String },
            timestamp: { type: Date, default: Date.now },
        },
    ],
}, { timestamps: true });

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

// Normalize phone numbers
const DEFAULT_COUNTRY_CODE = 'GH';
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    const parsedNumber = parsePhoneNumberFromString(phone.trim(), DEFAULT_COUNTRY_CODE);
    return parsedNumber && parsedNumber.isValid() ? parsedNumber.format('E.164') : null;
}

// Send WhatsApp interactive greeting
async function sendWhatsAppGreeting(phoneNumber) {
    const interactiveMessage = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
            type: 'button',
            header: { type: 'text', text: 'Hi! I am Vico, your assistant. How may I help you today?' },
            body: { text: 'Choose an option below:' },
            action: {
                buttons: [
                    { type: 'reply', reply: { id: 'account_assistance', title: '1️⃣ Account Assistance' } },
                    { type: 'reply', reply: { id: 'services_pricing', title: '2️⃣ Services & Pricing' } },
                    { type: 'reply', reply: { id: 'speak_to_rep', title: '3️⃣ Speak to a Representative' } },
                ],
            },
        },
    };

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            interactiveMessage,
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log('Interactive greeting sent:', response.data);
    } catch (error) {
        console.error('Error sending greeting:', error.response?.data || error.message);
    }
}

// Webhook to process interactive responses
app.post('/api/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field === 'messages') {
                    const messages = change.value.messages;

                    for (const message of messages) {
                        const phoneNumber = normalizePhoneNumber(message.from);
                        const buttonResponse = message.interactive?.button?.id;

                        if (buttonResponse) {
                            console.log(`User chose: ${buttonResponse}`);

                            let replyMessage = '';
                            switch (buttonResponse) {
                                case 'account_assistance':
                                    replyMessage = 'You selected Account Assistance. How can I help with your account?';
                                    break;
                                case 'services_pricing':
                                    replyMessage = 'You selected Services & Pricing. Here are our options...';
                                    break;
                                case 'speak_to_rep':
                                    replyMessage = 'You selected to speak with a representative. Connecting you...';
                                    break;
                                default:
                                    replyMessage = 'Sorry, I didn’t understand your response.';
                            }

                            await sendWhatsAppTextMessage(phoneNumber, replyMessage);
                        }
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// Function to send a simple WhatsApp text message
async function sendWhatsAppTextMessage(phoneNumber, message) {
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: message },
    };

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            messagePayload,
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log('Message sent:', response.data);
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
    }
}

// Webhook verification
app.get('/api/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.status(403).send('Verification failed');
    }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
