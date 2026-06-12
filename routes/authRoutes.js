const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware'); // Import token validator

// Open paths
router.post('/register', authController.registerOwner);
router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);

// Token-locked paths (Requires Bearer Token in Postman headers)
// Put this line right below your other protected routes
router.get('/profile', verifyToken, authController.getProfile);
router.post('/employees', verifyToken, authController.createEmployee);
router.put('/organization/:id', verifyToken, authController.updateOrganization);
router.post('/branches', verifyToken, authController.createBranch);
router.put('/branches/:id', verifyToken, authController.updateBranch);


module.exports = router;