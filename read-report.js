#!/usr/bin/env node

const { getReportsByUserId } = require('./db.js');

async function readLatestReport() {
    const userId = 1;
    const reports = await getReportsByUserId(userId, { report_type: 'render_analytics' }, 1);

    if (reports.length === 0) {
        console.log('No reports found');
        process.exit(0);
    }

    const report = reports[0];
    console.log('📊 Latest Render Analytics Report\n');
    console.log('='.repeat(60));
    console.log(`Report ID: ${report.id}`);
    console.log(`Name: ${report.name}`);
    console.log(`Date: ${report.report_date.toISOString().split('T')[0]}`);
    console.log(`Created: ${report.created_at.toLocaleString()}`);
    console.log('='.repeat(60));
    console.log('\n' + report.content + '\n');
    console.log('='.repeat(60));
    console.log('\nMetadata:', JSON.stringify(report.metadata, null, 2));

    process.exit(0);
}

readLatestReport().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
