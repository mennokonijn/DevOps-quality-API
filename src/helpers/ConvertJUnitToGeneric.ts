import { parseStringPromise, Builder } from 'xml2js';
import fs from 'fs';
import path from 'path';

interface TestCase {
    $: {
        name: string;
        duration: string;
        status: string;
    };
}

interface TestFile {
    $: { path: string };
    testCase: TestCase[];
}

interface TestExecutions {
    testExecutions: {
        $: { version: string }; // 👈 version field required
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
            const status = c.failure || c.error ? 'failure' : 'success';

            testFile.testCase.push({
                $: {
                    name,
                    duration: duration.toString(),
                    status,
                },
            });
        }

        testExecutions.testExecutions.file.push(testFile);
    }

    const builder = new Builder({ headless: true });
    const genericXml = builder.buildObject(testExecutions);
    fs.writeFileSync(outputPath, genericXml);
}
