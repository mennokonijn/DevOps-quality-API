import {Pool} from "pg";
import {WHOAMI} from "../config/env";

const pool = new Pool({
    user: WHOAMI,
    host: 'localhost',
    database: 'metrics_db',
    password: 'postgres',
    port: 5432,
})

type ZapAlert = {
    description: string;
    alert: string;
    solution: string;
    reference: string;
};

type ScanMetric = {
    name: string;
    value: string | number | ZapAlert[];
};



export const extractResults = async (repoName: any): Promise<Record<string, ScanMetric[]>[]> => {
    const client = await pool.connect();

    const repoRes = await client.query(
        `SELECT id FROM repositories WHERE name = $1`,
        [repoName]
    );

    if (repoRes.rows.length === 0) {
        client.release();
        return [];
    }

    const repositoryId = repoRes.rows[0].id;

    const scansRes = await client.query(
        `SELECT id, started_at FROM scans WHERE repository_id = $1 ORDER BY started_at ASC`,
        [repositoryId]
    );

    const results: Record<string, any>[] = [];

    for (const scanRow of scansRes.rows) {
        const scanId = scanRow.id;

        const [codeRes, testRes, cveRes, planMetrics, gitleaksRes, outdatedRes, licenseRes, OperateMonitorMetrics, buildRes, zapAlertsRes] = await Promise.all([
            client.query(`SELECT * FROM code_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM test_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM cve_vulnerabilities WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM plan_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM gitleaks_findings WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM outdated_packages WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM project_licenses WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM operate_monitor_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM build_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM zap_alerts WHERE scan_id = $1`, [scanId])
        ]);


        const scan: Record<string, ScanMetric[]> = {
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
                { name: 'Duplicated Lines Density', value: c.duplicated_lines_density?.toString() ?? '-' },
                { name: 'Programming Language Energy Impact', value: c.programming_language_impact?.toString() ?? '-' }
            );
        }

        if (buildRes.rowCount) {
            const b = buildRes.rows[0];
            const unused = b.unused_libraries
                ? b.unused_libraries.split(',').map((s: string) => s.trim()).filter(Boolean)
                : [];

            const value = unused.length
                ? `Total Unused Libraries: ${unused.length}\n` + unused.map((lib: string) => `- ${lib}`).join('\n')
                : '-';

            scan.Build.push({
                name: 'Unused Libraries',
                value: value
            });
        }


        // Library Freshness
        if (outdatedRes.rowCount) {
            const total = outdatedRes.rowCount;
            const list = outdatedRes.rows.map((r: any) =>
                `- ${r.package_name} ${r.installed_version} → ${r.fixed_versions ?? '?'}`
            ).join('\n');

            scan.Code.push({
                name: 'Library Freshness (Outdated Packages)',
                value: `Outdated Libraries: ${total}\n${list}`,
            });
        }


        // Test metrics
        if (testRes.rowCount) {
            const t = testRes.rows[0];
            scan.Test.push(
                { name: 'Test Success Density', value: (t.test_success_density ? t.test_success_density + '%' : '-') },
                { name: 'Total Coverage', value: t.total_coverage?.toString() ?? '-' }
            );
        }

        // ZAP Alerts
        if (zapAlertsRes.rowCount) {
            const rows = zapAlertsRes.rows;

            scan.Test.push({
                name: 'OWASP ZAP Penetration Tests Findings',
                value: zapAlertsRes.rows.map((r: any) => ({
                    description: r.description,
                    alert: r.alert,
                    riskcode: r.riskcode,
                    solution: r.solution,
                    reference: r.reference
                }))
            });

        }


        // CVEs
        if (cveRes.rowCount) {
            const scores = cveRes.rows.map((r: any) => r.score);
            const avg = scores.length ? (scores.reduce((a, b) => +a + +b, 0) / scores.length).toFixed(1) : '-';
            const detail = cveRes.rows.map((r: any) => `- ${r.cve_id} [${r.severity}] → ${r.score}`).join('\n');

            scan.Build.push({
                name: 'CVE identifiers and CVSS scores',
                value: `Total: ${cveRes.rowCount}, Avg CVSS: ${avg}\n${detail}`,
            });
        }

        // GitLeaks
        if (gitleaksRes.rowCount) {
            const count = gitleaksRes.rowCount;
            const ruleSummary = gitleaksRes.rows
                .map((r: any) => `- ${r.rule} in ${r.file_path}:${r.line_number}`)
                .join('\n');

            scan.Build.push({
                name: 'Secrets detected by GitLeaks',
                value: `Total Leaks: ${count}\n${ruleSummary}`,
            });
        }

        // project licenses
        if (licenseRes.rowCount) {
            const uniqueLicenses = Array.from(new Set(licenseRes.rows.map((r: any) => r.license_name))).sort();
            scan.Build.push({
                name: 'Open Source Licenses',
                value: uniqueLicenses.join('\n')
            });

        }


        // Plan metrics
        if (planMetrics.rowCount) {
            const p = planMetrics.rows[0];
            scan.Plan.push(
                { name: 'Latest sprint velocity', value: (p.estimated_vs_completed_story_points ? Number(p.estimated_vs_completed_story_points || 0).toFixed(1) + '%' : '-') }
            );
            scan.Plan.push(
                { name: 'Security Requirements Coverage', value : (p.security_requirements_coverage ? Number(p.security_requirements_coverage || 0).toFixed(1) + '%' : '-') }
            );
        }

        // Operate and Monitor metrics
        if (OperateMonitorMetrics.rowCount) {
            const o = OperateMonitorMetrics.rows[0];
            scan.OperateMonitor.push(
                { name: 'Security Incidents', value: (o.security_incidents ? Number(o.security_incidents || 0).toFixed(1) : '-') },
                { name: 'Defect Density', value : (o.defect_density ? Number(o.defect_density || 0).toFixed(1) + '%' : '-') }
            );
        }



        results.push(scan);
    }

    client.release();
    return results;
}
