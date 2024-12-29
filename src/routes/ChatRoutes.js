const express = require('express');
const ChatController = require('../controllers/ChatController');
const router = express.Router();

router.post('/sendMessage', ChatController.sendMessage);
router.get('/', ChatController.getChats);
router.get('/:phoneNumber', ChatController.getChat);

module.exports = router;
