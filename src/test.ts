export const dummyMetricData: Record<string, { name: string; value: string }[]> = {
    Plan: [
        { name: 'Requirements Volatility', value: '-' },
        { name: 'Requirements Completeness', value: '-' },
    ],
    Code: [
        { name: 'Cyclomatic Complexity', value: '25' },
        { name: 'Cognitive Complexity', value: '67' },
        { name: 'Code Smells', value: '10' },
        { name: 'Duplicated Lines Density', value: '20' },
        { name: 'CVE identifiers and CVSS scores', value: '30' },
        { name: 'Programming Language Impact', value: '-' },
    ],
    Build: [
        { name: 'Unused Libraries', value: '-' },
    ],
    Test: [
        { name: 'Total Coverage', value: '67%' },
        { name: 'Test Success Density', value: '95%' },
    ],
    'Deploy/Release': [
        { name: 'Change Failure Rate (CFR)', value: '-' },
        { name: 'Secret Detection', value: '-' },
        { name: 'Mean Time to Restore (MTTR)', value: '-' },
    ],
    Operate: [
        { name: 'Customer Satisfaction', value: '-' },
    ],
    Monitor: [
        { name: 'Defect Density', value: '-' },
    ],
};
