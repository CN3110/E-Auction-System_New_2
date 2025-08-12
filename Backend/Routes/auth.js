const express = require('express');
const router = express.Router();
const { login, changePassword } = require('../Controllers/authController');
const { authenticate } = require('../Middleware/auth');

router.post('/login', login);
router.post('/change-password', authenticate, changePassword);

module.exports = router;