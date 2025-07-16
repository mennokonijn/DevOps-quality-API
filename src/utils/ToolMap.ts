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
                name: 'Install Trivy',
                command: `curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin`
            },
            {
                name: 'Install CycloneDX SBOM Generator',
                command: `npm install --save-dev @cyclonedx/cyclonedx-npm`
            },
            {
                name: 'Generate SBOM (CycloneDX JSON)',
                command: `npx cyclonedx-npm --output-format json > bom.json`
            },
            {
                name: 'Run Trivy on SBOM (licenses + CVEs)',
                command: `trivy sbom --scanners vuln,license --format json --output trivy-results.json bom.json`
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
    },
    'Jira-Security-Epics': {
        steps: [
            {
                name: 'Fetch Epics from JIRA',
                command: `
echo "Fetching epics from JIRA..."

epics=$(curl -s -u \${{ secrets.JIRA_EMAIL }}:\${{ secrets.JIRA_TOKEN }} \\
  -G --data-urlencode "jql=issuetype=Epic" \\
  "\${{ secrets.JIRA_URL }}/rest/api/2/search?fields=key,summary,labels")

echo "$epics" > epics.json
      `.trim()
            }
        ]
    },
    'Jira-Security-Incidents': {
        steps: [
            {
                name: 'Fetch Security Incidents Created During Sprint',
                command: `
echo "Fetching current active sprint..."

active_sprint=$(curl -s -u \${{ secrets.JIRA_EMAIL }}:\${{ secrets.JIRA_TOKEN }} \\
  "\${{ secrets.JIRA_URL }}/rest/agile/1.0/board/\${{ secrets.JIRA_BOARD }}/sprint?state=active" | jq '.values[0]')

sprint_id=$(echo "$active_sprint" | jq -r '.id')
sprint_name=$(echo "$active_sprint" | jq -r '.name')
start_date=$(echo "$active_sprint" | jq -r '.startDate' | cut -d'T' -f1)
end_date=$(echo "$active_sprint" | jq -r '.endDate' | cut -d'T' -f1)

if [ -z "$start_date" ] || [ -z "$end_date" ]; then
  echo "Sprint dates not found. Exiting early."
  exit 1
fi

echo "Active sprint: $sprint_name (ID: $sprint_id)"
echo "Start: $start_date"
echo "End:   $end_date"

echo "Fetching security incidents created during sprint timeframe..."

incidents=$(curl -s -u \${{ secrets.JIRA_EMAIL }}:\${{ secrets.JIRA_TOKEN }} \\
  -G --data-urlencode "jql=labels in (\\"security-incident\\", \\"vulnerability\\") AND created >= \\"$start_date\\" AND created <= \\"$end_date\\"" \\
  "\${{ secrets.JIRA_URL }}/rest/api/2/search?fields=key,summary,created")

echo "$incidents" > security_incidents.json
      `.trim()
            }
        ]
    }
};
