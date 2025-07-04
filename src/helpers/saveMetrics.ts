import {Pool} from "pg";
import {WHOAMI} from "../config/env";

const pool = new Pool({
    user: WHOAMI,
    host: 'localhost',
    database: 'metrics_db',
    password: 'postgres',
    port: 5432,
})

export const saveMetrics = async (repo: string, tool: string, req: any) => {
    const client = await pool.connect();

    const existing = await client.query(
        `SELECT id FROM repositories WHERE name = $1`,
        [repo]
    );

    let repositoryId: number;

    if (existing.rowCount !== null && existing.rowCount > 0) {
        repositoryId = existing.rows[0].id;
    } else {
        const insertRes = await client.query(
            `INSERT INTO repositories (name) VALUES ($1) RETURNING id`,
            [repo]
        );
        repositoryId = insertRes.rows[0].id;
    }

    // 1. Check if a scan exists for this repo in the last X minutes
    const scanRes = await client.query(
        `SELECT id FROM scans
           WHERE repository_id = $1
           AND started_at > NOW() - INTERVAL '5 minutes'
           ORDER BY started_at DESC
           LIMIT 1`,
                [repositoryId]
            );

            let scanId: number;
            if (scanRes.rowCount !== null && scanRes.rowCount > 0) {
                scanId = scanRes.rows[0].id;
            } else {
                const insertScan = await client.query(
                    `INSERT INTO scans (repository_id) VALUES ($1) RETURNING id`,
                    [repositoryId]
                );
                scanId = insertScan.rows[0].id;
            }

    if (tool === 'SonarQube') {
        const measures = req.body?.component?.measures ?? [];

        const getValue = (key: string): number | null => {
            const metric = measures.find((m: any) => m.metric === key);
            return metric ? parseFloat(metric.value) : null;
        };

        const cyclomatic = getValue('complexity');
        const cognitive = getValue('cognitive_complexity');
        const codeSmells = getValue('code_smells');
        const duplication = getValue('duplicated_lines_density');

        const coverage = getValue('coverage');

        await client.query(
            `INSERT INTO code_metrics (
                   scan_id, cyclomatic_complexity, cognitive_complexity,
                   code_smells, duplicated_lines_density
                 ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (scan_id) DO UPDATE
            SET
            cyclomatic_complexity = EXCLUDED.cyclomatic_complexity,
            cognitive_complexity = EXCLUDED.cognitive_complexity,
            code_smells = EXCLUDED.code_smells,
            duplicated_lines_density = EXCLUDED.duplicated_lines_density;`,
            [scanId, cyclomatic, cognitive, codeSmells, duplication]
        );

        await client.query(
            `INSERT INTO  test_metrics (
                   scan_id, total_coverage
                 ) VALUES ($1, $2)
                   ON CONFLICT (scan_id) DO UPDATE
                   SET total_coverage = EXCLUDED.total_coverage;`,
            [scanId, coverage]
        );

        console.log(`SonarQube metrics saved for repository "${repo}"`);
    }

    else if (tool === 'Trivy') {
        const results = req.body?.Results ?? [];

        for (const result of results) {
            const vulns = result.Vulnerabilities ?? [];
            for (const vuln of vulns) {
                const id = vuln?.VulnerabilityID ?? 'Unknown CVE';
                const severity = vuln?.Severity ?? 'UNKNOWN';
                const score = vuln?.CVSS?.ghsa?.V3Score ?? vuln?.CVSS?.nvd?.V3Score;

                if (typeof score === 'number') {
                    await client.query(
                        `INSERT INTO cve_vulnerabilities (scan_id, cve_id, severity, score)
                                VALUES ($1, $2, $3, $4);`,
                        [scanId, id, severity, score]
                    );
                }
            }
        }

        console.log(`Trivy vulnerabilities saved for repository "${repo}"`);
    }

    else if (tool === 'Jest') {
        const passed = req.body?.numPassedTests;
        const total = req.body?.numTotalTests;

        const successDensity =
            typeof passed === 'number' && typeof total === 'number' && total > 0
                ? (passed / total) * 100
                : null;

        await client.query(
            `INSERT INTO test_metrics (scan_id, test_success_density)
                    VALUES ($1, $2)
                    ON CONFLICT (scan_id) DO UPDATE
                    SET test_success_density = EXCLUDED.test_success_density;`,
            [scanId, successDensity]
        );

        console.log(`Jest test metrics saved for repository "${repo}"`);
    }

    else if (tool === 'Jira-SprintPoints') {
        const sprints = req.body;

        if (!Array.isArray(sprints) || sprints.length === 0) {
            console.warn('No sprint data received');
            return;
        }

        // Get the last sprint (latest in array)
        const latestSprint = sprints[sprints.length - 1];

        const estimated = Number(latestSprint.estimated);
        const completed = Number(latestSprint.completed);

        const ratio =
            estimated > 0
                ? (completed / estimated) * 100
                : null;

        await client.query(
            `INSERT INTO plan_metrics (
            scan_id, estimated_vs_completed_story_points
         ) VALUES ($1, $2)
         ON CONFLICT (scan_id) DO UPDATE
         SET estimated_vs_completed_story_points = EXCLUDED.estimated_vs_completed_story_points;`,
            [scanId, ratio]
        );

        console.log(`Jira Sprint Points saved for "${repo}" (Sprint: ${latestSprint.sprint})`);
    }


    client.release();
}
