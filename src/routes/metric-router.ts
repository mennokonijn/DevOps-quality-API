import express from 'express';
import fs from 'fs';
import path from 'path';
import {dummyMetricData} from "../test";

const router = express.Router();
const BASE_RESULTS_DIR = path.join(__dirname, '../../data/results');

const TOOLS = ['GitLeaks', 'Jest', 'SonarQube', 'Trivy'];

if (!fs.existsSync(BASE_RESULTS_DIR)) {
    fs.mkdirSync(BASE_RESULTS_DIR, { recursive: true });
}


router.post('/metrics', express.json(), (req, res) => {
    const tool = req.headers['x-tool-name'] as string || 'unknown';
    const rawRepo = req.headers['x-repo-name'] as string || 'unknown-repo';
    const repo = rawRepo.replace(/[^\w\-]/g, '_');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${tool}-${timestamp}.json`;

    const folderPath = path.join(BASE_RESULTS_DIR, repo, tool);
    const filePath = path.join(folderPath, filename);

    try {
        fs.mkdirSync(folderPath, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf-8');
        console.log(`✅ Saved ${tool} result for repo "${repo}" → ${filePath}`);
        res.status(200).json({ message: 'Result saved', filename });
    } catch (err) {
        console.error('❌ Error saving result:', err);
        res.status(500).json({ error: 'Failed to save result' });
    }
});

router.get('/extract-results', async (req, res) => {
    const repoParamRaw = req.query.repo;

    if (typeof repoParamRaw !== 'string') {
        return res.status(400).json({ error: 'Invalid or missing repo parameter' });
    }

    const repoFolder = repoParamRaw.replace(/[:/.]/g, '_');
    const repoPath = path.join(BASE_RESULTS_DIR, repoFolder);

    try {
        const toolResults: Record<string, any[]> = {};

        // Load and sort JSON files for each tool
        for (const tool of TOOLS) {
            const toolPath = path.join(repoPath, tool);
            const files = fs.existsSync(toolPath)
                ? fs.readdirSync(toolPath).filter(f => f.endsWith('.json')).sort()
                : [];

            toolResults[tool] = files.map(f => {
                const content = fs.readFileSync(path.join(toolPath, f), 'utf-8');
                return {
                    filename: f,
                    data: JSON.parse(content),
                };
            });
        }

        // Group files by scan index
        const maxScans = Math.max(...TOOLS.map(tool => toolResults[tool]?.length || 0));
        const groupedResults = [];

        for (let i = 0; i < maxScans; i++) {
            const scanGroup: Record<string, any> = {};
            for (const tool of TOOLS) {
                if (toolResults[tool][i]) {
                    scanGroup[tool] = toolResults[tool][i];
                }
            }
            groupedResults.push(scanGroup);
        }

        const sonarqubeMetricMap: Record<string, string> = {
            complexity: 'Cyclomatic Complexity',
            cognitive_complexity: 'Cognitive Complexity',
            code_smells: 'Code Smells',
            duplicated_lines_density: 'Duplicated Lines Density',
            coverage: 'Total Coverage',
        };

        const nameToSonarKey = Object.fromEntries(
            Object.entries(sonarqubeMetricMap).map(([k, v]) => [v, k])
        );

        // Build frontend-ready metric output
        const processedResults: Record<string, { name: string; value: string }[]>[] = [];

        for (const scanGroup of groupedResults) {
            const filledMetrics: Record<string, { name: string; value: string }[]> = {};

            for (const stage of Object.keys(dummyMetricData)) {
                filledMetrics[stage] = [];

                for (const metric of dummyMetricData[stage]) {
                    const { name, value } = metric;

                    if (value.includes('SonarQube')) {
                        const sonarData = scanGroup['SonarQube']?.data;
                        const sonarKey = nameToSonarKey[name];
                        const matched = sonarData?.component?.measures?.find(
                            (m: any) => m.metric === sonarKey
                        );

                        filledMetrics[stage].push({
                            name,
                            value: matched?.value ?? '-',
                        });
                    } else if (value.includes('Jest') && name === 'Test Success Density') {
                        const jestData = scanGroup['Jest']?.data;
                        const passed = jestData?.numPassedTests;
                        const total = jestData?.numTotalTests;

                        const density = typeof passed === 'number' && typeof total === 'number' && total > 0
                            ? ((passed / total) * 100).toFixed(1) + '%'
                            : '-';

                        filledMetrics[stage].push({
                            name,
                            value: density,
                        });
                    } else if (value.includes('Trivy') && name === 'CVE identifiers and CVSS scores') {
                        const trivyData = scanGroup['Trivy']?.data;
                        const results = trivyData?.Results ?? [];

                        let totalCVEs = 0;
                        const cvssScores: number[] = [];
                        const cveDetails: string[] = [];

                        for (const result of results) {
                            const vulns = result?.Vulnerabilities ?? [];

                            for (const vuln of vulns) {
                                const id = vuln?.VulnerabilityID ?? 'Unknown CVE';
                                const severity = vuln?.Severity ?? 'UNKNOWN';
                                const score = vuln?.CVSS?.ghsa?.V3Score ?? vuln?.CVSS?.nvd?.V3Score ?? '-';

                                if (typeof score === 'number') {
                                    cvssScores.push(score);
                                }

                                cveDetails.push(`- ${id} [${severity}] → ${score}`);
                            }

                            totalCVEs += vulns.length;
                        }

                        const avgScore = cvssScores.length > 0
                            ? (cvssScores.reduce((a, b) => a + b, 0) / cvssScores.length).toFixed(1)
                            : '-';

                        const detailString = cveDetails.length > 0
                            ? `Total: ${totalCVEs}, Avg CVSS: ${avgScore}\n` + cveDetails.join('\n')
                            : '-';

                        filledMetrics[stage].push({
                            name,
                            value: detailString,
                        });
                    } else {
                            filledMetrics[stage].push({
                                name,
                                value: '-',
                            });
                        }
                }
            }

            processedResults.push(filledMetrics);
        }

        console.log(`📊 Extracted results for repo "${repoParamRaw}" with ${processedResults.length} scans`);
        console.log('Processed results:', processedResults);
        res.json(processedResults);
    } catch (err) {
        console.error('❌ Failed to process results:', err);
        res.status(500).json({ error: 'Failed to process results' });
    }
});


export default router;
