import dotenv from "dotenv";
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

import "newrelic";
import path from "path";
import fs from "fs";
import express from "express";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import cors from "cors";
import fileUpload from "express-fileupload";
import morgan from "morgan";
import compression from "compression";

import errorHandler from "@/middlewares/errorHandler";
import logger from "@/utils/logger";
import router from "@/routes";

const PORT = process.env.PORT || 4000;

const server = express();

server.use(cors());

server.use(compression());

server.use(express.json({ limit: "100mb" }));
server.use(express.urlencoded({ extended: true, limit: "100mb" }));

server.set("trust proxy", 10);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
});

server.use(limiter);

server.use(hpp());

if (process.env.NODE_ENV === "development") {
  server.use(morgan("dev"));
} else if (process.env.VERCEL === "true") {
  server.use(morgan("common"));
} else {
  const accessLogStream = fs.createWriteStream(
    path.join(__dirname, "access.log"),
    {
      flags: "a",
    }
  );
  server.use(morgan("combined", { stream: accessLogStream }));
}

server.use(
  fileUpload({
    useTempFiles: true,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB file size limit
  })
);

server.use(express.static("public"));

server.use("/api", router);

server.use(errorHandler);

server.listen(PORT, () => logger.error(`Server started on port ${PORT}`));
