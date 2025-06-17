// backend/routes/metrics.ts
import { Router } from 'express';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import {prepareRepoForSonarAnalysis} from "../helpers/prepareRepoForSonarAnalysis";
dotenv.config();

const SONAR_HOST = 'http://localhost:9000';
const SONAR_TOKEN = process.env.SONAR_TOKEN;

const metricRouter = Router();

function cloneRepo(repoUrl: string): string {
    const tempDir = path.join('/tmp', `repo-${uuidv4()}`);
    execSync(`git clone --depth=1 ${repoUrl} ${tempDir}`, { stdio: 'inherit' });
    return tempDir;
}

function runSonarScanner(repoPath: string, projectKey: string) {
    const logPath = path.join(repoPath, 'scanner.log');
    const errPath = path.join(repoPath, 'scanner.err');

    try {
        execSync(`sonar-scanner -X \
            -Dsonar.projectKey=${projectKey} \
            -Dsonar.sources=src \
            -Dsonar.tests=tests,coverage \
            -Dsonar.host.url=${SONAR_HOST} \
            -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
            -Dsonar.testExecutionReportPaths=generic-report.xml \
            -Dsonar.login=${SONAR_TOKEN}`, {
            cwd: repoPath,
            stdio: ['ignore', fs.openSync(logPath, 'a'), fs.openSync(errPath, 'a')]
        });
    } catch (e) {
        console.error('🚨 SonarQube scan failed.');
        console.error('📄 Log:', fs.readFileSync(logPath, 'utf-8'));
        console.error('📄 Error Log:', fs.readFileSync(errPath, 'utf-8'));
        throw e;
    }
}


async function getSonarMetrics(projectKey: string) {
    const metricKeys = [
        'complexity',
        'cognitive_complexity',
        'code_smells',
        'duplicated_lines_density',
        'coverage',
        'tests',
        'test_success_density'
    ].join(',');

    const response = await axios.get(`${SONAR_HOST}/api/measures/component`, {
        params: {
            component: projectKey,
            metricKeys: metricKeys
        },
        headers: {
            Authorization: `Basic ${Buffer.from(`${SONAR_TOKEN}:`).toString('base64')}`
        }
    });

    console.log('📊 SonarQube API Response:', JSON.stringify(response.data, null, 2));

    const values: Record<string, string> = {};
    for (const m of response.data.component.measures) {
        values[m.metric] = m.value;
    }

    return {
        Coding: [
            { name: 'Cyclomatic Complexity', value: values['complexity'] ?? 'N/A' },
            { name: 'Cognitive Complexity', value: values['cognitive_complexity'] ?? 'N/A' },
            { name: 'Code Smells', value: values['code_smells'] ?? 'N/A' },
            { name: 'Duplicated Lines Density', value: values['duplicated_lines_density'] ? `${values['duplicated_lines_density']}%` : 'N/A' }
        ],
        Testing: [
            { name: 'Total Coverage', value: values['coverage'] ? `${values['coverage']}%` : 'N/A' },
            { name: 'Test Success Density', value: values['test_success_density'] ? `${values['test_success_density']}%` : 'N/A' }
        ]
    };
}


metricRouter.get('/metrics', async (req, res) => {
    const repo = req.query.repo as string;
    if (!repo) return res.status(400).json({ error: 'Missing repo' });

    const projectKey = `project-${uuidv4()}`;
    let repoPath = '';

    try {
        repoPath = cloneRepo(repo);

        await prepareRepoForSonarAnalysis(repoPath);
        runSonarScanner(repoPath, projectKey);
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('🔍 Running SonarQube analysis...');
        const metrics = await getSonarMetrics(projectKey);

        console.log('Metrics collected...');
        res.json({ metrics });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Analysis failed' });
    } finally {
        if (repoPath) {
            const logPath = path.join(repoPath, 'scanner.log');
            const errPath = path.join(repoPath, 'scanner.err');

            if (fs.existsSync(logPath)) {
                console.log('📄 Log:\n', fs.readFileSync(logPath, 'utf-8'));
            }
            if (fs.existsSync(errPath)) {
                console.error('📄 Error Log:\n', fs.readFileSync(errPath, 'utf-8'));
            }

            fs.rmSync(repoPath, { recursive: true, force: true });
        }
    }
});

export default metricRouter;
