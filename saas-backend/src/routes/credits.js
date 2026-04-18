const express = require('express');
const prisma = require('../lib/db');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// GET /api/credits/status — get current credits and plan
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.user_id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ credits: user.credits, plan: user.plan });
  } catch (err) {
    console.error('[Credits Status Error]', err);
    res.status(500).json({ message: 'Error fetching credits' });
  }
});

// POST /api/credits/deduct — deduct credits (internal use)
router.post('/deduct', authenticateToken, async (req, res) => {
  const { amount = 1 } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.user_id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.credits < amount) {
      return res.status(403).json({ message: 'Insufficient credits' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { credits: { decrement: amount } },
    });

    res.json({ success: true, remaining: updatedUser.credits });
  } catch (err) {
    console.error('[Credits Deduct Error]', err);
    res.status(500).json({ message: 'Error deducting credits' });
  }
});

// POST /api/credits/redeem — redeem a coupon code for free credits
// Simple fixed-code approach; replace with DB-backed coupons in production.
const COUPON_CODES = {
  'LAUNCH10': 10,
  'CREATOR5': 5,
  'BETA25': 25,
  'FREESTART': 3,
};

router.post('/redeem', authenticateToken, async (req, res) => {
  const { coupon } = req.body;

  if (!coupon || typeof coupon !== 'string') {
    return res.status(400).json({ message: 'Coupon code is required.' });
  }

  const normalizedCode = coupon.trim().toUpperCase();
  const creditsToAdd = COUPON_CODES[normalizedCode];

  if (!creditsToAdd) {
    return res.status(400).json({ message: 'Invalid or expired coupon code.' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.user_id },
      data: { credits: { increment: creditsToAdd } },
    });

    console.log(`[Credits] Coupon '${normalizedCode}' redeemed by user ${req.user.user_id} — +${creditsToAdd} credits.`);

    res.json({
      success: true,
      creditsAdded: creditsToAdd,
      newBalance: updatedUser.credits,
      message: `${creditsToAdd} credits added successfully!`,
    });
  } catch (err) {
    console.error('[Credits Redeem Error]', err);
    res.status(500).json({ message: 'Error redeeming coupon.' });
  }
});

module.exports = router;
