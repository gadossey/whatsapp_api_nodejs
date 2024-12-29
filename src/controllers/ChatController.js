const ChatSession = require('../models/ChatSession');
const WhatsAppService = require('../services/WhatsAppService');

class ChatController {
    // Helper function to update chat session
    static async updateChatSession(phoneNumber, message, mediaUrl, sentBy) {
        try {
            await ChatSession.findOneAndUpdate(
                { phoneNumber },
                {
                    $push: {
                        messages: {
                            message,
                            mediaUrl,
                            sentBy,
                            timestamp: new Date(),
                        },
                    },
                },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('Error updating chat session:', error);
            throw new Error('Failed to update chat session');
        }
    }

    static async sendMessage(req, res) {
        try {
            const { phoneNumber, message, mediaId } = req.body;

            // Validate input
            if (!phoneNumber || (!message && !mediaId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number and message or mediaId are required.',
                });
            }

            // Send message via WhatsApp Service
            const result = await WhatsAppService.sendMessage(phoneNumber, message, mediaId);

            // Save message in the database
            await ChatController.updateChatSession(phoneNumber, message, mediaId, 'user');

            res.json({ success: true, data: result });
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ success: false, message: 'Message sending failed.' });
        }
    }

    static async getChats(req, res) {
        try {
            const chats = await ChatSession.find({}, 'phoneNumber updatedAt').sort('-updatedAt');
            res.json({ success: true, data: chats });
        } catch (error) {
            console.error('Error fetching chats:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch chats.' });
        }
    }

    static async getChat(req, res) {
        try {
            const { phoneNumber } = req.params;
            const chat = await ChatSession.findOne({ phoneNumber });

            if (!chat) {
                return res.status(404).json({ success: false, message: 'Chat not found' });
            }

            res.json({ success: true, data: chat });
        } catch (error) {
            console.error('Error fetching chat:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch chat.' });
        }
    }
}

module.exports = ChatController;
