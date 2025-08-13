import {pool} from "../database/createDatabase";
import {ToolName} from "../utils/ToolMap";

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
        `SELECT id, metrics FROM repositories WHERE name = $1`,
        [repoName]
    );

    if (repoRes.rows.length === 0) {
        client.release();
        return [];
    }

    const repositoryId = repoRes.rows[0].id;
    const selectedMetrics = repoRes.rows[0].metrics;

    const scansRes = await client.query(
        `SELECT id, started_at FROM scans WHERE repository_id = $1 ORDER BY started_at ASC`,
        [repositoryId]
    );

    const results: Record<string, any>[] = [];

    for (const scanRow of scansRes.rows) {
        const scanId = scanRow.id;

        const [codeRes, testRes, cveRes, planMetrics, gitleaksRes, outdatedRes, licenseRes, OperateMonitorMetrics, buildRes, zapAlertsRes, deployReleaseRes] = await Promise.all([
            client.query(`SELECT * FROM code_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM test_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM cve_vulnerabilities WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM plan_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM gitleaks_findings WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM outdated_packages WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM project_licenses WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM operate_monitor_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM build_metrics WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM zap_alerts WHERE scan_id = $1`, [scanId]),
            client.query(`SELECT * FROM deploy_release_metrics WHERE scan_id = $1`, [scanId])
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
        if (selectedMetrics.includes(ToolName.Complexity)) {
            if (codeRes.rowCount) {
                const c = codeRes.rows[0];
                if (c.cyclomatic_complexity != null) {
                    scan.Code.push({
                        name: 'Average Cyclomatic Complexity per function',
                        value: c.cyclomatic_complexity.toString()
                    });
                } else {
                    scan.Code.push({
                        name: 'Average Cyclomatic Complexity per function',
                        value: 'Not available'
                    });
                }
            } else {
                scan.Code.push({
                    name: 'Average Cyclomatic Complexity per function',
                    value: 'Not available'
                });
            }
        }

        if (selectedMetrics.includes(ToolName.CognitiveComplexity)) {
            if (codeRes.rowCount) {
                const c = codeRes.rows[0];
                if (c.cognitive_complexity != null) {
                    scan.Code.push({
                        name: 'Average Cognitive Complexity per function',
                        value: c.cognitive_complexity.toString()
                    });
                } else {
                    scan.Code.push({
                        name: 'Average Cognitive Complexity per function',
                        value: 'Not available'
                    });
                }
            } else {
                scan.Code.push({
                    name: 'Average Cognitive Complexity per function',
                    value: 'Not available'
                });
            }
        }

        if (selectedMetrics.includes(ToolName.CodeSmells)) {
            if (codeRes.rowCount) {
                const c = codeRes.rows[0];
                if (c.code_smells != null) {
                    scan.Code.push({
                        name: 'Code Smells per KLOC',
                        value: c.code_smells.toString()
                    });
                } else {
                    scan.Code.push({
                        name: 'Code Smells per KLOC',
                        value: 'Not available'
                    });
                }
            } else {
                scan.Code.push({
                    name: 'Code Smells per KLOC',
                    value: 'Not available'
                });
            }
        }

        if (selectedMetrics.includes(ToolName.DuplicatedLinesDensity)) {
            if (codeRes.rowCount) {
                const c = codeRes.rows[0];
                if (c.duplicated_lines_density != null) {
                    scan.Code.push({
                        name: 'Duplicated Lines Density',
                        value: c.duplicated_lines_density.toString() + '%'
                    });
                } else {
                    scan.Code.push({
                        name: 'Duplicated Lines Density',
                        value: 'Not available'
                    });
                }
            } else {
                scan.Code.push({
                    name: 'Duplicated Lines Density',
                    value: 'Not available'
                });
            }
        }

        if (selectedMetrics.includes(ToolName.LanguageImpact)) {
            if (codeRes.rowCount) {
                const c = codeRes.rows[0];
                if (c.programming_language_impact != null) {
                    scan.Code.push({
                        name: 'Programming Language Energy Impact',
                        value: c.programming_language_impact.toString()
                    });
                } else {
                    scan.Code.push({
                        name: 'Programming Language Energy Impact',
                        value: 'Not available'
                    });
                }
            } else {
                scan.Code.push({
                    name: 'Programming Language Energy Impact',
                    value: 'Not available'
                });
            }
        }

        if (selectedMetrics.includes(ToolName.Depcheck)) {
            if (buildRes.rowCount) {
                const b = buildRes.rows[0];
                const rawUnused = b.unused_libraries?.trim();

                const unused = rawUnused && rawUnused.toLowerCase() !== 'null'
                    ? rawUnused.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : [];

                const value = unused.length
                    ? `Total Unused Libraries: ${unused.length}\n` + unused.map((lib: string) => `- ${lib}`).join('\n')
                    : 0;

                scan.Build.push({
                    name: 'Unused Libraries',
                    value
                });
            } else {
                scan.Build.push({
                    name: 'Unused Libraries',
                    value: 0
                });
            }
        }

        // Library Freshness
        if (selectedMetrics.includes(ToolName.OutdatedPackages)) {
            if (outdatedRes.rowCount) {
                const total = outdatedRes.rowCount;
                const list = outdatedRes.rows.map((r: any) =>
                    `- ${r.package_name} ${r.installed_version} → ${r.fixed_versions ?? '?'}`
                ).join('\n');

                scan.Code.push({
                    name: 'Outdated Packages',
                    value: `Outdated Libraries: ${total}\n${list}`,
                });
            } else {
                scan.Code.push({
                    name: 'Outdated Packages',
                    value: 'No outdated packages found.'
                });
            }
        }


        // Test metrics
        if (selectedMetrics.includes(ToolName.Jest)) {
            if (testRes.rowCount) {
                scan.Test.push({
                    name: 'Test Success Density',
                    value: (testRes.rows[0].test_success_density ? Number(testRes.rows[0].test_success_density).toFixed(2) + '%' : 'Not available')
                });
            } else {
                scan.Test.push({
                    name: 'Test Success Density',
                    value: 'No test data available.'
                });
            }
        }
        if (selectedMetrics.includes(ToolName.Coverage)) {
            if (testRes.rowCount) {
                const t = testRes.rows[0];
                scan.Test.push(
                    {name: 'Total Coverage', value: t.total_coverage?.toString() ?? 'Not available'}
                );
            } else {
                scan.Test.push({
                    name: 'Total Coverage',
                    value: 'No test data available.'
                });
            }
        }

        // ZAP Alerts
        if (selectedMetrics.includes(ToolName.ZAP)) {
            if (zapAlertsRes.rowCount) {
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
            } else {
                scan.Test.push({
                    name: 'OWASP ZAP Penetration Tests Findings',
                    value: 'No ZAP findings found.'
                });
            }
        }


        // CVEs
        if (selectedMetrics.includes(ToolName.Trivy)) {
            if (!cveRes.rowCount) {
                scan.Build.push({
                    name: 'CVE identifiers and CVSS scores',
                    value: `No CVEs found for this scan.`,
                });
            } else {
                const scores = cveRes.rows.map((r: any) => r.score);
                const avg = scores.length ? (scores.reduce((a, b) => +a + +b, 0) / scores.length).toFixed(1) : '-';
                const detail = cveRes.rows.map((r: any) => `- ${r.cve_id} [${r.severity}] → ${r.score}`).join('\n');

                scan.Build.push({
                    name: 'CVE identifiers and CVSS scores',
                    value: `Total: ${cveRes.rowCount}, Avg CVSS: ${avg}\n${detail}`,
                });
            }
        }

        // GitLeaks
        if (selectedMetrics.includes(ToolName.GitLeaks)) {
            if (gitleaksRes.rowCount) {
                const count = gitleaksRes.rowCount;
                const ruleSummary = gitleaksRes.rows
                    .map((r: any) => `- ${r.rule} in ${r.file_path}:${r.line_number}`)
                    .join('\n');

                scan.Build.push({
                    name: 'Secrets detected by GitLeaks',
                    value: `Total Leaks: ${count}\n${ruleSummary}`,
                });
            } else {
                scan.Build.push({
                    name: 'Secrets detected by GitLeaks',
                    value: 'No secrets found.'
                });
            }
        }

        // project licenses
        if (selectedMetrics.includes(ToolName.TrivyOpen)) {
            if (licenseRes.rowCount) {
                const uniqueLicenses = Array.from(new Set(licenseRes.rows.map((r: any) => r.license_name))).sort();
                scan.Build.push({
                    name: 'Open Source Licenses',
                    value: uniqueLicenses.join('\n')
                });
            } else {
                scan.Build.push({
                    name: 'Open Source Licenses',
                    value: 'No licenses found.'
                });
            }
        }


        // Plan metrics

        if (selectedMetrics.includes(ToolName.JiraSprintPoints)) {
            if (planMetrics.rowCount) {
                const p = planMetrics.rows[0];
                scan.Plan.push(
                    { name: 'Completion Rate', value: (p.estimated_vs_completed_story_points ? Number(p.estimated_vs_completed_story_points || 0).toFixed(1) + '%' : '-') }
                );
            } else {
                scan.Plan.push(
                    { name: 'Completion Rate', value: 'No data available.' }
                );
            }
        }

        if (selectedMetrics.includes(ToolName.JiraSecurityEpics)) {
            if (planMetrics.rowCount) {
                const p = planMetrics.rows[0];
                scan.Plan.push(
                    { name: 'Security Requirements Coverage', value : (p.security_requirements_coverage ? Number(p.security_requirements_coverage || 0).toFixed(1) + '%' : '-') }
                );
            } else {
                scan.Plan.push(
                    { name: 'Security Requirements Coverage', value: 'No data available.' }
                );
            }
        }

        if (selectedMetrics.includes(ToolName.JiraSecurityIncidents)) {
            if (planMetrics.rowCount) {
                const o = OperateMonitorMetrics.rows[0];
                scan.OperateMonitor.push(
                    { name: 'Security Incidents', value: (o.security_incidents ? Number(o.security_incidents || 0) : '-') },
                );
            } else {
                scan.OperateMonitor.push(
                    { name: 'Security Incidents', value: 'No data available.' }
                );
            }
        }

        if (selectedMetrics.includes(ToolName.JiraDefectDensity)) {
            if (OperateMonitorMetrics.rowCount) {
                const o = OperateMonitorMetrics.rows[0];
                scan.OperateMonitor.push(
                    { name: 'Defect Density per KLOC', value : (o.defect_density ? Number(o.defect_density || 0) : '-') },
                );
            } else {
                scan.OperateMonitor.push(
                    { name: 'Defect Density per KLOC', value: 'No data available.' }
                );
            }
        }

        if (selectedMetrics.includes(ToolName.MTTR)) {
            // Operate and Monitor metrics
            if (OperateMonitorMetrics.rowCount) {
                const o = OperateMonitorMetrics.rows[0];
                scan.OperateMonitor.push(
                    {name: 'Mean Time to Recover (MTTR)', value: Number(o.mttr).toFixed(4) + ' hours'}
                );
            } else {
                scan.OperateMonitor.push(
                    {name: 'Mean Time to Recover (MTTR)', value: 'No data available.'}
                );
            }
        }

        if (selectedMetrics.includes(ToolName.DeploymentFrequency)) {
            if (deployReleaseRes.rowCount) {
                const o = deployReleaseRes.rows[0];
                scan.DeployRelease.push(
                    {name: 'Average Deployment Frequency', value: Number(o.deployment_frequency).toFixed(2) + ' per day'}
                );
            } else {
                scan.DeployRelease.push(
                    {name: 'Average Deployment Frequency', value: 'No data available.'}
                );
            }
        }

        if (selectedMetrics.includes(ToolName.DeploymentTime)) {
            if (deployReleaseRes.rowCount) {
                const d = deployReleaseRes.rows[0];
                scan.DeployRelease.push({
                    name: 'Average Deployment Time',
                    value: Number(d.deployment_time).toFixed(2) + ' hours',
                });
            } else {
                scan.DeployRelease.push({
                    name: 'Average Deployment Time',
                    value: 'No data available.'
                });
            }
        }

        results.push(scan);
    }

    if (results.length === 0) {
        results.push({
            Plan: [],
            Code: [],
            Build: [],
            Test: [],
            DeployRelease: [],
            OperateMonitor: [],
        });
    }

    client.release();
    return results;
}
