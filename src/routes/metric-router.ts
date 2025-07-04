import express from 'express';
import fs from 'fs';
import path from 'path';
import {saveMetrics} from "../helpers/saveMetrics";
import {extractResults} from "../helpers/extractResults";

const router = express.Router();
router.use(express.json());

const BASE_RESULTS_DIR = path.join(__dirname, '../../data/results');

const TOOLS = ['GitLeaks', 'Jest', 'SonarQube', 'Trivy', 'Jira-SprintPoints'];

if (!fs.existsSync(BASE_RESULTS_DIR)) {
    fs.mkdirSync(BASE_RESULTS_DIR, { recursive: true });
}


router.post('/metrics', async (req, res) => {
    const tool = req.headers['x-tool-name'] as string || 'unknown';
    const rawRepoUrl = req.headers['x-repo-name'] as string || 'unknown/unknown-repo';

    const repoMatch = rawRepoUrl.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
    const repo = repoMatch ? repoMatch[1] : rawRepoUrl;


    try {
        await saveMetrics(repo, tool, req);
        res.status(200).json({ message: `Metrics saved for tool "${tool}"` });
    } catch (err) {
        console.error('❌ Failed to save metrics:', err);
        res.status(500).json({ error: 'Failed to save metrics' });
    }
});

router.get('/extract-results', async (req, res) => {
    const repoName = req.query.repo as string;


    if (!repoName) {
        return res.status(400).json({ error: 'Missing repo query param' });
    }

    try {
        const results = await extractResults(repoName);

        return res.json(results);
    } catch (err) {
        console.error('Failed to extract metrics:', err);
        res.status(500).json({ error: 'Failed to extract metrics' });
    }
});

export default router;
