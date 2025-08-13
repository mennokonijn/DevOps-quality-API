import {ToolConfig} from "../helpers/generatePipeline";

export enum ToolName {
    ZAP = 'ZAP',
    OutdatedPackages = 'Outdated-Packages',
    Depcheck = 'Depcheck',
    GitLeaks = 'GitLeaks',
    Jest = 'Jest',
    SonarQube = 'SonarQube',
    Trivy = 'Trivy',
    TrivyOpen = 'Trivy-Open',
    JiraSprintPoints = 'Jira-SprintPoints',
    JiraSecurityEpics = 'Jira-Security-Epics',
    JiraSecurityIncidents = 'Jira-Security-Incidents',
    JiraDefectDensity = 'Jira-Defect-Density',
    LanguageImpact = 'Language-Impact',
    DeploymentFrequency = 'Deployment-Frequency',
    DeploymentTime = 'Deployment-Time',
    MTTR = 'MTTR',
    CodeSmells = 'code_smells',
    Complexity = 'complexity',
    CognitiveComplexity = 'cognitive_complexity',
    DuplicatedLinesDensity = 'duplicated_lines_density',
    Coverage = 'coverage'
}

export const TOOL_MAP: Record<string, ToolConfig> = {
    SonarQube: {
        steps: [
            {
                name: 'Install SonarScanner',
                command: 'npm install -g sonarqube-scanner',
                continueOnError: true
            },
            {
                name: 'Run SonarQube Analysis',
                command: `sonar-scanner \\
  -Dsonar.projectKey=\${{ secrets.SONAR_PROJECT_KEY }} \\
  -Dsonar.sources=src \\
  -Dsonar.host.url=\${{ secrets.SONAR_HOST_URL }} \\
  -Dsonar.token=\${{ secrets.SONAR_TOKEN }}`,
                 continueOnError: true
            },
            {
                name: 'Wait for SonarQube Analysis to Complete',
                command: `echo 'Waiting for SonarQube analysis...' && \\
MAX_RETRIES=10 && \\
COUNT=0 && \\
while true; do \\
  STATUS=$(curl -s -u \${{ secrets.SONAR_TOKEN }}: "\${{ secrets.SONAR_HOST_URL }}/api/ce/component?component=\${{ secrets.SONAR_PROJECT_KEY }}" | jq -r '.current.status'); \\
  echo "Attempt $COUNT - SonarQube status: $STATUS"; \\
  if [ "$STATUS" = "SUCCESS" ] || [ "$STATUS" = "FAILED" ]; then break; fi; \\
  COUNT=$((COUNT + 1)); \\
  if [ "$COUNT" -ge "$MAX_RETRIES" ]; then echo "Max retries reached ($MAX_RETRIES). Exiting loop."; break; fi; \\
  sleep 5; \\
done`,
                continueOnError: true
            },
            {
                name: 'Fetch SonarQube Metrics',
                command: `curl -s -u \${{ secrets.SONAR_TOKEN }}: \\
  "\${{ secrets.SONAR_HOST_URL }}/api/measures/component?component=\${{ secrets.SONAR_PROJECT_KEY }}&metricKeys={{SONARQUBE_METRIC_KEYS}}" \\
  -o sonar-results.json`,
                continueOnError: true
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
                command: `curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin`,
                continueOnError: true
            },
            {
                name: 'Run Trivy scan with SBOM, CVEs, and licenses',
                command: `trivy fs --scanners vuln,license --format cyclonedx --output trivy-results.json .`,
                continueOnError: true
            },
        ]
    },
    Jest: {
        steps: [
            {
                name: 'Run Jest Tests',
                command: 'npx jest --coverage --outputFile=jest-results.json --json',
                continueOnError: true
            }
        ]
    },
    'Outdated-Packages': {
        steps: [
            {
                name: 'Check for outdated npm packages',
                command: 'npm outdated --json > outdated.json || true',
                continueOnError: true
            },
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
completed_sprints=$(curl -s -u {{JIRA_EMAIL}}:\${{ secrets.JIRA_TOKEN }} \\
  "{{JIRA_URL}}/rest/agile/1.0/board/{{JIRA_BOARD}}/sprint?state=closed" | jq '.values')

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
  issues_url="{{JIRA_URL}}/rest/agile/1.0/sprint/$sprint_id/issue"
  echo "Fetching issues from: $issues_url"

  issues_response=$(curl -s -u {{JIRA_EMAIL}}:\${{ secrets.JIRA_TOKEN }} "$issues_url")
  echo "$issues_response" > issues_raw.json

  issues=$(echo "$issues_response" | jq '.issues')

  total_estimated=0
  total_completed=0

  while IFS= read -r issue; do
    estimate=$(echo "$issue" | jq -r ".fields[\\"$STORY_POINTS_FIELD\\"] // 0")
    status=$(echo "$issue" | jq -r ".fields.status.name")

    total_estimated=$(echo "$total_estimated + $estimate" | bc)
    if [[ "$status" == "{{COMPLETION_LABEL}}" ]]; then
      total_completed=$(echo "$total_completed + $estimate" | bc)
    fi
  done < <(echo "$issues" | jq -c '.[]')

  result_entry="{\\"sprint\\":\\"$sprint_name\\",\\"estimated\\":$total_estimated,\\"completed\\":$total_completed}"
  results=$(echo "$results" | jq ". + [\${result_entry}]")
done

echo "$results" > sprint_points.json
      `.trim(),
                continueOnError: true
            }
        ]
    },
    'Jira-Security-Epics': {
        steps: [
            {
                name: 'Fetch Epics from JIRA',
                command: `
echo "Fetching epics from JIRA..."

epics=$(curl -s -u {{JIRA_EMAIL}}:\${{ secrets.JIRA_TOKEN }} \\
  -G --data-urlencode "jql=issuetype=Epic" \\
  "{{JIRA_URL}}/rest/api/2/search?fields=key,summary,labels")

echo "$epics" > epics.json
      `.trim(),
                continueOnError: true
            }
        ]
    },
    'Jira-Security-Incidents': {
        steps: [
            {
                name: 'Fetch Security Incidents Created During Sprint',
                command: `
echo "Fetching current active sprint..."

active_sprint=$(curl -s -u {{JIRA_EMAIL}}:\${{ secrets.JIRA_TOKEN }} \\
  "{{JIRA_URL}}/rest/agile/1.0/board/{{JIRA_BOARD}}/sprint?state=active" | jq '.values[0]')

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

incidents=$(curl -s -u {{JIRA_EMAIL}}:\${{ secrets.JIRA_TOKEN }} \\
  -G --data-urlencode "jql=labels in (\\"{{SECURITY_INCIDENT_LABEL}}\\") AND created >= \\"$start_date\\" AND created <= \\"$end_date\\"" \\
  "{{JIRA_URL}}/rest/api/2/search?fields=key,summary,created")

echo "$incidents" > security_incidents.json
      `.trim(),
                continueOnError: true
            }
        ]
    },
    'Jira-Defect-Density': {
        steps: [
            {
                name: 'Fetch JIRA Bugs',
                command: `
echo "Fetching issues of type 'Bug' from JIRA..."
bugs=$(curl -s -u {{JIRA_EMAIL}}:\${{ secrets.JIRA_TOKEN }} \\
  -G --data-urlencode "jql=issuetype=Bug" \\
  "{{JIRA_URL}}/rest/api/2/search?fields=key,summary,created")

echo "$bugs" > jira_bugs.json
      `.trim(),
                continueOnError: true
            },
            {
                name: 'Count LOC for Defect Density',
                command: `
echo "Counting lines of code in ./src..."
loc=$(find ./src -type f \\( -name '*.ts' -o -name '*.js' -o -name '*.tsx' -o -name '*.jsx' \\) | xargs wc -l | tail -n 1 | awk '{print $1}')
kloc=$(echo "scale=2; $loc / 1000" | bc)

echo "{ \\"loc\\": $loc, \\"kloc\\": $kloc }" > loc.json
      `.trim(),
                continueOnError: true
            }
        ]
    },
    'Language-Impact': {
        steps: [
            {
                name: 'Fetch Programming Language Breakdown',
                command: `
echo "Fetching language breakdown from GitHub API..."
curl -s -H "Authorization: token \${{ secrets.GITHUB_TOKEN }}" \\
  https://api.github.com/repos/\${{ github.repository }}/languages \\
  -o languages.json
            `.trim(),
                continueOnError: true
            }
        ]
    },
    'Depcheck': {
        steps: [
            {
                name: 'Install Depcheck',
                command: 'npm install -g depcheck',
                continueOnError: true
            },
            {
                name: 'Run Depcheck',
                command: 'depcheck --json > depcheck-results.json || true',
                continueOnError: true
            }
        ]
    },
    'ZAP': {
        steps: [
            {
                name: 'Start App',
                command: 'PORT={{PORT}} {{START_COMMAND}} &',
                continueOnError: true
            },
            {
                name: 'Wait for app to be ready',
                command: 'sleep 15',
                continueOnError: true
            },
            {
                name: 'Run OWASP ZAP Baseline Scan',
                command: `
docker run -u root --network host \\
  -v $(pwd):/zap/wrk/:rw \\
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \\
  -t http://localhost:{{PORT}} \\
  -g zap-gen.conf \\
  -r zap-report.html \\
  -J zap-report.json \\
  -z "-config api.disablekey=true"
            `.trim(),
                continueOnError: true
            }
        ]
    },
    'Deployment-Frequency': {
        steps: [
            {
                name: 'Calculate Deployment Frequency',
                command: `
jq -r '.[].created_at' deployments.json | cut -d'T' -f1 | sort | uniq -c |
jq -Rn '
  [inputs
   | capture("(?<count>\\\\d+) (?<date>\\\\d{4}-\\\\d{2}-\\\\d{2})")
   | {date: .date, count: (.count | tonumber)}]' > deployment_frequency.json
        `.trim(),
                continueOnError: true
            }
        ]
    },

    'Deployment-Time': {
        steps: [
            {
                name: 'Calculate Deployment Time',
                command: `
echo "[]" > deployment_time.json
jq -c '.[]' deployments.json | while read -r deployment; do
  sha=$(echo "$deployment" | jq -r '.sha')
  deploy_time=$(echo "$deployment" | jq -r '.created_at')

  commit_info=$(curl -s -H "Authorization: token \${{ secrets.GITHUB_TOKEN }}" \\
    https://api.github.com/repos/\${{ github.repository }}/commits/$sha)
  commit_time=$(echo "$commit_info" | jq -r '.commit.committer.date')

  deploy_epoch=$(date -d "$deploy_time" +%s)
  commit_epoch=$(date -d "$commit_time" +%s)
  lead_time_sec=$((deploy_epoch - commit_epoch))
  lead_time_hr=$(echo "scale=2; $lead_time_sec / 3600" | bc)

  jq --arg sha "$sha" --argjson hrs "$lead_time_hr" \\
    '. += [{"sha": $sha, "lead_time_hours": $hrs}]' deployment_time.json > tmp.json && mv tmp.json deployment_time.json
done
        `.trim(),
                continueOnError: true
            }
        ]
    },

    'MTTR': {
        steps: [
            {
                name: 'Calculate MTTR',
                command: `
echo "[]" > mttr.json
jq -r '.[].id' deployments.json | while read -r id; do
  statuses=$(curl -s -H "Authorization: token \${{ secrets.GITHUB_TOKEN }}" \\
    https://api.github.com/repos/\${{ github.repository }}/deployments/$id/statuses)

  failed=$(echo "$statuses" | jq -r '[.[] | select(.state == "failure")][0].created_at')
  success=$(echo "$statuses" | jq -r '[.[] | select(.state == "success")][0].created_at')

  if [[ "$failed" != "null" && "$success" != "null" ]]; then
    fail_epoch=$(date -d "$failed" +%s)
    success_epoch=$(date -d "$success" +%s)
    delta=$((success_epoch - fail_epoch))
    minutes=$(echo "scale=2; $delta / 60" | bc)

    jq --arg id "$id" --argjson m "$minutes" \\
      '. += [{"deployment_id": $id, "mttr_minutes": $m}]' mttr.json > tmp.json && mv tmp.json mttr.json
  fi
done
        `.trim(),
                continueOnError: true
            }
        ]
    }
};
