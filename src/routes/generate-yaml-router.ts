import express from 'express';
import { generateGitHubActionsYaml } from '../helpers/generatePipeline';
import {pool} from "../database/createDatabase";

const router = express.Router();

router.post('/generate-yaml', async (req, res) => {
    let { tools, repo, branch, directory, port, startCommand, installCommand, deploymentName, nodeVersion, securityIncidentLabel, completionLabel, jiraEmail, jiraBoardId, jiraUrl, sonarQubeMetrics } = req.body;
    if (!tools || !repo || !branch) {
        return res.status(400).json({ error: 'language, metrics, and repo are required' });
    }

    if (directory == null || directory === '') {
        directory = '.';
    }

    const client = await pool.connect();

    const yaml = generateGitHubActionsYaml(tools, repo, directory, branch, deploymentName, nodeVersion, port, startCommand, installCommand, securityIncidentLabel, completionLabel, jiraEmail, jiraBoardId, jiraUrl, sonarQubeMetrics);

    const repoMatch = repo.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
    const repoName = repoMatch ? repoMatch[1] : repo;

    const existing = await client.query(
        `SELECT id FROM repositories WHERE name = $1`,
        [repoName]
    );

    const allTools = [...tools, ...sonarQubeMetrics.split(',')];
    const toolsString = JSON.stringify(allTools);


    if (existing.rows.length <= 0) {
        await client.query(
            `INSERT INTO repositories (name) VALUES ($1, $2) RETURNING id`,
            [repoName]
        );
    }

    await client.query(
        `UPDATE repositories SET metrics = $1 WHERE name = $2`,
        [toolsString, repoName]
    );


    res.json({ yaml });
});

export default router;
