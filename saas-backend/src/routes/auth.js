const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/db');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: username, // Map 'username' to 'email' field in DB
        password: hashedPassword,
        credits: 3,
        plan: 'FREE'
      }
    });

    const token = jwt.sign(
      { user_id: user.id, username: user.email, plan: user.plan },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, username: user.email, plan: user.plan, credits: user.credits } });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Username already exists' });
    }
    res.status(500).json({ message: 'Error creating user' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email: username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { user_id: user.id, username: user.email, plan: user.plan },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, username: user.email, plan: user.plan, credits: user.credits } });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: 'Login error' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Note: use_id is attached to req.user by middleware after verification
    const user = await prisma.user.findUnique({ where: { id: req.user.user_id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    res.json({ user: { id: user.id, username: user.email, plan: user.plan, credits: user.credits } });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

module.exports = router;
