const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const prisma = require('../lib/db');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLAN_PRICES = {
  STARTER: 499,
  PRO: 1499,
};

const PLAN_CREDITS = {
  STARTER: 20,
  PRO: 100,
};

// Create Order (Frontend initiates)
router.post('/create-order', authenticateToken, async (req, res) => {
  const { plan } = req.body;
  const amount = PLAN_PRICES[plan];

  if (!amount) {
    return res.status(400).json({ message: 'Invalid plan selected' });
  }

  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay uses paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}_${req.user.user_id}`,
    });

    // Create a pending payment record
    await prisma.payment.create({
      data: {
        userId: req.user.user_id,
        razorpay_order_id: order.id,
        amount: amount,
        plan: plan,
        status: 'PENDING'
      }
    });

    res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error creating payment order' });
  }
});

// Verify Payment (Frontend sends back signature)
router.post('/verify', authenticateToken, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
  const expectedSignature = hmac.digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ message: 'Invalid payment signature' });
  }

  try {
    const payment = await prisma.payment.findUnique({ where: { razorpay_order_id } });
    if (!payment) return res.status(404).json({ message: 'Order not found' });
    
    // Check if user is the same
    if (payment.userId !== req.user.user_id) return res.status(403).json({ message: 'Forbidden' });
    
    if (payment.status === 'COMPLETED') {
      return res.json({ message: 'Payment already processed', success: true });
    }

    // Atomic upgrade
    await prisma.$transaction([
      prisma.payment.update({
        where: { razorpay_order_id },
        data: { 
          status: 'COMPLETED',
          razorpay_payment_id,
          razorpay_signature
        }
      }),
      prisma.user.update({
        where: { id: payment.userId },
        data: {
          plan: payment.plan,
          credits: { increment: PLAN_CREDITS[payment.plan] }
        }
      })
    ]);

    res.json({ success: true, message: 'Plan upgraded successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error verifying payment' });
  }
});

// WEBHOOK (Reliability fix)
router.post('/webhook', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(req.body));
  const expectedSignature = hmac.digest('hex');

  if (expectedSignature !== signature) {
    return res.status(400).send('Invalid signature');
  }

  const event = req.body.event;
  if (event === 'order.paid') {
    const order_id = req.body.payload.order.entity.id;
    const payment_id = req.body.payload.payment.entity.id;
    
    try {
      const dbPayment = await prisma.payment.findUnique({ where: { razorpay_order_id: order_id } });
      if (dbPayment && dbPayment.status === 'PENDING') {
        const user = await prisma.user.update({
          where: { id: dbPayment.userId },
          data: {
            plan: dbPayment.plan,
            credits: { increment: PLAN_CREDITS[dbPayment.plan] }
          }
        });
        
        await prisma.payment.update({
          where: { id: dbPayment.id },
          data: { 
            status: 'COMPLETED',
            razorpay_payment_id: payment_id
          }
        });
        
        console.log(`[Webhook] User ${user.email} upgraded via webhook.`);
      }
    } catch (err) {
      console.error('[Webhook] Error processing order.paid:', err);
    }
  }

  res.send('ok');
});

module.exports = router;
