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

// Utility to normalize phone numbers using libphonenumber-js
const DEFAULT_COUNTRY_CODE = 'GH'; // Ghana is the default country
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    phone = phone.trim();

    const parsedNumber = parsePhoneNumberFromString(phone, DEFAULT_COUNTRY_CODE);
    if (parsedNumber && parsedNumber.isValid()) {
        return parsedNumber.format('E.164');
    }

    return null; // If number is invalid, return null
}

// Middleware for error handling
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route to send the initial greeting message with interactive buttons
async function sendWhatsAppGreeting(phoneNumber) {
    const interactiveMessage = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
            type: 'button',
            header: { type: 'text', text: 'Afenhyia Pa o! I am Vico, your virtual assistant from MITWORK Customer Care. How may I assist you today?' },
            body: { text: 'Reply with the number to interact with our agent:' },
            action: {
                buttons: [
                    { type: 'reply', reply: { id: 'account_assistance', title: '1️⃣ Account Assistance' } },
                    { type: 'reply', reply: { id: 'services_pricing', title: '2️⃣ Services & Pricing' } },
                    { type: 'reply', reply: { id: 'speak_to_rep', title: '3️⃣ Speak to a Representative' } }
                ]
            }
        }
    };

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            interactiveMessage,
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                }
            }
        );
        console.log('Interactive message sent:', response.data);
    } catch (error) {
        console.error('Error sending interactive message:', error.response?.data || error.message);
    }
}

// Webhook to process incoming button click
app.post('/api/webhook', asyncHandler(async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field === 'messages') {
                    const messages = change.value.messages;

                    for (const message of messages) {
                        const phoneNumber = normalizePhoneNumber(message.from);
                        const interactiveResponse = message.interactive?.button?.id; // Capture the button ID

                        console.log(`Received message from ${phoneNumber}`);
                        console.log('Interactive response:', interactiveResponse);

                        let responseMessage = '';

                        // Handle button click actions
                        switch (interactiveResponse) {
                            case 'account_assistance':
                                responseMessage = 'You selected Account Assistance. How can I assist with your account?';
                                break;
                            case 'services_pricing':
                                responseMessage = 'You selected Services & Pricing. Let me provide details about our services and pricing.';
                                break;
                            case 'speak_to_rep':
                                responseMessage = 'You selected to speak to a Representative. Please hold on while I connect you.';
                                // Optional: Here, you can initiate connecting to a live representative
                                break;
                            default:
                                responseMessage = 'Sorry, I didn’t recognize that option.';
                                break;
                        }

                        // Send the response based on user input
                        await sendWhatsAppTextMessage(phoneNumber, responseMessage);
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
}));

// WhatsApp Webhook verification
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

// Function to send a simple text message to WhatsApp
async function sendWhatsAppTextMessage(phoneNumber, message) {
    const responsePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: message },
    };

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            responsePayload,
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                }
            }
        );
        console.log('Message sent:', response.data);
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
    }
}

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
