import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const BASE_RESULTS_DIR = path.join(__dirname, '../../data/results');

if (!fs.existsSync(BASE_RESULTS_DIR)) {
    fs.mkdirSync(BASE_RESULTS_DIR, { recursive: true });
}


router.post('/metrics', express.json(), (req, res) => {
    const tool = req.headers['x-tool-name'] as string || 'unknown';
    const repo = req.headers['x-repo-name'] as string || 'unknown-repo';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${tool}-${timestamp}.json`;

    const folderPath = path.join(BASE_RESULTS_DIR, repo, tool);
    const filePath = path.join(folderPath, filename);

    try {
        fs.mkdirSync(folderPath, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf-8');
        console.log(`✅ Saved ${tool} result for repo "${repo}" → ${filePath}`);
        res.status(200).json({ message: 'Result saved', filename });
    } catch (err) {
        console.error('❌ Error saving result:', err);
        res.status(500).json({ error: 'Failed to save result' });
    }
});

router.post('/extract-results', express.json(), (req, res) => {

});

export default router;
