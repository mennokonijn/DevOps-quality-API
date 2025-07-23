import express from 'express';
import { generateGitHubActionsYaml } from '../helpers/generatePipeline';
import {pool} from "../database/createDatabase";

const router = express.Router();

router.post('/generate-yaml', async (req, res) => {
    let { tools, repo, branch, directory, port, startCommand, deploymentName } = req.body;
    if (!tools || !repo || !branch) {
        return res.status(400).json({ error: 'language, metrics, and repo are required' });
    }

    if (directory == null || directory === '') {
        directory = '.';
    }

    const client = await pool.connect();

    const yaml = generateGitHubActionsYaml(tools, repo, directory, branch, deploymentName, port, startCommand);

    const repoMatch = repo.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
    const repoName = repoMatch ? repoMatch[1] : repo;

    await client.query(
        `INSERT INTO repositories (name) VALUES ($1) RETURNING id`,
        [repoName]
    );

    res.json({ yaml });
});

export default router;
