const ChatSession = require('../models/ChatSession');
const WhatsAppService = require('../services/WhatsAppService');

class ChatController {
    static async sendMessage(req, res) {
        try {
            const { phoneNumber, message, mediaId } = req.body;

            // Send message via WhatsApp Service
            const result = await WhatsAppService.sendMessage(phoneNumber, message, mediaId);

            // Save message in DB
            await ChatSession.findOneAndUpdate(
                { phoneNumber },
                { $push: { messages: { phoneNumber, message, mediaUrl: mediaId, sentBy: 'user' } } },
                { upsert: true }
            );

            res.json({ success: true, data: result });
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ success: false, message: 'Message sending failed.' });
        }
    }

    static async getChats(req, res) {
        try {
            const chats = await ChatSession.find({}, 'phoneNumber').sort('-updatedAt');
            res.json({ success: true, chats });
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
            res.json({ success: true, chat });
        } catch (error) {
            console.error('Error fetching chat:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch chat.' });
        }
    }
}

module.exports = ChatController;
