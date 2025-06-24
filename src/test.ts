export const dummyMetricData: Record<string, { name: string; value: string }[]> = {
    Plan: [
        { name: 'Requirements Volatility', value: 'JIRA API' },
        { name: 'Requirements Completeness', value: 'Stakeholder survey' },
    ],
    Code: [
        { name: 'Cyclomatic Complexity', value: 'SonarQube' },
        { name: 'Cognitive Complexity', value: 'SonarQube' },
        { name: 'Code Smells', value: 'SonarQube' },
        { name: 'Duplicated Lines Density', value: 'SonarQube' },
        { name: 'CVE identifiers and CVSS scores', value: 'Trivy' },
        { name: 'Programming Language Impact', value: 'GitHub Linguist, Marco Couto benchmark' },
    ],
    Build: [
        { name: 'Unused Libraries', value: 'Depcheck/Vulture/Maven Analyzer' },
    ],
    Test: [
        { name: 'Total Coverage', value: 'SonarQube' },
        { name: 'Test Success Density', value: 'Jest' },
    ],
    'Deploy/Release': [
        { name: 'Change Failure Rate (CFR)', value: 'GitHub Actions' },
        { name: 'Secret Detection', value: 'SonarQube' },
        { name: 'Mean Time to Restore (MTTR)', value: 'GitHub REST API' },
    ],
    Operate: [
        { name: 'Customer Satisfaction', value: 'Survey' },
    ],
    Monitor: [
        { name: 'Defect Density', value: 'JIRA (Bug-labeled issues)' },
    ],
};
