const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const verifyToken = require('../middleware/authMiddleware'); 

// Dashboard Overview & Core Registration Maps
router.get('/dashboard', verifyToken, inventoryController.getInventoryDashboard);
router.post('/products', verifyToken, inventoryController.addProduct);

// Extended CRUD Operations
router.put('/products/:id', verifyToken, inventoryController.updateProduct);
router.delete('/products/:id', verifyToken, inventoryController.deleteProduct);

module.exports = router;