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
    branch = 'master'
): string {
    const allSteps: ToolStep[] = [];

    selectedTools.forEach(tool => {
        const config = TOOL_MAP[tool];
        if (!config) return;

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
  --data @sonar-results.json`
            });
        }

        if (tool === 'Trivy') {
            allSteps.push({
                name: 'Send Trivy results to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Trivy' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @trivy-results.json`
            });
        }

        if (tool === 'GitLeaks') {
            allSteps.push({
                name: 'Send GitLeaks results to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: GitLeaks' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @gitleaks.json`
            });
        }

        if (tool === 'Jest') {
            allSteps.push({
                name: 'Send Jest results to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Jest' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @jest-results.json`
            });
        }

        if (tool === 'Jira-SprintPoints') {
            allSteps.push({
                name: 'Send Sprint Points to API',
                command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H 'Content-Type: application/json' \\
  -H 'X-Tool-Name: Jira-SprintPoints' \\
  -H 'X-Repo-Name: ${repo}' \\
  --data @sprint_points.json`
            });
        }
    });

    const stepsYaml = allSteps
        .map(step => {
            if (typeof step.command === 'string') {
                const dedented = typeof step.command === 'string' ? dedent(step.command) : '';
                const indentedCommand = dedented
                    .split('\n')
                    .map(line => `          ${line}`)  // 10 spaces here (6 for step + 2 for run: + 2 extra)
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
          node-version: 18

      - name: Install dependencies
        run: npm install

${stepsYaml}
`.trim();
}
