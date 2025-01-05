let currentPhoneNumber = null;

// Fetch and display chat sessions
async function fetchChats() {
    try {
        const response = await fetch('/api/chats');
        const chats = await response.json();

        const chatList = document.getElementById('chatList');
        chatList.innerHTML = '';

        if (chats.length === 0) {
            chatList.innerHTML = '<p style="text-align:center; color: #6c757d;">No chats available</p>';
            return;
        }

        chats.forEach(chat => {
            const listItem = document.createElement('li');
            listItem.textContent = chat.phoneNumber;
            listItem.onclick = () => loadChat(chat.phoneNumber);
            chatList.appendChild(listItem);
        });
    } catch (error) {
        console.error('Error fetching chats:', error);
        document.getElementById('chatList').innerHTML = '<p style="color: red; text-align:center;">Unable to load chats.</p>';
    }
}

// Load messages for a specific chat
async function loadChat(phoneNumber) {
    currentPhoneNumber = phoneNumber;
    highlightActiveChat(phoneNumber);

    // Autofill phone number in the message input field
    document.getElementById('phone').value = phoneNumber;

    try {
        const response = await fetch(`/api/chat/${phoneNumber}`);
        const chat = await response.json();

        const chatTitle = document.getElementById('chatTitle');
        const chatMessages = document.getElementById('chatMessages');

        chatTitle.textContent = `Chat with ${phoneNumber}`;
        chatMessages.innerHTML = '';

        if (chat.messages.length === 0) {
            chatMessages.innerHTML = '<p style="text-align:center; color: #6c757d;">No messages yet. Start the conversation!</p>';
            return;
        }

        chat.messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = msg.sender === 'you' ? 'sent' : 'received';  // Use 'you' or 'user'
            messageDiv.innerHTML = `
                ${msg.text || '[No Content]'}
                ${msg.mediaUrl ? `<img src="${msg.mediaUrl}" alt="media" class="media-message">` : ''}
                <div class="timestamp">${new Date(msg.timestamp).toLocaleString()}</div>
            `;
            chatMessages.appendChild(messageDiv);
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error loading chat:', error);
    }
}

// Highlight active chat
function highlightActiveChat(phoneNumber) {
    const chatList = document.querySelectorAll("#chatList li");
    chatList.forEach(item => item.classList.remove("active"));

    const activeChat = Array.from(chatList).find(item => item.textContent === phoneNumber);
    if (activeChat) activeChat.classList.add("active");
}

// Send a message
document.getElementById('sendMessageForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const phoneInput = document.getElementById('phone');
    const messageInput = document.getElementById('message');
    const mediaUrlInput = document.getElementById('mediaUrl');
    const phoneNumber = currentPhoneNumber || phoneInput.value;

    if (!phoneNumber) {
        alert('Please enter a phone number or select a chat.');
        return;
    }

    if (!messageInput.value.trim() && !mediaUrlInput.value.trim()) {
        alert('Message cannot be empty.');
        return;
    }

    try {
        const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumber,
                message: messageInput.value,
                mediaUrl: mediaUrlInput.value.trim(),
            }),
        });

        const data = await response.json();

        if (data.message === 'Message sent successfully') {
            loadChat(phoneNumber);
            fetchChats(); // Update chat list
            messageInput.value = '';
            mediaUrlInput.value = '';
        } else {
            alert('Failed to send message.');
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
});

document.getElementById('newChatBtn').addEventListener('click', () => {
    document.getElementById('newChatModal').style.display = 'block';
});

document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('newChatModal').style.display = 'none';
});

// Start a new chat
document.getElementById('newChatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPhoneInput = document.getElementById('newPhone');
    const newPhoneNumber = newPhoneInput.value.trim();

    if (!newPhoneNumber) {
        alert('Please enter a valid phone number.');
        return;
    }

    currentPhoneNumber = newPhoneNumber;
    document.getElementById('phone').value = newPhoneNumber;
    document.getElementById('chatTitle').textContent = `Chat with ${newPhoneNumber}`;
    document.getElementById('chatMessages').innerHTML = '<p style="text-align:center; color: #6c757d;">No messages yet. Start the conversation!</p>';

    // Hide modal and clear input
    document.getElementById('newChatModal').style.display = 'none';
    newPhoneInput.value = '';
});

// Initialize
fetchChats();
