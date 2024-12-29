const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
    {
        phoneNumber: { type: String, required: true },
        messages: [
            {
                message: { type: String },
                mediaUrl: { type: String },
                sentBy: { type: String, enum: ['user', 'system'], required: true },
                timestamp: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

const ChatSession = mongoose.model('ChatSession', chatSchema);

module.exports = ChatSession;
