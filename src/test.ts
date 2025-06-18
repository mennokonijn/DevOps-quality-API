const dummyMetrics: { [key: string]: { name: string; value: string | number }[] } = {
    Planning: [
        { name: 'Requirements Volatility', value: 'Low' },
        { name: 'Requirements Completeness', value: '85%' }
    ],
    Coding: [
        { name: 'Cyclomatic Complexity', value: 12 },
        { name: 'Cognitive Complexity', value: 9 },
        { name: 'Code Smells', value: 5 },
        { name: 'Duplicated Lines Density', value: '2.4%' },
        { name: 'Programming Language Impact', value: '300 DRAM' }
    ],
    Testing: [
        { name: 'Total Coverage', value: '87%' },
        { name: 'Test Success Density', value: '91%' }
    ],
    Deploying: [
        { name: 'Change Failure Rate', value: '3%' },
        { name: 'Mean Time to Recover', value: '15m' }
    ],
    Maintaining: [
        { name: 'Defect Density', value: 0.02 },
        { name: 'Customer Satisfaction', value: '4.5/5' },
        { name: 'Unused Libraries', value: 2 },
        { name: 'Runtime Performance', value: '98%' }
    ]
};
