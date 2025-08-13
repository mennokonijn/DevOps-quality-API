import { NGROK_URL } from '../config/env';
import { TOOL_MAP } from '../utils/ToolMap';

export type ToolStep = {
    name: string;
    command: string | {
        uses: string;
        with?: Record<string, string>;
    };
    continueOnError?: boolean;
};

export type ToolConfig = {
    steps: ToolStep[];
};

function dedent(str: string): string {
    const lines = str.split('\n');

    // Remove leading/trailing empty lines
    while (lines.length && lines[0].trim() === '') lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

    // Find minimum indentation of non-empty lines
    const indentLengths = lines
        .filter(line => line.trim())
        .map(line => line.match(/^(\s*)/)![1].length);
    const minIndent = Math.min(...indentLengths);

    // Remove that indentation from each line
    return lines.map(line => line.slice(minIndent)).join('\n');
}


export function generateGitHubActionsYaml(
    selectedTools: string[],
    repo: string,
    workingDir = '.',
    branch = 'master',
    deploymentName: string,
    nodeVersion: string,
    port?: number,
    startCommand?: string,
    installCommand: string = 'npm install',
    securityIncidentLabel: string = 'Security Incident',
    completionLabel: string = 'Done',
    jiraEmail: string = '',
    jiraBoardId: string = '',
    jiraUrl: string = '',
    sonarqubeMetrics: string = ''
): string {
    const allSteps: ToolStep[] = [];

    const needsDeploymentData = selectedTools.some(tool =>
        ['Deployment-Frequency', 'Deployment-Time', 'MTTR'].includes(tool)
    );

    if (needsDeploymentData) {
        allSteps.push(
            {
                name: 'Fetch Deployment Events from GitHub API',
                command: `
curl -s -H "Authorization: token \${{ secrets.GITHUB_TOKEN }}" \\
  https://api.github.com/repos/\${{ github.repository }}/deployments \\
  > deployments.json
      `.trim()
            },
            {
                name: 'Fetch Workflow Runs (for MTTR)',
                command: `
curl -s -H "Authorization: token \${{ secrets.GITHUB_TOKEN }}" \\
  "https://api.github.com/repos/\${{ github.repository }}/actions/runs?branch=master&status=completed" \\
  | jq '[.workflow_runs[] | select(.name == "Simulate Deployment History")]' \\
  > workflow_runs.json
      `.trim()
            }
        );
    }

    selectedTools.forEach(tool => {
        let config = TOOL_MAP[tool];
        if (!config) return;

        config = JSON.parse(JSON.stringify(config));
        config.steps = config.steps.map((step) => {
            if (typeof step.command === 'string') {
                return {
                    ...step,
                    command: step.command
                        .replace(/{{PORT}}/g, String(port ?? 8080))
                        .replace(/{{START_COMMAND}}/g, startCommand ?? 'npm run start')
                        .replace(/{{DEPLOYMENT_NAME}}/g, deploymentName)
                        .replace(/{{SECURITY_INCIDENT_LABEL}}/g, securityIncidentLabel)
                        .replace(/{{JIRA_EMAIL}}/g, jiraEmail)
                        .replace(/{{JIRA_BOARD}}/g, jiraBoardId )
                        .replace(/{{JIRA_URL}}/g, jiraUrl)
                        .replace(/{{SONARQUBE_METRIC_KEYS}}/g, sonarqubeMetrics)
                        .replace(/{{COMPLETION_LABEL}}/g, completionLabel)
                };
            }
            return step;
        });

        if (tool === 'GitLeaks') {
            allSteps.push(...config.steps.slice(0, 1));
            allSteps.push(...config.steps.slice(1));
        } else {
            allSteps.push(...config.steps);
        }

        if (tool === 'SonarQube') {
            allSteps.push({
                name: 'Send SonarQube results to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: SonarQube' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @sonar-results.json`,
                continueOnError: true
            });
        }

        if (tool === 'Trivy') {
            allSteps.push({
                name: 'Send Trivy results to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Trivy' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @trivy-results.json`,
                continueOnError: true
            });
        }

        if (tool === 'GitLeaks') {
            allSteps.push({
                name: 'Send GitLeaks results to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: GitLeaks' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @gitleaks.json`,
                continueOnError: true
            });
        }

        if (tool === 'Jest') {
            allSteps.push({
                name: 'Send Jest results to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Jest' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @jest-results.json`,
                continueOnError: true
            });
        }

        if (tool === 'Jira-SprintPoints') {
            allSteps.push({
                name: 'Send Sprint Points to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Jira-SprintPoints' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @sprint_points.json`,
                continueOnError: true
            });
        }

        if (tool === 'Jira-Security-Epics') {
            allSteps.push({
                name: 'Send Epics to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Jira-Security-Epics' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @epics.json`,
                continueOnError: true
            });
        }

        if (tool === 'Jira-Security-Incidents') {
            allSteps.push({
                name: 'Send Security Incidents to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Jira-Security-Incidents' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @security_incidents.json`,
                continueOnError: true
            });
        }

        if (tool === 'Jira-Defect-Density') {
            allSteps.push({
                name: 'Merge Defect Density Inputs',
                command: `jq -s '.[0] * .[1]' jira_bugs.json loc.json > defect_density.json`,
                continueOnError: true
            });

            allSteps.push({
                name: 'Send Defect Density Data to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Jira-Defect-Density' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @defect_density.json`,
                continueOnError: true
            });
        }

        if (tool === 'Language-Impact') {
            allSteps.push({
                name: 'Send Language Energy Impact to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Language-Impact' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @languages.json`,
                continueOnError: true
            });
        }

        if (tool === 'Depcheck') {
            allSteps.push({
                name: 'Send Depcheck results to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Depcheck' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @depcheck-results.json`,
                continueOnError: true
            });
        }

        if (tool === 'Outdated-Packages') {
            allSteps.push({
                name: 'Send Outdated Packages to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Outdated-Packages' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @outdated.json`,
                continueOnError: true
            });
        }

        else if (tool === 'ZAP') {
            allSteps.push({
                name: 'Send ZAP results to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: ZAP' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @zap-report.json`,
                continueOnError: true
            });
        }

        else if (tool === 'Deployment-Frequency') {
            allSteps.push({
                name: 'Send Deployment Frequency to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Deployment-Frequency' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @deployment_frequency.json`,
                continueOnError: true
            });
        }

        else if (tool === 'Deployment-Time') {
            allSteps.push({
                name: 'Send Deployment Time to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Deployment-Time' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @deployment_time.json`,
                continueOnError: true
            });
        }

        else if (tool === 'MTTR') {
            allSteps.push({
                name: 'Send MTTR to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: MTTR' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @mttr.json`,
                continueOnError: true
            });
        }
    });

    const stepsYaml = allSteps
        .map(step => {
            if (typeof step.command === 'string') {
                const dedented = typeof step.command === 'string' ? dedent(step.command) : '';
                const indentedCommand = dedented
                    .split('\n')
                    .map(line => `          ${line}`)
                    .join('\n');

                const continueOnError = step.continueOnError ? '\n        continue-on-error: true' : '';
                return `      - name: ${step.name}
        run: |
${indentedCommand}${continueOnError}`;

            }

            const usesLine = `        uses: ${step.command.uses}`;
            const withBlock = step.command.with
                ? '        with:\n' +
                Object.entries(step.command.with)
                    .map(([k, v]) => `          ${k}: ${v}`)
                    .join('\n')
                : '';

            return `      - name: ${step.name}
${usesLine}
${withBlock}`;
        })
        .join('\n\n');

    return `
name: Quality Metrics Pipeline

on:
  push:
    branches:
      - ${branch}

jobs:
  quality-check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ${workingDir}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}

      - name: Install dependencies
        run: ${installCommand}

${stepsYaml}
`.trim();
}
