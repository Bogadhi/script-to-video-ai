const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired', expired: true });
      }
      return res.status(403).json({ message: 'Invalid token' });
    }
    
    req.user = user;
    console.log('JWT PAYLOAD:', req.user);
    console.log('AUTH HEADER:', req.headers.authorization);
    next();
  });
}

module.exports = { authenticateToken };
