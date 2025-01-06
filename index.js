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
        status: { type: String, default: 'new' },
        messages: [
            {
                sender: { type: String, enum: ['you', 'system', 'user'], required: true },
                text: { type: String },
                mediaUrl: { type: String },
                timestamp: { type: Date, default: Date.now },
            },
        ],
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

// Utility to send a message via WhatsApp API
async function sendMessage(phoneNumber, message) {
    const payload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        text: { body: message },
    };

    await axios.post(
        `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
        payload,
        {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
        }
    );
}

// Route to handle incoming webhook
app.post('/api/webhook', async (req, res) => {
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

                        // Handle different message replies
                        if (text === '1' || text === '2' || text === '3') {
                            // If account assistance
                            if (text === '1') {
                                await handleAccountAssistance(phoneNumber, chat);
                            } else if (text === '2') {
                                await sendMessage(phoneNumber, '💼 *Services & Pricing*: Please check our website for details.');
                            } else if (text === '3') {
                                await connectToAgent(phoneNumber, chat);
                            }
                        } else if (['1️⃣', '2️⃣', '3️⃣'].includes(text)) {
                            await handleAccountAssistance(phoneNumber, chat);
                        } else {
                            await sendMessage(phoneNumber, '🚫 *Invalid Selection*: Please reply with one of the following options: 1️⃣ Account Assistance 2️⃣ Services & Pricing 3️⃣ Speak to a Representative');
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
});

// Route to verify the webhook
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

// Send the initial welcome message with options
async function sendWelcomeMessage(phoneNumber) {
    const message = `
    👋 *Afenhyia Pa o!*

    I am Vico, your virtual assistant from MITWORK Customer Care.  
    How may I assist you today?  
    Reply with the number to interact with our agent:  

    1️⃣ *Account Assistance*  
    2️⃣ *Services & Pricing*  
    3️⃣ *Speak to a Representative`;

    const buttonPayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: message },
            action: {
                buttons: [
                    { type: 'reply', reply: { id: '1', title: 'Account Assistance' } },
                    { type: 'reply', reply: { id: '2', title: 'Services & Pricing' } },
                    { type: 'reply', reply: { id: '3', title: 'Speak to a Representative' } },
                ],
            },
        },
    };

    await axios.post(
        `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
        buttonPayload,
        {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
        }
    );
}

// Handle Account Assistance selection
async function handleAccountAssistance(phoneNumber, chat) {
    const message = `
    🛠️ *Account Assistance*: Please describe your account issue. An agent will follow up soon.

    *Please select the platform you're having an issue with:*
    
    1️⃣ NSEM.COM.GH  
    2️⃣ ENAG SAFETY SOLUTIONS  
    3️⃣ SIRECORD AUDIO MONITORING PLATFORM`;

    const buttonPayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: message },
            action: {
                buttons: [
                    { type: 'reply', reply: { id: '1', title: 'NSEM.COM.GH' } },
                    { type: 'reply', reply: { id: '2', title: 'ENAG SAFETY SOLUTIONS' } },
                    { type: 'reply', reply: { id: '3', title: 'SIRECORD AUDIO MONITORING PLATFORM' } },
                ],
            },
        },
    };

    await axios.post(
        `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
        buttonPayload,
        {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
        }
    );
}

// Handle platform selection and issue description
async function handlePlatformSelection(phoneNumber, selectedPlatform, chat) {
    let responseMessage;

    switch (selectedPlatform) {
        case '1':
            responseMessage = `⚙️ You have selected *NSEM.COM.GH*. Please describe the issue you are facing.`;
            break;
        case '2':
            responseMessage = `⚙️ You have selected *ENAG SAFETY SOLUTIONS*. Please describe the issue you are facing.`;
            break;
        case '3':
            responseMessage = `⚙️ You have selected *SIRECORD AUDIO MONITORING PLATFORM*. Please describe the issue you are facing.`;
            break;
        default:
            responseMessage = `🚫 *Invalid Selection*: Please reply with one of the following options:
            1️⃣ NSEM.COM.GH  
            2️⃣ ENAG SAFETY SOLUTIONS  
            3️⃣ SIRECORD AUDIO MONITORING PLATFORM`;
            break;
    }

    chat.messages.push({
        sender: 'system',
        text: responseMessage,
        timestamp: new Date(),
    });
    await chat.save();

    await sendMessage(phoneNumber, responseMessage);
}

// Connect user to an agent
async function connectToAgent(phoneNumber, chat) {
    const responseMessage = `🗣️ You are now connected with an Agent. Please describe your issue to the agent.`;

    chat.status = 'connected';
    await chat.save();

    await sendMessage(phoneNumber, responseMessage);
}

// End chat and inform user
async function endChat(phoneNumber, chat) {
    const responseMessage = `❌ Your chat has ended. Thank you for reaching out! If you need further assistance, feel free to contact us again.`;

    chat.status = 'ended';
    await chat.save();

    await sendMessage(phoneNumber, responseMessage);
}

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
