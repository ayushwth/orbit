const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const matchRoutes = require('./routes/match');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

app.use('/auth', authRoutes);
app.use('/match', matchRoutes);
app.use('/chat', chatRoutes);
app.use('/admin', adminRoutes);

// Serve static frontend files from parent directory
const path = require('path');
app.use(express.static(path.join(__dirname, '../')));

// Serve clean routes dynamically!
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../campus-connect.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../orbit-login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, '../orbit-signup.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, '../orbit-chat.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, '../orbit-profile.html')));

// Fallback Basic route for API root
app.get('/api', (req, res) => {
    res.json({ message: 'Welcome to Orbit Backend API' });
});

// Setup Socket.io
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Initialize socket events
const socketSetup = require('./sockets/index');
socketSetup(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
