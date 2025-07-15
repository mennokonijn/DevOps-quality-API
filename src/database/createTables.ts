import { Client } from 'pg';
import { WHOAMI} from "../config/env";

const client = new Client({
    user: WHOAMI,
    host: 'localhost',
    database: 'metrics_db',
    password: 'postgress',
    port: 5432,
});

const createTables = async () => {
    await client.connect();

    // UNCOMMENT THIS TO DROP ALL TABLES

    // await client.query(`
    //   DROP TABLE IF EXISTS
    //     gitleaks_findings,
    //     cve_vulnerabilities,
    //     operate_monitor_metrics,
    //     deploy_release_metrics,
    //     test_metrics,
    //     build_metrics,
    //     code_metrics,
    //     plan_metrics,
    //     repositories,
    //     scans
    //   CASCADE;
    // `);

    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS repositories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
  
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );



      CREATE TABLE IF NOT EXISTS plan_metrics (
        id SERIAL PRIMARY KEY,
        scan_id INTEGER UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
        requirements_completeness NUMERIC,
        estimated_vs_completed_story_points NUMERIC,
        security_requirements_coverage NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS code_metrics (
        id SERIAL PRIMARY KEY,
        scan_id INTEGER UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
        library_freshness NUMERIC,
        cyclomatic_complexity NUMERIC,
        cognitive_complexity NUMERIC,
        code_smells NUMERIC,
        duplicated_lines_density NUMERIC,
        programming_language_impact NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS build_metrics (
        id SERIAL PRIMARY KEY,
        scan_id INTEGER UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
        cve_count INTEGER,
        avg_cvss_score NUMERIC,
        secret_detection NUMERIC,
        license_scan_issues NUMERIC,
        unused_libraries NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS test_metrics (
        id SERIAL PRIMARY KEY,
        scan_id INTEGER UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
        total_coverage NUMERIC,
        test_success_density NUMERIC,
        sla_time_behavior NUMERIC,
        sla_resource_utilization NUMERIC,
        sla_capacity NUMERIC,
        penetration_testing NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS deploy_release_metrics (
        id SERIAL PRIMARY KEY,
        scan_id INTEGER UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
        deployment_time NUMERIC,
        change_time NUMERIC,
        deployment_frequency NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS operate_monitor_metrics (
        id SERIAL PRIMARY KEY,
        scan_id INTEGER UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
        security_incidents NUMERIC,
        availability_percentage NUMERIC,
        mttr NUMERIC,
        user_satisfaction NUMERIC,
        defect_density NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
  
    CREATE TABLE IF NOT EXISTS cve_vulnerabilities (
      id SERIAL PRIMARY KEY,
      scan_id INTEGER REFERENCES scans(id) ON DELETE CASCADE,
      cve_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      score NUMERIC NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gitleaks_findings (
      id SERIAL PRIMARY KEY,
      scan_id INTEGER REFERENCES scans(id) ON DELETE CASCADE,
      rule TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER,
      description TEXT,
      detected_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );


    `);

        console.log('Tables created (or already exist)');
    } catch (err) {
        console.error('Error creating tables:', err);
    } finally {
        await client.end();
    }
};

export default createTables;
