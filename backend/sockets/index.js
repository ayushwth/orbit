const jwt = require('jsonwebtoken');
const db = require('../db');

module.exports = function(io) {
    // Authentication middleware for sockets
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error: Token missing'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });

    const isUserInConversation = async (userId, conversationId) => {
        const query = `
            SELECT c.id FROM conversations c
            JOIN matches m ON c.match_id = m.id
            WHERE c.id = $1 AND (m.user_a = $2 OR m.user_b = $2)
        `;
        const res = await db.query(query, [conversationId, userId]);
        return res.rows.length > 0;
    };

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user.phantom_alias} (${socket.user.id})`);

        socket.on('join_conversation', async (conversationId) => {
            try {
                if (await isUserInConversation(socket.user.id, conversationId)) {
                    socket.join(`conversation_${conversationId}`);
                    console.log(`User ${socket.user.id} joined conversation_${conversationId}`);
                } else {
                    socket.emit('error', { message: 'Not authorized for this conversation' });
                }
            } catch (err) {
                console.error('Error joining conversation:', err);
            }
        });

        socket.on('send_message', async (data) => {
            try {
                const conversationId = data.conversation_id || data.conversationId;
                const content = data.content;
                
                if (!conversationId || !content) return;
                
                if (await isUserInConversation(socket.user.id, conversationId)) {
                    // Save message to database
                    const result = await db.query(
                        'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING id, conversation_id, sender_id, content, sent_at as created_at',
                        [conversationId, socket.user.id, content]
                    );
                    const message = result.rows[0];
                    
                    // Broadcast to others in room
                    socket.to(`conversation_${conversationId}`).emit('new_message', message);
                }
            } catch (err) {
                console.error('Error sending message:', err);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        socket.on('typing', async (data) => {
            try {
                const { conversationId, isTyping } = data;
                if (await isUserInConversation(socket.user.id, conversationId)) {
                    // Broadcast to others in the room
                    socket.to(`conversation_${conversationId}`).emit('typing', {
                        userId: socket.user.id,
                        phantom_alias: socket.user.phantom_alias,
                        isTyping
                    });
                }
            } catch (err) {
                console.error('Error in typing event:', err);
            }
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.id}`);
        });
    });
};
