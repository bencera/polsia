/**
 * Data Migration Script: Modules → Routines
 *
 * This script migrates existing modules to the new routines architecture where:
 * - Routines are scheduled tasks that belong to agents
 * - Agents have persistent session_ids (not routines)
 * - Each module type becomes a routine owned by an agent
 *
 * Run with: node scripts/migrate-modules-to-routines.js
 */

require('dotenv').config();
const { pool } = require('../db');
const fs = require('fs');
const path = require('path');

// Module type to agent type mapping
const MODULE_TYPE_TO_AGENT_MAPPING = {
    'brain_ceo': 'ceo_brain',
    'security_patcher': 'security_agent',
    'email_summarizer': 'email_agent',
    'render_analytics': 'analytics_agent',
    'appstore_analytics': 'analytics_agent',
    'data_agent': 'data_agent',
    'social_content_generator': 'content_agent',
};

// Default agent configurations by type
const DEFAULT_AGENT_CONFIGS = {
    'ceo_brain': {
        name: 'CEO Brain',
        description: 'Strategic decision-making agent that reviews goals, analytics, and assigns tasks',
        role: 'You are the CEO Brain, responsible for strategic planning and decision-making. Review company vision, goals, analytics reports, and tasks. Make informed decisions about what work should be done next and assign tasks to appropriate execution agents.',
    },
    'security_agent': {
        name: 'Security Agent',
        description: 'Monitors and patches security vulnerabilities in repositories',
        role: 'You are a Security Agent specialized in identifying and fixing security vulnerabilities. Monitor repositories for security issues and create pull requests with fixes.',
    },
    'email_agent': {
        name: 'Email Agent',
        description: 'Processes and summarizes email communications',
        role: 'You are an Email Agent that reads, summarizes, and manages email communications. Help users stay on top of their inbox.',
    },
    'analytics_agent': {
        name: 'Analytics Agent',
        description: 'Collects and analyzes metrics from various platforms',
        role: 'You are an Analytics Agent that collects metrics and generates reports on business performance. Track KPIs and identify trends.',
    },
    'data_agent': {
        name: 'Data Agent',
        description: 'Analyzes data and generates insights',
        role: 'You are a Data Agent specialized in data analysis and generating actionable insights from metrics and reports.',
    },
    'content_agent': {
        name: 'Content Agent',
        description: 'Creates and schedules social media content',
        role: 'You are a Content Agent that generates engaging social media content and schedules posts across platforms.',
    },
};

async function migrateModulesToRoutines() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting module → routine migration...\n');

        // Get all modules
        const modulesResult = await client.query('SELECT * FROM modules ORDER BY created_at');
        const modules = modulesResult.rows;

        console.log(`📦 Found ${modules.length} modules to migrate\n`);

        let createdAgents = 0;
        let createdRoutines = 0;
        let migratedSessions = 0;

        for (const module of modules) {
            console.log(`\n🔄 Processing module: ${module.name} (ID: ${module.id}, Type: ${module.type})`);

            // 1. Determine agent type for this module
            const agentType = MODULE_TYPE_TO_AGENT_MAPPING[module.type] || 'general_agent';
            console.log(`   Agent type: ${agentType}`);

            // 2. Find or create agent for this user with this type
            let agentResult = await client.query(
                'SELECT * FROM agents WHERE user_id = $1 AND agent_type = $2 LIMIT 1',
                [module.user_id, agentType]
            );

            let agent;
            if (agentResult.rows.length === 0) {
                // Create new agent
                const agentConfig = DEFAULT_AGENT_CONFIGS[agentType] || {
                    name: `Agent for ${module.type}`,
                    description: `Agent handling ${module.type} routines`,
                    role: `You are an agent responsible for ${module.type} tasks.`,
                };

                console.log(`   ✨ Creating new agent: ${agentConfig.name}`);

                agent = await client.query(
                    `INSERT INTO agents (user_id, name, description, role, agent_type, status, config)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     RETURNING *`,
                    [
                        module.user_id,
                        agentConfig.name,
                        agentConfig.description,
                        agentConfig.role,
                        agentType,
                        'active',
                        module.config || {}
                    ]
                );
                agent = agent.rows[0];
                createdAgents++;
            } else {
                agent = agentResult.rows[0];
                console.log(`   📍 Using existing agent: ${agent.name} (ID: ${agent.id})`);
            }

            // 3. Migrate module session_id to agent (if module has one and agent doesn't)
            if (module.session_id && !agent.session_id) {
                console.log(`   💾 Migrating session ID from module to agent`);

                const oldWorkspace = path.join(process.cwd(), 'temp', 'module-sessions', `module-${module.id}`);
                const newWorkspace = path.join(process.cwd(), 'temp', 'agent-sessions', `agent-${agent.id}`);

                // Copy workspace if it exists
                if (fs.existsSync(oldWorkspace)) {
                    console.log(`   📁 Copying workspace: ${oldWorkspace} → ${newWorkspace}`);
                    try {
                        fs.mkdirSync(path.dirname(newWorkspace), { recursive: true });
                        fs.cpSync(oldWorkspace, newWorkspace, { recursive: true });
                    } catch (err) {
                        console.warn(`   ⚠️  Failed to copy workspace: ${err.message}`);
                    }
                }

                await client.query(
                    'UPDATE agents SET session_id = $1, workspace_path = $2 WHERE id = $3',
                    [module.session_id, newWorkspace, agent.id]
                );
                migratedSessions++;
            }

            // 4. Create routine from module
            console.log(`   🎯 Creating routine from module`);

            const routine = await client.query(
                `INSERT INTO routines (user_id, agent_id, name, description, type, status, frequency, config, last_run_at, next_run_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [
                    module.user_id,
                    agent.id,
                    module.name,
                    module.description,
                    module.type,
                    module.status,
                    module.frequency,
                    module.config,
                    null, // last_run_at will be calculated from executions if needed
                    null  // next_run_at will be calculated on first run
                ]
            );

            console.log(`   ✅ Routine created: ${routine.rows[0].name} (ID: ${routine.rows[0].id})`);
            createdRoutines++;

            // 5. Update existing module_executions to link to routine
            const updateResult = await client.query(
                `UPDATE module_executions
                 SET routine_id = $1, is_routine_execution = true
                 WHERE module_id = $2`,
                [routine.rows[0].id, module.id]
            );

            if (updateResult.rowCount > 0) {
                console.log(`   🔗 Linked ${updateResult.rowCount} executions to routine`);
            }

            // 6. Update module status to 'migrated' to mark it as processed
            await client.query(
                'UPDATE modules SET status = $1 WHERE id = $2',
                ['migrated', module.id]
            );
        }

        console.log('\n\n🎉 Migration completed successfully!\n');
        console.log('📊 Summary:');
        console.log(`   - Modules processed: ${modules.length}`);
        console.log(`   - Agents created: ${createdAgents}`);
        console.log(`   - Routines created: ${createdRoutines}`);
        console.log(`   - Sessions migrated: ${migratedSessions}`);
        console.log('\n✨ All modules have been migrated to routines owned by agents!');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run migration
if (require.main === module) {
    migrateModulesToRoutines()
        .then(() => {
            console.log('\n✅ Migration script completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateModulesToRoutines };
