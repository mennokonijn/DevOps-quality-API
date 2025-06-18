import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// This folder will store the posted metric results
const RESULTS_DIR = path.join(__dirname, '../../data/results');

// Ensure the directory exists
if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

router.post('/metrics', (req, res) => {
    const { repo, commit, tool, rawTextOutput } = req.body;

    if (!repo || !commit || !tool || !rawTextOutput) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${repo.replace(/\//g, '_')}--${tool}--${commit}--${timestamp}.json`;
    const filePath = path.join(RESULTS_DIR, filename);

    try {
        fs.writeFileSync(filePath, JSON.stringify({ repo, commit, tool, rawTextOutput }, null, 2));
        console.log(`✅ Saved results for ${tool} from ${repo}@${commit}`);
        res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('❌ Failed to save results:', err);
        res.status(500).json({ error: 'Failed to save results' });
    }
});

export default router;
