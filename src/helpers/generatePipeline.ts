import { NGROK_URL } from "../config/env";

export type MetricToolStep = {
    name: string;
    command: string | {
        uses: string;
        with?: Record<string, string>;
    };
    continueOnError?: boolean;
};

export type MetricToolMap = Record<string, {
    tools: string[];
    steps: MetricToolStep[];
}>;

const ngrokUrl = NGROK_URL;

const SONARQUBE_METRIC_KEYS: Record<string, string> = {
    "Code Smells": "code_smells",
    "Cyclomatic Complexity": "complexity",
    "Cognitive Complexity": "cognitive_complexity",
    "Duplicated Lines Density": "duplicated_lines_density",
    "Total Coverage": "coverage"
};

export const METRIC_MAP: Record<string, Record<string, MetricToolMap[string]>> = {
    javascript: {
        "Code Smells": {
            tools: ["SonarQube"],
            steps: []
        },
        "Cyclomatic Complexity": {
            tools: ["SonarQube"],
            steps: []
        },
        "Cognitive Complexity": {
            tools: ["SonarQube"],
            steps: []
        },
        "Duplicated Lines Density": {
            tools: ["SonarQube"],
            steps: []
        },
        "Total Coverage": {
            tools: ["SonarQube"],
            steps: []
        },
        "CVEs and CVSS": {
            tools: ["Trivy"],
            steps: [
                {
                    name: "Run Trivy Scan",
                    command: {
                        uses: "aquasecurity/trivy-action@master",
                        with: {
                            "scan-type": "fs",
                            "scan-ref": ".",
                            "format": "json",
                            "output": "trivy-results.json"
                        }
                    }
                }
            ]
        },
        "Secret Detection": {
            tools: ["GitLeaks"],
            steps: [
                {
                    name: "Run GitLeaks",
                    command: `
echo "[allowlist]
description = \\"Exclude common non-source directories\\"
paths = [
  '''\\\\.cache/''',
  '''node_modules/''',
  '''dist/'''
]" > .gitleaks.toml

gitleaks detect \\
  --source=. \\
  --config=.gitleaks.toml \\
  --report-format json \\
  --report-path=gitleaks.json \\
  --no-git
            `.trim(),
                    continueOnError: true
                }
            ]
        },
        "Test Success Density": {
            tools: ["Jest"],
            steps: [
                {
                    name: "Run Jest Tests",
                    command: "npx jest --coverage --outputFile=jest-results.json --json"
                }
            ]
        }
    },
    python: {
        "Code Smells": {
            tools: ["SonarQube"],
            steps: []
        },
        "Cyclomatic Complexity": {
            tools: ["SonarQube"],
            steps: []
        },
        "Cognitive Complexity": {
            tools: ["SonarQube"],
            steps: []
        },
        "Duplicated Lines Density": {
            tools: ["SonarQube"],
            steps: []
        },
        "Total Coverage": {
            tools: ["SonarQube"],
            steps: []
        },
        "CVEs and CVSS": {
            tools: ["Trivy"],
            steps: [
                {
                    name: "Run Trivy Scan",
                    command: {
                        uses: "aquasecurity/trivy-action@master",
                        with: {
                            "scan-type": "fs",
                            "scan-ref": ".",
                            "format": "json",
                            "output": "trivy-results.json"
                        }
                    }
                }
            ]
        },
        "Secret Detection": {
            tools: ["GitLeaks"],
            steps: [
                {
                    name: "Run GitLeaks",
                    command: `
echo "[allowlist]
description = \\"Exclude common non-source directories\\"
paths = [
  '''\\\\.cache/''',
  '''node_modules/''',
  '''dist/'''
]" > .gitleaks.toml

gitleaks detect \\
  --source=. \\
  --config=.gitleaks.toml \\
  --report-format json \\
  --report-path=gitleaks.json \\
  --no-git
            `.trim(),
                    continueOnError: true
                }
            ]
        },
        "Test Success Density": {
            tools: ["pytest"],
            steps: [
                {
                    name: "Run Pytest",
                    command: "pytest --junitxml=pytest-results.xml"
                }
            ]
        }
    }
};

