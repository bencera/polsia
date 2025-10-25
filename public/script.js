// POLSIA - Autonomous System Simulation

class PolsiaSystem {
    constructor() {
        this.waitlistCount = 247;

        this.statusMessages = [
            '> Welcome to Polsia',
            '> Analyzing market trends...',
            '> Generating project blueprint...',
            '> Optimizing build pipeline...',
            '> Deploying marketing campaign...',
            '> Processing autonomous tasks...',
            '> Scaling operations...',
        ];

        this.currentStatusIndex = 0;
        this.init();
    }

    init() {
        // Start all autonomous processes
        this.startStatusRotation();
        this.startWaitlistCounter();
        this.setupEventListeners();
    }

    // Rotate status messages
    startStatusRotation() {
        setInterval(() => {
            this.currentStatusIndex = (this.currentStatusIndex + 1) % this.statusMessages.length;
            const terminalElement = document.getElementById('terminal-text');

            if (terminalElement) {
                terminalElement.style.opacity = '0';
                setTimeout(() => {
                    terminalElement.textContent = this.statusMessages[this.currentStatusIndex];
                    terminalElement.style.opacity = '1';
                }, 300);
            }
        }, 5000);
    }

    // Increment waitlist counter occasionally
    startWaitlistCounter() {
        setInterval(() => {
            if (Math.random() > 0.7) { // 30% chance every interval
                this.waitlistCount += 1;
                const element = document.getElementById('waitlist-count');
                element.textContent = this.waitlistCount;

                // Brief highlight animation
                element.style.color = '#00ff00';
                setTimeout(() => {
                    element.style.color = '';
                }, 500);
            }
        }, 8000);
    }

    // Setup event listeners
    setupEventListeners() {
        const joinBtn = document.getElementById('joinBtn');
        const emailInput = document.getElementById('email');

        joinBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();

            if (email && this.isValidEmail(email)) {
                // Call backend API to join waitlist
                joinBtn.textContent = 'PROCESSING...';
                joinBtn.disabled = true;

                try {
                    const response = await fetch('/api/waitlist', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ email }),
                    });

                    const data = await response.json();

                    if (data.success) {
                        joinBtn.textContent = 'ADDED TO QUEUE';
                        emailInput.value = '';

                        // Increment waitlist
                        this.waitlistCount += 1;
                        document.getElementById('waitlist-count').textContent = this.waitlistCount;

                        setTimeout(() => {
                            joinBtn.textContent = 'Join Waitlist';
                            joinBtn.disabled = false;
                        }, 3000);
                    } else {
                        throw new Error(data.message || 'Failed to join waitlist');
                    }
                } catch (error) {
                    console.error('Error joining waitlist:', error);
                    joinBtn.textContent = 'ERROR - TRY AGAIN';
                    setTimeout(() => {
                        joinBtn.textContent = 'Join Waitlist';
                        joinBtn.disabled = false;
                    }, 3000);
                }
            } else {
                // Invalid email feedback
                emailInput.style.borderColor = '#ff0000';
                setTimeout(() => {
                    emailInput.style.borderColor = '';
                }, 1000);
            }
        });

        // Enter key support
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinBtn.click();
            }
        });
    }

    // Simple email validation
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
}

// Add transition styles for status text
const style = document.createElement('style');
style.textContent = `
    #status-text {
        transition: opacity 0.3s ease;
    }
    #waitlist-count {
        transition: color 0.5s ease;
    }
`;
document.head.appendChild(style);

// Initialize the system when page loads
document.addEventListener('DOMContentLoaded', () => {
    const polsia = new PolsiaSystem();
    console.log('POLSIA System Initialized');
});
