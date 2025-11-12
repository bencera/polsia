exports.shorthands = undefined;

exports.up = (pgm) => {
    // ===== STEP 1: Merge routines into their parent agents =====

    // For each agent that has routines, update the agent with schedule info from its first active routine
    pgm.sql(`
        UPDATE agents a
        SET
            execution_mode = CASE
                WHEN r.frequency = 'manual' THEN 'on_demand'::execution_mode_type
                ELSE 'scheduled'::execution_mode_type
            END,
            schedule_frequency = CASE
                WHEN r.frequency != 'manual' THEN r.frequency
                ELSE NULL
            END,
            last_run_at = r.last_run_at,
            next_run_at = r.next_run_at
        FROM routines r
        WHERE a.id = r.agent_id
          AND r.status = 'active'
          AND r.id = (
              SELECT MIN(id) FROM routines
              WHERE agent_id = a.id AND status = 'active'
          );
    `);

    // ===== STEP 2: Migrate modules to new agents =====

    // For each module, create a corresponding agent
    // Skip modules that already have a corresponding agent by agent_type
    pgm.sql(`
        INSERT INTO agents (
            user_id,
            name,
            description,
            role,
            agent_type,
            status,
            execution_mode,
            schedule_frequency,
            config,
            session_id,
            created_at,
            updated_at
        )
        SELECT
            m.user_id,
            m.name,
            m.description,
            COALESCE(m.description, 'Autonomous agent migrated from module system'),
            m.type AS agent_type,
            CASE
                WHEN m.status IN ('active', 'paused') THEN m.status
                ELSE 'disabled'
            END AS status,
            CASE
                WHEN m.frequency = 'manual' THEN 'on_demand'::execution_mode_type
                ELSE 'scheduled'::execution_mode_type
            END AS execution_mode,
            CASE
                WHEN m.frequency != 'manual' THEN m.frequency
                ELSE NULL
            END AS schedule_frequency,
            m.config,
            m.session_id,
            m.created_at,
            CURRENT_TIMESTAMP AS updated_at
        FROM modules m
        WHERE NOT EXISTS (
            -- Don't create duplicate agents for modules that already have agents
            SELECT 1 FROM agents a WHERE a.agent_type = m.type AND a.user_id = m.user_id
        );
    `);

    // ===== STEP 3: Link module executions to new agents =====

    // Update module_executions to reference the agent_id for migrated modules
    // This preserves execution history
    pgm.sql(`
        UPDATE module_executions me
        SET metadata = COALESCE(me.metadata, '{}'::jsonb) ||
            jsonb_build_object(
                'migrated_from_module_id', me.module_id,
                'migrated_from_module_type', m.type
            )
        FROM modules m
        WHERE me.module_id = m.id
          AND me.module_id IS NOT NULL;
    `);

    // ===== STEP 4: Add comments for tracking =====
    pgm.sql(`
        COMMENT ON TABLE modules IS 'DEPRECATED: Migrated to agents table. Kept for historical reference only.';
        COMMENT ON TABLE routines IS 'DEPRECATED: Merged into agents table. Kept for historical reference only.';
    `);

    // ===== STEP 5: Add migration tracking flag to agents =====
    pgm.addColumn('agents', {
        migrated_from: {
            type: 'varchar(50)',
            notNull: false
        }
    });

    pgm.sql(`
        COMMENT ON COLUMN agents.migrated_from IS 'Tracks if agent was migrated from modules or routines system';
    `);
};

exports.down = (pgm) => {
    // Remove migration tracking
    pgm.dropColumn('agents', 'migrated_from');

    // Remove comments
    pgm.sql(`
        COMMENT ON TABLE modules IS NULL;
        COMMENT ON TABLE routines IS NULL;
    `);

    // Note: We cannot fully reverse the data migration without data loss
    // The down migration will only remove the tracking fields
    console.log('WARNING: Data migration cannot be fully reversed without potential data loss.');
    console.log('Modules and routines tables are preserved but agents created from migration remain.');
};
