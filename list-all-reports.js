#!/usr/bin/env node

const { pool } = require('./db.js');

async function listAllReports() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT id, name, report_type, report_date,
                    LENGTH(content) as content_length,
                    metadata, created_at
             FROM reports
             ORDER BY report_date DESC, created_at DESC`
        );

        console.log('\n📊 ALL REPORTS IN DATABASE\n');
        console.log('='.repeat(80));

        if (result.rows.length === 0) {
            console.log('\n   No reports found in database.\n');
        } else {
            result.rows.forEach((report, i) => {
                console.log(`\n${i + 1}. Report ID: ${report.id}`);
                console.log(`   Name: ${report.name}`);
                console.log(`   Type: ${report.report_type}`);
                console.log(`   Date: ${report.report_date.toISOString().split('T')[0]}`);
                console.log(`   Created: ${report.created_at.toLocaleString()}`);
                console.log(`   Content Length: ${report.content_length} chars`);
                if (report.metadata) {
                    console.log(`   Metadata: ${JSON.stringify(report.metadata)}`);
                }
            });

            console.log('\n' + '='.repeat(80));
            console.log(`\nTotal: ${result.rows.length} reports\n`);
        }
    } finally {
        client.release();
    }
    process.exit(0);
}

listAllReports().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
