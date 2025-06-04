import express, { Request, Response } from 'express';
import cors from 'cors';
import metricRouter from "./routes/metric-router";

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req: Request, res: Response) => {
    res.send('Backend is running');
});

app.use('/api', metricRouter);

app.listen(4000, () => {
    console.log('Server running on http://localhost:4000');
});
