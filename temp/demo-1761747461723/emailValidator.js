/**
 * Email Validation Utility
 *
 * This module provides a robust email validation function that checks
 * if a given string is a valid email address format.
 */

/**
 * Validates an email address using a regular expression pattern.
 *
 * The validation checks for:
 * - Local part (before @): alphanumeric characters, dots, hyphens, underscores
 * - @ symbol (required)
 * - Domain name: alphanumeric characters and hyphens
 * - TLD (top-level domain): at least 2 characters
 *
 * @param {string} email - The email address to validate
 * @returns {boolean} True if the email is valid, false otherwise
 *
 * @example
 * validateEmail('user@example.com'); // returns true
 * validateEmail('invalid.email'); // returns false
 */
function validateEmail(email) {
  // Check if email is a non-empty string
  if (typeof email !== 'string' || email.trim() === '') {
    return false;
  }

  // Regular expression for email validation
  // Pattern breakdown:
  // ^[^\s@]+ - Start with one or more characters that are not whitespace or @
  // @ - Literal @ symbol
  // [^\s@]+ - One or more characters that are not whitespace or @
  // \. - Literal dot
  // [^\s@]{2,} - At least 2 characters that are not whitespace or @ (TLD)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  return emailRegex.test(email);
}

/**
 * Validates an email address with more strict RFC 5322 standards.
 * This version performs more comprehensive validation.
 *
 * @param {string} email - The email address to validate
 * @returns {boolean} True if the email is valid, false otherwise
 *
 * @example
 * validateEmailStrict('john.doe+tag@example.co.uk'); // returns true
 * validateEmailStrict('invalid@'); // returns false
 */
function validateEmailStrict(email) {
  // Check if email is a non-empty string
  if (typeof email !== 'string' || email.trim() === '') {
    return false;
  }

  // More comprehensive email regex pattern
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  // Additional length checks
  if (email.length > 254) {
    return false; // Maximum email length per RFC 5321
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domain] = parts;

  // Validate local part length (max 64 characters)
  if (localPart.length > 64) {
    return false;
  }

  return emailRegex.test(email);
}

/**
 * Validates multiple email addresses at once.
 *
 * @param {string[]} emails - Array of email addresses to validate
 * @returns {Object} Object containing valid and invalid email arrays
 *
 * @example
 * const result = validateMultipleEmails(['user@example.com', 'invalid', 'test@test.co']);
 * // Returns: { valid: ['user@example.com', 'test@test.co'], invalid: ['invalid'] }
 */
function validateMultipleEmails(emails) {
  const result = {
    valid: [],
    invalid: []
  };

  if (!Array.isArray(emails)) {
    throw new TypeError('Input must be an array of email addresses');
  }

  emails.forEach(email => {
    if (validateEmail(email)) {
      result.valid.push(email);
    } else {
      result.invalid.push(email);
    }
  });

  return result;
}

// ====================
// USAGE EXAMPLES
// ====================

console.log('=== Basic Email Validation Examples ===\n');

// Example 1: Valid emails
console.log('Valid emails:');
console.log(validateEmail('john@example.com'));        // true
console.log(validateEmail('user.name@domain.co.uk'));  // true
console.log(validateEmail('test123@test-domain.org')); // true

console.log('\n=== Invalid Email Examples ===\n');

// Example 2: Invalid emails
console.log('Invalid emails:');
console.log(validateEmail('notanemail'));              // false
console.log(validateEmail('missing@domain'));          // false
console.log(validateEmail('@nodomain.com'));           // false
console.log(validateEmail('spaces in@email.com'));     // false
console.log(validateEmail(''));                        // false
console.log(validateEmail('double@@domain.com'));      // false

console.log('\n=== Strict Validation Examples ===\n');

// Example 3: Strict validation
console.log('Strict validation:');
console.log(validateEmailStrict('john.doe+tag@example.com'));  // true
console.log(validateEmailStrict('user_name@domain.co'));       // true
console.log(validateEmailStrict('invalid@'));                  // false

console.log('\n=== Multiple Email Validation ===\n');

// Example 4: Validate multiple emails
const emailList = [
  'user1@example.com',
  'invalid.email',
  'user2@test.org',
  'another@domain.co.uk',
  'bad@email'
];

const validationResult = validateMultipleEmails(emailList);
console.log('Validation results:');
console.log('Valid emails:', validationResult.valid);
console.log('Invalid emails:', validationResult.invalid);

console.log('\n=== Edge Cases ===\n');

// Example 5: Edge cases
console.log('Edge cases:');
console.log(validateEmail(null));                  // false
console.log(validateEmail(undefined));             // false
console.log(validateEmail(123));                   // false
console.log(validateEmail('   '));                 // false (whitespace only)

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateEmail,
    validateEmailStrict,
    validateMultipleEmails
  };
}
