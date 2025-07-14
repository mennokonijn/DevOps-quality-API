import express from 'express';
import { Pool } from 'pg';
import {WHOAMI} from "../config/env";

const router = express.Router();

const pool = new Pool({
    user: WHOAMI,
    host: 'localhost',
    database: 'metrics_db',
    password: 'postgres',
    port: 5432,
});

router.get('/repos', async (req, res) => {
    const client = await pool.connect();

    try {
        const result = await client.query(`
        SELECT name FROM repositories ORDER BY name ASC;
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
