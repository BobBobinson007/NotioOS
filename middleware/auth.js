const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = function authMiddleware(req, res, next) {
    const headerToken = req.headers?.authorization?.split(' ')[1];
    const token = headerToken || req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.pre) return res.status(401).json({ error: 'Unauthorized – 2FA required.' });
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired session.' });
    }
};
