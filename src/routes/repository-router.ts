import express from 'express';
import {pool} from "../database/createDatabase";

const router = express.Router();

router.get('/repos', async (req, res) => {
    const client = await pool.connect();

    try {
        const result = await client.query(`
        SELECT id, name FROM repositories ORDER BY name ASC;
    `);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Failed to fetch repositories:', error);
        res.status(500).json({ error: 'Failed to fetch repositories' });
    } finally {
        client.release();
    }
});

export default router;
