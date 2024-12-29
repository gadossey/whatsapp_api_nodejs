const axios = require('axios');

class WhatsAppService {
    static async sendMessage(phoneNumber, message, mediaId = null) {
        const payload = {
            messaging_product: 'whatsapp',
            to: phoneNumber,
        };

        if (mediaId) {
            payload.type = 'image';
            payload.image = { id: mediaId };
        } else {
            payload.type = 'text';
            payload.text = { body: message };
        }

        try {
            console.log('Sending payload:', JSON.stringify(payload));
            const response = await axios.post(
                `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    },
                }
            );
            console.log('WhatsApp API response:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error sending WhatsApp message:', error.response?.data || error.message);
            throw new Error('Failed to send message');
        }
    }

}

module.exports = WhatsAppService;