export function generateGitHubActionsYaml(
    selectedMetrics: string[],
    language: 'javascript' | 'python',
    repo: string,
    workingDir = '.',
    branch = 'master'
): string {
    console.log(ngrokUrl)
    const allSteps: MetricToolStep[] = [];
    const allTools = new Set<string>();
    const NGROK_URL = ngrokUrl;

    const SONARQUBE_METRIC_KEYS: Record<string, string> = {
        "Code Smells": "code_smells",
        "Cyclomatic Complexity": "complexity",
        "Cognitive Complexity": "cognitive_complexity",
        "Duplicated Lines Density": "duplicated_lines_density",
        "Total Coverage": "coverage"
    };

    const sonarMetricKeys: string[] = [];

    function addResultPostStep(filename: string, toolName: string): MetricToolStep {
        return {
            name: `Send ${toolName} results to API`,
            command: `curl -X POST ${NGROK_URL}/api/metrics \\
  -H "Content-Type: application/json" \\
  -H "X-Tool-Name: ${toolName}" \\
  -H "X-Repo-Name: ${repo}" \\
  --data @${filename}`
        };
    }

    selectedMetrics.forEach(metric => {
        const config = METRIC_MAP[language][metric];
        if (config) {
            config.steps.forEach(step => allSteps.push(step));
            config.tools.forEach(tool => allTools.add(tool));

            if (config.tools.includes("SonarQube") && SONARQUBE_METRIC_KEYS[metric]) {
                sonarMetricKeys.push(SONARQUBE_METRIC_KEYS[metric]);
            }

            if (metric === 'CVEs and CVSS') {
                allSteps.push(addResultPostStep('trivy-results.json', 'Trivy'));
            }
            if (metric === 'Secret Detection') {
                allSteps.push(addResultPostStep('gitleaks.json', 'GitLeaks'));
            }
            if (metric === 'Test Success Density') {
                if (language === 'javascript') {
                    allSteps.push(addResultPostStep('jest-results.json', 'Jest'));
                } else {
                    allSteps.push(addResultPostStep('pytest-results.xml', 'Pytest'));
                }
            }
        }
    });

    if (allTools.has('GitLeaks')) {
        allSteps.unshift({
            name: 'Install GitLeaks',
            command: [
                'curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_linux_x64.tar.gz -o gitleaks.tar.gz',
                'tar -xzf gitleaks.tar.gz',
                'chmod +x gitleaks',
                'sudo mv gitleaks /usr/local/bin/gitleaks'
            ].join('\n')
        });
    }

    if (allTools.has('SonarQube')) {
        allSteps.push({
            name: 'Install SonarScanner',
            command: 'npm install -g sonarqube-scanner'
        });

        allSteps.push({
            name: 'Run SonarQube Analysis',
            command: `sonar-scanner \\
  -Dsonar.projectKey=\${{ secrets.SONAR_PROJECT_KEY }} \\
  -Dsonar.sources=src \\
  -Dsonar.host.url=\${{ secrets.SONAR_HOST_URL }} \\
  -Dsonar.login=\${{ secrets.SONAR_TOKEN }}`
        });

        allSteps.push({
            name: 'Wait for SonarQube Analysis to Complete',
            command: `echo "Waiting for SonarQube analysis..." && \\
while true; do \\
  STATUS=$(curl -s -u \${{ secrets.SONAR_TOKEN }}: "\${{ secrets.SONAR_HOST_URL }}/api/ce/component?component=\${{ secrets.SONAR_PROJECT_KEY }}" | jq -r '.current.status'); \\
  echo "Current SonarQube status: $STATUS"; \\
  if [ "$STATUS" = "SUCCESS" ] || [ "$STATUS" = "FAILED" ]; then break; fi; \\
  sleep 5; \\
done`
        });

        if (sonarMetricKeys.length > 0) {
            const metricsParam = sonarMetricKeys.join(',');
            allSteps.push({
                name: 'Fetch SonarQube Metrics',
                command: `curl -s -u \${{ secrets.SONAR_TOKEN }}: \\
  "\${{ secrets.SONAR_HOST_URL }}/api/measures/component?component=\${{ secrets.SONAR_PROJECT_KEY }}&metricKeys=${metricsParam}" \\
  -o sonar-results.json`
            });

            allSteps.push(addResultPostStep('sonar-results.json', 'SonarQube'));
        }
    }

    const stepsYaml = allSteps.map(step => {
        if (typeof step.command === 'string') {
            const indentedCommand = step.command
                .split('\n')
                .map(line => `          ${line.trim()}`)
                .join('\n');

            return `      - name: ${step.name}
        run: |
${indentedCommand}
${step.continueOnError ? '        continue-on-error: true' : ''}`;
        }

        const usesLine = `        uses: ${step.command.uses}`;
        const withBlock = step.command.with
            ? '        with:\n' + Object.entries(step.command.with)
            .map(([k, v]) => `          ${k}: ${v}`)
            .join('\n')
            : '';

        return `      - name: ${step.name}
${usesLine}
${withBlock}`;
    }).join('\n\n');

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

      - name: Setup ${language === 'javascript' ? 'Node.js' : 'Python'}
        uses: actions/setup-${language === 'javascript' ? 'node' : 'python'}@v4
        with:
          ${language === 'javascript' ? 'node-version: 18' : 'python-version: 3.10'}

      - name: Install dependencies
        run: ${language === 'javascript' ? 'npm install' : 'pip install -r requirements.txt'}

${stepsYaml}
`.trim();
}
