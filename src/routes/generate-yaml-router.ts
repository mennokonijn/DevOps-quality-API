import express from 'express';
import { generateGitHubActionsYaml } from '../helpers/generatePipeline';

const router = express.Router();

router.post('/generate-yaml', (req, res) => {
    let { tools, repo, branch, directory, port, startCommand, deploymentName } = req.body;
    if (!tools || !repo || !branch) {
        return res.status(400).json({ error: 'language, metrics, and repo are required' });
    }

    if (directory == null || directory === '') {
        directory = '.';
    }

    const yaml = generateGitHubActionsYaml(tools, repo, directory, branch, deploymentName, port, startCommand);
    res.json({ yaml });
});

export default router;
