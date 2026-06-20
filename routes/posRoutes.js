const express = require('express');
const router = express.Router();
const posController = require('../controllers/posController');
const verifyToken = require('../middleware/authMiddleware');

router.post('/checkout', verifyToken, posController.createTransaction);
router.put('/orders/:id/confirm-payment', verifyToken, posController.confirmPayment);
router.get('/receipts', verifyToken, posController.getReceiptsByDate);
router.post('/receipts/:id/print', verifyToken, posController.printReceipt);
router.get('/transaction/:id', verifyToken, posController.getTransactionDetail);
router.delete('/transaction/:id', verifyToken, posController.deleteTransaction);
router.put('/orders/:id/add-payment', verifyToken, posController.addPayment);

module.exports = router;