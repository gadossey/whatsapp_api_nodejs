require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
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
        canChatNormally: { type: Boolean, default: false }, // Added to track normal chat state
    },
    { timestamps: true }
);

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

// Utility to normalize phone numbers
const DEFAULT_COUNTRY_CODE = '+233';
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    phone = phone.trim();
    if (phone.startsWith('+')) return phone;
    if (phone.startsWith(DEFAULT_COUNTRY_CODE.replace('+', ''))) return `+${phone}`;
    if (phone.startsWith('0')) return DEFAULT_COUNTRY_CODE + phone.substring(1);
    return DEFAULT_COUNTRY_CODE + phone;
}

// Middleware for error handling
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route to fetch all chat sessions
app.get(
    '/api/chats',
    asyncHandler(async (req, res) => {
        const chats = await ChatSession.find().sort({ updatedAt: -1 });
        res.json(chats);
    })
);

// Route to fetch a specific chat
app.get(
    '/api/chat/:phoneNumber',
    asyncHandler(async (req, res) => {
        const { phoneNumber } = req.params;
        const normalizedNumber = normalizePhoneNumber(phoneNumber);
        if (!normalizedNumber) return res.status(400).json({ message: 'Invalid phone number' });

        const chat = await ChatSession.findOne({ phoneNumber: normalizedNumber });
        if (!chat) return res.status(404).json({ message: 'Chat not found' });

        chat.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        res.json(chat);
    })
);

// Route to send a message
app.post(
    '/api/send-message',
    asyncHandler(async (req, res) => {
        const { phoneNumber, message, mediaUrl } = req.body;
        if (!phoneNumber || (!message && !mediaUrl)) {
            return res.status(400).json({ message: 'Phone number and message or media URL are required' });
        }

        const normalizedNumber = normalizePhoneNumber(phoneNumber);
        if (!normalizedNumber) return res.status(400).json({ message: 'Invalid phone number' });

        // Send message via WhatsApp Business API
        await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                to: normalizedNumber,
                type: mediaUrl ? 'image' : 'text',
                ...(mediaUrl ? { image: { link: mediaUrl } } : { text: { body: message } }),
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // Save message in DB
        let chat = await ChatSession.findOne({ phoneNumber: normalizedNumber });
        if (!chat) chat = new ChatSession({ phoneNumber: normalizedNumber, messages: [] });

        chat.messages.push({
            sender: 'you',
            text: message || '',
            mediaUrl: mediaUrl || null,
            timestamp: new Date(),
        });
        await chat.save();

        res.json({ message: 'Message sent successfully', chat });
    })
);

// WhatsApp Webhook to receive messages
app.post(
    '/api/webhook',
    asyncHandler(async (req, res) => {
        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    if (change.field === 'messages' && change.value.messages) {
                        const messages = change.value.messages;

                        for (const message of messages) {
                            const phoneNumber = normalizePhoneNumber(message.from);
                            const text = message.text?.body?.trim() || null;

                            console.log(`Received message from ${phoneNumber}: ${text}`);

                            let chat = await ChatSession.findOne({ phoneNumber });
                            if (!chat) chat = new ChatSession({ phoneNumber, messages: [] });

                            // Push user's message to chat history
                            chat.messages.push({
                                sender: 'user',
                                text,
                                timestamp: new Date(),
                            });
                            await chat.save();

                            // Check if the user is allowed to chat normally
                            if (!chat.canChatNormally) {
                                let reply;
                                switch (text) {
                                    case '1':
                                        reply = "Here is the information on Account Assistance...";
                                        break;
                                    case '2':
                                        reply = "Here are the details about our Services & Pricing...";
                                        break;
                                    case '3':
                                        reply = "You are now connected to a representative. Feel free to chat with us.";
                                        chat.canChatNormally = true; // Enable normal chat
                                        await chat.save();
                                        break;
                                    default:
                                        reply =
                                            "Sorry, I didn't understand that. Please reply with:\n" +
                                            "1 for Account Assistance\n" +
                                            "2 for Services & Pricing\n" +
                                            "3 to Speak to a Representative";
                                }

                                // Send reply
                                await axios.post(
                                    `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
                                    {
                                        messaging_product: 'whatsapp',
                                        to: phoneNumber,
                                        type: 'text',
                                        text: { body: reply },
                                    },
                                    {
                                        headers: {
                                            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                                            'Content-Type': 'application/json',
                                        },
                                    }
                                );

                                console.log(`Reply sent to ${phoneNumber}: ${reply}`);

                                chat.messages.push({
                                    sender: 'system',
                                    text: reply,
                                    timestamp: new Date(),
                                });
                                await chat.save();
                            } else {
                                // Normal chat flow
                                console.log(`User ${phoneNumber} is allowed to chat normally.`);
                                // Add additional handling for the normal chat flow if needed
                            }
                        }
                    }
                }
            }
            res.status(200).send('EVENT_RECEIVED');
        } else {
            res.sendStatus(404);
        }
    })
);

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

// Central error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
