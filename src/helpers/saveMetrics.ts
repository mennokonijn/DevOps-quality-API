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
        const seen = new Set();
        const uniqueLicenses = new Set<string>();

        for (const result of results) {
            const vulns = result.Vulnerabilities ?? [];
            for (const vuln of vulns) {
                const key = `${vuln.VulnerabilityID}:${vuln.PkgName}`;
                if (seen.has(key)) continue;
                seen.add(key);

                const id = vuln?.VulnerabilityID ?? 'Unknown CVE';
                const severity = vuln?.Severity ?? 'UNKNOWN';
                const score = vuln?.CVSS?.ghsa?.V3Score ?? vuln?.CVSS?.nvd?.V3Score;
                const pkg = vuln?.PkgName;
                const installed = vuln?.InstalledVersion;
                const fixed = vuln?.FixedVersion;
                const file = result?.Target;
                const title = vuln?.Title?.toLowerCase() ?? '';
                const description = vuln?.Description?.toLowerCase() ?? '';
                const isLicenseIssue = title.includes('license') || description.includes('license');

                if (typeof score === 'number') {
                    await client.query(
                        `INSERT INTO cve_vulnerabilities (scan_id, cve_id, package_name, severity, score)
                                VALUES ($1, $2, $3, $4, $5);`,
                        [scanId, id, pkg, severity, score]
                    );
                }

                if (pkg && installed && fixed && fixed !== installed) {
                    await client.query(
                        `INSERT INTO outdated_packages (scan_id, package_name, installed_version, fixed_versions, severity, file_path)
                           VALUES ($1, $2, $3, $4, $5, $6)
                           ON CONFLICT (scan_id, package_name)
                           DO UPDATE SET
                             installed_version = EXCLUDED.installed_version,
                             fixed_versions = EXCLUDED.fixed_versions,
                             severity = EXCLUDED.severity,
                             file_path = EXCLUDED.file_path;`,
                        [scanId, pkg, installed, fixed, severity, file]
                    );

                }
            }

            const licenses = result.Licenses ?? [];
            for (const license of licenses) {
                if (license.Name) {
                    uniqueLicenses.add(license.Name);
                }
            }
        }

        for (const licenseName of uniqueLicenses) {
            await client.query(
                `INSERT INTO project_licenses (scan_id, license_name)
                     VALUES ($1, $2)
                     ON CONFLICT (scan_id, license_name) DO NOTHING;`,
                [scanId, licenseName]
            );
        }


        console.log(`Trivy results saved for repository "${repo}"`);
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

    else if (tool === 'GitLeaks') {
        const findings = req.body ?? [];

        console.log(findings);

        for (const finding of findings) {
            const rule = finding.RuleID || 'unknown';
            const file = finding.File || 'unknown';
            const line = finding.StartLine || 0;
            const description = finding.Description || '';
            const detectedAt = finding.date || new Date().toISOString();

            await client.query(
                `INSERT INTO gitleaks_findings (
                scan_id, rule, file_path, line_number, description, detected_at
            ) VALUES ($1, $2, $3, $4, $5, $6);`,
                [scanId, rule, file, line, description, detectedAt]
            );
        }

        const secretCount = Array.isArray(findings) ? findings.length : 0;

        await client.query(
            `INSERT INTO build_metrics (scan_id, secret_detection)
         VALUES ($1, $2)
         ON CONFLICT (scan_id) DO UPDATE
         SET secret_detection = EXCLUDED.secret_detection;`,
            [scanId, secretCount]
        );

        console.log(`GitLeaks findings saved for repository "${repo}"`);
    }



    client.release();
}
