#!/usr/bin/env node

const https = require('http');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTc2MTgyNDM0NywiZXhwIjoxNzYyNDI5MTQ3fQ.obpRArd11dmHDpQD5bkhXmH8Xub_VGrsRmR-1Ktfy20';

const moduleData = {
    name: 'Security Patcher',
    description: 'Reviews code for security vulnerabilities and creates patches',
    type: 'security',
    frequency: 'daily',
    config: {
        goal: 'Review the repository for outdated dependencies, known vulnerabilities, and insecure patterns. Use GitHub MCP to patch or open PRs with fixes.',
        mcpMounts: ['github'],
        inputs: {
            repo: 'Polsia-Inc/newco-app',
            branch: 'main'
        }
    }
};

const postData = JSON.stringify(moduleData);

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/modules',
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('Creating module...\n');

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        const response = JSON.parse(data);
        console.log('Response:', JSON.stringify(response, null, 2));

        if (response.success && response.module) {
            console.log(`\n✅ Module created successfully! ID: ${response.module.id}`);
            testListModules();
        }
    });
});

req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
});

req.write(postData);
req.end();

function testListModules() {
    console.log('\nListing all modules...\n');

    const listOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/modules',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${TOKEN}`
        }
    };

    const req = https.request(listOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            const response = JSON.parse(data);
            console.log('Modules:', JSON.stringify(response, null, 2));
        });
    });

    req.on('error', (e) => {
        console.error(`Error: ${e.message}`);
    });

    req.end();
}
