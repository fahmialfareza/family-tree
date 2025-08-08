require("dotenv").config({ path: `.env.${process.env.NODE_ENV}` });

exports.config = {
  app_name: process.env.NEW_RELIC_APP_NAME,
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  application_logging: {
    forwarding: {
      enabled: true,
    },
  },
  distributed_tracing: {
    enabled: true,
  },
};
