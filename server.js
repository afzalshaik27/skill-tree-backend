const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const nodesRouter = require('./routes/nodes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/nodes', nodesRouter);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));