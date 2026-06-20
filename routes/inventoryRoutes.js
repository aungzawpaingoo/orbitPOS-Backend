const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const verifyToken = require('../middleware/authMiddleware'); 
const upload = require('../middleware/uploadMiddleware');

router.get('/dashboard', verifyToken, inventoryController.getInventoryDashboard);
router.post('/products', verifyToken, upload.single('image'), inventoryController.addProduct);

router.put('/products/:id', verifyToken, upload.single('image'), inventoryController.updateProduct);
router.delete('/products/:id', verifyToken, inventoryController.deleteProduct);

module.exports = router;