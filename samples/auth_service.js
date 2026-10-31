/**
 * Authentication and Token Management Service
 * Handles user password validation, session expiration, and role-based permissions.
 */

class AuthService {
  constructor(jwtSecret, tokenExpiryHours = 24) {
    if (!jwtSecret || typeof jwtSecret !== 'string') {
      throw new Error('JWT Secret must be a non-empty string');
    }
    this.jwtSecret = jwtSecret;
    this.tokenExpiryMs = tokenExpiryHours * 60 * 60 * 1000;
  }

  validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, reason: 'Password is required' };
    }
    if (password.length < 8) {
      return { valid: false, reason: 'Password must be at least 8 characters long' };
    }
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      return {
        valid: false,
        reason: 'Password must contain uppercase, lowercase, number, and special character'
      };
    }
    return { valid: true, reason: null };
  }

  authorizeRole(user, requiredRole) {
    if (!user || !user.role) {
      return false;
    }
    const roleHierarchy = {
      guest: 1,
      user: 2,
      moderator: 3,
      admin: 4,
      superadmin: 5
    };
    const userLevel = roleHierarchy[user.role.toLowerCase()] || 0;
    const requiredLevel = roleHierarchy[requiredRole.toLowerCase()] || 999;
    return userLevel >= requiredLevel;
  }
}

module.exports = AuthService;
