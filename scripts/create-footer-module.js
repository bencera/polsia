#!/usr/bin/env node

const http = require('http');

// Get token from login
async function getToken() {
    return new Promise((resolve, reject) => {
        const loginData = JSON.stringify({
            email: 'demo@example.com',
            password: 'demo123'
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(loginData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.token) {
                        resolve(response.token);
                    } else {
                        reject(new Error('No token in response'));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', reject);
        req.write(loginData);
        req.end();
    });
}

// Update module to manual frequency
async function updateModuleToManual(token, moduleId) {
    return new Promise((resolve, reject) => {
        const updateData = JSON.stringify({
            frequency: 'manual'
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: `/api/modules/${moduleId}`,
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(updateData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', reject);
        req.write(updateData);
        req.end();
    });
}

// Create the new footer module
async function createFooterModule(token) {
    return new Promise((resolve, reject) => {
        const moduleData = {
            name: 'Footer Copyright Updater',
            description: 'Updates the copyright name in the landing page footer',
            type: 'maintenance',
            frequency: 'manual',  // Manual so we can trigger it ourselves for testing
            config: {
                goal: 'Change the copyright name in the footer of the landing page from "Polsia Inc." to "Polsia AI". The landing page is at client/src/pages/Landing.jsx. Use GitHub MCP to create a PR with the change.',
                mcpMounts: ['github'],
                inputs: {
                    repo: 'Polsia-Inc/newco-app',
                    branch: 'main',
                    file: 'client/src/pages/Landing.jsx',
                    oldText: 'Polsia Inc.',
                    newText: 'Polsia AI'
                },
                maxTurns: 10  // Shorter execution for faster testing
            }
        };

        const postData = JSON.stringify(moduleData);

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/modules',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Main execution
async function main() {
    try {
        console.log('🔑 Getting authentication token...');
        const token = await getToken();
        console.log('✅ Got token\n');

        console.log('🔧 Updating Security Patcher to manual frequency...');
        const updateResult = await updateModuleToManual(token, 1);  // Module ID 1 is Security Patcher
        console.log('✅ Security Patcher updated:', updateResult.success ? 'Success' : 'Failed');
        console.log('   (It will no longer auto-run on server restart)\n');

        console.log('📝 Creating Footer Copyright Updater module...');
        const createResult = await createFooterModule(token);

        if (createResult.success && createResult.module) {
            console.log('✅ Footer module created successfully!');
            console.log(`   Module ID: ${createResult.module.id}`);
            console.log(`   Name: ${createResult.module.name}`);
            console.log('   Frequency: manual (you can trigger it from the UI)');
            console.log('\n🎉 Done! You can now:');
            console.log('   1. Go to the Modules page in the UI');
            console.log('   2. Click "Run" on the Footer Copyright Updater');
            console.log('   3. Watch the AI task summary generate in the Dashboard feed');
        } else {
            console.log('❌ Failed to create module:', createResult);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
