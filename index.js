require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');

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
    .catch((err) => console.log('MongoDB connection error:', err));

// Chat session schema
const chatSessionSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true },
    messages: [{ sender: String, text: String, timestamp: Date }]
});

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Route to fetch all chat sessions
app.get('/api/chats', async (req, res) => {
    try {
        const chats = await ChatSession.find();
        res.json(chats);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching chat sessions' });
    }
});

// Route to fetch a specific chat by phone number
app.get('/api/chat/:phoneNumber', async (req, res) => {
    const { phoneNumber } = req.params;
    try {
        const chat = await ChatSession.findOne({ phoneNumber });
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }
        res.json(chat);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching chat' });
    }
});

// Route to send a message
app.post('/api/send-message', async (req, res) => {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
        return res.status(400).json({ message: 'Phone number and message are required' });
    }

    try {
        let chat = await ChatSession.findOne({ phoneNumber });
        if (!chat) {
            chat = new ChatSession({ phoneNumber, messages: [] });
        }

        chat.messages.push({
            sender: 'you',
            text: message,
            timestamp: new Date()
        });

        await chat.save();
        res.json({ message: 'Message sent successfully', chat });
    } catch (err) {
        res.status(500).json({ message: 'Error sending message', error: err.message });
    }
});

// Serve the index.html file for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
