const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'success', 
        message: 'Orbit POS Backend is up and running smoothly!' 
    });
});

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const inventoryRoutes = require('./routes/inventoryRoutes');
app.use('/api/inventory', inventoryRoutes);

const posRoutes = require('./routes/posRoutes');
app.use('/api/pos', posRoutes)


app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Server successfully deployed on environment lane`);
    console.log(`📡 Listening & serving API requests at: http://localhost:${PORT}`);
    console.log(`===================================================`);
});