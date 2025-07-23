import {Client, Pool} from 'pg';
import { WHOAMI} from "../config/env";

export const pool = new Pool({
    user: WHOAMI,
    host: 'localhost',
    database: 'metrics_db',
    password: 'postgres',
    port: 5432,
})

export const createDatabase = async (dbName: string) => {
    const client = new Client({
        user: WHOAMI,
        host: 'localhost',
        password: 'postgres',
        port: 5432,
        database: 'postgres',
    });

    try {
        await client.connect();
        await client.query(`CREATE DATABASE ${dbName}`);
        console.log(`Database "${dbName}" created successfully`);
    } catch (err) {
        // @ts-ignore
        if (err.code === '42P04') {
            console.log(`Database "${dbName}" already exists`);
        } else {
            console.error(`Error creating database "${dbName}":`, err);
        }
    } finally {
        await client.end();
    }
};
