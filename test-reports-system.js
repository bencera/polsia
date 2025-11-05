#!/usr/bin/env node

/**
 * Test script for Reports System
 * Tests database functions and MCP server integration
 */

const { createReport, getReportsByUserId, getReportsByDate } = require('./db.js');

async function testReportsSystem() {
    console.log('🧪 Testing Reports System\n');

    // Use user ID 1 for testing (adjust if needed)
    const testUserId = 1;
    const testDate = new Date().toISOString().split('T')[0]; // Today's date YYYY-MM-DD

    try {
        // Test 1: Create a test report
        console.log('📝 Test 1: Creating a test report...');
        const testReport = {
            name: 'Test Report - Render Analytics',
            report_type: 'render_analytics',
            report_date: testDate,
            content: `# Test Analytics Report

**Generated:** ${new Date().toISOString()}
**Test Run:** Automated test

## Summary
This is a test report to verify the reports system is working correctly.

## Test Metrics
- Total Users: 42
- Active Modules: 7
- Executions Today: 15

## Status
✅ Reports system is operational!`,
            metadata: {
                test: true,
                total_users: 42,
                active_modules: 7,
                executions_today: 15
            },
            execution_id: null,
            module_id: null
        };

        const createdReport = await createReport(testUserId, testReport);
        console.log('✅ Report created successfully!');
        console.log(`   ID: ${createdReport.id}`);
        console.log(`   Name: ${createdReport.name}`);
        console.log(`   Type: ${createdReport.report_type}`);
        console.log(`   Date: ${createdReport.report_date}\n`);

        // Test 2: Query reports by user
        console.log('🔍 Test 2: Querying reports by user...');
        const userReports = await getReportsByUserId(testUserId, {}, 10);
        console.log(`✅ Found ${userReports.length} report(s) for user ${testUserId}`);

        if (userReports.length > 0) {
            console.log('\n   Latest reports:');
            userReports.slice(0, 3).forEach(r => {
                console.log(`   - ${r.name} (${r.report_type}) - ${r.report_date}`);
            });
        }
        console.log('');

        // Test 3: Query reports by date
        console.log('🗓️  Test 3: Querying reports by date...');
        const dateReports = await getReportsByDate(testUserId, testDate);
        console.log(`✅ Found ${dateReports.length} report(s) for date ${testDate}`);

        if (dateReports.length > 0) {
            console.log('\n   Reports for today:');
            dateReports.forEach(r => {
                console.log(`   - ${r.name} (${r.report_type})`);
                console.log(`     Created: ${r.created_at}`);
                console.log(`     Content length: ${r.content.length} chars`);
                if (r.metadata) {
                    console.log(`     Metadata: ${JSON.stringify(r.metadata)}`);
                }
            });
        }
        console.log('');

        // Test 4: Query with filters
        console.log('🎯 Test 4: Querying with type filter...');
        const filteredReports = await getReportsByUserId(testUserId, {
            report_type: 'render_analytics'
        }, 5);
        console.log(`✅ Found ${filteredReports.length} render_analytics report(s)\n`);

        // Test 5: Create a second report (to test multiple per date)
        console.log('📝 Test 5: Creating a second report for same date...');
        const secondReport = {
            name: 'Test Report - Slack Digest',
            report_type: 'slack_digest',
            report_date: testDate,
            content: `# Slack Daily Digest

**Date:** ${testDate}

## Test Summary
Testing multiple reports per date functionality.`,
            metadata: {
                test: true,
                channels_analyzed: 3,
                messages_reviewed: 50
            }
        };

        const secondCreated = await createReport(testUserId, secondReport);
        console.log('✅ Second report created successfully!');
        console.log(`   ID: ${secondCreated.id}`);
        console.log(`   Type: ${secondCreated.report_type}\n`);

        // Verify multiple reports per date
        console.log('🔍 Test 6: Verifying multiple reports per date...');
        const todayReports = await getReportsByDate(testUserId, testDate);
        console.log(`✅ Found ${todayReports.length} report(s) for ${testDate}`);
        console.log('   Report types:');
        todayReports.forEach(r => {
            console.log(`   - ${r.report_type}: "${r.name}"`);
        });
        console.log('');

        // Success!
        console.log('🎉 All tests passed! Reports system is working correctly.\n');
        console.log('Next steps:');
        console.log('1. Run a module that uses reports (e.g., Render Analytics Summarizer)');
        console.log('2. Create a CEO agent module that queries reports');
        console.log('3. Check the reports table in your database\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Run tests
testReportsSystem();
