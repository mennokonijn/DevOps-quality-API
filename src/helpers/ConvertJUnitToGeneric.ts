import { parseStringPromise, Builder } from 'xml2js';
import fs from 'fs';

interface TestCase {
    $: {
        name: string;
        duration: string;
    };
    failure?: any[];
    error?: any[];
    skipped?: any[];
}

interface TestFile {
    $: { path: string };
    testCase: TestCase[];
}

interface TestExecutions {
    testExecutions: {
        $: { version: string };
        file: TestFile[];
    };
}

export async function convertJUnitToGeneric(inputPath: string, outputPath: string) {
    const xml = fs.readFileSync(inputPath, 'utf-8');
    const result = await parseStringPromise(xml);

    const testExecutions: TestExecutions = {
        testExecutions: {
            $: { version: '1' },
            file: [],
        },
    };

    const suites = result.testsuites?.testsuite || [];
    for (const suite of suites) {
        const fileName = suite.$.name || 'unknown';
        const testFile: TestFile = {
            $: { path: fileName },
            testCase: [],
        };

        const cases = suite.testcase || [];
        for (const c of cases) {
            const name = c.$.name || 'unnamed';
            const duration = c.$.time ? Math.round(parseFloat(c.$.time) * 1000) : 0;

            const testCase: TestCase = {
                $: {
                    name,
                    duration: duration.toString()
                }
            };

            if (Array.isArray(c.failure) && c.failure.length > 0) {
                testCase.failure = [''];
            }
            if (Array.isArray(c.error) && c.error.length > 0) {
                testCase.error = [''];
            }
            if (Array.isArray(c.skipped) && c.skipped.length > 0) {
                testCase.skipped = [''];
            }

            testFile.testCase.push(testCase);
        }

        testExecutions.testExecutions.file.push(testFile);
    }

    const builder = new Builder({ headless: true });
    const genericXml = builder.buildObject(testExecutions);
    fs.writeFileSync(outputPath, genericXml);
}
