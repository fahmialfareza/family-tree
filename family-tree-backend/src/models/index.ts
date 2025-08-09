import dotenv from "dotenv";
import mongoose from "mongoose";
import { createClient, RedisClientType } from "redis";
import logger from "@/utils/logger";

import Person from "./person";
import Relationship from "./relationship";
import Family from "./family";
import User from "./user";

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const uri: string = process.env.MONGO_URI as string;

mongoose
  .connect(uri, {})
  .then(() => logger.error("MongoDB Connected"))
  .catch((err) => logger.error(err.message));

export async function redisClient(): Promise<RedisClientType> {
  if (!process.env.REDIS_URI) {
    throw new Error("REDIS_URI must be defined");
  }

  try {
    const client: RedisClientType = createClient({
      url: process.env.REDIS_URI,
    });

    await client.connect();

    return client;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export { Person, Relationship, Family, User };
