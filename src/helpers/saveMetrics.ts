import {calculateWeightedEnergy} from "../utils/calculateEnergy";
import {pool} from "../database/createDatabase";

type CycloneDXLicense = {
    license?: {
        id?: string;
        expression?: string;
    };
};

type CycloneDXProperty = {
    name: string;
    value: string;
};

export type CycloneDXComponent = {
    'bom-ref': string;
    type: string;
    name: string;
    version?: string;
    licenses?: CycloneDXLicense[];
    purl?: string;
    properties?: CycloneDXProperty[];
};


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

        const functionsNr = getValue('functions');
        const ncloc = getValue('ncloc');

        const smellDensity = (
            typeof codeSmells === 'number' &&
            typeof ncloc === 'number' &&
            ncloc > 0
        )
            ? parseFloat(((codeSmells / ncloc) * 1000).toFixed(2))
            : null;

        const normalizedCyclomatic = (
            typeof cyclomatic === 'number' &&
            typeof functionsNr === 'number' &&
            functionsNr > 0
        )
            ? parseFloat((cyclomatic / functionsNr).toFixed(2))
            : null;

        const normalizedCognitive = (
            typeof cognitive === 'number' &&
            typeof functionsNr === 'number' &&
            functionsNr > 0
        )
            ? parseFloat((cognitive / functionsNr).toFixed(2))
            : null;

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
            [scanId, normalizedCyclomatic, normalizedCognitive, smellDensity, duplication]
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

    else if (tool === 'Outdated-Packages') {
        const outdated = req.body ?? {};

        console.log(outdated)

        for (const [pkg, data] of Object.entries(outdated)) {
            const { current, latest } = data as {
                current?: string;
                latest?: string;
            };

            await client.query(
                `INSERT INTO outdated_packages (
                scan_id, package_name, installed_version, fixed_versions
             ) VALUES ($1, $2, $3, $4)
             ON CONFLICT (scan_id, package_name) DO UPDATE
             SET
               installed_version = EXCLUDED.installed_version,
               fixed_versions = EXCLUDED.fixed_versions;`,
                [scanId, pkg, current ?? null, latest ?? null]
            );
        }

        console.log(`Outdated packages saved for "${repo}"`);
    }


    else if (tool === 'Trivy') {
        const vulnerabilities = req.body?.vulnerabilities ?? [];
        const components: CycloneDXComponent[] = req.body?.components ?? [];
        const seen = new Set();

        for (const vuln of vulnerabilities) {
            const id = vuln.id ?? 'Unknown CVE';
            const severity = vuln.ratings?.[0]?.severity ?? 'UNKNOWN';
            const score = vuln.ratings?.[0]?.score;
            const affected = vuln.affects?.[0]?.ref;

            // Extract component info from the BOM (if needed)
            const component = components.find(c => c['bom-ref'] === affected);
            const pkg = component?.name ?? affected;
            const installed = component?.version ?? null;

            const key = `${id}:${pkg}`;
            if (seen.has(key)) continue;
            seen.add(key);

            if (typeof score === 'number') {
                await client.query(
                    `INSERT INTO cve_vulnerabilities (scan_id, cve_id, package_name, severity, score)
                        VALUES ($1, $2, $3, $4, $5);`,
                    [scanId, id, pkg, severity, score]
                );
            }
        }

        const uniqueLicenses = new Set<string>();
        for (const c of components) {
            const licenses = c.licenses ?? [];

            for (const license of licenses) {
                if (license.license?.id) {
                    uniqueLicenses.add(license.license.id);
                } else if (license.license?.expression) {
                    uniqueLicenses.add(license.license.expression);
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

        console.log(`✅ Trivy CycloneDX results saved for repository "${repo}"`);
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

        for (const finding of findings) {
            const rule = finding.RuleID || 'unknown';
            const file = finding.File || 'unknown';
            const line = finding.StartLine || 0;
            const description = finding.Description || '';
            const detectedAt = finding.date || new Date().toISOString();

            // Skip known false positives
            if (
                file.includes('.github/workflows/quality') ||
                (rule === 'sidekiq-secret' && file.toLowerCase().includes('readme') && line === 50)
            ) {
                continue;
            }

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

    else if (tool === 'Jira-Security-Epics') {
        const epics = req.body.issues ?? [];

        if (!Array.isArray(epics) || epics.length === 0) {
            console.warn('No epic data received');
            return;
        }

        const totalEpics = epics.length;
        const securityEpics = epics.filter((epic: any) => {
                return Array.isArray(epic.fields?.labels) && epic.fields.labels.some((label: string) => label.toLowerCase().includes('security'))
            }

        );
        const securityCount = securityEpics.length;

        const coverage =
            totalEpics > 0
                ? parseFloat(((securityCount / totalEpics) * 100).toFixed(1))
                : null;

        await client.query(
            `INSERT INTO plan_metrics (
            scan_id, security_requirements_coverage
        ) VALUES ($1, $2)
        ON CONFLICT (scan_id) DO UPDATE
        SET security_requirements_coverage = EXCLUDED.security_requirements_coverage;`,
            [scanId, coverage]
        );

        console.log(`Security requirements coverage saved for repository "${repo}": ${securityCount}/${totalEpics} (${coverage}%)`);
    }

    else if (tool === 'Jira-Security-Incidents') {
        const issues = req.body?.issues ?? [];
        const incidentCount = issues.length;

        await client.query(
            `INSERT INTO operate_monitor_metrics (
            scan_id, security_incidents
         ) VALUES ($1, $2)
         ON CONFLICT (scan_id) DO UPDATE
         SET security_incidents = EXCLUDED.security_incidents;`,
            [scanId, incidentCount]
        );

        console.log(`Saved ${incidentCount} security incidents during sprint for "${repo}"`);
    }

    else if (tool === 'Jira-Defect-Density') {
        const issues = req.body?.issues ?? [];
        const kloc = req.body?.kloc;

        const bugCount = issues.length;

        let defectDensity: number | null = null;
        if (typeof kloc === 'number' && kloc > 0) {
            defectDensity = parseFloat((bugCount / kloc).toFixed(2));
        }

        await client.query(
            `INSERT INTO operate_monitor_metrics (
            scan_id, defect_density
        ) VALUES ($1, $2)
        ON CONFLICT (scan_id) DO UPDATE
        SET defect_density = EXCLUDED.defect_density;`,
            [scanId, defectDensity]
        );

        console.log(`Saved defect density for repository "${repo}": ${bugCount} bugs / ${kloc} KLOC = ${defectDensity}`);
    }

    else if (tool === 'Language-Impact') {
        const languages = req.body ?? {};
        const energy = calculateWeightedEnergy(languages);

        await client.query(
            `INSERT INTO code_metrics (scan_id, programming_language_impact)
         VALUES ($1, $2)
         ON CONFLICT (scan_id) DO UPDATE
         SET programming_language_impact = EXCLUDED.programming_language_impact;`,
            [scanId, energy]
        );

        console.log(`Saved language energy impact (${energy} J) for repo "${repo}"`);
    }

    else if (tool === 'Depcheck') {
        const body = req.body ?? {};
        const unusedList = Array.isArray(body.dependencies) ? body.dependencies : [];

        const unusedString = unusedList.join(', ');
        const unusedCount = unusedList.length;

        await client.query(
            `INSERT INTO build_metrics (scan_id, unused_libraries)
         VALUES ($1, $2)
         ON CONFLICT (scan_id) DO UPDATE
         SET unused_libraries = EXCLUDED.unused_libraries;`,
            [scanId, unusedString]
        );

        console.log(`Saved ${unusedCount} unused libraries for "${repo}": ${unusedString}`);
    }

    else if (tool === 'ZAP') {
        const body = req.body ?? {};
        const site = body?.site?.[0];
        const alerts = Array.isArray(site?.alerts) ? site.alerts : [];

        for (const alert of alerts) {
            await client.query(
                `INSERT INTO zap_alerts (
              scan_id, alert, confidence, solution, description, riskcode, reference
            ) VALUES ($1, $2, $3, $4, $5, $6, $7);`,
                [
                    scanId,
                    alert.alert || 'Unknown',
                    alert.confidence || null,
                    alert.solution.replace(/<\/?p>/g, '') || null,
                    alert.riskdesc.replace(/<\/?p>/g, '') || null,
                    alert.riskcode || '-',
                    alert.reference.replace(/<\/?p>/g, '') || null
                ]
            );
        }

        console.log(`Saved ZAP alerts for "${repo}"`);
    }

    else if (tool === 'Deployment-Frequency') {
        const deployments = req.body ?? [];

        if (!Array.isArray(deployments) || deployments.length === 0) {
            console.warn(`No deployment frequency data received for "${repo}"`);
            return;
        }

        // Only use data from the past 7 days
        const now = new Date();
        const pastWeekData = deployments.filter((d: any) => {
            const date = new Date(d.date);
            const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
            return diffDays <= 7;
        });

        const totalDeploys = pastWeekData.reduce((sum, d) => sum + d.count, 0);
        const distinctDays = pastWeekData.length;

        const avgPerDay = distinctDays > 0 ? totalDeploys / distinctDays : 0;

        await client.query(
            `INSERT INTO deploy_release_metrics (scan_id, deployment_frequency)
     VALUES ($1, $2)
     ON CONFLICT (scan_id) DO UPDATE
     SET deployment_frequency = EXCLUDED.deployment_frequency;`,
            [scanId, avgPerDay]
        );

        console.log(`Saved average deployment frequency (${avgPerDay.toFixed(2)} per day over ${distinctDays} day(s)) for "${repo}"`);
    }

    else if (tool === 'Deployment-Time') {
        const data = req.body ?? [];

        const total = data.reduce((sum: number, d: any) => sum + (d.lead_time_hours || 0), 0);
        const avg = data.length > 0 ? total / data.length : null;

        await client.query(
            `INSERT INTO deploy_release_metrics (scan_id, deployment_time)
     VALUES ($1, $2)
     ON CONFLICT (scan_id) DO UPDATE
     SET deployment_time = EXCLUDED.deployment_time;`,
            [scanId, avg]
        );

        console.log(`Saved average deployment time (${avg?.toFixed(2)} hrs) for "${repo}"`);
    }

    else if (tool === 'MTTR') {
        const incidents = req.body ?? [];

        const total = incidents.reduce((sum: number, d: any) => sum + (d.mttr_minutes || 0), 0);
        const avgMinutes = incidents.length > 0 ? total / incidents.length : null;
        const avgHours = avgMinutes !== null ? avgMinutes / 60 : null;

        await client.query(
            `INSERT INTO operate_monitor_metrics (scan_id, mttr)
         VALUES ($1, $2)
         ON CONFLICT (scan_id) DO UPDATE
         SET mttr = EXCLUDED.mttr;`,
            [scanId, avgHours]
        );

        console.log(`Saved MTTR (${avgHours?.toFixed(2)} hours) for "${repo}"`);
    }

    client.release();
}
