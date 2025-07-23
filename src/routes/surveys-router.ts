import express from 'express';
import { pool } from "../database/createDatabase";

const router = express.Router();

router.post('/user-survey', async (req, res) => {
    const client = await pool.connect();

    try {
        const { repository_id, answers } = req.body;

        if (!repository_id || !Array.isArray(answers)) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        const surveyResult = await client.query(
            `INSERT INTO user_surveys (repository_id) VALUES ($1) RETURNING id`,
            [repository_id]
        );
        const surveyId = surveyResult.rows[0].id;

        for (const { question, rating } of answers) {
            await client.query(
                `INSERT INTO user_survey_answers (survey_id, question, rating) VALUES ($1, $2, $3)`,
                [surveyId, question, rating]
            );
        }

        res.status(201).json({
            message: "Survey submitted successfully",
        });

    } catch (error) {
        console.error("Error submitting user survey:", error);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        client.release();
    }
});

router.get('/user-survey/averages/:repositoryId', async (req, res) => {
    const client = await pool.connect();

    try {
        const repositoryId = parseInt(req.params.repositoryId, 10);
        if (isNaN(repositoryId)) {
            return res.status(400).json({ error: 'Invalid repository ID' });
        }

        const avgResults = await client.query(
            `
          SELECT 
            question, 
            ROUND(AVG(rating), 2) AS average_rating, 
            COUNT(*) AS total_responses
          FROM user_survey_answers
          INNER JOIN user_surveys ON user_survey_answers.survey_id = user_surveys.id
          WHERE user_surveys.repository_id = $1
            AND rating > 0
          GROUP BY question
          ORDER BY question
          `,
            [repositoryId]
        );

        res.status(200).json({ averages: avgResults.rows });
    } catch (error) {
        console.error("Error fetching survey averages:", error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

router.get('/survey-nsi', async (req, res) => {
    const client = await pool.connect();

    try {
        const repoId = parseInt(req.query.repo as string, 10);
        if (isNaN(repoId)) {
            return res.status(400).json({ error: 'Invalid repo ID' });
        }

        const result = await client.query(
            `
          SELECT rating
          FROM user_survey_answers
          INNER JOIN user_surveys ON user_survey_answers.survey_id = user_surveys.id
          WHERE user_surveys.repository_id = $1 AND rating > 0
          `,
            [repoId]
        );

        const ratings = result.rows.map(r => r.rating);

        if (ratings.length === 0) {
            return res.status(200).json({ nsi: null, message: "No valid ratings yet." });
        }

        const total = ratings.reduce((sum, r) => sum + r, 0);
        const maxScore = ratings.length * 5;
        const minScore = ratings.length;
        const nsi = ((total - minScore) / (maxScore - minScore)) * 100;

        res.status(200).json({ nsi: Math.round(nsi) });

    } catch (err) {
        console.error("Error calculating NSI:", err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

router.post('/stakeholder-survey', async (req, res) => {
    const client = await pool.connect();

    try {
        const { repository_id, answers } = req.body;

        if (!repository_id || !Array.isArray(answers)) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        const surveyResult = await client.query(
            `INSERT INTO stakeholder_surveys (repository_id) VALUES ($1) RETURNING id`,
            [repository_id]
        );
        const surveyId = surveyResult.rows[0].id;

        for (const { question, rating } of answers) {
            await client.query(
                `INSERT INTO stakeholder_survey_answers (survey_id, question, rating) VALUES ($1, $2, $3)`,
                [surveyId, question, rating]
            );
        }

        res.status(201).json({ message: "Stakeholder survey submitted successfully" });

    } catch (error) {
        console.error("Error submitting stakeholder survey:", error);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        client.release();
    }
});

router.get('/stakeholder-survey/averages/:repositoryId', async (req, res) => {
    const client = await pool.connect();

    try {
        const repositoryId = parseInt(req.params.repositoryId, 10);
        if (isNaN(repositoryId)) {
            return res.status(400).json({ error: 'Invalid repository ID' });
        }

        const avgResults = await client.query(
            `
            SELECT 
                question, 
                ROUND(AVG(rating), 2) AS average_rating, 
                COUNT(*) AS total_responses
            FROM stakeholder_survey_answers
            INNER JOIN stakeholder_surveys ON stakeholder_survey_answers.survey_id = stakeholder_surveys.id
            WHERE stakeholder_surveys.repository_id = $1
              AND rating > 0
            GROUP BY question
            ORDER BY question
            `,
            [repositoryId]
        );

        res.status(200).json({ averages: avgResults.rows });

    } catch (error) {
        console.error("Error fetching stakeholder averages:", error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

router.get('/stakeholder-survey-nsi', async (req, res) => {
    const client = await pool.connect();

    try {
        const repoId = parseInt(req.query.repo as string, 10);
        if (isNaN(repoId)) {
            return res.status(400).json({ error: 'Invalid repo ID' });
        }

        const result = await client.query(
            `
            SELECT rating
            FROM stakeholder_survey_answers
            INNER JOIN stakeholder_surveys ON stakeholder_survey_answers.survey_id = stakeholder_surveys.id
            WHERE stakeholder_surveys.repository_id = $1 AND rating > 0
            `,
            [repoId]
        );

        const ratings = result.rows.map(r => r.rating);

        if (ratings.length === 0) {
            return res.status(200).json({ nsi: null, message: "No valid ratings yet." });
        }

        const total = ratings.reduce((sum, r) => sum + r, 0);
        const maxScore = ratings.length * 5;
        const minScore = ratings.length;
        const nsi = ((total - minScore) / (maxScore - minScore)) * 100;

        res.status(200).json({ nsi: Math.round(nsi) });

    } catch (err) {
        console.error("Error calculating stakeholder NSI:", err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

export default router;
