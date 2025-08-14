const express = require('express');
const router = express.Router();
const { login, changePassword } = require('../Controllers/authController');
const { authenticate } = require('../Middleware/auth');

router.post('/login', login);
router.post('/change-password', authenticate, changePassword);

//to get the logged user's role
router.get('/current-user', authenticate, (req, res) => {
  res.json({ 
    success: true, 
    user: req.user 
  });
});

module.exports = router;