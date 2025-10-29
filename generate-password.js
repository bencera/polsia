// Helper script to generate bcrypt password hash
// Usage: node generate-password.js <password>
// Example: node generate-password.js password123

const bcrypt = require('bcrypt');

const password = process.argv[2] || 'password123';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        console.error('Error generating hash:', err);
        process.exit(1);
    }

    console.log('\nPassword:', password);
    console.log('Hash:', hash);
    console.log('\nTo insert a user with this password, use:');
    console.log(`INSERT INTO users (email, password_hash, name) VALUES ('user@example.com', '${hash}', 'User Name');`);
});
