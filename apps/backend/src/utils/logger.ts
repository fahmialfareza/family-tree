// @ts-ignore
import nrPino from "@newrelic/pino-enricher";
import pino from "pino";

const logger = pino(nrPino());

export default logger;
