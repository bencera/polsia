#!/usr/bin/env node

/**
 * Quick script to view all reports in the database
 */

const { getReportsByUserId } = require('./db.js');

async function checkReports() {
    const userId = 1; // Adjust if needed

    console.log('📊 Reports in Database\n');

    const reports = await getReportsByUserId(userId, {}, 100);

    if (reports.length === 0) {
        console.log('No reports found. Run a module to create one!\n');
        process.exit(0);
    }

    console.log(`Found ${reports.length} report(s):\n`);

    // Group by date
    const byDate = {};
    reports.forEach(r => {
        const date = r.report_date.toISOString().split('T')[0];
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(r);
    });

    Object.keys(byDate).sort().reverse().forEach(date => {
        console.log(`📅 ${date}`);
        byDate[date].forEach(r => {
            console.log(`   ${r.report_type.padEnd(25)} - ${r.name}`);
            console.log(`   ${''.padEnd(25)}   Created: ${r.created_at.toLocaleString()}`);
            console.log(`   ${''.padEnd(25)}   Size: ${r.content.length} chars`);
            if (r.metadata) {
                console.log(`   ${''.padEnd(25)}   Metadata: ${JSON.stringify(r.metadata)}`);
            }
            console.log('');
        });
    });

    process.exit(0);
}

checkReports().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
