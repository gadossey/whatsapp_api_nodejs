require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const axios = require('axios');
const helmet = require('helmet');
const morgan = require('morgan');

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
const chatSessionSchema = new mongoose.Schema(
    {
        phoneNumber: { type: String, required: true },
        messages: [
            {
                sender: { type: String, enum: ['you', 'system', 'user'], required: true },
                text: { type: String },
                mediaUrl: { type: String },
                timestamp: { type: Date, default: Date.now },
            },
        ],
        status: { type: String, default: 'waiting' }, // Track if agent has accepted
    },
    { timestamps: true }
);

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

// Utility to normalize phone numbers (Ghana is the default country code)
const DEFAULT_COUNTRY_CODE = '+233';
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    phone = phone.trim();

    // If phone starts with a '+', assume it's international
    if (phone.startsWith('+')) {
        return phone;
    }

    // If phone starts with the default country code (without the '+')
    if (phone.startsWith(DEFAULT_COUNTRY_CODE.replace('+', ''))) {
        return `+${phone}`;
    }

    // If phone starts with '0', it's likely a local Ghana number, so add the default country code
    if (phone.startsWith('0')) {
        return DEFAULT_COUNTRY_CODE + phone.substring(1);
    }

    // Otherwise, assume it's an international number and prepend the default country code
    return DEFAULT_COUNTRY_CODE + phone;
}

// Middleware for error handling
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// Route to handle WhatsApp Webhook verification
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

// Route to receive messages from WhatsApp
app.post('/api/webhook', asyncHandler(async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field === 'messages' && change.value.messages) {
                    const messages = change.value.messages;
                    for (const message of messages) {
                        const phoneNumber = normalizePhoneNumber(message.from);
                        const text = message.text?.body || null;

                        let chat = await ChatSession.findOne({ phoneNumber });
                        if (!chat) chat = new ChatSession({ phoneNumber, messages: [] });

                        // If user hasn't selected a valid option, send them the initial message again
                        if (!chat.status || chat.status === 'waiting') {
                            if (text === '1') {
                                await sendMessage(phoneNumber, '📋 *Account Assistance*: Please describe your account issue. An agent will follow up soon.');
                                chat.status = 'awaiting_account_issue';
                            } else if (text === '2') {
                                await sendMessage(phoneNumber, '💼 *Services & Pricing*: Please check our website for more details.');
                            } else if (text === '3') {
                                await sendMessage(phoneNumber, '⏳ *Please wait*: Your request is being processed. An agent will be with you shortly.');
                                chat.status = 'waiting_for_agent';
                            } else {
                                await sendMessage(phoneNumber, '🚫 *Invalid Selection*: Please reply with one of the following options: 1️⃣ Account Assistance 2️⃣ Services & Pricing 3️⃣ Speak to a Representative');
                            }
                        } else if (chat.status === 'awaiting_account_issue') {
                            if (text) {
                                await sendMessage(phoneNumber, '🔧 *Account Issue*: We have received your issue. An agent will follow up soon.');
                                chat.status = 'waiting_for_agent';
                            }
                        } else if (chat.status === 'waiting_for_agent') {
                            if (text === 'accept') {
                                await sendMessage(phoneNumber, '🎉 *You are now connected with an agent*. How may we assist you?');
                                chat.status = 'connected_with_agent';
                            } else if (text === 'end') {
                                await sendMessage(phoneNumber, '🔴 *Chat has ended*. Thank you for using our service. Please rate your experience.');
                                chat.status = 'ended';
                            } else {
                                await sendMessage(phoneNumber, '⏳ *Please wait*: An agent will be with you shortly.');
                            }
                        }

                        chat.messages.push({
                            sender: 'user',
                            text,
                            timestamp: new Date(),
                        });

                        await chat.save();
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
}));

// Send message function to WhatsApp using WhatsApp Business API
async function sendMessage(phoneNumber, message) {
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: message },
    };

    await axios.post(
        `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
        messagePayload,
        {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
        }
    );
}

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
