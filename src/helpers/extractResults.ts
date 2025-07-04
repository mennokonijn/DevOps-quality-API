import {Pool} from "pg";
import {WHOAMI} from "../config/env";

const pool = new Pool({
    user: WHOAMI,
    host: 'localhost',
    database: 'metrics_db',
    password: 'postgres',
    port: 5432,
})


export const extractResults = async (repoName: any): Promise<Record<string, any>[]> => {
    const client = await pool.connect();

    const repoRes = await client.query(
        `SELECT id FROM repositories WHERE name = $1`,
        [repoName]
    );

    if (repoRes.rows.length === 0) {
        client.release();
        return []; // No repository found
    }

    const repositoryId = repoRes.rows[0].id;

    const scansRes = await client.query(
        `SELECT id, started_at FROM scans WHERE repository_id = $1 ORDER BY started_at ASC`,
        [repositoryId]
    );

    const results: Record<string, any>[] = [];

    for (const scanRow of scansRes.rows) {
        const scanId = scanRow.id;

        const [codeRes, testRes, cveRes, planMetrics] = await Promise.all([
            client.query(`SELECT * FROM code_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM test_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM cve_vulnerabilities WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM plan_metrics WHERE scan_id = $1`, [scanId]),
        ]);

        const scan: Record<string, { name: string; value: string }[]> = {
            Plan: [],
            Code: [],
            Build: [],
            Test: [],
            DeployRelease: [],
            OperateMonitor: [],
        };

        // Code metrics
        if (codeRes.rowCount) {
            const c = codeRes.rows[0];
            scan.Code.push(
                { name: 'Cyclomatic Complexity', value: c.cyclomatic_complexity?.toString() ?? '-' },
                { name: 'Cognitive Complexity', value: c.cognitive_complexity?.toString() ?? '-' },
                { name: 'Code Smells', value: c.code_smells?.toString() ?? '-' },
                { name: 'Duplicated Lines Density', value: c.duplicated_lines_density?.toString() ?? '-' }
            );
        }

        // Test metrics
        if (testRes.rowCount) {
            const t = testRes.rows[0];
            scan.Test.push(
                { name: 'Test Success Density', value: (t.test_success_density ? t.test_success_density + '%' : '-') },
                { name: 'Total Coverage', value: t.total_coverage?.toString() ?? '-' }
            );
        }

        // CVEs
        if (cveRes.rowCount) {
            const scores = cveRes.rows.map((r: any) => r.score);
            const avg = scores.length ? (scores.reduce((a, b) => +a + +b, 0) / scores.length).toFixed(1) : '-';
            const detail = cveRes.rows.map((r: any) => `- ${r.cve_id} [${r.severity}] → ${r.score}`).join('\n');

            console.log(scores);
            scan.Build.push({
                name: 'CVE identifiers and CVSS scores',
                value: `Total: ${cveRes.rowCount}, Avg CVSS: ${avg}\n${detail}`,
            });
        }

        if (planMetrics.rowCount) {
            const p = planMetrics.rows[0];
            scan.Plan.push(
                { name: 'Latest sprint velocity', value: (p.estimated_vs_completed_story_points ? Number(p.estimated_vs_completed_story_points || 0).toFixed(1) + '%' : '-') }
            );
        }

        results.push(scan);
    }

    client.release();
    return results;
}
