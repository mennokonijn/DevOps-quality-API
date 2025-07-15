import {ToolConfig} from "../helpers/generatePipeline";

const SONARQUBE_METRIC_KEYS = [
    'code_smells',
    'complexity',
    'cognitive_complexity',
    'duplicated_lines_density',
    'coverage'
];

export const TOOL_MAP: Record<string, ToolConfig> = {
    SonarQube: {
        steps: [
            {
                name: 'Install SonarScanner',
                command: 'npm install -g sonarqube-scanner'
            },
            {
                name: 'Run SonarQube Analysis',
                command: `sonar-scanner \\
  -Dsonar.projectKey=\${{ secrets.SONAR_PROJECT_KEY }} \\
  -Dsonar.sources=src \\
  -Dsonar.host.url=\${{ secrets.SONAR_HOST_URL }} \\
  -Dsonar.login=\${{ secrets.SONAR_TOKEN }}`
            },
            {
                name: 'Wait for SonarQube Analysis to Complete',
                command: `echo 'Waiting for SonarQube analysis...' && \\
while true; do \\
  STATUS=$(curl -s -u \${{ secrets.SONAR_TOKEN }}: "\${{ secrets.SONAR_HOST_URL }}/api/ce/component?component=\${{ secrets.SONAR_PROJECT_KEY }}" | jq -r '.current.status'); \\
  echo "Current SonarQube status: $STATUS"; \\
  if [ "$STATUS" = "SUCCESS" ] || [ "$STATUS" = "FAILED" ]; then break; fi; \\
  sleep 5; \\
done`
            },
            {
                name: 'Fetch SonarQube Metrics',
                command: `curl -s -u \${{ secrets.SONAR_TOKEN }}: \\
  "\${{ secrets.SONAR_HOST_URL }}/api/measures/component?component=\${{ secrets.SONAR_PROJECT_KEY }}&metricKeys=${SONARQUBE_METRIC_KEYS.join(',')}" \\
  -o sonar-results.json`
            }
        ]
    },

    GitLeaks: {
        steps: [
            {
                name: 'Install GitLeaks',
                command: [
                    'curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_linux_x64.tar.gz -o gitleaks.tar.gz',
                    'tar -xzf gitleaks.tar.gz',
                    'chmod +x gitleaks',
                    'sudo mv gitleaks /usr/local/bin/gitleaks'
                ].join('\n')
            },
            {
                name: "Run GitLeaks",
                command: `
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
    Trivy: {
        steps: [
            {
                name: 'Run Trivy Scan',
                command: {
                    uses: 'aquasecurity/trivy-action@master',
                    with: {
                        'scan-type': 'fs',
                        'scan-ref': '.',
                        format: 'json',
                        output: 'trivy-results.json'
                    }
                }
            }
        ]
    },

    Jest: {
        steps: [
            {
                name: 'Run Jest Tests',
                command: 'npx jest --coverage --outputFile=jest-results.json --json'
            }
        ]
    },

    'Jira-SprintPoints': {
        steps: [
            {
                name: 'Fetch JIRA Sprint Story Points',
                command: `
STORY_POINTS_FIELD="customfield_10016"
echo "Using Story Points field: $STORY_POINTS_FIELD"

echo "Fetching completed sprints..."
completed_sprints=$(curl -s -u \${{ secrets.JIRA_EMAIL }}:\${{ secrets.JIRA_TOKEN }} \\
  "\${{ secrets.JIRA_URL }}/rest/agile/1.0/board/\${{ secrets.JIRA_BOARD }}/sprint?state=closed" | jq '.values')

echo "$completed_sprints" > sprints.json

results="[]"

echo "Processing sprints..."
for row in $(echo "$completed_sprints" | jq -r '.[] | @base64'); do
  _jq() {
    echo "\${row}" | base64 --decode | jq -r "\${1}"
  }

  sprint_id=$(_jq '.id')
  sprint_name=$(_jq '.name')

  echo "Sprint: $sprint_name (ID: $sprint_id)"
  issues_url="\${{ secrets.JIRA_URL }}/rest/agile/1.0/sprint/$sprint_id/issue"
  echo "Fetching issues from: $issues_url"

  issues_response=$(curl -s -u \${{ secrets.JIRA_EMAIL }}:\${{ secrets.JIRA_TOKEN }} "$issues_url")
  echo "$issues_response" > issues_raw.json

  issues=$(echo "$issues_response" | jq '.issues')

  total_estimated=0
  total_completed=0

  while IFS= read -r issue; do
    estimate=$(echo "$issue" | jq -r ".fields[\\"$STORY_POINTS_FIELD\\"] // 0")
    status=$(echo "$issue" | jq -r ".fields.status.name")

    total_estimated=$(echo "$total_estimated + $estimate" | bc)
    if [[ "$status" == "Gereed" ]]; then
      total_completed=$(echo "$total_completed + $estimate" | bc)
    fi
  done < <(echo "$issues" | jq -c '.[]')

  result_entry="{\\"sprint\\":\\"$sprint_name\\",\\"estimated\\":$total_estimated,\\"completed\\":$total_completed}"
  results=$(echo "$results" | jq ". + [\${result_entry}]")
done

echo "$results" > sprint_points.json
      `.trim()
            }
        ]
    }
};
