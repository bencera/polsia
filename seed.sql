-- Polsia Seed Data
-- This script creates test users, service connections, and tasks
-- Run this script using: psql -d polsia -f seed.sql
-- Or execute directly in your PostgreSQL client

-- Create a test user
-- Password: 'password123' (hashed with bcrypt)
-- Note: The password hash below is for 'password123' with bcrypt rounds=10
INSERT INTO users (email, password_hash, name, created_at, updated_at)
VALUES
    ('test@polsia.ai', '$2b$10$siK8oyaOtMZh5nfXBHRNnu.ZO1.pnfV07ac82P3yAlecgeBrzfkhq', 'Test User', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Get the user ID for the test user
DO $$
DECLARE
    test_user_id INTEGER;
BEGIN
    SELECT id INTO test_user_id FROM users WHERE email = 'test@polsia.ai';

    -- Create service connections for the test user
    INSERT INTO service_connections (user_id, service_name, status, metadata, created_at)
    VALUES
        (test_user_id, 'github', 'connected', '{"username": "testuser", "repos": 42}', NOW() - INTERVAL '30 days'),
        (test_user_id, 'notion', 'connected', '{"workspace": "Test Workspace"}', NOW() - INTERVAL '25 days'),
        (test_user_id, 'slack', 'disconnected', '{"workspace": "Test Team"}', NOW() - INTERVAL '20 days')
    ON CONFLICT DO NOTHING;

    -- Create sample tasks
    INSERT INTO tasks (user_id, title, description, status, created_at, completed_at)
    VALUES
        (test_user_id, 'Synced GitHub Issues to Notion', 'Automatically synced 15 open issues from GitHub repository to Notion project board', 'completed', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
        (test_user_id, 'Posted Daily Standup Summary', 'Collected updates from team and posted summary to Slack #standup channel', 'completed', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
        (test_user_id, 'Updated Project Documentation', 'Generated and updated README files for 3 repositories based on recent code changes', 'completed', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
        (test_user_id, 'Triaged New Issues', 'Analyzed and labeled 8 new GitHub issues based on content and priority', 'completed', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
        (test_user_id, 'Created Weekly Report', 'Compiled weekly activity report from GitHub, Notion, and Slack data', 'completed', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
        (test_user_id, 'Scheduled Team Meeting', 'Found optimal time slot and created calendar invite for team sync', 'completed', NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours')
    RETURNING id;

    -- Link tasks to services
    -- Task 1: GitHub + Notion
    INSERT INTO task_services (task_id, service_connection_id)
    SELECT t.id, sc.id
    FROM tasks t
    CROSS JOIN service_connections sc
    WHERE t.user_id = test_user_id
        AND t.title = 'Synced GitHub Issues to Notion'
        AND sc.user_id = test_user_id
        AND sc.service_name IN ('github', 'notion');

    -- Task 2: Slack
    INSERT INTO task_services (task_id, service_connection_id)
    SELECT t.id, sc.id
    FROM tasks t
    CROSS JOIN service_connections sc
    WHERE t.user_id = test_user_id
        AND t.title = 'Posted Daily Standup Summary'
        AND sc.user_id = test_user_id
        AND sc.service_name = 'slack';

    -- Task 3: GitHub
    INSERT INTO task_services (task_id, service_connection_id)
    SELECT t.id, sc.id
    FROM tasks t
    CROSS JOIN service_connections sc
    WHERE t.user_id = test_user_id
        AND t.title = 'Updated Project Documentation'
        AND sc.user_id = test_user_id
        AND sc.service_name = 'github';

    -- Task 4: GitHub
    INSERT INTO task_services (task_id, service_connection_id)
    SELECT t.id, sc.id
    FROM tasks t
    CROSS JOIN service_connections sc
    WHERE t.user_id = test_user_id
        AND t.title = 'Triaged New Issues'
        AND sc.user_id = test_user_id
        AND sc.service_name = 'github';

    -- Task 5: All services
    INSERT INTO task_services (task_id, service_connection_id)
    SELECT t.id, sc.id
    FROM tasks t
    CROSS JOIN service_connections sc
    WHERE t.user_id = test_user_id
        AND t.title = 'Created Weekly Report'
        AND sc.user_id = test_user_id
        AND sc.service_name IN ('github', 'notion', 'slack');

    -- Task 6: Slack + Notion
    INSERT INTO task_services (task_id, service_connection_id)
    SELECT t.id, sc.id
    FROM tasks t
    CROSS JOIN service_connections sc
    WHERE t.user_id = test_user_id
        AND t.title = 'Scheduled Team Meeting'
        AND sc.user_id = test_user_id
        AND sc.service_name IN ('slack', 'notion');

END $$;

-- Verification queries
SELECT 'Users created:' as info;
SELECT id, email, name FROM users WHERE email = 'test@polsia.ai';

SELECT 'Service connections created:' as info;
SELECT id, service_name, status FROM service_connections WHERE user_id = (SELECT id FROM users WHERE email = 'test@polsia.ai');

SELECT 'Tasks created:' as info;
SELECT id, title, status FROM tasks WHERE user_id = (SELECT id FROM users WHERE email = 'test@polsia.ai');

-- Success message
SELECT '✅ Seed data created successfully!' as status;
SELECT 'Login credentials:' as info;
SELECT '  Email: test@polsia.ai' as credentials;
SELECT '  Password: password123' as credentials;
