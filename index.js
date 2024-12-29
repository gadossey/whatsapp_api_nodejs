require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios'); // For making HTTP requests


// Initialize express app
const app = express();
app.use(bodyParser.json());

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit if database connection fails
    });

// Chat session schema
const chatSessionSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true },
    messages: [
        {
            sender: { type: String, required: true },
            text: { type: String },
            mediaUrl: { type: String },
            timestamp: { type: Date, default: Date.now },
        },
    ],
});

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

// Utility to normalize phone numbers
const DEFAULT_COUNTRY_CODE = '+233';

function normalizePhoneNumber(phone) {
    if (!phone) return null;

    phone = phone.trim();

    // If the number starts with '+', it's already formatted
    if (phone.startsWith('+')) {
        return phone;
    }

    // If the number starts with the country code without '+', add '+'
    if (phone.startsWith(DEFAULT_COUNTRY_CODE.replace('+', ''))) {
        return `+${phone}`;
    }

    // If the number starts with '0', replace it with the country code
    if (phone.startsWith('0')) {
        return DEFAULT_COUNTRY_CODE + phone.substring(1);
    }

    // Otherwise, assume it's missing the country code
    return DEFAULT_COUNTRY_CODE + phone;
}

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Route to fetch all chat sessions
app.get('/api/chats', async (req, res) => {
    try {
        const chats = await ChatSession.find();
        res.json(chats);
    } catch (err) {
        console.error('Error fetching chats:', err.message);
        res.status(500).json({ message: 'Error fetching chats' });
    }
});

// Route to fetch a specific chat by phone number
app.get('/api/chat/:phoneNumber', async (req, res) => {
    const { phoneNumber } = req.params;
    try {
        const normalizedNumber = normalizePhoneNumber(phoneNumber);
        const chat = await ChatSession.findOne({ phoneNumber: normalizedNumber });
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }
        res.json(chat);
    } catch (err) {
        console.error('Error fetching chat:', err.message);
        res.status(500).json({ message: 'Error fetching chat' });
    }
});

// Route to send a message
app.post('/api/send-message', async (req, res) => {
    const { phoneNumber, message, mediaUrl } = req.body;

    if (!phoneNumber || (!message && !mediaUrl)) {
        return res.status(400).json({ message: 'Phone number and message or media URL are required' });
    }

    try {
        // Send the message using the WhatsApp Business API
        const whatsappResponse = await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                to: phoneNumber,
                type: mediaUrl ? 'image' : 'text',
                ...(mediaUrl
                    ? { image: { link: mediaUrl } }
                    : { text: { body: message } }),
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // Save the message in the database
        let chat = await ChatSession.findOne({ phoneNumber });
        if (!chat) {
            chat = new ChatSession({ phoneNumber, messages: [] });
        }

        chat.messages.push({
            sender: 'you',
            text: message || '',
            mediaUrl: mediaUrl || null,
            timestamp: new Date(),
        });

        await chat.save();

        res.json({ message: 'Message sent successfully', chat });
    } catch (err) {
        console.error('Error sending message:', err.response?.data || err.message);
        res.status(500).json({ message: 'Error sending message', error: err.message });
    }
});


// Route to fix duplicate numbers in the database
app.get('/api/fix-duplicates', async (req, res) => {
    try {
        const chats = await ChatSession.find();

        const normalizedMap = {};

        for (const chat of chats) {
            const normalizedNumber = normalizePhoneNumber(chat.phoneNumber);

            if (!normalizedNumber) continue;

            if (!normalizedMap[normalizedNumber]) {
                normalizedMap[normalizedNumber] = chat;
            } else {
                // Merge messages if the number already exists
                normalizedMap[normalizedNumber].messages = [
                    ...normalizedMap[normalizedNumber].messages,
                    ...chat.messages,
                ];
                await ChatSession.deleteOne({ _id: chat._id }); // Remove duplicate
            }
        }

        // Save updated chats
        for (const normalizedNumber in normalizedMap) {
            const chat = normalizedMap[normalizedNumber];
            chat.phoneNumber = normalizedNumber; // Ensure consistent format
            await chat.save();
        }

        res.json({ message: 'Duplicates fixed and normalized successfully' });
    } catch (err) {
        console.error('Error fixing duplicates:', err.message);
        res.status(500).json({ message: 'Error fixing duplicates', error: err.message });
    }
});

// Serve the index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
