import express, { Request, Response } from 'express';
import cors from 'cors';
import metricRouter from "./routes/metric-router";
import generateYamlRouter from './routes/generate-yaml-router';
import dotenv from 'dotenv'
import {createDatabase} from "./database/createDatabase";
import createTables from "./database/createTables";
import repositoryRouter from "./routes/repository-router";

dotenv.config()


const app = express();


app.use(cors());
app.use(express.json());

app.get('/api/health', (req: Request, res: Response) => {
    res.send('Backend is running');
});

app.use('/api', metricRouter);
app.use('/api', generateYamlRouter);
app.use('/api', repositoryRouter);

// 👇 Wrap in async function to await DB creation
const startServer = async () => {
    try {
        await createDatabase('metrics_db');
        await createTables();

        app.listen(4000, () => {
            console.log('🚀 Server running on http://localhost:4000');
        });

    } catch (error) {
        console.error('❌ Failed to initialize application:', error);
        process.exit(1);
    }
};

startServer();
