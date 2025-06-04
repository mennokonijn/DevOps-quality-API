import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {convertJUnitToGeneric} from "./ConvertJUnitToGeneric";

export async function prepareRepoForSonarAnalysis(repoPath: string): Promise<void> {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { cwd: repoPath, stdio: 'inherit' });

    const pkgPath = path.join(repoPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        throw new Error('No package.json found – cannot detect test runner.');
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.jest) {
        console.log('🧪 Detected Jest – installing `jest-junit`...');
        execSync('npm install --save-dev jest-junit', { cwd: repoPath, stdio: 'inherit' });

        console.log('🧪 Running Jest with coverage and JUnit output...');
        const jestConfigPath = path.join(repoPath, 'jest.config.js');
        const junitConfig = `
            module.exports = {
                testResultsProcessor: "jest-junit",
                reporters: ["default", ["jest-junit", { outputDirectory: ".", outputName: "report.xml" }]]
            };
        `;
        fs.writeFileSync(jestConfigPath, junitConfig);
        try {
            execSync('npx jest --coverage', { cwd: repoPath, stdio: 'inherit' });
        } catch (e) {
            console.warn('⚠️ Some tests failed, but still trying to generate test report...');
        }

        const reportXml = path.join(repoPath, 'report.xml');
        const genericXml = path.join(repoPath, 'generic-report.xml');

        if (fs.existsSync(reportXml)) {
            await convertJUnitToGeneric(reportXml, genericXml);
        } else {
            console.warn('⚠️ No JUnit report found — skipping conversion to generic format');
        }



    } else if (deps.mocha) {
        console.log('🧪 Detected Mocha – installing reporters and nyc...');
        execSync('npm install --save-dev mocha mocha-junit-reporter nyc', { cwd: repoPath, stdio: 'inherit' });

        console.log('🧪 Running Mocha with nyc for coverage...');
        execSync('npx nyc mocha --reporter mocha-junit-reporter', { cwd: repoPath, stdio: 'inherit' });

        const reportSrc = path.join(repoPath, 'test-results.xml');
        const reportDest = path.join(repoPath, 'report.xml');
        if (fs.existsSync(reportSrc)) fs.renameSync(reportSrc, reportDest);
    } else {
        console.warn('⚠️ No known test runner detected. Skipping test execution.');
    }

    // Warn if no coverage info
    const coveragePath = path.join(repoPath, 'coverage', 'lcov.info');
    if (!fs.existsSync(coveragePath)) {
        console.warn('⚠️ No coverage info found at coverage/lcov.info. Sonar coverage may be empty.');
    }
}

